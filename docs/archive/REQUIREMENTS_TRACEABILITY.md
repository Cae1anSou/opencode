# Scholar CLI MVP 需求追踪矩阵

## 1. 功能需求追踪

| 需求ID | 需求描述 | 对应 Phase | 依据 | 验证方式 |
|---|---|---|---|---|
| FR-001 | 项目初始化与工程脚手架 | Phase 0 | IMPLEMENTATION_PLAN | CLI + CI 验证 |
| FR-002 | OpenCode 架构吸收与 fork 策略 | Phase 1 | IMPLEMENTATION_PLAN | 设计评审 |
| FR-003 | 学术搜索（arXiv/S2） | Phase 2 | IMPLEMENTATION_PLAN | API 集成测试 |
| FR-004 | 下载与去重存储 | Phase 2 | IMPLEMENTATION_PLAN | 单测 + 集成 |
| FR-005 | PDF 处理与 fallback | Phase 2 | ADR-005 | 样本回归 |
| FR-006 | SubAgent 总结机制 | Phase 2 | ADR-003/013 | 质量评估 |
| FR-007 | 引用管理与写作支持 | Phase 2 | IMPLEMENTATION_PLAN | 内容验收 |
| FR-008 | 分层存储与 RESEARCH.md | Phase 3 | IMPLEMENTATION_PLAN | 文件系统测试 |
| FR-009 | 上下文动态加载/压缩 | Phase 3 | ADR-007 | Token 压测 |
| FR-010 | Agent 主循环集成与工具编排 | Phase 4 | IMPLEMENTATION_PLAN | E2E |
| FR-011 | Git 工作流集成 | Phase 5 | IMPLEMENTATION_PLAN | Git 行为测试 |
| FR-012 | 测试体系与质量门禁 | Phase 6 | IMPLEMENTATION_PLAN | 测试报告 |
| FR-013 | 文档与部署 | Phase 7 | IMPLEMENTATION_PLAN | 文档审查 + 发布演练 |

## 2. 非功能需求追踪

| 需求ID | 指标 | 目标值 | 验证方式 |
|---|---|---|---|
| NFR-001 | 稳定性 | 核心流程不崩溃 | 长会话回归 |
| NFR-002 | 覆盖率 | >80% | coverage 报告 |
| NFR-003 | 性能 | 50 篇 < 5 小时 | 性能测试 |
| NFR-004 | 可维护性 | 模块化清晰 | 架构评审 |
| NFR-005 | 可配置性 | endpoint/key/model 可改 | 配置测试 |

## 3. 冲突与澄清
1. API 策略以 ADR-002 为准（OpenAI 兼容）。
2. 实施计划中的 Anthropic 残留表述需统一修订。
3. 本地模型口径建议统一到“可接兼容 endpoint”。

