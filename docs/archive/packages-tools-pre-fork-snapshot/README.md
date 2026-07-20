# 归档说明

这是 fork OpenCode(ADR-018)之前、Phase 2.1 阶段独立开发的领域工具代码快照(2026-03-27 ~ 2026-07-19)。当时项目尚未确定二开基座,搜索/下载/fulltext resolver 是作为可独立运行的 TS 包先行验证的。

**此目录已过期,不再维护,不要在这里改代码。** 现行的领域代码在 fork(`opencode/packages/scholar/`,github.com/Cae1anSou/opencode)里,已经比这份快照多出 `cite/`(引用生成、审计、导入)、`experiments/`、`memory/`、`notes/`、`fulltext/outline.ts` 整套模块,连基础的 `fulltext/extract.ts`(多文件 LaTeX 拼装顺序修复)也已经不同步。保留这份快照只是为了可追溯"起点长什么样",git 历史本身也保留了完整演进过程,这份目录不是必需的参考,只是省得翻 log。

原始设计文档见 `docs/specs/LITERATURE_SEARCH_DOWNLOAD_SPEC.md`(该文档现行有效,描述的存储约定与设计原则在 fork 里仍然适用,只是实现文件位置变了)。
