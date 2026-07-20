import { json } from "./fulltext/http"

export interface SearchScholarArgs {
  query: string
  maxResults?: number
  yearMin?: number
  yearMax?: number
  source?: "arxiv" | "semantic-scholar" | "both"
  semanticKey?: string
}

export interface PaperMetadata {
  id: string
  source: "arxiv" | "semantic-scholar"
  title: string
  authors: string[]
  abstract: string
  year?: number
  citationCount?: number
  pdfUrl?: string
  arxivId?: string
  doi?: string
}

function text(raw: string, tag: string) {
  const m = raw.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))
  return m?.[1]?.replace(/\s+/g, " ").trim() || ""
}

function list(raw: string, tag: string) {
  const out: string[] = []
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi")
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) out.push(m[1].replace(/\s+/g, " ").trim())
  return out
}

async function arxiv(args: SearchScholarArgs): Promise<PaperMetadata[]> {
  const n = Math.min(Math.max(args.maxResults || 20, 1), 100)
  const q = args.query.trim()
  const aid = q.match(/^(\d{4}\.\d{4,5})(v\d+)?$/i)?.[1]
  const url = aid
    ? `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(aid)}`
    : `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&start=0&max_results=${n}`
  const xml = await fetch(url).then((r) => r.text())

  const out: PaperMetadata[] = []
  const re = /<entry>([\s\S]*?)<\/entry>/gi
  let m: RegExpExecArray | null

  while ((m = re.exec(xml))) {
    const row = m[1]
    const idUrl = text(row, "id")
    const aid = idUrl.split("/").pop()?.replace(/v\d+$/i, "")
    const title = text(row, "title")
    const abs = text(row, "summary")
    const pub = text(row, "published")
    const year = Number(pub.slice(0, 4)) || undefined
    const authors = list(row, "name")

    const doi = (() => {
      const dm = row.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/i)
      return dm?.[1]?.trim()
    })()

    if (!aid || !title) continue
    if (args.yearMin && year && year < args.yearMin) continue
    if (args.yearMax && year && year > args.yearMax) continue

    out.push({
      id: `arxiv-${aid}`,
      source: "arxiv",
      title,
      authors,
      abstract: abs,
      year,
      pdfUrl: `https://arxiv.org/pdf/${aid}.pdf`,
      arxivId: aid,
      doi,
    })
  }

  return out
}

export const SEMANTIC_FIELDS = "title,abstract,year,authors,citationCount,openAccessPdf,externalIds"

/** Semantic Scholar 的 paper 行对象到 `PaperMetadata` 的映射，search 和 verify 两条路径共用。 */
export function semanticToPaper(it: unknown): PaperMetadata | undefined {
  const row = typeof it === "object" && it ? (it as Record<string, unknown>) : {}
  const title = "title" in row && typeof row.title === "string" ? row.title : ""
  if (!title) return undefined

  const abs = "abstract" in row && typeof row.abstract === "string" ? row.abstract : ""
  const year = "year" in row && typeof row.year === "number" ? row.year : undefined
  const cite = "citationCount" in row && typeof row.citationCount === "number" ? row.citationCount : undefined
  const pdf =
    "openAccessPdf" in row &&
    typeof row.openAccessPdf === "object" &&
    row.openAccessPdf &&
    "url" in (row.openAccessPdf as Record<string, unknown>) &&
    typeof (row.openAccessPdf as Record<string, unknown>).url === "string"
      ? ((row.openAccessPdf as Record<string, unknown>).url as string)
      : undefined
  const ids =
    "externalIds" in row && typeof row.externalIds === "object" && row.externalIds
      ? (row.externalIds as Record<string, unknown>)
      : {}
  const doi = "DOI" in ids && typeof ids.DOI === "string" ? ids.DOI : undefined
  const arxivId = "ArXiv" in ids && typeof ids.ArXiv === "string" ? ids.ArXiv : undefined
  const paperId = "paperId" in row && typeof row.paperId === "string" ? row.paperId : "unknown"
  const id = doi ? `doi-${doi}` : arxivId ? `arxiv-${arxivId}` : `s2-${paperId}`
  const authors =
    "authors" in row && Array.isArray(row.authors)
      ? row.authors
          .map((a) => {
            if (!a || typeof a !== "object") return ""
            if (!("name" in a)) return ""
            return typeof (a as Record<string, unknown>).name === "string"
              ? ((a as Record<string, unknown>).name as string)
              : ""
          })
          .filter(Boolean)
      : []

  return {
    id,
    source: "semantic-scholar" as const,
    title,
    authors,
    abstract: abs,
    year,
    citationCount: cite,
    pdfUrl: typeof pdf === "string" ? pdf : undefined,
    arxivId,
    doi,
  }
}

async function semantic(args: SearchScholarArgs): Promise<PaperMetadata[]> {
  const n = Math.min(Math.max(args.maxResults || 20, 1), 100)
  const q = encodeURIComponent(args.query)
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${q}&limit=${n}&fields=${encodeURIComponent(SEMANTIC_FIELDS)}`
  const key = args.semanticKey || process.env.SEMANTIC_SCHOLAR_API_KEY
  const headers = key ? { "x-api-key": key } : undefined

  const data = await json(url, { headers }, 12000, 2)
  const list = Array.isArray(data?.data) ? data.data : []

  return list
    .map(semanticToPaper)
    .filter((it): it is PaperMetadata => {
      if (!it) return false
      if (args.yearMin && it.year && it.year < args.yearMin) return false
      if (args.yearMax && it.year && it.year > args.yearMax) return false
      return true
    })
}

function key(it: PaperMetadata) {
  if (it.doi) return `doi:${it.doi.toLowerCase()}`
  if (it.arxivId) return `arxiv:${it.arxivId.toLowerCase()}`
  return `title:${it.title.toLowerCase().replace(/\s+/g, " ")}:${it.year || "na"}`
}

function merge(list: PaperMetadata[]) {
  const map = new Map<string, PaperMetadata>()

  list.forEach((it) => {
    const k = key(it)
    const old = map.get(k)
    if (!old) {
      map.set(k, it)
      return
    }

    map.set(k, {
      ...old,
      ...it,
      authors: old.authors.length >= it.authors.length ? old.authors : it.authors,
      abstract: old.abstract.length >= it.abstract.length ? old.abstract : it.abstract,
      citationCount: Math.max(old.citationCount || 0, it.citationCount || 0) || undefined,
    })
  })

  return [...map.values()]
}

export async function searchScholar(args: SearchScholarArgs): Promise<PaperMetadata[]> {
  const q = args.query.trim()
  if (!q) return []

  const src = args.source || "both"
  const out: PaperMetadata[] = []

  if (src === "arxiv" || src === "both") {
    out.push(...(await arxiv(args)))
  }

  if (src === "semantic-scholar" || src === "both") {
    out.push(...(await semantic(args).catch(() => [])))
  }

  return merge(out).slice(0, Math.min(Math.max(args.maxResults || 20, 1), 100))
}
