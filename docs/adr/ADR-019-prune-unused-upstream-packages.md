# ADR-019: 物理删除未使用的上游包,放弃这部分的可合并性

- 状态: ACCEPTED
- 决策日期: 2026-07-20
- 决策者: User

## 背景

仓库合并改名后(见 ADR-018 后续 UPSTREAM_SYNC_AND_RELEASE.md 的"仓库合并记录"),`packages/` 下仍然带着完整的上游 monorepo:桌面壳(app/desktop)、Web 站点(web)、托管服务(console 四个子包、stats 三个子包)、企业版(enterprise)、Slack 机器人(slack)、组件预览(storybook)等共 15 个包,总计 87MB 源码,没有一个被 Scholar CLI 的运行时用到——依赖图核实过:`packages/opencode` 的直接与传递依赖闭包是 tui/server/sdk/plugin/codemode/llm/protocol/schema/script/core/ui,这 15 个包不在其中,且在整个闭包源码里搜不到任何对它们的引用。

问题是这些包该不该留着。此前(见本文件同目录 `UPSTREAM_SYNC_AND_RELEASE.md`)的既定策略是"加法优先、少碰上游文件",目的是让未来 `git merge upstream/dev` 保持廉价。物理删除这 15 个包会打破这个前提:上游持续改动这些活跃产品,每次同步都可能在已删除的路径上产生冲突。

## 决策

物理删除。用户的理由是这些文件正在妨碍新加入项目的人理解代码库——打开 `packages/` 看到 20 多个目录,分不清哪些是"我们真正在做的东西"。这个体验成本被判断为高于"上游同步偶尔要处理冲突"的成本,并且后者可以被大幅摊薄(见下)。

删除范围:15 个包目录(app/desktop/web/console/stats/enterprise/slack/storybook/session-ui/identity/client/function/httpapi-codegen/sdk-next/containers)、多语言 README(21 个 `README.*.md`,只留 `README.md`)、SST 部署配置(`infra/`、`sst.config.ts`、`sst-env.d.ts`,整套都是部署上述已删服务用的)、5 个专属于已删包的 CI workflow(containers/deploy/docs-locale-sync/docs-update/storybook)、`test.yml` 里专属于 `packages/app`(整个 e2e job)与 `packages/client`(一个 step)的部分、`script/translate-app.*`(维护多语言 README 的脚本)、根 `package.json` 里指向这些包的 scripts 与 workspace glob 条目。

保留但已知有过时引用、未处理:`CONTRIBUTING.md`(6 处提及已删包,属于贡献指南文字,不阻塞开发,留作后续小修)。

## 代价与缓解

代价是真实的:以后 `git merge upstream/dev` 如果上游改过这 15 个包路径下的任何文件,会产生"modify/delete"冲突,需要处理。缓解措施是把处理成本从"每次逐个决策"降到"每次跑一条命令":

```sh
git rm -rf --ignore-unmatch packages/app packages/desktop packages/web packages/console \
  packages/stats packages/enterprise packages/slack packages/storybook packages/session-ui \
  packages/identity packages/client packages/function packages/httpapi-codegen packages/sdk-next \
  packages/containers infra sst.config.ts sst-env.d.ts
```

固定策略是:合并冲突里只要涉及这些路径,一律接受删除(resurrect 的文件重新删掉),不合并内容。这条命令应作为 `docs/specs/UPSTREAM_SYNC_AND_RELEASE.md` 同步流程的标准步骤之一,合并后、提交合并结果前跑一次。

## 验证

删除后 `bun install`(20 个包被移除,lockfile 干净)、`bun run typecheck`(全 workspace 从 37 个包降到 17 个,15/15 通过)、`packages/scholar` 单元测试(56 测试 0 失败)、宿主受影响区域回归(test/agent + test/session + test/tool,763 测试 0 失败,与删除前的基线完全一致)、CLI 冒烟启动(`--version` 正常退出)全部通过,确认零功能回归。

## 影响

`docs/specs/UPSTREAM_SYNC_AND_RELEASE.md` 的合并面清单需要新增"已删除路径"一节记录上述命令;根 README.md 的仓库结构图需要移除对这些目录的描述。
