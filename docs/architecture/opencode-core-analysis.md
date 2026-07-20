# OpenCode 核心机制分析（二）：`opencode/`

> **状态提示(2026-07-19):** 本文分析的是 Effect 化重构(上游提交 `c5442d418`,2026-03-30)之前的朴素 TS 形态。最新上游(v1.18.x)的 session/tool 层已全面重写为 Effect-ts 风格,本文的**实现细节描述已过期**,仅概念结构(loop/subtask/compaction/overflow 的职责划分)仍具参考价值。决策背景见 `docs/adr/ADR-018-fork-base-and-effect.md`,新版分析见 `opencode-core-analysis-v2.md`。

本文只分析 `scholar-cli/opencode/` 里的实现，聚焦三个问题：

1. Agent Loop：如何接收 Observation、调用模型进行 Thought、再把输出转成 Action
2. State：如何管理会话状态与历史记录
3. 记忆管理：如何把 System Prompt、Tools、裁剪后的历史拼成最终请求

和 `codex/` 最大的不同先说在前面：

- Codex 更像“自己维护 loop + 自己解析 tool call”
- OpenCode 更像“自己维护会话状态与 prompt 组装，但把 tool calling runtime 交给 AI SDK 的 `streamText()`”

---

## 1. 代码入口总览

这次最关键的文件集中在 `opencode/packages/opencode/src/`：

- `session/prompt.ts`
- `session/processor.ts`
- `session/llm.ts`
- `session/message-v2.ts`
- `session/compaction.ts`
- `session/system.ts`
- `session/instruction.ts`
- `session/index.ts`
- `session/projectors.ts`
- `tool/registry.ts`
- `provider/transform.ts`
- `server/routes/session.ts`
- `sync/index.ts`

可以先分成四层：

- `server/routes/session.ts`：HTTP 入口
- `session/prompt.ts`：主 loop 与 prompt 组装
- `session/processor.ts`：消费模型流事件，记录 text / reasoning / tool 状态
- `session/llm.ts`：把内部 `messages + tools + system` 交给 AI SDK 发请求

---

## 2. Agent Loop

### 2.1 顶层入口

对外入口在：

- `server/routes/session.ts`
  - `POST /session/:sessionID/message`
  - `POST /session/:sessionID/prompt_async`

这两个路由最终都调用：

- `SessionPrompt.prompt()` in `session/prompt.ts`

`prompt()` 先把用户输入写成一条 `user message`，然后如果 `noReply !== true`，进入：

- `SessionPrompt.loop()`

所以 OpenCode 的真实 agent loop 在 `session/prompt.ts::loop()`。

### 2.2 一轮 loop 的主流程

`loop()` 的核心结构非常清晰：

1. 读取当前 session 历史：`MessageV2.filterCompacted(MessageV2.stream(sessionID))`
2. 找出：
   - 最新 user message
   - 最新 assistant message
   - 最新已完成 assistant message
   - 尚未处理的 `compaction` / `subtask`
3. 如果有 pending subtask，直接先执行 task tool
4. 如果有 pending compaction，先做 compact
5. 如果上下文溢出，插入一条 compaction user message，下一轮继续
6. 正常情况下：
   - 解析 agent / model
   - 构造 assistant message 占位
   - 解析本轮可用 tools
   - 组装 system + messages
   - 调 `processor.process()` 跑一次模型
7. 根据结果决定：
   - `stop`
   - `compact`
   - `continue`

换成更贴近代码的伪流程：

```text
create user message
-> while true
   -> load filtered history
   -> if pending subtask: run it
   -> else if pending compaction: compact it
   -> else if overflow: enqueue compaction
   -> else:
      -> resolve agent/model/tools
      -> build system/messages
      -> stream model via LLM.stream()
      -> persist text/reasoning/tool parts
   -> if finished and no more follow-up: break
```

### 2.3 Observation 是怎么进来的

OpenCode 的 Observation 有三类：

1. 历史消息本身
2. 模型流式事件
3. 工具执行结果

#### 第一类：历史消息

在每轮开始时，`loop()` 通过：

- `MessageV2.stream(sessionID)`
- `MessageV2.filterCompacted(...)`

取出当前应该暴露给模型的历史。

这里不是简单“全量历史”。`filterCompacted()` 会在遇到最近一次有效 compaction 边界后停止，把更早的历史折叠掉。

#### 第二类：模型流事件

模型调用发生在：

- `LLM.stream()` in `session/llm.ts`

`SessionProcessor.process()` 对 `stream.fullStream` 做 `for await`，消费 AI SDK 流出来的事件：

