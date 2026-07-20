<p align="center">
  <strong>Scholar CLI</strong>
</p>
<p align="center">A research copilot, command-line native. Built on <a href="https://github.com/sst/opencode">OpenCode</a>.</p>

---

通用 coding agent 帮你写代码,Scholar CLI 陪你做完一项研究——从读透关键论文,到跑通实验,到写出经得起审稿的稿子,全程记得你读过什么、想过什么、试过什么。

产品定位、功能设计与技术路线见 [docs/product/PRODUCT_VISION_v2.md](docs/product/PRODUCT_VISION_v2.md),这是当前唯一有效的产品定义文档。

## 这是什么关系:Scholar CLI 与 OpenCode

这个仓库是 [sst/opencode](https://github.com/sst/opencode) 的 fork(见仓库右上角 fork 标记与 MIT 许可证)。宿主的 agent 循环、工具运行时、多 provider 支持、TUI/Web/Desktop 客户端全部原样继承自上游;Scholar CLI 是长在这套宿主之上的科研领域层——独立的 `packages/scholar` 工具包、按支柱设计的内置工具与子 agent、以及项目研究记忆的注入机制。选择 fork 而非从零自研的理由、以及为什么最终决定采纳上游的 Effect-ts 编排层而不是自己重写一套,记录在 [docs/adr/ADR-018-fork-base-and-effect.md](docs/adr/ADR-018-fork-base-and-effect.md)。

我们保持与上游的定期同步(`git fetch upstream && git merge upstream/dev`),同步节奏与冲突面清单见 [docs/specs/UPSTREAM_SYNC_AND_RELEASE.md](docs/specs/UPSTREAM_SYNC_AND_RELEASE.md)——这份文档也是理解"哪些代码是我们的、哪些是上游的"最快的入口。

## 仓库结构

这不是完整的 OpenCode monorepo——桌面壳、Web 站点、托管服务(console/stats)、企业版、Slack 机器人、组件预览等 15 个与 CLI 无关的上游包已经物理删除(理由与后果见 [ADR-019](docs/adr/ADR-019-prune-unused-upstream-packages.md)),`packages/` 下只留 CLI 真正用到的那部分:

```text
scholar-cli/
├── packages/
│   ├── scholar/          # 领域层:独立 workspace 包,零外部依赖,详见其 README
│   ├── opencode/          # CLI 入口 + 我们的挂接点(见下)
│   ├── tui/                # 终端交互界面,CLI 直接依赖,不是独立 GUI 产品
│   ├── server/               # 会话/工具编排的服务端部分
│   ├── core/                   # 共享领域类型、数据库、Effect 基础设施
│   └── sdk/, plugin/, llm/, protocol/, schema/, script/, codemode/, ui/, cli/
│                                 # 均为 CLI 运行时的直接或传递依赖
├── docs/
│   ├── product/            # 产品定义(现行有效):愿景 v2、旧 ADR 处置清单
│   ├── architecture/        # 架构研究:codex / opencode / claude-code 编排层分析
│   ├── adr/                  # ADR-018 起的新决策记录(旧 17 条在 archive/ 里)
│   ├── specs/                  # 已实现组件的设计规格,现行有效,与代码同步维护
│   ├── research/                # 早期调研报告(harness 对比、文献工具生态)
│   └── archive/                   # 已废弃/已超越的旧材料,只读
└── (其余为上游 OpenCode 的原生目录:.github/、infra/、script/ 等)
```

**领域代码在哪:** `packages/scholar/`。**宿主挂接点在哪:** `packages/opencode/src/tool/scholar.ts`(内置工具包装)、`packages/opencode/src/agent/agent.ts`(reader/writer/checker/synthesizer 四个子 agent 定义)、`packages/opencode/src/session/scholar-context.ts`(项目记忆常驻注入)、`packages/opencode/src/tool/registry.ts`(工具注册)。改这几个文件之外的任何地方,大概率是在改上游代码,先确认是否真的需要。

## 当前能力

**内置工具(12 个)**,按支柱分组——精读与文献:`scholar_search`(arXiv+Semantic Scholar 搜索)、`paper_download`(去重下载)、`paper_fulltext`(全文获取,LaTeX→HTML→PDF→OCR 回退,支持 `section` 参数按章节读,LaTeX/PDF 的抽取结果按内容哈希记忆化避免重复解包)、`paper_outline`(章节大纲,LaTeX/HTML 结构化、PDF 启发式)、`paper_note`(结构化精读笔记)、`bib_import`(存量 BibTeX/Zotero 库一次性迁入)、`arxiv_digest`(按显式主题追踪新论文,排除项目已跟踪的)。写作与引用:`paper_cite`(生成稳定 BibTeX key,联网补全 venue/doi)、`cite_audit`(稿件↔bib↔笔记三方机械对齐)、`paper_verify`(引用存在性核验)。项目记忆:`research_update`(RESEARCH.md 问题/假设/结论)。实验:`experiment_log`(结构化实验记录,关联假设/论文/稿件主张)。

**子 agent(4 个,全部只读/写权限白名单收紧)**:`reader`(精读单篇论文,产出结构化笔记)、`writer`(第一个有写权限的领域子 agent,证据严格限于精读笔记)、`checker`(只读,逐条核对稿件主张与笔记)、`synthesizer`(只读,跨论文综合,证据严格限于笔记)。

**记忆与上下文**:三索引(RESEARCH/NOTES/EXPERIMENTS)常驻注入主会话 system prompt,带预算截尾;四类一等对象(论文、项目认知、实验、稿件引用)全部文件化,靠 id 字段互相关联,写入统一串行化避免并发损坏。

设计细节见 `docs/specs/`:[READER_AND_NOTES_SPEC](docs/specs/READER_AND_NOTES_SPEC.md)、[MEMORY_CITE_EXPERIMENTS_SPEC](docs/specs/MEMORY_CITE_EXPERIMENTS_SPEC.md)、[SECTION_AWARE_READING_SPEC](docs/specs/SECTION_AWARE_READING_SPEC.md)、[BIB_IMPORT_SPEC](docs/specs/BIB_IMPORT_SPEC.md)、[ARXIV_DIGEST_SPEC](docs/specs/ARXIV_DIGEST_SPEC.md)。

功能规划的四批(见愿景 v2 路线图)前三批已全部完成;第四批(RAG 粗筛、记忆图谱的反向查询投影)按 [docs/product/ADR_DISPOSITION.md](docs/product/ADR_DISPOSITION.md) 的处置结论维持推迟,规模化到真正需要时再做,不预先引入数据库。

## 开发

依赖 [Bun](https://bun.sh)。首次拉取后:

```sh
bun install
bun run --cwd packages/opencode --conditions=browser src/index.ts   # 启动 CLI(即 root package.json 的 dev 脚本)
```

改动宿主(`packages/opencode`)后跑 `bun run typecheck`;改动领域层后 `cd packages/scholar && bun test`(默认跳过需要网络的用例,设置 `RUN_NET_TESTS=1` 全跑)。改了 `packages/opencode/src/{tool,agent,session}` 里挂接点相关的文件,额外跑一遍宿主回归 `bun test test/agent test/session test/tool`——这块测试量大(700+),但正是防止我们的改动悄悄破坏上游原生功能的安全网,回归基线见 UPSTREAM_SYNC_AND_RELEASE.md。

## 待做

只剩不适合单方面推进的事:端到端验收场景(用真实研究项目走一遍五步——搜索精读→记忆延续→跨论文综合→写作引用→审稿,这是产品打磨唯一可靠的输入,目前只有零散验证);发布准备(CI、面向用户的分发方式,见 UPSTREAM_SYNC_AND_RELEASE 的发布前清单)。

## 法律与许可

本仓库以 MIT 许可继承自 [sst/opencode](https://github.com/sst/opencode)(见 [LICENSE](LICENSE)),我们的领域层代码同样以 MIT 发布。设计参考材料中曾读过 Claude Code 的 sourcemap 反解源码(非开源许可)——**其代码从未也不会进入本仓库**,只有从中提炼的架构设计思想被记录在 `docs/architecture/claude-code-orchestration-portable-patterns.md`,这是唯一被保留的产物。
