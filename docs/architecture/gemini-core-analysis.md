# Gemini CLI 核心机制分析（三）：`gemini-cli/`

本文只分析 `scholar-cli/gemini-cli/` 里的实现，聚焦三个问题：

1. Agent Loop：如何接收 Observation、调用模型进行 Thought、再把输出转成 Action
2. State：如何管理会话状态与历史记录
3. 记忆管理：如何把 System Prompt、Tools、裁剪后的历史拼成最终请求

先说结论：

- Gemini CLI 的 loop 分成两层：
  - `GeminiClient` 负责“发一轮模型请求、检查是否继续、必要时递归继续”
  - `Scheduler` 负责“真正执行工具，并把 `functionResponse` 回灌给下一轮模型”
- 历史记录的真实来源是 `GeminiChat.history: Content[]`
- 持久化历史则由 `ChatRecordingService` 另存为 session JSON 文件
- 最终并不是自己手写 HTTP JSON 字符串，而是先拼成 `GenerateContentParameters`，再交给 `@google/genai` 序列化发送

---

## 1. 代码入口总览

这次最关键的文件集中在 `gemini-cli/packages/core/src/` 和少量 `packages/sdk/src/`：

- `core/client.ts`
- `core/turn.ts`
- `core/geminiChat.ts`
- `core/contentGenerator.ts`
- `core/baseLlmClient.ts`
- `core/prompts.ts`
- `prompts/promptProvider.ts`
- `scheduler/scheduler.ts`
- `agents/agent-scheduler.ts`
- `services/chatRecordingService.ts`
- `services/chatCompressionService.ts`
- `services/agentHistoryProvider.ts`
- `utils/environmentContext.ts`
- `utils/sessionUtils.ts`
- `packages/sdk/src/session.ts`

可以先把它们分成四层：

- `core/client.ts`：外层 agent loop
- `core/turn.ts` + `core/geminiChat.ts`：单轮模型调用、流式解析、history 更新
- `scheduler/*`：工具执行与确认/策略调度
- `prompts/*` + `services/*`：system prompt、memory、压缩、持久化

---

## 2. Agent Loop

### 2.1 顶层入口

Gemini 的核心 loop 在：

- `GeminiClient.sendMessageStream()` in `core/client.ts`

如果从 SDK 看，对外会话入口是：

- `GeminiCliSession.sendStream()` in `packages/sdk/src/session.ts`

SDK 这一层做的事情很薄：

1. 把用户 prompt 包成 `[{ text: prompt }]`
2. 调 `client.sendMessageStream(...)`
3. 收集模型输出里的 `ToolCallRequest`
4. 调 `scheduleAgentTools(...)` 执行工具
5. 把工具返回的 `functionResponse` parts 作为下一轮 request

所以 Gemini 的真实 agent loop 不是单文件 while，而是：

- `GeminiClient.sendMessageStream()` 管模型侧循环
- `Scheduler.schedule()` 管动作执行
- SDK 或 `legacy-agent-session` 把工具结果重新喂回模型

### 2.2 单轮 Thought 是怎么跑的

单轮执行链是：

1. `GeminiClient.processTurn()`
2. 新建 `Turn`
3. `Turn.run()`
4. `GeminiChat.sendMessageStream()`
5. `GeminiChat.makeApiCallAndProcessStream()`
6. `contentGenerator.generateContentStream(...)`

这里的 “Thought” 本质上就是一次 `generateContentStream`。

和 Codex/OpenCode 的差异在于，Gemini 把“聊天状态管理”封装在 `GeminiChat`，但把“是否继续下一轮、是否补一句 Please continue、是否压缩上下文、是否检测 loop”放在 `GeminiClient`。

### 2.3 Observation 是怎么进来的

Gemini 的 observation 主要有四类。

#### 第一类：已有 history

`GeminiChat` 内部维护：

- `history: Content[]`

发请求前，`GeminiChat.sendMessageStream()` 会先把当前用户输入包装成：

- `createUserContent(message)`

然后直接：

- `this.history.push(userContent)`

接着用：

- `requestContents = this.getHistory(true)`

把“裁剪过的 curated history”作为本轮请求上下文。

#### 第二类：模型流式 chunk

`Turn.run()` 消费 `GeminiChat.sendMessageStream()` 返回的流。

每个 chunk 会被拆成：

- `part.thought` -> `GeminiEventType.Thought`
- 普通文本 -> `GeminiEventType.Content`
- `resp.functionCalls` -> `GeminiEventType.ToolCallRequest`
- `finishReason` -> `GeminiEventType.Finished`

也就是说，Gemini 把底层 `GenerateContentResponse` 翻译成了自己的一套事件流。

#### 第三类：工具执行结果

工具结果不是自动由模型 SDK 执行的，而是自己调度：

