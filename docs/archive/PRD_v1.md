# Scholar CLI MVP PRD

## 1. 文档信息
- 产品名称: Scholar CLI（Research Agent）
- 版本: MVP
- 日期: 2026-03-25
- 状态: Draft for Review
- 范围基线: `IMPLEMENTATION_PLAN.md`（完整内容即 MVP）
- 决策基线: `ARCHITECTURE_DECISIONS.md`

## 2. MVP 定义（最终口径）
本项目的 MVP 不是“缩减版功能集”，而是 `IMPLEMENTATION_PLAN.md` 中定义的完整范围。

即：Phase 0 ~ Phase 7 全部属于 MVP 交付范围。

## 3. 背景与问题定义
科研流程被分散在文献管理、对话、写作、实验和版本管理多个工具中，导致上下文断裂与重复劳动。Scholar CLI 的目标是在命令行中打通完整科研链路并保留项目级记忆。

## 4. MVP 目标
1. 在 CLI 中完成完整科研循环：搜索、下载、阅读、总结、写作、实验、版本管理。
2. 具备分层记忆与上下文管理：RESEARCH.md、Papers Index、Active Papers、对话历史。
3. 支持 OpenAI 兼容 API 的可配置接入。
4. 达到实施计划中定义的质量与性能标准。

## 5. MVP 范围（与实施计划一致）
### 5.1 功能范围
- FR-001: 项目初始化（目录、配置、模板、脚手架）。
- FR-002: 学术搜索（arXiv / Semantic Scholar）。
- FR-003: 论文下载与去重存储。
- FR-004: PDF 处理与 fallback（LaTeX source / pdf-parse / OCR）。
- FR-005: SubAgent 论文总结与结构化输出。
- FR-006: 引用管理与相关写作辅助。
- FR-007: 分层文献记忆与项目记忆（RESEARCH.md）。
- FR-008: 上下文动态加载与压缩策略。
- FR-009: Agent 主循环集成与工具编排。
- FR-010: Git 工作流集成。
- FR-011: 测试与质量保障体系。
- FR-012: 文档、部署与发布准备。

### 5.2 非功能范围
- NFR-001: 核心流程稳定，关键场景不崩溃。
- NFR-002: 测试覆盖率 > 80%。
- NFR-003: 批处理性能目标：50 篇论文 < 5 小时。
- NFR-004: 模块化架构可维护（core/tools/memory/cli）。
- NFR-005: 配置与依赖文档完整可复用。

## 6. 非目标（本次 MVP 不做）
1. GUI / Web UI。
2. 多人协作与云同步。
3. 浏览器插件与移动端。
4. 其他实施计划未纳入的扩展特性。

## 7. 里程碑（沿用实施计划）
1. Phase 0: 项目初始化（1 周）
2. Phase 1: OpenCode 架构学习（2-3 周）
3. Phase 2: 核心工具开发（4-6 周）
4. Phase 3: 文献记忆系统（3-4 周）
5. Phase 4: Agent 核心集成（2-3 周）
6. Phase 5: Git 工作流集成（1-2 周）
7. Phase 6: 测试与质量保证（3-4 周）
8. Phase 7: 文档与部署（2-3 周）

## 8. MVP 验收标准（沿用实施计划）
1. 可复现实战场景（Transformer 改进方法论文写作）端到端跑通。
2. Agent 能自动搜索、下载、总结论文并支持写作。
3. Agent 能记住讨论与文献上下文。
4. Agent 能执行实验任务并管理 Git 版本。
5. 质量标准满足覆盖率、稳定性与性能目标。

## 9. 当前冲突项（需统一）
1. `IMPLEMENTATION_PLAN.md` 中仍有 “Anthropic API” 残留描述，与 ADR-002 不一致。
2. “本地模型支持”表述需与 ADR-002 的 OpenAI 兼容 endpoint 口径统一。

