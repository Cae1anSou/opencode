import { readFile } from "node:fs/promises"
import { downloadPaper } from "../download-paper"
import { upsertNote, getNote } from "../notes/store"
import { bibPath } from "./bibtex"
import { mkdir, writeFile } from "node:fs/promises"
import { root } from "../fulltext/fs"

/**
 * 迁移入口:把用户存量的 BibTeX 库(Zotero/EndNote/手写 .bib 导出)一次性
 * 搬进项目——每条目落一份 `to_read` 占位笔记(用户之前的阅读进度我们并不知道,
 * 统一从 to_read 起步,不冒充"已读"),原样并入 `.research/references.bib`
 * 让稿件里已有的 `\cite{原 key}` 保持可用,可选顺带下载开放获取全文。
 */

export interface BibEntry {
  key: string
  entryType: string
  title: string
  authors: string[]
  year?: number
  doi?: string
  arxivId?: string
  venue?: string
  raw: string
}

function unwrap(v: string) {
  // BibTeX 字段值可能是 {...}、"..."、或裸 token,统一剥一层。
  const t = v.trim()
  if (t.startsWith("{") && t.endsWith("}")) return t.slice(1, -1).trim()
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).trim()
  return t
}

function findField(body: string, name: string): string | undefined {
  // 值可能跨行、可能嵌套一层花括号(如 {A Study of {GPT}}),用平衡计数取到匹配的右括号。
  const re = new RegExp(`\\b${name}\\s*=\\s*`, "i")
  const m = re.exec(body)
  if (!m) return undefined
  let i = m.index + m[0].length
  while (i < body.length && /\s/.test(body[i])) i++
  if (body[i] === "{") {
    let depth = 1
    let j = i + 1
    while (j < body.length && depth > 0) {
      if (body[j] === "{") depth++
      else if (body[j] === "}") depth--
      j++
    }
    return unwrap(body.slice(i, j))
  }
  if (body[i] === '"') {
    const end = body.indexOf('"', i + 1)
    return end === -1 ? undefined : unwrap(body.slice(i, end + 1))
  }
  const stop = (() => {
    const rel = body.slice(i).search(/[,\n]/)
    return rel === -1 ? body.length : i + rel
  })()
  return unwrap(body.slice(i, stop))
}

function splitAuthors(v: string | undefined): string[] {
  if (!v) return []
  return v
    .split(/\s+and\s+/i)
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      // BibTeX 常见 "Last, First" 形式转成 "First Last",与项目其余模块的作者格式一致。
      const c = a.indexOf(",")
      return c === -1 ? a : `${a.slice(c + 1).trim()} ${a.slice(0, c).trim()}`
    })
}

export function parseBibtex(raw: string): BibEntry[] {
  const out: BibEntry[] = []
  const re = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    const entryType = m[1].toLowerCase()
    if (entryType === "comment" || entryType === "string" || entryType === "preamble") continue
    const key = m[2]
    const bodyStart = m.index + m[0].length
    let depth = 1
    let i = bodyStart
    while (i < raw.length && depth > 0) {
      if (raw[i] === "{") depth++
      else if (raw[i] === "}") depth--
      i++
    }
    const body = raw.slice(bodyStart, i - 1)
    const wholeEntry = raw.slice(m.index, i)

    const title = findField(body, "title") ?? ""
    if (!title) continue

    const yearStr = findField(body, "year")
    const doi = findField(body, "doi")
    const eprint = findField(body, "eprint")
    const archivePrefix = findField(body, "archiveprefix") ?? findField(body, "archivePrefix")
    const arxivId = archivePrefix?.toLowerCase() === "arxiv" ? eprint : eprint?.match(/^\d{4}\.\d{4,5}$/) ? eprint : undefined

    out.push({
      key,
      entryType,
      title,
      authors: splitAuthors(findField(body, "author")),
      year: yearStr ? Number(yearStr) : undefined,
      doi,
      arxivId,
      venue: findField(body, "journal") ?? findField(body, "booktitle"),
      raw: wholeEntry,
    })
  }
  return out
}

export interface ImportOptions {
  download?: boolean
  force?: boolean
}

export interface ImportEntryResult {
  key: string
  paperId: string
  title: string
  noteCreated: boolean
  bibAppended: boolean
  downloaded?: boolean
  downloadError?: string
}

export interface ImportResult {
  total: number
  notesCreated: number
  notesSkipped: number
  bibAppended: number
  bibSkipped: number
  downloaded: number
  downloadFailed: number
  entries: ImportEntryResult[]
}

function paperIdFor(entry: BibEntry): string {
  if (entry.arxivId) return `arxiv-${entry.arxivId.replace(/[^a-zA-Z0-9._-]/g, "-")}`
  if (entry.doi) return `doi-${entry.doi.toLowerCase().replace(/[^a-zA-Z0-9._-]/g, "-")}`
  // 没有可靠外部 id 时,用原 bib key 兜底,加前缀避免和真实来源的 id 撞车。
  return `bibkey-${entry.key.replace(/[^a-zA-Z0-9._-]/g, "-")}`
}

let queue: Promise<unknown> = Promise.resolve()
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn)
  queue = next.catch(() => undefined)
  return next
}

export async function importBibtex(projectDir: string, source: string, opts?: ImportOptions): Promise<ImportResult> {
  const raw = source.includes("@") && !source.endsWith(".bib") ? source : await readFile(source, "utf8")
  const parsed = parseBibtex(raw)

  const result: ImportResult = {
    total: parsed.length,
    notesCreated: 0,
    notesSkipped: 0,
    bibAppended: 0,
    bibSkipped: 0,
    downloaded: 0,
    downloadFailed: 0,
    entries: [],
  }

  for (const entry of parsed) {
    const paperId = paperIdFor(entry)
    const entryResult: ImportEntryResult = { key: entry.key, paperId, title: entry.title, noteCreated: false, bibAppended: false }

    const existingNote = await getNote(projectDir, paperId)
    if (!existingNote) {
      await upsertNote(projectDir, {
        paperId,
        title: entry.title,
        authors: entry.authors.length ? entry.authors : undefined,
        year: entry.year,
        status: "to_read",
      })
      entryResult.noteCreated = true
      result.notesCreated++
    } else {
      result.notesSkipped++
    }

    entryResult.bibAppended = await serialized(async () => {
      await mkdir(root(projectDir), { recursive: true })
      const path = bibPath(projectDir)
      const bib = await readFile(path, "utf8").catch(() => "")
      if (new RegExp(`@\\w+\\{\\s*${entry.key}\\s*,`).test(bib)) return false
      await writeFile(path, bib ? `${bib.trimEnd()}\n\n${entry.raw}\n` : `${entry.raw}\n`)
      return true
    })
    if (entryResult.bibAppended) result.bibAppended++
    else result.bibSkipped++

    if (opts?.download && (entry.arxivId || entry.doi)) {
      try {
        await downloadPaper({ paperId, projectDir, force: opts.force })
        entryResult.downloaded = true
        result.downloaded++
      } catch (e) {
        entryResult.downloaded = false
        entryResult.downloadError = (e as Error).message
        result.downloadFailed++
      }
    }

    result.entries.push(entryResult)
  }

  return result
}