1. `Turn.run()` 发现 `functionCalls`
2. 生成 `ToolCallRequestInfo`
3. 外层收集这些 request
4. `scheduleAgentTools(...)` -> `Scheduler.schedule(...)`
5. 工具完成后返回 `response.responseParts`
6. 下一轮把这些 parts 当作 request 发回去

这些 `responseParts` 的核心形态就是：

```ts
{
  functionResponse: {
    id,
    name,
    response: ...
  }
}
```

它们就是模型在下一轮看到的 observation。

#### 第四类：系统注入的观察信息

Gemini 还会在 loop 里主动插入一些“系统观察”：

- 初始环境上下文：`getInitialChatHistory()` / `getEnvironmentContext()`
- IDE 上下文增量：`GeminiClient.getIdeContextParts()`
- loop recovery 提示：`_recoverFromLoop()`
- invalid stream 补一句：`System: Please continue.`
- next speaker 检查后补一句：`Please continue.`

所以它不是只依赖“用户输入 + 工具输出”，而是会主动往 history 里塞一些控制性消息。

### 2.4 Action 是怎么解析和执行的

这一段和 OpenCode 很不一样。Gemini CLI 没把 tool execution 交给模型 SDK，而是自己跑。

#### 第一步：解析 action

`Turn.run()` 里：

- 读取 `resp.functionCalls ?? []`
- 对每个 `FunctionCall` 调 `handlePendingFunctionCall()`
- 转成内部统一结构 `ToolCallRequestInfo`

这一步相当于把模型的 Action 描述解析成内部请求对象。

#### 第二步：调度 action

之后由外层调用：

- `scheduleAgentTools()` in `agents/agent-scheduler.ts`
- 它内部 new 一个 `Scheduler`
- 再走 `Scheduler.schedule(...)`

`Scheduler` 负责：

- 排队
- policy 检查
- approval / confirmation
- hook
- 真正执行工具
- 收集 `CompletedToolCall`

#### 第三步：把 action 结果回灌

工具执行完成后，SDK 层这样做：

```ts
const functionResponses = completedCalls.flatMap(
  (call) => call.response.responseParts,
);
request = functionResponses;
```

然后继续下一轮 `client.sendMessageStream(...)`。

所以 Gemini 的 loop 更接近：

```text
user request
-> stream model
-> parse functionCalls
-> scheduler executes tools
-> collect functionResponse parts
-> send them back as next request
-> repeat
```

### 2.5 多轮继续的条件

`GeminiClient.processTurn()` 在一轮结束后还会做几件事：

1. 如果流异常但允许恢复，自动补一句 `System: Please continue.`
2. 如果没有工具调用，会做 `checkNextSpeaker()`
3. 如果 `next_speaker === 'model'`，自动补一句 `Please continue.`
4. 如果检测到循环，用 `_recoverFromLoop()` 注入反馈再递归

所以 Gemini 的“继续下一轮”不只由 tool call 决定，还包括：

- stream 恢复
- next-speaker 判定
- loop-recovery
- hook 阻断/放行后的 continuation

这是它比前两个项目更“控制流密集”的地方。

---

## 3. State：历史记录和会话状态怎么管

Gemini 这里至少有三套状态。

### 3.1 真正喂给模型的历史：`GeminiChat.history`

最核心的是：

- `GeminiChat.history: Content[]`

它保存的是 Gemini API 直接可消费的 `Content[]`。

关键方法：

- `getHistory(curated?: boolean)`
- `addHistory(content)`
- `setHistory(history)`
- `clearHistory()`

这里有两个概念：

- `comprehensive history`：所有 turn
- `curated history`：过滤掉无效 model 输出后的历史

过滤逻辑在：

- `extractCuratedHistory()` in `core/geminiChat.ts`

如果某段 model 输出不合法，就不会进入后续请求上下文。

### 3.2 运行期控制状态：`GeminiClient`

`GeminiClient` 里除了 `chat` 之外，还维护很多 loop 级状态：

- `sessionTurnCount`
- `currentSequenceModel`
- `lastPromptId`
- `hasFailedCompressionAttempt`
- `lastSentIdeContext`
- `hookStateMap`

这些状态不直接发送给模型，但决定：

- 当前轮是否超出 turn 限制
- 本轮用哪个 model
- 是否需要压缩历史
- IDE context 发全量还是 delta
- hook 是否已经触发过

所以 `GeminiClient` 更像“会话控制器”。

### 3.3 工具执行状态：`SchedulerStateManager`

工具状态单独维护在：

- `scheduler/state-manager.ts`

`Scheduler` 自己管：

- queued calls
- active calls
- completed batch
- awaiting approval
- executing / success / error / cancelled

也就是说，Gemini 明确把“聊天状态”和“工具运行状态”拆开了。