- `reasoning-start / delta / end`
- `text-start / delta / end`
- `tool-input-start`
- `tool-call`
- `tool-result`
- `tool-error`
- `start-step`
- `finish-step`

这些事件就是 OpenCode 在运行时看到的最直接 observation。

#### 第三类：工具执行结果

和 Codex 不同，OpenCode 没有自己写一个“解析工具调用 -> 手动执行”的低层 router。它把工具对象直接传给 AI SDK：

- `LLM.stream()` -> `streamText({ tools, ... })`

所以：

- 模型输出 tool call
- AI SDK 负责解析 tool call
- AI SDK 直接调用对应 `tool.execute()`
- `SessionProcessor.process()` 只是旁路监听 `tool-call / tool-result / tool-error` 事件并把状态写回 session

这是一处非常关键的架构差异。

### 2.4 Thought 是怎么触发的

OpenCode 的 Thought 阶段就是：

- `processor.process()` 调 `LLM.stream()`
- `LLM.stream()` 再调 `streamText()`

`LLM.stream()` 会先准备：

- system prompt
- model messages
- provider options
- active tools
- tool choice
- headers

然后交给 AI SDK 的 `streamText()`。

也就是说，OpenCode 并不直接拼某家厂商的 HTTP body；它先组一个统一的 `streamText()` 输入，再由 AI SDK / provider driver 做最后序列化。

### 2.5 Action 是怎么解析和执行的

OpenCode 这里分成两层：

#### 第一层：工具集合解析

在 `SessionPrompt.resolveTools()` 里：

- 先从 `ToolRegistry.tools()` 取内置/插件工具
- 再把 MCP tools 也挂进去
- 再按当前 model/provider 做 schema transform
- 再把 permission / plugin hook / metadata 更新逻辑包进每个 tool 的 `execute()`

所以真正交给模型的是“可直接执行的工具对象”。

#### 第二层：工具执行

模型一旦发出 tool call，AI SDK 会直接调用对应的 `execute()`。

OpenCode 在 `SessionProcessor.process()` 里只负责持久化状态：

- `tool-input-start`：创建 pending tool part
- `tool-call`：转成 running
- `tool-result`：写 completed output
- `tool-error`：写 error

所以可以把 OpenCode 的 Action 阶段理解成：

- “动作解析”主要由 AI SDK 做
- “动作执行”由 tool `execute()` 做
- “动作落库与可视化”由 `SessionProcessor` 做

### 2.6 多轮继续的条件

`loop()` 是否继续，主要看两件事：

1. `assistant.finish`
2. `processor.process()` 返回的状态

如果模型 finish 不是 `tool-calls` / `unknown`，而且没有新的 pending compaction/subtask，loop 就会退出。

如果：

- 工具链还没结束
- 或上下文溢出需要 compact
- 或 compaction 后还要 replay/continue

就继续下一轮。

---

## 3. State：历史记录和会话状态怎么管

OpenCode 的状态管理比 Codex 更“事件溯源”。

### 3.1 三层数据结构

最核心的三张表在：

- `session/session.sql.ts`

分别是：

- `SessionTable`
- `MessageTable`
- `PartTable`

含义分别是：

- `session`：会话级元数据
- `message`：一条 user / assistant message
- `part`：message 下的细粒度内容片段

OpenCode 的 message 不是一整块字符串，而是拆成很多 `part`：

- `text`
- `reasoning`
- `tool`
- `file`
- `patch`
- `step-start`
- `step-finish`
- `compaction`
- `subtask`

这使它能很细地记录一次 agent 运行过程。

### 3.2 写入不是直接 update，而是先发 SyncEvent

看 `session/index.ts`：

- `Session.updateMessage()`
- `Session.updatePart()`
- `Session.setSummary()`
- `Session.setPermission()`

这些函数本身几乎不直接写表，而是调用：

- `SyncEvent.run(...)`

真正落库发生在：

- `session/projectors.ts`

这里的 projector 会把事件投影到 sqlite 表：

- `session.created/updated/deleted` -> `SessionTable`
- `message.updated/removed` -> `MessageTable`
- `message.part.updated/removed` -> `PartTable`

所以 OpenCode 的写路径是：

```text
业务代码调用 updateMessage/updatePart
-> 触发 SyncEvent
-> SyncEvent.process()
-> session/projectors.ts 投影到 sqlite
-> 同时向 bus 发布更新
```

这就是它的核心 state model。

### 3.3 历史是怎么读回来的

读路径主要在 `message-v2.ts`：

- `page()`
- `stream()`
- `hydrate()`
- `parts()`

流程是：

1. 先从 `message` 表分页读 message row
2. 批量取对应 `part` 表内容
3. `hydrate()` 组装成 `MessageV2.WithParts`

