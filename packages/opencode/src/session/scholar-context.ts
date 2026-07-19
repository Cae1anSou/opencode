import { readFile } from "node:fs/promises"
import { Effect } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { researchPath } from "@scholar-cli/tools/memory/research"
import { notesIndexPath } from "@scholar-cli/tools/notes/store"
import { experimentsIndexPath } from "@scholar-cli/tools/experiments/store"

// 注入预算:这两个文件是"廉价常驻上下文",必须小。超限截尾并提示 agent
// 用 read 工具看全文,而不是把长文塞进每一轮请求。
const RESEARCH_BUDGET = 6_000
const NOTES_BUDGET = 4_000
const EXPERIMENTS_BUDGET = 3_000

function clip(content: string, budget: number, fullPath: string) {
  if (content.length <= budget) return content
  return `${content.slice(0, budget)}\n… (truncated — read the full file at ${fullPath})`
}

/**
 * 项目研究记忆的常驻注入:RESEARCH.md(研究问题/假设/结论/时间线)与
 * NOTES.md(精读笔记单行索引)。文件不存在时返回空,不产生任何开销——
 * 非科研项目完全无感。
 */
export const system = Effect.fn("ScholarContext.system")(function* () {
  const ctx = yield* InstanceState.context
  const research = researchPath(ctx.worktree)
  const notes = notesIndexPath(ctx.worktree)
  const experiments = experimentsIndexPath(ctx.worktree)
  const [researchContent, notesContent, experimentsContent] = yield* Effect.promise(() =>
    Promise.all([
      readFile(research, "utf8").catch(() => undefined),
      readFile(notes, "utf8").catch(() => undefined),
      readFile(experiments, "utf8").catch(() => undefined),
    ]),
  )
  const out: string[] = []
  if (researchContent?.trim()) {
    out.push(
      [
        `<research_memory path="${research}">`,
        "Project research memory. Treat it as established context; update it via the research_update tool when questions, hypotheses, or findings change.",
        clip(researchContent.trim(), RESEARCH_BUDGET, research),
        "</research_memory>",
      ].join("\n"),
    )
  }
  if (notesContent?.trim()) {
    out.push(
      [
        `<reading_notes_index path="${notes}">`,
        "Index of papers this project has read. Full structured notes live in .research/notes/<paperId>.md — read them before re-reading or re-summarizing a paper, and dispatch the reader subagent for papers not yet here.",
        clip(notesContent.trim(), NOTES_BUDGET, notes),
        "</reading_notes_index>",
      ].join("\n"),
    )
  }
  if (experimentsContent?.trim()) {
    out.push(
      [
        `<experiments_index path="${experiments}">`,
        "Index of this project's experiments. Full structured logs live in .research/experiments/<id>.md — record new runs and status changes via the experiment_log tool.",
        clip(experimentsContent.trim(), EXPERIMENTS_BUDGET, experiments),
        "</experiments_index>",
      ].join("\n"),
    )
  }
  return out
})

export * as ScholarContext from "./scholar-context"
