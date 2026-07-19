import { join } from "node:path"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { root } from "../fulltext/fs"
import { parse, serialize } from "./frontmatter"
import type { NoteInput, NoteMeta, NoteRecord, ReadingStatus } from "./types"

const BODY_TEMPLATE = [
  "## Problem & Motivation",
  "",
  "## Method",
  "",
  "## Experiments & Results",
  "",
  "## Relevance to This Project",
  "",
  "## Limitations & Open Questions",
  "",
  "## Key References",
  "",
].join("\n")

export function notesDir(projectDir: string) {
  return join(root(projectDir), "notes")
}

export function indexPath(projectDir: string) {
  return join(root(projectDir), "NOTES.md")
}

/** paperId 可能含 `/` `:` 等字符(DOI),落盘前收敛成安全文件名。 */
export function noteFileName(paperId: string) {
  return `${paperId.replace(/[^a-zA-Z0-9._-]/g, "-")}.md`
}

export function notePath(projectDir: string, paperId: string) {
  return join(notesDir(projectDir), noteFileName(paperId))
}

// 所有写操作(笔记文件 + 索引重建)经此队列串行化,并行 reader 不会写坏索引。
// 见归档 ADR-006:串行化优于文件锁。
let queue: Promise<unknown> = Promise.resolve()
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn)
  queue = next.catch(() => undefined)
  return next
}

function toMeta(data: Record<string, unknown>, fallbackId: string): NoteMeta {
  const status = data.status === "reading" || data.status === "read" ? data.status : "to_read"
  return {
    paperId: typeof data.paperId === "string" && data.paperId ? data.paperId : fallbackId,
    title: typeof data.title === "string" ? data.title : "",
    status: status as ReadingStatus,
    year: typeof data.year === "number" ? data.year : undefined,
    authors: Array.isArray(data.authors) ? data.authors.map(String) : undefined,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : undefined,
    thesis: typeof data.thesis === "string" && data.thesis ? data.thesis : undefined,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
  }
}

export async function getNote(projectDir: string, paperId: string): Promise<NoteRecord | undefined> {
  const path = notePath(projectDir, paperId)
  const content = await readFile(path, "utf8").catch(() => undefined)
  if (content === undefined) return undefined
  const { data, body } = parse(content)
  return { ...toMeta(data, paperId), body, path }
}

export async function listNotes(projectDir: string): Promise<NoteRecord[]> {
  const dir = notesDir(projectDir)
  const files = await readdir(dir).catch(() => [] as string[])
  const out: NoteRecord[] = []
  for (const file of files.filter((f) => f.endsWith(".md")).sort()) {
    const path = join(dir, file)
    const content = await readFile(path, "utf8").catch(() => undefined)
    if (content === undefined) continue
    const { data, body } = parse(content)
    out.push({ ...toMeta(data, file.slice(0, -3)), body, path })
  }
  return out
}

function renderIndex(notes: NoteRecord[]): string {
  const lines = [
    "# Reading Notes Index",
    "",
    "Auto-generated projection of `.research/notes/`. One line per paper; open the note file for the full content.",
    "",
  ]
  const order: Record<ReadingStatus, number> = { reading: 0, read: 1, to_read: 2 }
  const sorted = notes.toSorted((a, b) => order[a.status] - order[b.status] || a.title.localeCompare(b.title))
  for (const n of sorted) {
    const bits = [
      `- [${n.status}] **${n.title || n.paperId}**`,
      n.year ? `(${n.year})` : undefined,
      `\`${n.paperId}\``,
      n.thesis ? `— ${n.thesis}` : undefined,
    ].filter(Boolean)
    lines.push(bits.join(" "))
  }
  if (!notes.length) lines.push("(no notes yet)")
  lines.push("")
  return lines.join("\n")
}

export async function upsertNote(projectDir: string, input: NoteInput): Promise<NoteRecord> {
  return serialized(async () => {
    await mkdir(notesDir(projectDir), { recursive: true })
    const existing = await getNote(projectDir, input.paperId)
    if (!existing && !input.title) {
      throw new Error(`Creating a new note requires a title (paperId: ${input.paperId})`)
    }
    const meta: NoteMeta = {
      paperId: input.paperId,
      title: input.title ?? existing?.title ?? "",
      status: input.status ?? existing?.status ?? "to_read",
      year: input.year ?? existing?.year,
      authors: input.authors ?? existing?.authors,
      tags: input.tags ?? existing?.tags,
      thesis: input.thesis ?? existing?.thesis,
      updatedAt: new Date().toISOString(),
    }
    const body = input.body ?? existing?.body ?? BODY_TEMPLATE
    const content = `${serialize({ ...meta })}\n\n${body.trimEnd()}\n`
    const path = notePath(projectDir, input.paperId)
    await writeFile(path, content)
    const all = await listNotes(projectDir)
    await writeFile(indexPath(projectDir), renderIndex(all))
    return { ...meta, body, path }
  })
}