`Session.messages()` 则基于 `MessageV2.stream()` 拉完整会话，再 reverse 成正常时间顺序。

### 3.4 Compaction 相关状态

OpenCode 的 compact 不是“替换历史数组”那种内存操作，而是显式写入历史。

它会插入：

- 一条 user message
- 其中带一个 `compaction` part

随后 `SessionCompaction.process()` 再生成一条 `summary: true` 的 assistant message，作为压缩后的 continuation prompt。

所以“已经 compact 过”本身也是历史的一部分，不是隐藏状态。

### 3.5 旧工具结果的裁剪

除了 compaction，还有一个更细粒度的裁剪：

- `SessionCompaction.prune()`

它会回溯旧 tool part，当旧工具输出太多时，把这些 part 标记为：

- `part.state.time.compacted = Date.now()`

后面在 `MessageV2.toModelMessages()` 里，这些旧工具输出会被替换成：

- `[Old tool result content cleared]`

所以 OpenCode 的历史裁剪是两级的：

1. 会话级 compaction
2. 工具输出级 prune

---

## 4. 记忆管理：System Prompt、Tools、历史记录怎么拼

这一块是 OpenCode 最值得看的地方。

### 4.1 用户输入先被“扩写”为标准消息

进入 loop 之前，`SessionPrompt.prompt()` 先调：

- `createUserMessage()`

这一步不是简单保存用户文本，而是把输入部件做了很多预处理。

#### 文件输入

如果用户附带文件：

- 文本文件会直接调用 `ReadTool` 读内容
- 目录会调用 `ReadTool` 列目录
- 二进制/图片/PDF 会变成 data URL file part

而且会额外插入 synthetic text，例如：

- `Called the Read tool with the following input: ...`
- 读出来的文本内容

这意味着文件上下文在真正发给模型前，已经被“显式转写”进对话历史里了。

#### MCP resource

如果 part 的 source 是 MCP resource，`createUserMessage()` 会先调用：

- `MCP.readResource()`

并把读到的文本/二进制摘要也转成 synthetic parts。

#### agent mention

如果用户 message 里显式点了 agent part，OpenCode 会追加一段 synthetic 提示，引导主 agent 去调用 task tool 拉起子 agent。

这一步相当于把 UI 层的富输入，规整成模型可消费的统一历史。

### 4.2 发请求前先取“可见历史”

每轮 loop 开头执行：

- `MessageV2.filterCompacted(MessageV2.stream(sessionID))`

得到当前对模型可见的历史窗口。

然后还会做几种额外注入：

- `insertReminders()`：给 plan/build 模式塞 reminder
- 如果 step > 1，把新用户消息包成 `<system-reminder>...`
- `experimental.chat.messages.transform` plugin hook

也就是说，真正发给模型的 history 并不是数据库原样，而是“取出后再加工”的结果。

### 4.3 System Prompt 的拼装顺序

`loop()` 里最终传给 `LLM.stream()` 的 `system` 主要来自三块：

1. `SystemPrompt.environment(model)`
2. `SystemPrompt.skills(agent)`
3. `InstructionPrompt.system()`

再加上 `LLM.stream()` 内部的：

4. agent 自带 prompt 或 provider 默认 prompt
5. 当前 user message 的 `system` 字段

具体看 `session/llm.ts`，最终 system 的顺序是：

1. agent prompt，若无则 provider prompt
2. loop 传入的 `system[]`
3. 当前 user message 上自带的 system

其中：

- `SystemPrompt.provider()` 会根据模型选 `gpt.txt` / `anthropic.txt` / `gemini.txt` / `codex.txt` 等
- `SystemPrompt.environment()` 会注入工作目录、workspace root、git repo、平台、日期
- `SystemPrompt.skills()` 会注入可用 skill 列表
- `InstructionPrompt.system()` 会读取项目/全局的 `AGENTS.md`、`CLAUDE.md`、额外 instruction 文件或 URL

如果这轮要求结构化输出，还会再追加：

- `STRUCTURED_OUTPUT_SYSTEM_PROMPT`

### 4.4 Tools 的拼装方式

`resolveTools()` 会把三类工具并到一起：

1. `ToolRegistry` 内置工具
2. 本地/插件自定义工具
3. MCP tools

然后再做四件事：

- 用 `ProviderTransform.schema()` 把 schema 适配到当前 provider
- 把 permission 检查包进 `ctx.ask()`
- 把插件 hook 包进 `tool.execute.before/after`
- 把 attachment / truncation / metadata 规范成统一输出

最终得到的是一组可以直接喂给 `streamText()` 的 `tools` 对象。

### 4.5 历史消息如何变成模型消息

