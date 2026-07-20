# Findings

## Initial
- `codex/` 是一个独立仓库镜像，核心 Rust 代码在 `codex/codex-rs/`。
- 与本次主题最相关的模块初步集中在：
  - `codex/codex-rs/core/src/client.rs`
  - `codex/codex-rs/app-server/src/codex_message_processor.rs`
  - `codex/codex-rs/app-server/src/thread_state.rs`
  - `codex/codex-rs/app-server-protocol/src/protocol/thread_history.rs`
  - `codex/codex-rs/core/src/memories/*`
  - `codex/codex-rs/core/src/instructions/*`
  - `codex/codex-rs/core/src/tools/*`

## Agent Loop
- 顶层线程入口是 `codex/codex-rs/core/src/codex_thread.rs`，`CodexThread::submit()` 直接委托给 `Codex::submit()`。
- 真正的主循环在 `codex/codex-rs/core/src/codex.rs`：构造 turn context、build tools、build prompt，然后通过 `ModelClientSession::stream()` 发起一次 sampling request。
- 请求层在 `codex/codex-rs/core/src/client.rs`：
  - `build_responses_request()` 把 `Prompt` 转成 `ResponsesApiRequest`。
  - 优先走 `stream_responses_websocket()`，失败则 fallback 到 `stream_responses_api()`。
  - WebSocket 路径会缓存 `last_request` / `last_response_rx`，只发送增量 `input`，并复用 `previous_response_id`。
- 模型流返回的事件由 `try_run_sampling_request()` 消费：
  - `OutputItemAdded` 用于 UI/turn item 的“started”状态。
  - `OutputItemDone` 进入 `handle_output_item_done()`。
  - 若 item 是工具调用，`ToolRouter::build_tool_call()` 解析成 `ToolCall`，再通过 `tool_runtime.handle_tool_call()` 异步执行，并把 tool output 回灌为下一轮 `ResponseInputItem`。
  - 若 item 不是工具调用，则转换为 `TurnItem`、写入历史、发事件给前端。
  - `Completed` 时更新 token/rate limit，并依据 `needs_follow_up` 决定是否继续下一轮。

## State / History
- 会话级状态在 `codex/codex-rs/core/src/state/session.rs::SessionState`。
- turn 级运行态在 `codex/codex-rs/core/src/state/turn.rs::TurnState`，包括 pending approvals、pending user input、pending dynamic tools、pending_input 等。
- 对话历史主体不在 app-server，而在 `codex/codex-rs/core/src/context_manager/history.rs::ContextManager`：
  - `record_items()` 只接收模型 API 可见的 item，并按 `TruncationPolicy` 截断大输出。
  - `for_prompt()` 在真正发给模型前做 normalize，并依据模型 modality 去掉不支持的图片项。
  - `remove_first_item()` / `replace()` 支撑 compact 和 rollback 类操作。
- app-server 还有一套“面向客户端线程视图”的状态：
  - `app-server/src/thread_state.rs::ThreadState` 持有 `ThreadHistoryBuilder`，用于把运行时事件归并成 active turn snapshot。
  - `app-server-protocol/src/protocol/thread_history.rs::ThreadHistoryBuilder` 负责把 `EventMsg` / `RolloutItem` 还原为 `Turn[]`，给 UI 的线程历史展示使用。
- 另有全局 message history 文件 `core/src/message_history.rs`，落盘到 `~/.codex/history.jsonl`，它更像“命令面板/历史检索”的附加日志，不是主 prompt history。

## Memory / Request Assembly
- 会话初始化时，`codex.rs` 会解析基础指令优先级：
  1. `config.base_instructions`
  2. resume/fork 历史里的 `session_meta.base_instructions`
  3. 当前 model 默认 instructions
- `build_initial_context()` 负责生成首轮或需要全量 reinject 时的上下文块，内容包括：
  - policy / sandbox / approval developer instructions
  - session developer instructions
  - memory developer instructions（来自 `build_memory_tool_developer_instructions()`）
  - collaboration mode / personality / apps / skills / plugins / commit trailer 等补充 developer sections
  - AGENTS.md user instructions
  - EnvironmentContext XML
- `build_prompt()` 只做最后一步拼装：`input + tools + parallel_tool_calls + base_instructions + personality + output_schema`。
- tools 定义来自 `ToolRouter::model_visible_specs()`，底层由 `tools/spec.rs` 生成 Responses API 所需 schema。
- 真正发送前，`Prompt::get_formatted_input()` 还会对 `apply_patch` 场景做 shell output 重序列化，保证 freeform tool 的 output 是纯文本。
- 记忆系统不是直接把 `MEMORY.md` 塞进历史；而是把 `memory_summary.md` 截断后，作为 developer instructions 注入 prompt。
