# Codex 核心机制分析（一）：`codex/`

本文只分析 `scholar-cli/codex/` 里的实现，聚焦三个问题：

1. Agent Loop：如何接收 Observation、调用模型、解析输出并执行 Action
2. State：如何管理线程状态与历史记录
3. 记忆管理：如何把 System Prompt、Tools、历史记录拼成最终请求体

---

## 1. 代码入口总览

这部分核心 Rust 代码在 `codex/codex-rs/`，这次最关键的文件是：

- `codex/codex-rs/core/src/codex_thread.rs`
- `codex/codex-rs/core/src/codex.rs`
- `codex/codex-rs/core/src/client.rs`
- `codex/codex-rs/core/src/stream_events_utils.rs`
- `codex/codex-rs/core/src/tools/router.rs`
- `codex/codex-rs/core/src/state/session.rs`
- `codex/codex-rs/core/src/state/turn.rs`
- `codex/codex-rs/core/src/context_manager/history.rs`
- `codex/codex-rs/app-server/src/thread_state.rs`
- `codex/codex-rs/app-server-protocol/src/protocol/thread_history.rs`

可以先把它们分成三层：

- `core/src/codex.rs`：主调度层，决定一轮 turn 怎么跑
- `core/src/client.rs`：模型请求层，负责把 `Prompt` 变成 Responses API 请求并流式接收结果
- `core/src/tools/*` + `stream_events_utils.rs`：动作执行层，负责把模型输出转成 tool call 并执行

---

## 2. Agent Loop

### 2.1 顶层入口

线程入口非常薄：

- `CodexThread::submit()` in `core/src/codex_thread.rs`
- 它直接调用 `Codex::submit()`

也就是说，`CodexThread` 更像线程壳，真正的 loop 在 `Codex` 内部。

### 2.2 一轮 turn 的主流程

主流程集中在 `core/src/codex.rs`，关键链路是：

1. 构造 `TurnContext`
2. 依据当前 turn 构建可见工具集合 `ToolRouter`
3. 组装 `Prompt`
4. 调用 `ModelClientSession::stream()` 向模型发请求
5. 消费流式 `ResponseEvent`
6. 对非工具输出直接落历史，对工具输出转成 `ToolCall`
7. 执行工具，把 tool output 作为下一轮输入回灌
8. 若本轮产生 follow-up input，则继续下一次 sampling request

对应关键函数：

- `build_prompt()` in `core/src/codex.rs`
- `run_sampling_request()` / `try_run_sampling_request()` in `core/src/codex.rs`
- `handle_output_item_done()` in `core/src/stream_events_utils.rs`

### 2.3 Observation 是怎么进来的

这里的“Observation”本质上有两类：

1. 模型流返回的事件
2. 工具执行后返回的结果

模型流返回的是 `ResponseEvent`，在 `try_run_sampling_request()` 里被消费。关键分支：

- `ResponseEvent::OutputItemAdded(item)`
  - 用于 UI/turn item 的 started 状态
- `ResponseEvent::OutputItemDone(item)`
  - 这是最关键的分支
  - 进入 `handle_output_item_done()`
- `ResponseEvent::Completed { token_usage, .. }`
  - 表示这一轮模型输出结束
  - 更新 token usage / rate limit
  - 判断是否需要 follow-up

工具结果则会被包装成 `ResponseInputItem::FunctionCallOutput`、`CustomToolCallOutput` 等，再追加回 turn 的 pending input，成为下一轮模型可见的 observation。

### 2.4 Thought 是怎么触发的

Codex 不会显式写一个 `thought()` 函数；它的 “Thought” 阶段就是重新向模型发一次 request。

具体入口在：

- `ModelClientSession::stream()` in `core/src/client.rs`

这个函数会：

- 优先尝试 `stream_responses_websocket()`
- 如果 WebSocket 不可用或需要降级，则 fallback 到 `stream_responses_api()`

