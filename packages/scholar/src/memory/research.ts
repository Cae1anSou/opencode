import { join } from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { root } from "../fulltext/fs"

/**
 * 项目级研究记忆:`.research/RESEARCH.md`。
 * 人类可直接阅读与手改;agent 经 research_update 工具结构化更新。
 * 三个固定小节承载"当前认知"(整节替换),Log 小节只增不改,承载时间线。
 */

export type ResearchSection = "questions" | "hypotheses" | "findings"

const HEADINGS: Record<ResearchSection, string> = {
  questions: "## Research Questions",
  hypotheses: "## Hypotheses",
  findings: "## Findings & Decisions",
}

const LOG_HEADING = "## Log"

const TEMPLATE = [
  "# Research Memory",
  "",
  "Project-level research memory. Agents update it via the research_update tool; humans can edit it directly.",
  "",
  HEADINGS.questions,
  "",
  HEADINGS.hypotheses,
  "",
  HEADINGS.findings,
  "",
  LOG_HEADING,
  "",
].join("\n")

export function researchPath(projectDir: string) {
  return join(root(projectDir), "RESEARCH.md")
}

// 与笔记层同理:写入串行化,避免并行更新互相覆盖(归档 ADR-006)。
let queue: Promise<unknown> = Promise.resolve()
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn)
  queue = next.catch(() => undefined)
  return next
}

export async function readResearch(projectDir: string): Promise<string> {
  return readFile(researchPath(projectDir), "utf8").catch(() => TEMPLATE)
}

/** 按固定标题切分;标题缺失(用户手改删掉了)时按需补回,不破坏其余内容。 */
function splitSections(content: string) {
  const all = [HEADINGS.questions, HEADINGS.hypotheses, HEADINGS.findings, LOG_HEADING]
  const positions = all
    .map((h) => ({ h, at: content.indexOf(`${h}\n`) === -1 ? content.indexOf(h) : content.indexOf(`${h}\n`) }))
    .filter((p) => p.at !== -1)
    .sort((a, b) => a.at - b.at)
  const head = positions.length ? content.slice(0, positions[0].at) : content
  const bodies = new Map<string, string>()
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].at + positions[i].h.length
    const end = i + 1 < positions.length ? positions[i + 1].at : content.length
    bodies.set(positions[i].h, content.slice(start, end).replace(/^\n+/, "").trimEnd())
  }
  return { head: head.trimEnd(), bodies }
}

function render(head: string, bodies: Map<string, string>) {
  const lines = [head.trim() || "# Research Memory", ""]
  for (const h of [HEADINGS.questions, HEADINGS.hypotheses, HEADINGS.findings, LOG_HEADING]) {
    lines.push(h)
    const body = bodies.get(h)
    lines.push(body ? body : "")
    lines.push("")
  }
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`
}

export interface ResearchUpdate {
  /** 整节替换这三个"当前认知"小节之一。 */
  section?: ResearchSection
  content?: string
  /** 追加一条带日期的时间线记录(与 section 更新可同时发生)。 */
  log?: string
}

export async function updateResearch(projectDir: string, update: ResearchUpdate): Promise<string> {
  if (!update.log && !(update.section && update.content !== undefined)) {
    throw new Error("research_update requires either {section, content} or {log}")
  }
  return serialized(async () => {
    await mkdir(root(projectDir), { recursive: true })
    const current = await readResearch(projectDir)
    const { head, bodies } = splitSections(current)
    if (update.section && update.content !== undefined) {
      bodies.set(HEADINGS[update.section], update.content.trim())
    }
    if (update.log) {
      const date = new Date().toISOString().slice(0, 10)
      const existing = bodies.get(LOG_HEADING) ?? ""
      const entry = `- [${date}] ${update.log.trim()}`
      bodies.set(LOG_HEADING, existing ? `${existing}\n${entry}` : entry)
    }
    const next = render(head, bodies)
    await writeFile(researchPath(projectDir), next)
    return next
  })
}