### 3.4 持久化会话：`ChatRecordingService`

Gemini 会把会话另存到磁盘：

- `~/.gemini/tmp/<project_hash>/chats/*.json`

对应实现：

- `services/chatRecordingService.ts`

保存的结构是 `ConversationRecord`，里面有：

- `sessionId`
- `startTime`
- `lastUpdated`
- `messages`
- `summary`
- `directories`
- `kind`

`messages` 不是简单文本，而是结构化记录：

- user/gemini/info/error/warning
- gemini thoughts
- gemini toolCalls
- token usage
- displayContent

所以：

- `GeminiChat.history` 是“模型上下文真相”
- `ConversationRecord` 是“可恢复/可展示/可审计的磁盘转录”

### 3.5 恢复历史

恢复能力分两层。

#### 第一层：SDK resume

`GeminiCliAgent.resumeSession()` 会从 `Storage.listProjectChatFiles()` 找到 session JSON，再传给：

- `GeminiCliSession(..., resumedData)`

`GeminiCliSession.initialize()` 会把 `conversation.messages` 粗略转成：

- user -> `{ role: 'user', parts }`
- gemini -> `{ role: 'model', parts }`

然后调：

- `client.resumeChat(history, resumedData)`

#### 第二层：更完整的恢复工具

仓库里还提供：

- `convertSessionToClientHistory()` in `utils/sessionUtils.ts`

它比 SDK 那条路径更完整，会把：

- thoughts
- functionCall
- functionResponse

都重建成 Gemini API 需要的交替 `Content[]`。

这说明 Gemini 其实区分了：

- “便捷恢复”
- “高保真恢复”

只是当前 SDK 主链路用的是相对简化的恢复方式。

---

## 4. 记忆管理：System Prompt、Tools、历史如何拼成最终请求

这部分是 Gemini 最值得拆开的地方，因为它并不是只靠 system prompt。

### 4.1 System Prompt 的生成

system prompt 的入口很薄：

- `getCoreSystemPrompt()` in `core/prompts.ts`

真正组装在：

- `PromptProvider.getCoreSystemPrompt()` in `prompts/promptProvider.ts`

它会综合这些输入：

- 交互模式 / 非交互模式
- approval mode（是否 plan mode / yolo）
- skills 列表
- agent definitions
- 当前启用的 tools
- tracker / hook / sandbox / git repo 状态
- `userMemory`
- `GEMINI.md` 相关上下文文件名
- 是否现代模型（决定用 `snippets.ts` 还是 `snippets.legacy.ts`）

最终产出一个大字符串，再经过：

- `renderFinalShell(basePrompt, userMemory, contextFilenames)`

把 memory 与 shell 约束拼进去。

所以 Gemini 的 system prompt 是“模板化拼装”，不是硬编码大常量。

### 4.2 Memory 来自哪里

Gemini 的 memory 至少有三层。

#### 第一层：system-level memory

`Config.getSystemInstructionMemory()` 会被传给 `getCoreSystemPrompt()`。

这部分通常来自：

- 全局 / 扩展 / 项目级记忆
- `GEMINI.md` 体系

在类型上它支持：

```ts
interface HierarchicalMemory {
  global?: string;
  extension?: string;
  project?: string;
}
```

#### 第二层：session 初始化 memory

`getInitialChatHistory()` 会在历史最前面塞一条 user message，里面包含：

- 当前日期
- 操作系统
- project temp dir
- 目录树
- environment/session memory

也就是说，Gemini 除了 system prompt，还会把环境信息作为第一条 `user` 消息放进 history。

#### 第三层：运行时动态 memory

运行时还会不断往 history 注入：

- IDE context
- 压缩后的 `<state_snapshot>`
- history truncation summary
- loop recovery/system continue 提示

因此 Gemini 的“记忆管理”不是单纯 prompt engineering，而是：

- system memory
- initial user context
- dynamic runtime injections

三层一起工作。

### 4.3 Tools 是怎么进请求的

工具声明来自：

- `toolRegistry.getFunctionDeclarations(modelId?)`

在 `GeminiClient.startChat()` 和 `setTools()` 里被包装成：

```ts
const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];
```

然后存进 `GeminiChat.tools`。

真正发请求时，`makeApiCallAndProcessStream()` 会组：

```ts
const config: GenerateContentConfig = {
  ...currentGenerateContentConfig,
  systemInstruction: this.systemInstruction,
  tools: this.tools,
  abortSignal,
}
```

如果 hook 改写了 tool choice，还会额外写入：

- `config.toolConfig`

所以 Gemini 的 tool schema 是在 request `config.tools` 里进入模型的。

### 4.4 历史是怎么裁剪的

Gemini 有两条历史裁剪路径。

#### 路径 A：`ChatCompressionService`

默认路径在：

- `services/chatCompressionService.ts`