请求体由 `build_responses_request()` 生成，里面把：

- `instructions`
- `input`
- `tools`
- `reasoning`
- `parallel_tool_calls`
- `output_schema`

拼成 `ResponsesApiRequest`。

### 2.5 Action 是怎么解析和执行的

模型输出完成一个 item 后，`handle_output_item_done()` 会判断它是不是工具调用。

核心步骤：

1. `ToolRouter::build_tool_call(session, item)`
2. 如果是工具调用，构造 `ToolCall`
3. 调用 `tool_runtime.handle_tool_call(call, cancellation_token)`
4. 工具返回结果后，封装成 `ResponseInputItem`
5. 作为 follow-up input 继续发给模型

`ToolRouter::build_tool_call()` 支持几类动作：

- `ResponseItem::FunctionCall`
- `ResponseItem::CustomToolCall`
- `ResponseItem::ToolSearchCall`
- `ResponseItem::LocalShellCall`

这一步相当于把模型输出的“Action 描述”解析成内部统一动作对象。

### 2.6 Agent Loop 的真实形态

如果用一个更贴近代码的形式描述，可以写成：

```text
submit user op
-> build turn context
-> build prompt
-> stream model response
-> for each ResponseEvent:
   - if normal output: persist to history
   - if tool call: dispatch tool, collect tool output
-> if tool output exists: append pending input
-> repeat sampling request until Completed and no follow-up
```

所以 Codex 的 loop 不是单个 while 里写死 Observation/Thought/Action 三步，而是：

- 以 `Prompt -> stream -> parse items -> execute tools -> append new input -> resample`
- 这样一轮轮递归推进

这是典型的 tool-augmented ReAct/Responses API agent loop。

---

## 3. State：历史记录和线程状态怎么管

这里要分清三套状态，容易混：

1. `core` 里的真实 prompt history
2. `app-server` 里的线程展示状态
3. 全局 message history 文件

### 3.1 真正喂给模型的历史：`ContextManager`

最核心的是：

- `core/src/context_manager/history.rs::ContextManager`

它维护：

- `items: Vec<ResponseItem>`
- `token_info`
- `reference_context_item`

关键方法：

- `record_items()`
  - 把新的 `ResponseItem` 写入历史
  - 只保留模型 API 可见的 item
  - 大输出会按 `TruncationPolicy` 截断
- `for_prompt()`
  - 真正发请求前调用
  - 会做 normalize
  - 会根据模型的 `InputModality` 删除不支持的图片内容
- `remove_first_item()`
  - compact 时从最老历史开始裁剪
- `replace()`
  - 用于 compact/rollback 之后整体替换历史

这套状态才是“下一次要发给模型的历史上下文”。

### 3.2 会话级状态：`SessionState`

定义在：

- `core/src/state/session.rs::SessionState`

这里除了 `history: ContextManager`，还放了：

- `latest_rate_limits`
- `server_reasoning_included`
- `dependency_env`
- `previous_turn_settings`
- `active_connector_selection`
- `granted_permissions`

也就是说，`SessionState` 是整个线程的长期可变状态容器，而 `ContextManager` 是其中最重要的一块。

### 3.3 turn 级运行态：`TurnState`

定义在：

- `core/src/state/turn.rs::TurnState`

它保存的是“一轮运行中的临时状态”：

- `pending_approvals`
- `pending_request_permissions`
- `pending_user_input`
- `pending_dynamic_tools`
- `pending_input`
- `tool_calls`
- `token_usage_at_turn_start`

这里最关键的是 `pending_input`。

工具执行完成后，输出不会直接覆盖历史，而是先进入 pending input，作为下一轮模型调用的附加输入。这正是 loop 能继续推进的原因。

### 3.4 app-server 的线程状态：给 UI 看，不是给模型喂 prompt

定义在：

