import { json } from "./fulltext/http"
import { searchScholar, semanticToPaper, SEMANTIC_FIELDS, type PaperMetadata } from "./search-scholar"

export interface VerifyPaperArgs {
  /** 待核验的引用标题，通常来自笔记或稿件里的一句"某某年的这篇工作"。 */
  title: string
  authors?: string[]
  year?: number
  doi?: string
  arxivId?: string
  semanticKey?: string
}

export interface VerifyPaperResult {
  /** 未超过置信度阈值时为空——宁可承认"没找到"，也不要把弱匹配当成确认过的引用。 */
  match?: PaperMetadata
  confidence: number
  reason: string
}

const CONFIDENT = 0.8

function normTitle(v: string) {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function titleTokens(v: string) {
  return new Set(normTitle(v).split(" ").filter((w) => w.length > 2))
}

function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter += 1
  const union = a.size + b.size - inter
  return union ? inter / union : 0
}

function surname(name: string) {
  return name.trim().split(/\s+/).pop()?.toLowerCase() || ""
}

function authorOverlap(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0
  const as = new Set(a.map(surname).filter(Boolean))
  const bs = new Set(b.map(surname).filter(Boolean))
  if (!as.size || !bs.size) return 0
  let hit = 0
  for (const s of as) if (bs.has(s)) hit += 1
  return hit / as.size
}

function yearScore(a: number | undefined, b: number | undefined) {
  if (!a || !b) return 0.5 // 缺年份时不惩罚也不加分，交给标题/作者判断
  const diff = Math.abs(a - b)
  if (diff === 0) return 1
  if (diff === 1) return 0.5 // 预印本年份与正式发表年份常常差一年
  return 0
}

/** 导出供单测直接验证打分逻辑，不必真的打网络请求。 */
export function matchScore(query: VerifyPaperArgs, candidate: PaperMetadata) {
  const titleSim = jaccard(titleTokens(query.title), titleTokens(candidate.title))
  const authorSim = query.authors ? authorOverlap(query.authors, candidate.authors) : 0.5
  const ySim = yearScore(query.year, candidate.year)
  return titleSim * 0.65 + authorSim * 0.2 + ySim * 0.15
}

async function directLookup(query: VerifyPaperArgs): Promise<PaperMetadata | undefined> {
  const id = query.doi ? `DOI:${query.doi}` : query.arxivId ? `ARXIV:${query.arxivId}` : undefined
  if (!id) return undefined

  const key = query.semanticKey || process.env.SEMANTIC_SCHOLAR_API_KEY
  const headers = key ? { "x-api-key": key } : undefined
  const url = `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(id)}?fields=${encodeURIComponent(SEMANTIC_FIELDS)}`

  try {
    const row = await json(url, { headers }, 12000, 1)
    return semanticToPaper(row)
  } catch {
    return undefined
  }
}

/**
 * 面向"引用核验"场景的高精度定位：给一个标题/作者/年份/DOI/arXiv 组合，
 * 返回唯一最佳匹配及其置信度，而不是像 `searchScholar` 那样返回一批候选
 * 供人挑选。用于支柱二"被引论文是否真的说了那句话"之前的第一步——先确认
 * 引用确实指向存在的那篇论文。
 */
export async function verifyPaper(args: VerifyPaperArgs): Promise<VerifyPaperResult> {
  if (args.doi || args.arxivId) {
    const hit = await directLookup(args)
    if (hit) {
      const s = matchScore(args, hit)
      if (s >= CONFIDENT) return { match: hit, confidence: s, reason: "matched by doi/arxiv id" }
      return { match: hit, confidence: s, reason: "doi/arxiv id resolved but title/author mismatch — verify manually" }
    }
  }

  const candidates = await searchScholar({
    query: args.title,
    source: "both",
    maxResults: 10,
    semanticKey: args.semanticKey,
  }).catch(() => [] as PaperMetadata[])

  if (!candidates.length) return { confidence: 0, reason: "no candidates found" }

  const ranked = candidates
    .map((c) => ({ c, s: matchScore(args, c) }))
    .sort((a, b) => b.s - a.s)

  const best = ranked[0]
  if (best.s >= CONFIDENT) return { match: best.c, confidence: best.s, reason: "matched by title/author/year similarity" }
  return { confidence: best.s, reason: "best candidate below confidence threshold" }
}
