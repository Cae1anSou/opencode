# Task Plan

## Goal
梳理 `codex/` 的核心执行链路，重点分析：
1. Agent Loop：Observation -> Thought -> Action 的接收、调用模型、解析输出、执行动作流程。
2. State：历史记录与线程状态如何管理。
3. 记忆管理：System Prompt、Tools 定义、裁剪后的对话历史如何组装为最终发给模型的请求体。

## Scope
本轮只分析 `codex/` 代码，不展开 `opencode/`。输出为仓库内 Markdown 文档。

## Phases
- [completed] 定位主入口与关键模块
- [completed] 分析 Agent Loop 主链路
- [completed] 分析 state / history 管理
- [completed] 分析 memory / request assembly
- [completed] 写入 Markdown 文档并自检

## Notes
- 遵循仓库 `AGENTS.md` 与根目录 `RTK.md` 约束，shell 命令优先使用 `rtk` 前缀。
- 当前工作树状态：根仓库未跟踪 `codex/` 目录；视为研究对象，不做回滚操作。
- 正式输出文档：`docs/codex-core-analysis.md`。

## Errors Encountered
- planning-with-files 模板目录在当前环境不存在，改为手工初始化规划文件。