- `app-server/src/thread_state.rs::ThreadState`
- `app-server-protocol/src/protocol/thread_history.rs::ThreadHistoryBuilder`

这一层做的事是：

- 接收运行时 `EventMsg`
- 增量构造 `Turn`
- 提供 `active_turn_snapshot()`
- 在 resume/rejoin 时把 rollout/history 重建成 UI 可读的 turn 列表

`ThreadHistoryBuilder::handle_event()` 会把各种事件归并为 UI 线程项，例如：

- `UserMessage`
- `AgentMessage`
- `Reasoning`
- `ExecCommandBegin/End`
- `McpToolCallBegin/End`
- `DynamicToolCallRequest/Response`
- `TurnStarted/TurnComplete`

这套状态主要服务 app-server 和前端展示，不是模型采样时直接用的 prompt history。

### 3.5 全局 message history：附加日志

还有一个单独的文件：

- `core/src/message_history.rs`

它会把文本历史追加到：

- `~/.codex/history.jsonl`

这一层的特征很明显：

- append-only
- 按行 JSON 存储
- 有 lock 和 max bytes 裁剪

它更像“全局历史检索/命令面板日志”，不是每轮采样时直接用的上下文。

---

## 4. 记忆管理：最终请求体是怎么拼出来的

这部分是这次分析里最值得关注的。

### 4.1 base instructions 的优先级

在 `core/src/codex.rs` 初始化 session 时，base instructions 的优先级是：

1. `config.base_instructions`
2. resume/fork 历史里的 `session_meta.base_instructions`
3. 当前 model 默认 instructions

对应逻辑在 session 初始化处。

这说明 Codex 允许：

- 配置层覆盖模型默认 system prompt
- 历史线程恢复时继承之前的 base instructions

### 4.2 初始上下文不是简单字符串拼接，而是结构化生成

真正负责“拼上下文块”的函数是：

- `build_initial_context()` in `core/src/codex.rs`

它会收集两类 section：

- `developer_sections`
- `contextual_user_sections`

其中 `developer_sections` 会聚合：

- policy / sandbox / approval instructions
- session developer instructions
- memory developer instructions
- collaboration mode instructions
- realtime update
- personality message
- apps section
- skills section
- plugins section
- commit trailer instruction

而 `contextual_user_sections` 会聚合：

- AGENTS.md user instructions
- EnvironmentContext XML

最后再分别通过：

- `build_developer_update_item(...)`
- `build_contextual_user_message(...)`

变成 `ResponseItem`。

也就是说，Codex 不是简单地把 system prompt 拼成一个超长字符串，而是把多种上下文源整理成多个结构化 `ResponseItem`。

### 4.3 Prompt 的最后组装

最终的 `Prompt` 在 `build_prompt()` 里构造：

- `input`
- `tools`
- `parallel_tool_calls`
- `base_instructions`
- `personality`
- `output_schema`

也就是说，最终给 `client.rs` 的不是原始文本，而是一个中间层对象 `Prompt`。

然后在 `client.rs` 里：

- `Prompt::get_formatted_input()` 产出规范化后的 `input`
- `create_tools_json_for_responses_api(&prompt.tools)` 产出 tool schema
- `build_responses_request()` 产出 `ResponsesApiRequest`

### 4.4 tools 是怎么进请求体的

tools 定义来自：

- `ToolRouter::model_visible_specs()`

而 `ToolRouter` 本身由 `ToolRouter::from_config(...)` 构造，背后用的是 `tools/spec.rs`。

这里做了几件事：

- 根据 config / feature flag 组装内建工具
- 合并 MCP tools / app tools / dynamic tools
- 过滤 code-mode nested tools
- 只把当前模型真正可见的 tools 暴露给 prompt

最后在 `client.rs` 里转成 Responses API 所需 JSON schema。

### 4.5 history 是怎么裁剪后进入请求体的

历史进入请求体的路径是：

