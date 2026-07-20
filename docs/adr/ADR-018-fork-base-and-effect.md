# ADR-018: Fork 基座选定 OpenCode 最新版,采纳 Effect 作为编排层实现基底

- 状态: ACCEPTED
- 决策日期: 2026-07-19
- 决策者: User + Engineering Review
- 编号说明: 延续 `docs/archive/ARCHITECTURE_DECISIONS.md` 的 ADR-001~017 序列,此后新决策均以独立文件存放于 `docs/adr/`

## 背景

产品愿景 v2 确定了 fork OpenCode 作为宿主。但核对最新上游源码(v1.18.3,2026-07-16)时发现重大变化:2026-03-30 的提交 `c5442d418` 起,上游把 SessionPrompt 服务全面重写为 Effect-ts 风格,此后仅 session 目录就有 369 个提交。我们三月份的架构分析(`docs/architecture/opencode-core-analysis.md`)恰好记录的是 Effect 化之前最后的朴素 TS 形态,"OpenCode 自管层是朴素 TS、改造面小"这一选型理由已不再成立。摆在面前的是三条路:fork 最新版并接受 Effect;fork Effect 化之前的 v1.3.7 快照;或放弃 fork 改为自研薄核心。

## 决策

fork 最新版 OpenCode(跟随 v1.18.x 系列),接受 Effect-ts 作为编排层的实现基底。我们自建的 agent 循环与领域服务以 Effect 服务(Context.Service / Layer)的形态实现,与宿主原生机制同构集成,不另起一套并行范式。

## 理由

第一,Effect 的 fiber 结构化并发、层级化取消传播、Scope 资源安全和 Schedule 重试策略,正是我们在 codex-rs 源码分析中最欣赏、原计划手工移植的那批能力(CancellationToken 派生、abort-on-drop、重试收敛);框架直接提供,且质量高于我们手写。第二,保持与活跃上游的同步通道:provider 适配、工具修复、LSP 集成的持续改进可以低成本吸收,这对小团队做公开产品是显著杠杆。第三,fork 旧版等于基于死快照建产品,放弃四个月修复且永久失去上游,是三个选项中维护负债最重的;自研薄核心则推翻了已确认的"fork 完整 harness"路线,起点功能损失过大。

## 代价与缓解

Effect 学习曲线陡峭,团队与 AI 协作时的心智模型都要过这道坎。缓解:领域逻辑(fulltext resolver、精读笔记 schema、引用处理等 `packages/tools` 内容)保持朴素 TS,不感知 Effect;只有编排边界层(循环、工具注册、记忆注入)以 Effect 服务实现,把框架的侵入面控制在最小。此外,`docs/architecture/opencode-core-analysis.md` 的实现细节描述已过期,只保留概念层参考价值,后续需要针对 Effect 化后的新架构重做一份分析。

## 影响

`claude-code-orchestration-portable-patterns.md` 中"取消传播与重试收敛对照 codex 手工实现"的两项,改判为"正确使用 Effect fiber 与 Schedule";移植清单里的 Tool 契约、执行管线、多策略压缩、SubAgent 模型仍然有效,但实现载体从 async generator 改为 Effect 原语。下一步行动:在 GitHub 上建立正式 fork,深读 Effect 化后的 session/tool 层并产出新版架构分析,再启动编排层设计。