大致过程：

1. 看 token 是否超过阈值
2. 先对历史里的大 tool output 做预算内截断
3. 找 split point
4. 用 summarizer 模型把旧历史压成 `<state_snapshot>`
5. 再做一次 verification turn，自检 summary 是否漏信息
6. 生成新的 history：
   - 一条 user `<state_snapshot>`
   - 一条 model 确认
   - 保留最近的未压缩历史

#### 路径 B：`AgentHistoryProvider`

实验路径在：

- `services/agentHistoryProvider.ts`

它不是做完整 chat compression，而是：

1. 按消息数量阈值截断
2. 保留最近 N 条
3. 对前面的历史生成一个 `intent_summary`
4. 把 summary 合并进保留段前面

所以 Gemini 同时支持：

- token-based 压缩
- message-count based 截断 + summary

### 4.5 最终请求对象长什么样

Gemini CLI 自己并不手写 HTTP JSON body，但在代码层已经把“最终请求体”拼成了 `GenerateContentParameters`。

主链路在 `GeminiChat.makeApiCallAndProcessStream()`，最终会生成近似这样的对象：

```ts
const request: GenerateContentParameters = {
  model: modelToUse,
  contents: contentsToUse,
  config: {
    ...currentGenerateContentConfig,
    systemInstruction: this.systemInstruction,
    tools: this.tools,
    abortSignal,
    toolConfig,           // 可选，hook 改写后出现
  },
}
```

如果是 utility LLM 调用，比如压缩器 / summarizer / JSON 生成，则会在 `BaseLlmClient` 里组类似对象：

```ts
const requestParams: GenerateContentParameters = {
  model: currentModel,
  contents,
  config: {
    ...generateContentConfig,
    systemInstruction,
    responseJsonSchema,   // generateJson 时可选
    responseMimeType,     // generateJson 时可选
    abortSignal,
  },
}
```

所以从“最终请求体”角度看，Gemini CLI 的核心字段就是：

- `model`
- `contents`
- `config.systemInstruction`
- `config.tools`
- `config.toolConfig`
- `config.abortSignal`
- 若是 utility call，还可能有 `responseJsonSchema` / `responseMimeType`

### 4.6 `contents` 里到底放了什么

最容易混的是 `contents`。

对 Gemini 而言，`contents` 不是“当前这一句”，而是：

1. 初始环境上下文 user message
2. 之前累计的 curated history
3. 当前 request（用户文本或工具 `functionResponse`）
4. 必要时附加的 IDE context / 压缩 summary / 恢复提示

也就是说，请求体虽然看起来只有一个 `contents` 字段，但里面已经包了：

- system prompt 之外的大部分“记忆”
- 上一轮工具执行结果
- 历史裁剪后的摘要

---

## 5. 三个问题的归纳结论

### 5.1 Agent Loop

Gemini CLI 的核心 loop 不是“模型 SDK 自动帮你跑完”，而是：

- `GeminiClient` 负责多轮递归控制
- `Turn` 负责把模型 chunk 转成统一事件
- `Scheduler` 负责执行工具
- 工具结果通过 `functionResponse` 回灌

这是一个显式实现的 ReAct loop。

### 5.2 State

Gemini 至少维护三套状态：

- `GeminiChat.history`：真正给模型看的上下文
- `GeminiClient`：会话运行控制状态
- `ChatRecordingService`：落盘的 session 转录

工具执行状态则单独在 `SchedulerStateManager` 维护。

### 5.3 记忆管理

Gemini 的最终请求不是“system prompt + 最近几条历史”这么简单，而是三层拼装：

1. `PromptProvider` 生成 system prompt
2. `getInitialChatHistory()` 把环境上下文作为第一条 user 消息注入
3. `GeminiChat` 在运行时持续把压缩摘要、IDE context、tool response 等内容追加到 `contents`

最后统一组成 `GenerateContentParameters`，交给 `@google/genai` 发出。

---

## 6. 和前两者相比，Gemini 最值得记住的差异

- 和 Codex 相比：
  - Codex 更像“自己维护 prompt + item history + tool router”
  - Gemini 更像“自己维护 chat history + event loop + scheduler”
- 和 OpenCode 相比：
  - OpenCode 把 tool execution 更大程度交给 AI SDK
  - Gemini 明确自己解析 `functionCalls`，再自己调 `Scheduler`
- 从状态设计上看：
  - Gemini 的“模型历史”和“磁盘转录”分得非常开
- 从请求组装上看：
  - Gemini 不是单纯裁剪 message list，而是会主动生成 `<state_snapshot>` / `intent_summary` 这种结构化摘要塞回 history

如果后面要继续做三者对比，Gemini 最适合被概括成：

- “显式事件流 + 显式调度器 + 结构化压缩历史”的 agent runtime

