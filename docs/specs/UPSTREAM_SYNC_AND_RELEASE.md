# 上游同步策略与发布准备

- 日期: 2026-07-20(2026-07-20 追记:仓库合并)
- 对象: fork(github.com/Cae1anSou/scholar-cli,原名 opencode,dev 分支)与上游 sst/opencode 的长期共存方式,以及公开发布前的工程清单

## 仓库合并记录(2026-07-20)

项目原本拆成两个 GitHub 仓库:`Cae1anSou/schoar-cli`(注:曾经的仓库名有拼写错误,少一个 l)只放文档,`Cae1anSou/opencode` 放全部实际代码。这个拆分在实践中很别扭——想找"Scholar CLI 这个产品"的人在 GitHub 上根本找不到,只会看到一堆文档仓库和一个顶着"forked from sst/opencode"身份的代码仓库。现已合并:`docs/` 整树迁入本仓库(历史提交记录留在旧仓库,旧仓库已归档只读,不删除),随后把这个 fork 仓库改名为 `scholar-cli`。旧仓库地址:`github.com/Cae1anSou/schoar-cli`(archived)。

一个直接后果:根目录 `README.md` 从上游的 OpenCode 产品介绍替换成了 Scholar CLI 自己的介绍。这意味着**每次 `git merge upstream/dev` 时 README.md 几乎必定冲突**——上游会持续修改它自己的 README,我们也有自己的内容。解决方式固定:冲突时保留我们的版本(`git checkout --ours README.md && git add README.md`),不要尝试合并两份内容。这是刻意的取舍,不是遗留问题:比起为了减少这一处必然冲突而让仓库首页继续显示"OpenCode",宁可接受这个冲突点。

## 已删除的上游包(2026-07-20,ADR-019)

`packages/` 下与 Scholar CLI 运行时无关的 15 个上游包(桌面壳、Web 站点、托管服务、企业版、Slack 机器人、组件预览等)已物理删除,连带多语言 README、SST 部署配置(`infra/`、`sst.config.ts`)、专属 CI workflow。决策与验证过程见 [ADR-019](../adr/ADR-019-prune-unused-upstream-packages.md)。

这意味着合并面清单从"零冲突"变成"这些路径上必然偶发冲突"。固定处理方式:合并出现在下列路径的冲突时一律接受删除(不合并上游的改动内容),合并完成后、提交合并结果前跑一次:

```sh
git rm -rf --ignore-unmatch packages/app packages/desktop packages/web packages/console \
  packages/stats packages/enterprise packages/slack packages/storybook packages/session-ui \
  packages/identity packages/client packages/function packages/httpapi-codegen packages/sdk-next \
  packages/containers infra sst.config.ts sst-env.d.ts
```

若上游对根 `package.json` 的 `scripts`/`workspaces.packages` 做了改动且合并产生冲突,同理:凡是指向上述已删包的条目一律不保留。

## 合并面清单

我们对上游文件的改动刻意保持"加法优先":绝大部分代码在全新文件里,上游文件只有少数插入点。未来 `git merge upstream/dev` 时,冲突只可能出现在下面这些位置,按此清单逐一核对即可,不需要通读 diff。

全新文件(上游不存在,永不冲突):`packages/scholar/` 整个包;`packages/opencode/src/tool/scholar.ts`;`packages/opencode/src/session/scholar-context.ts`;`packages/opencode/src/agent/prompt/reader.txt`、`checker.txt`、`synthesizer.txt`;顶层 `docs/`(合并进来的文档树)。

上游文件的插入点(共五个文件,新增第五个见上一节):`packages/opencode/src/tool/registry.ts` 有四处成对插入——import 一行、`yield*` 工具初始化若干行、`Effect.all` 的键值若干行、builtin 数组若干行,全部以 scholar 工具名可识别;`packages/opencode/src/session/prompt.ts` 有两处——import 一行、system 组装的 `Effect.all` 里追加 `ScholarContext.system()` 与 system 数组里的展开;`packages/opencode/src/agent/agent.ts` 有两处——prompt 导入两行、`agents` 记录中插入 reader/checker/synthesizer 三个定义(位于 explore 与 compaction 之间);`packages/opencode/package.json` 的 devDependencies 一行;根目录 `README.md`(必然冲突,固定保留 ours,见上一节)。若上游重构了插入点所在文件(如再次搬移 system 组装位置),按 `docs/specs/MEMORY_CITE_EXPERIMENTS_SPEC.md` 描述的语义重新挂接即可——注入点的本质是"system prompt 组装处"与"工具注册表",不管上游代码怎么挪,这两个概念位置总能找到。

## 同步节奏

建议每一至两周 `git fetch upstream && git merge upstream/dev`,合并后跑三件事:`packages/scholar` 的 bun test(领域层不该受影响)、`packages/opencode` 的 typecheck 与 test/agent + test/session + test/tool(我们插入点所在区域)、以及一次手工冒烟(搜索一篇论文并派 reader)。上游 Effect 化后迭代很快,拖得越久合并面越陡。

## 发布前清单

命名与品牌:仓库名与文档统一用 Scholar CLI(2026-07-20 仓库改名已落地);bin 名、是否保留 opencode 命令兼容仍未定,需要产品决策。分发方式:上游经 `packages/core/bin/opencode` 分发,我们首选跟随其构建管线出自己的 npm 包或独立二进制,次选先以"clone + bun install + bun run dev"的开发者姿势发布 alpha。CI:仓库上建 GitHub Actions,跑 typecheck + scholar 测试 + 插入点区域测试,上游同步 PR 也走同一套门禁。文档:面向用户的 README(已完成,根目录)、快速开始(初始化一个研究项目、五个验收场景的教程化版本,未写)。许可与致谢:MIT 下保留上游 LICENSE 与出处声明(已完成,README 明确"built on opencode")。

## 回归基线(ADR-014 落实记录)

2026-07-20(功能规划四批全部完成 + 清理 + 性能优化后终复核)宿主受影响区域(test/agent + test/session + test/tool,41 个文件)763 测试 0 失败;领域层(packages/scholar,含 RUN_NET_TESTS=1)56 测试 0 失败,覆盖章节大纲、下载、引用元数据补全、arXiv 摘报的真实网络端到端验证。至此 12 个内置工具、4 个领域子 agent 全部有回归覆盖。

2026-07-20(功能规划批次一至三完成后复核)对宿主受影响区域(test/agent + test/session + test/tool,现已扩展到 41 个文件)重跑:763 测试 0 失败;领域层(packages/scholar,含 RUN_NET_TESTS=1)49 测试 0 失败,含真实论文的章节大纲、下载、引用元数据补全端到端验证。

2026-07-20 对 fork dev(含全部 scholar 改动)执行宿主回归:改动核心区 test/agent + test/session 共 425 测试 0 失败,test/tool 的 registry/tool-define/task 共 40 测试 0 失败。全量套件 3195 测试跑两轮,归因后**零回归**:`test/session/prompt.test.ts` 的一次超时(5016ms/5000ms 限时)单独重跑 57 测试 0 失败,是并行负载 flake;`test/server/httpapi-sdk.test.ts` 在纯上游基线 worktree 上同样失败(16 fail + 4 errors),是上游自身的环境依赖问题。甄别方法留档:失败文件先在我们的 dev 单独重跑(排除负载 flake),再在 `git worktree add <tmp> upstream/dev` 的纯上游环境重跑(两边都红即上游问题)。此后每次上游合并后重跑并在此追记。