1. `SessionState.history` 持有完整 `ContextManager`
2. 发送前 clone 一份 history
3. `history.for_prompt(input_modalities)` 进行 normalize
4. 必要时 strip image / 清理 ghost snapshot / 修正 call-output 配对
5. 填入 `Prompt.input`

另外，compact 逻辑在 `core/src/compact.rs`：

- 当上下文过长时，调用 compact task
- 生成 summary
- 用 `replace_compacted_history()` 替换原历史
- 保证后续 prompt 只携带压缩后的 replacement history

所以裁剪不是在请求发送前临时拍脑袋完成，而是：

- 平时 `record_items()` 就会处理大输出截断
- 超长上下文再通过 compact 进行结构化压缩

### 4.6 memory 是怎么注入的

记忆相关在：

- `core/src/memories/prompts.rs`
- `core/src/codex.rs::build_initial_context()`

关键点：

- `memory_summary.md` 会被读取
- 会按 token 限额截断
- 然后通过 `build_memory_tool_developer_instructions()` 生成一段 developer instructions
- 再作为 developer section 注入 prompt

这意味着：

- Codex 不会把完整 `MEMORY.md` 粗暴地并入普通聊天历史
- 而是把总结后的 memory 以“开发者说明”的形式塞给模型

这是一个很重要的设计选择，因为它把 memory 放在高优先级的指令层，而不是普通对话层。

---

## 5. 一个更准确的整体链路图

可以把 `codex/` 的核心执行链路总结成下面这样：

```text
User Op
-> CodexThread::submit
-> Codex::submit
-> create TurnContext
-> build_initial_context / clone history
-> build ToolRouter
-> build Prompt
-> ModelClientSession::stream
-> Responses API / WebSocket stream
-> ResponseEvent loop
   -> normal item: persist to ContextManager + emit UI events
   -> tool item: parse to ToolCall -> execute -> generate ResponseInputItem
-> if pending_input exists: continue sampling
-> Completed
-> update token/rate limits/history
```

如果映射到 ReAct：

- Observation
  - 历史上下文
  - 环境上下文
  - 工具输出
  - 上一轮模型输出
- Thought
  - Responses API sampling
- Action
  - `FunctionCall` / `CustomToolCall` / `LocalShellCall` / MCP tool call

---

## 6. 结论

针对这次的三个问题，可以直接总结为：

### 6.1 Agent Loop

Codex 的 agent loop 核心不在 app-server，而在 `core/src/codex.rs + core/src/client.rs`。

它的模式是：

- 先构建 `Prompt`
- 再流式接收 `ResponseEvent`
- 解析 `OutputItemDone`
- 若是工具调用则执行工具
- 把工具结果追加为 follow-up input
- 重复采样直到没有 follow-up

### 6.2 state

真正的 prompt history 由 `ContextManager` 管理，挂在 `SessionState.history` 下面。

而 app-server 的 `ThreadHistoryBuilder` 主要负责：

- 事件流转 turn 视图
- resume/rejoin 时重建 UI 历史

两者目标不同，不应混为一谈。

### 6.3 记忆管理 / 请求体拼装

Codex 采用三层拼装：

1. `build_initial_context()` 先生成 developer/contextual-user 级别的上下文 item
2. `build_prompt()` 再把 `input + tools + instructions + schema` 组装成 `Prompt`
3. `build_responses_request()` 最后转成真正发送给模型的 `ResponsesApiRequest`

memory 注入方式不是普通聊天历史，而是 developer instructions 注入，这一点非常关键。

---

## 7. 下一步建议

如果要继续分析 `opencode/`，建议保持同样的拆解框架：

1. 找到最上层 submit / run loop 入口
2. 找到 prompt 组装点
3. 找到工具执行分发点
4. 找到 history/state 与 UI-thread-state 的分界点
5. 找到 memory 是注入到 system/developer 层还是 message 层

这样最后两边可以直接横向对比。
