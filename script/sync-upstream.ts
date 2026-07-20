#!/usr/bin/env bun

/**
 * 同步上游 sst/opencode(见 docs/specs/UPSTREAM_SYNC_AND_RELEASE.md)。
 * 只自动化机械部分:拉取、合并、清理被删除包路径下"静默复活"的文件、跑验证。
 * 真正的冲突(README.md、五个编排层插入点)需要人读 diff 决定,本脚本合并出现
 * 冲突时会直接停下并提示,不会替你瞎猜着解决。
 */

import { $ } from "bun"

const PRUNED_PATHS = [
  "packages/app",
  "packages/desktop",
  "packages/web",
  "packages/console",
  "packages/stats",
  "packages/enterprise",
  "packages/slack",
  "packages/storybook",
  "packages/session-ui",
  "packages/identity",
  "packages/client",
  "packages/function",
  "packages/httpapi-codegen",
  "packages/sdk-next",
  "packages/containers",
  "infra",
  "sst.config.ts",
  "sst-env.d.ts",
]

function step(title: string) {
  console.log(`\n\x1b[1m▶ ${title}\x1b[0m`)
}

async function hasConflicts() {
  const out = await $`git diff --name-only --diff-filter=U`.text()
  return out.trim().length > 0 ? out.trim().split("\n") : []
}

step("git fetch upstream")
await $`git fetch upstream`

// Resuming after a prior run stopped for manual conflict resolution: MERGE_HEAD
// still exists, so re-running `git merge` would just fail with "you have not
// concluded your merge". Skip straight to the conflict check in that case.
const resuming = !(await $`git rev-parse -q --verify MERGE_HEAD`.nothrow().quiet()).exitCode

let merge = { exitCode: 0 }
if (resuming) {
  step("恢复上次未完成的合并(跳过重复的 git merge)")
} else {
  step("git merge upstream/dev")
  merge = await $`git merge upstream/dev --no-edit`.nothrow()
}

const conflicts = await hasConflicts()
if (conflicts.length > 0) {
  const readmeConflict = conflicts.includes("README.md")
  const other = conflicts.filter((f) => f !== "README.md")

  if (readmeConflict) {
    console.log("  README.md 冲突,按固定策略保留 ours")
    await $`git checkout --ours README.md`
    await $`git add README.md`
  }

  const prunedConflicts = other.filter((f) => PRUNED_PATHS.some((p) => f === p || f.startsWith(`${p}/`)))
  for (const f of prunedConflicts) {
    console.log(`  ${f} 属于已删除路径,接受删除`)
    await $`git rm -f ${f}`.nothrow()
  }

  const genuine = other.filter((f) => !prunedConflicts.includes(f))
  if (genuine.length > 0) {
    console.log("\n\x1b[31m以下冲突需要人工判断,脚本已停止(其余能自动解决的已处理并 git add):\x1b[0m")
    genuine.forEach((f) => console.log(`  - ${f}`))
    console.log(
      "\n对照 docs/specs/UPSTREAM_SYNC_AND_RELEASE.md 的「合并面清单」逐个解决," +
        "然后 git add 对应文件、git commit,再重新运行本脚本(会跳过已完成的 merge,直接做后续清理与验证)。",
    )
    process.exit(1)
  }
} else if (!merge.exitCode) {
  console.log("  无冲突")
}

step("清理已删除包路径下可能被静默复活的文件")
for (const p of PRUNED_PATHS) {
  await $`git rm -rf --ignore-unmatch ${p}`.quiet()
}
const staged = await $`git status --porcelain`.text()
if (staged.trim()) {
  console.log("  发现复活文件,已重新删除并暂存:")
  console.log(
    staged
      .trim()
      .split("\n")
      .map((l) => `    ${l}`)
      .join("\n"),
  )
} else {
  console.log("  没有复活文件")
}

// 合并本身若产生了合并提交,上面的 git rm 需要并入同一个提交,而不是另开一个。
const mergeHead = await $`git rev-parse -q --verify MERGE_HEAD`.nothrow().quiet()
if (!mergeHead.exitCode) {
  await $`git commit --no-edit`
} else if ((await $`git diff --cached --name-only`.text()).trim()) {
  await $`git commit -m "chore: prune resurrected upstream packages after sync"`
}

step("bun install")
await $`bun install`

step("bun run typecheck")
await $`bun run typecheck`

step("packages/scholar 测试")
await $`bun test`.cwd("packages/scholar")

step("宿主回归(test/agent + test/session + test/tool)")
await $`bun test test/agent test/session test/tool`.cwd("packages/opencode")

console.log(
  "\n\x1b[32m✓ 自动化部分全部通过。\x1b[0m 别忘了:手工冒烟一下(搜论文、派 reader)," +
    "把结果追记进 docs/specs/UPSTREAM_SYNC_AND_RELEASE.md 的「回归基线」节,然后 git push origin dev。",
)
