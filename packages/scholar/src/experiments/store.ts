import { join } from "node:path"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { root } from "../fulltext/fs"
import { parse, serialize } from "../notes/frontmatter"

/**
 * 实验记录层:`.research/experiments/<id>.md` + `EXPERIMENTS.md` 单文件索引。
 * 与笔记层同构:frontmatter 承载结构化字段,正文承载过程与解读,
 * 写入串行化。`papers` 与 `claims` 字段是记忆图谱的第一批边:
 * 实验 ↔ 论文(方法来源)、实验 ↔ 稿件主张(证据关系)。
 */

export type ExperimentStatus = "planned" | "running" | "done" | "failed"

export interface ExperimentMeta {
  id: string
  title: string
  status: ExperimentStatus
  /** 本实验要检验的假设(通常对应 RESEARCH.md Hypotheses 里的一条)。 */
  hypothesis?: string
  /** 方法来源的论文 id 列表(与 .research/notes/ 对应)。 */
  papers?: string[]
  /** 本实验支撑(或推翻)的稿件主张,自由文本或稿件行锚点。 */
  claims?: string[]
  tags?: string[]
  updatedAt: string
}

export interface ExperimentInput {
  id: string
  title?: string
  status?: ExperimentStatus
  hypothesis?: string
  papers?: string[]
  claims?: string[]
  tags?: string[]
  /** 提供时整体替换正文;省略时保留已有正文。 */
  body?: string
}

export interface ExperimentRecord extends ExperimentMeta {
  body: string
  path: string
}

const BODY_TEMPLATE = [
  "## Setup",
  "",
  "## Command",
  "",
  "## Results",
  "",
  "## Interpretation",
  "",
  "## Next Steps",
  "",
].join("\n")

export function experimentsDir(projectDir: string) {
  return join(root(projectDir), "experiments")
}

export function experimentsIndexPath(projectDir: string) {
  return join(root(projectDir), "EXPERIMENTS.md")
}

export function experimentFileName(id: string) {
  return `${id.replace(/[^a-zA-Z0-9._-]/g, "-")}.md`
}

export function experimentPath(projectDir: string, id: string) {
  return join(experimentsDir(projectDir), experimentFileName(id))
}

let queue: Promise<unknown> = Promise.resolve()
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn)
  queue = next.catch(() => undefined)
  return next
}

const STATUSES: ExperimentStatus[] = ["planned", "running", "done", "failed"]

function toMeta(data: Record<string, unknown>, fallbackId: string): ExperimentMeta {
  return {
    id: typeof data.id === "string" && data.id ? data.id : fallbackId,
    title: typeof data.title === "string" ? data.title : "",
    status: STATUSES.includes(data.status as ExperimentStatus) ? (data.status as ExperimentStatus) : "planned",
    hypothesis: typeof data.hypothesis === "string" && data.hypothesis ? data.hypothesis : undefined,
    papers: Array.isArray(data.papers) ? data.papers.map(String) : undefined,
    claims: Array.isArray(data.claims) ? data.claims.map(String) : undefined,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : undefined,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
  }
}

export async function getExperiment(projectDir: string, id: string): Promise<ExperimentRecord | undefined> {
  const path = experimentPath(projectDir, id)
  const content = await readFile(path, "utf8").catch(() => undefined)
  if (content === undefined) return undefined
  const { data, body } = parse(content)
  return { ...toMeta(data, id), body, path }
}

export async function listExperiments(projectDir: string): Promise<ExperimentRecord[]> {
  const dir = experimentsDir(projectDir)
  const files = await readdir(dir).catch(() => [] as string[])
  const out: ExperimentRecord[] = []
  for (const file of files.filter((f) => f.endsWith(".md")).sort()) {
    const content = await readFile(join(dir, file), "utf8").catch(() => undefined)
    if (content === undefined) continue
    const { data, body } = parse(content)
    out.push({ ...toMeta(data, file.slice(0, -3)), body, path: join(dir, file) })
  }
  return out
}

function renderIndex(items: ExperimentRecord[]): string {
  const lines = [
    "# Experiments Index",
    "",
    "Auto-generated projection of `.research/experiments/`. One line per experiment.",
    "",
  ]
  const order: Record<ExperimentStatus, number> = { running: 0, planned: 1, done: 2, failed: 3 }
  const sorted = items.toSorted((a, b) => order[a.status] - order[b.status] || a.id.localeCompare(b.id))
  for (const e of sorted) {
    const bits = [
      `- [${e.status}] **${e.title || e.id}** \`${e.id}\``,
      e.hypothesis ? `— tests: ${e.hypothesis}` : undefined,
      e.papers?.length ? `(papers: ${e.papers.join(", ")})` : undefined,
    ].filter(Boolean)
    lines.push(bits.join(" "))
  }
  if (!items.length) lines.push("(no experiments yet)")
  lines.push("")
  return lines.join("\n")
}

export async function upsertExperiment(projectDir: string, input: ExperimentInput): Promise<ExperimentRecord> {
  return serialized(async () => {
    await mkdir(experimentsDir(projectDir), { recursive: true })
    const existing = await getExperiment(projectDir, input.id)
    if (!existing && !input.title) {
      throw new Error(`Creating a new experiment requires a title (id: ${input.id})`)
    }
    const meta: ExperimentMeta = {
      id: input.id,
      title: input.title ?? existing?.title ?? "",
      status: input.status ?? existing?.status ?? "planned",
      hypothesis: input.hypothesis ?? existing?.hypothesis,
      papers: input.papers ?? existing?.papers,
      claims: input.claims ?? existing?.claims,
      tags: input.tags ?? existing?.tags,
      updatedAt: new Date().toISOString(),
    }
    const body = input.body ?? existing?.body ?? BODY_TEMPLATE
    const content = `${serialize({ ...meta })}\n\n${body.trimEnd()}\n`
    const path = experimentPath(projectDir, input.id)
    await writeFile(path, content)
    const all = await listExperiments(projectDir)
    await writeFile(experimentsIndexPath(projectDir), renderIndex(all))
    return { ...meta, body, path }
  })
}