真正把 `MessageV2.WithParts[]` 转成模型输入的是：

- `MessageV2.toModelMessages()`

这一步做了很多关键映射：

- `user.text part` -> user text
- `file part` -> file / media part
- `assistant.text` -> assistant text
- `assistant.reasoning` -> reasoning part
- `tool completed/error` -> tool result / tool error
- pending/running tool -> 强制变成 interrupted error，避免 dangling tool state

还有两个很重要的细节：

1. 被 prune 过的旧工具输出会变成 `[Old tool result content cleared]`
2. 某些 provider 不支持“tool result 里带图片/PDF”，这些附件会被拆出来，改成独立的 user media message

所以这里不只是序列化，更是一次 provider 兼容层转换。

### 4.6 最终请求在 `LLM.stream()` 里成形

`LLM.stream()` 最终把下面这些东西交给 AI SDK：

- `messages`
- `tools`
- `toolChoice`
- `temperature/topP/topK`
- `providerOptions`
- `headers`
- `maxOutputTokens`
- `abortSignal`

如果是常规 provider，system 会以独立 `system` message 的形式拼到 `messages` 前面。

如果是某些 OpenAI OAuth 场景，则会改成：

- `options.instructions = system.join("\n")`

也就是不用 system messages，而走 instructions 字段。

### 4.7 ProviderTransform 是最后一道适配层

在真正进入 provider 之前，`LLM.stream()` 还通过 middleware 调：

- `ProviderTransform.message(...)`

这里会做最后一轮 provider-specific 适配：

- 去掉 Anthropic 不接受的空 message
- 规范 Claude / Mistral 的 toolCallId
- 修复某些 provider 不接受的 message 序列
- 把 reasoning 挪到 provider 专用字段
- 给 Anthropic/OpenRouter/Bedrock 等打 cache 标记
- 重映射 `providerOptions` key
- 把不支持的媒体输入改写成报错文本

所以如果问“最终那个庞大的 JSON 请求体是在哪里拼的”，准确答案是：

- OpenCode 自己负责拼的是统一的 `system + messages + tools + providerOptions`
- 真正的 HTTP JSON body 序列化，大多交给 AI SDK/provider driver
- `ProviderTransform` 是 OpenCode 在序列化前最后一次改写请求内容的地方

### 4.8 上下文太大时怎么处理

如果 `finish-step` 时发现 token 接近上限：

- `SessionCompaction.isOverflow()` 返回 true
- loop 里插入一条 `compaction` user message
- 下一轮走 `SessionCompaction.process()`

`process()` 会：

1. 用 `compaction` agent 再开一次模型调用
2. 让它生成 continuation prompt
3. 把这条 summary assistant message 持久化
4. 若是 auto compact，再 replay 原用户请求或注入一条 synthetic “continue” message

这就是 OpenCode 的长期记忆折叠方案。

---

## 5. 总结

如果只抓最核心的机制，OpenCode 可以概括成：

### 5.1 Agent Loop

- 入口是 `SessionPrompt.prompt()` -> `SessionPrompt.loop()`
- 每轮先读当前“可见历史”，再处理 subtask / compaction / overflow
- 正常分支里调用 `SessionProcessor.process()` + `LLM.stream()`
- 工具调用的解析和执行主要交给 AI SDK，OpenCode 负责状态持久化

### 5.2 State

- 状态是事件溯源式的
- `updateMessage/updatePart` 先发 `SyncEvent`
- `session/projectors.ts` 再把事件投影到 `session/message/part` 三张表
- 历史读取通过 `MessageV2.page/stream/hydrate`

### 5.3 记忆管理

- 用户输入会先被扩写成标准 message/part
- system prompt 由 provider prompt、环境信息、skills、AGENTS/CLAUDE 指令、user.system 共同组成
- tools 由 ToolRegistry + MCP + permission + plugin hook 拼成
- 历史通过 `toModelMessages()` 转成统一模型消息
- `ProviderTransform` 在进入 provider 前做最后的兼容改写
- 真正的底层 HTTP JSON body 大多不是 OpenCode 手写，而是交给 AI SDK/provider SDK 生成

---

## 6. 和 Codex 的一个关键差异

对比 `docs/codex-core-analysis.md`，最值得记的一点是：

- Codex：更像“自己实现 tool-router 驱动的 agent runtime”
- OpenCode：更像“自己实现会话状态机 + prompt assembler，但 tool runtime 交给 AI SDK”

所以如果后面你们要继续研究两者：

- 研究 Codex，要重点盯 `Prompt -> Responses API request -> output item -> tool router`
- 研究 OpenCode，要重点盯 `Session loop -> Message/Part event sourcing -> AI SDK streamText tool runtime`
