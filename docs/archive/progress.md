# Progress

## 2026-03-29
- 读取根目录 `AGENTS.md` 指向的 `~/.codex/RTK.md`。
- 读取 `codex/AGENTS.md`，确认 Rust 仓库工作约束。
- 运行 planning-with-files 的 session catchup，发现旧会话上下文与当前任务无关。
- 初步检索 `codex-rs` 中与 responses、history、tools、memory 相关的文件路径。
- 初始化 `task_plan.md`、`findings.md`、`progress.md`。
- 深读 `client.rs`、`codex.rs`、`stream_events_utils.rs`、`ToolRouter`、`SessionState`、`ContextManager`、`thread_state.rs`、`thread_history.rs`。
- 确认 `codex/` 的核心主链路：`CodexThread::submit` -> `Codex` turn loop -> `build_prompt` -> `ModelClientSession::stream` -> `ResponseEvent` 消费 -> `ToolRouter` 分发 -> tool output 回灌。
- 确认会话真实 prompt history 由 `ContextManager` 管理，app-server 的 `ThreadHistoryBuilder` 主要服务 UI 重建与 resume snapshot。
- 确认 memory 注入采用 developer instructions 方式，而不是把完整 memory 文件直接并入对话历史。
