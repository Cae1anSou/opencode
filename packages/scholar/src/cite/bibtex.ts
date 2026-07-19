import { join } from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { root } from "../fulltext/fs"
import { getNote } from "../notes/store"

/**
 * 引用层:从"项目里真正读过/存过的论文"生成 BibTeX,而不是临时网络检索。
 * 产物是 `.research/references.bib`——LaTeX 稿件直接 \bibliography 引用它。
 */

export interface CiteInput {
  /** 项目文献 id(如 arxiv-1706.03762);提供时自动从精读笔记补全元数据。 */
  paperId?: string
  title?: string
  authors?: string[]
  year?: number
  doi?: string
  arxivId?: string
  url?: string
  venue?: string
}

export interface CiteResult {
  key: string
  entry: string
  path: string
  /** true 表示该 key 已存在于 references.bib,本次未重复写入。 */
  existed: boolean
}

export function bibPath(projectDir: string) {
  return join(root(projectDir), "references.bib")
}

let queue: Promise<unknown> = Promise.resolve()
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn)
  queue = next.catch(() => undefined)
  return next
}

function lastName(author: string) {
  // "Smith, John" 形式取逗号前;"John Smith" 形式取末词。
  const comma = author.indexOf(",")
  const raw = comma > 0 ? author.slice(0, comma) : (author.trim().split(/\s+/).pop() ?? author)
  return raw.replace(/[^a-zA-Z]/g, "").toLowerCase() || "anon"
}

const STOPWORDS = new Set(["a", "an", "the", "on", "of", "for", "and", "with", "to", "in", "is", "are", "at"])

function titleWord(title: string) {
  for (const w of title.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w && !STOPWORDS.has(w)) return w
  }
  return "untitled"
}

export function bibtexKey(input: { title: string; authors?: string[]; year?: number }) {
  const author = input.authors?.length ? lastName(input.authors[0]) : "anon"
  return `${author}${input.year ?? "nd"}${titleWord(input.title)}`
}

function esc(v: string) {
  return v.replace(/[{}]/g, "")
}

export function toBibtex(key: string, input: CiteInput & { title: string }) {
  const arxivId = input.arxivId ?? (input.paperId?.startsWith("arxiv-") ? input.paperId.slice(6) : undefined)
  const kind = input.venue ? "article" : arxivId ? "misc" : input.doi ? "article" : "misc"
  const fields: [string, string][] = [["title", `{${esc(input.title)}}`]]
  if (input.authors?.length) fields.push(["author", `{${input.authors.map(esc).join(" and ")}}`])
  if (input.year !== undefined) fields.push(["year", `{${input.year}}`])
  if (input.venue) fields.push(["journal", `{${esc(input.venue)}}`])
  if (input.doi) fields.push(["doi", `{${esc(input.doi)}}`])
  if (arxivId) {
    fields.push(["eprint", `{${esc(arxivId)}}`])
    fields.push(["archivePrefix", "{arXiv}"])
  }
  if (input.url) fields.push(["url", `{${esc(input.url)}}`])
  const body = fields.map(([k, v]) => `  ${k} = ${v}`).join(",\n")
  return `@${kind}{${key},\n${body}\n}`
}

function existingKeys(bib: string) {
  return new Set(Array.from(bib.matchAll(/@\w+\{\s*([^,\s]+)\s*,/g)).map((m) => m[1]))
}

export async function addCitation(projectDir: string, input: CiteInput): Promise<CiteResult> {
  return serialized(async () => {
    let merged: CiteInput = { ...input }
    if (input.paperId) {
      const note = await getNote(projectDir, input.paperId)
      if (note) {
        merged = {
          ...merged,
          title: merged.title ?? note.title,
          authors: merged.authors ?? note.authors,
          year: merged.year ?? note.year,
        }
      }
    }
    if (!merged.title) {
      throw new Error("paper_cite requires a title (directly, or via a paperId that has a reading note)")
    }
    const path = bibPath(projectDir)
    const bib = await readFile(path, "utf8").catch(() => "")
    const keys = existingKeys(bib)
    let key = bibtexKey({ title: merged.title, authors: merged.authors ? [...merged.authors] : undefined, year: merged.year })
    if (keys.has(key)) {
      const entryRe = new RegExp(`@\\w+\\{${key},[\\s\\S]*?\\n\\}`)
      const prior = bib.match(entryRe)?.[0]
      // 同名同年同首词大概率是同一篇:直接复用已有条目,保证稿件里 key 稳定。
      if (prior && prior.includes(esc(merged.title))) {
        return { key, entry: prior, path, existed: true }
      }
      let i = 98 // 'b'
      while (keys.has(key + String.fromCharCode(i))) i++
      key = key + String.fromCharCode(i)
    }
    const entry = toBibtex(key, merged as CiteInput & { title: string })
    await mkdir(root(projectDir), { recursive: true })
    await writeFile(path, bib ? `${bib.trimEnd()}\n\n${entry}\n` : `${entry}\n`)
    return { key, entry, path, existed: false }
  })
}
