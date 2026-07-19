import { text, list, type PaperMetadata } from "../search-scholar"
import { listNotes } from "../notes/store"

/**
 * arXiv 跟踪摘报:按主题查最近提交的论文,排掉项目已经在追踪的那些,
 * 交给用户/agent 判断哪些值得精读。主题必须显式给出——不从 RESEARCH.md
 * 做关键词自动抽取,那类启发式抽取的准确度不足以决定"查什么",宁可让调用方
 * (agent 读过 RESEARCH.md 之后自己总结成关键词)把话说清楚。
 */

export interface DigestTopic {
  topic: string
  maxResults?: number
}

export interface DigestEntry extends PaperMetadata {
  matchedTopics: string[]
  publishedAt?: string
}

export interface DigestResult {
  entries: DigestEntry[]
  /** 命中但已被项目跟踪(在某篇笔记里出现过)而被排除的数量,如实报告不是漏了。 */
  excludedAlreadyTracked: number
  queriedTopics: string[]
}

export function normTitle(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

async function fetchRecentByTopic(topic: string, maxResults: number): Promise<Array<PaperMetadata & { publishedAt?: string }>> {
  const n = Math.min(Math.max(maxResults, 1), 50)
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(topic)}&sortBy=submittedDate&sortOrder=descending&start=0&max_results=${n}`
  const xml = await fetch(url).then((r) => r.text())

  const out: Array<PaperMetadata & { publishedAt?: string }> = []
  const re = /<entry>([\s\S]*?)<\/entry>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const row = m[1]
    const idUrl = text(row, "id")
    const aid = idUrl.split("/").pop()?.replace(/v\d+$/i, "")
    const title = text(row, "title")
    if (!aid || !title) continue
    const published = text(row, "published")
    out.push({
      id: `arxiv-${aid}`,
      source: "arxiv",
      title,
      authors: list(row, "name"),
      abstract: text(row, "summary"),
      year: Number(published.slice(0, 4)) || undefined,
      pdfUrl: `https://arxiv.org/pdf/${aid}.pdf`,
      arxivId: aid,
      publishedAt: published || undefined,
    })
  }
  return out
}

/**
 * 项目已经在追踪的论文(不论阅读状态如何,只要有笔记就算"已知")——
 * 匹配 arXiv id 或标题近似,双重判据避免同一篇论文因为 id 缺失而漏判成"新"。
 */
export type TrackedMatcher = (entry: { arxivId?: string; title: string }) => boolean

export async function alreadyTrackedMatcher(projectDir: string): Promise<TrackedMatcher> {
  const notes = await listNotes(projectDir)
  const arxivIds = new Set(notes.map((n) => n.paperId).filter((id) => id.startsWith("arxiv-")).map((id) => id.slice(6)))
  const titles = new Set(notes.map((n) => normTitle(n.title)).filter(Boolean))
  return (entry) => (entry.arxivId ? arxivIds.has(entry.arxivId) : false) || titles.has(normTitle(entry.title))
}

/**
 * 纯逻辑,不碰网络/磁盘:把"每个主题各自查到的命中"合并去重、排序、统计排除数。
 * 独立导出是为了能直接用合成数据测试排序/去重/排除三条规则,不必真的打网络请求。
 */
export function mergeDigestHits(
  topicHits: Array<{ topic: string; hits: Array<PaperMetadata & { publishedAt?: string }> }>,
  isTracked: TrackedMatcher,
): DigestResult {
  const byId = new Map<string, DigestEntry>()
  let excluded = 0

  for (const { topic, hits } of topicHits) {
    for (const hit of hits) {
      if (isTracked(hit)) {
        excluded++
        continue
      }
      const existing = byId.get(hit.id)
      if (existing) {
        if (!existing.matchedTopics.includes(topic)) existing.matchedTopics.push(topic)
        continue
      }
      byId.set(hit.id, { ...hit, matchedTopics: [topic] })
    }
  }

  // 多主题命中的排在前面(更可能是真正相关),同等情况下按提交时间倒序。
  const entries = [...byId.values()].sort(
    (a, b) => b.matchedTopics.length - a.matchedTopics.length || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
  )

  return { entries, excludedAlreadyTracked: excluded, queriedTopics: topicHits.map((t) => t.topic) }
}

export async function arxivDigest(projectDir: string, topics: DigestTopic[]): Promise<DigestResult> {
  if (!topics.length) throw new Error("arxiv_digest requires at least one topic to search for")

  const [tracked, topicHits] = await Promise.all([
    alreadyTrackedMatcher(projectDir),
    Promise.all(
      topics.map(async ({ topic, maxResults }) => ({ topic, hits: await fetchRecentByTopic(topic, maxResults ?? 10).catch(() => []) })),
    ),
  ])

  return mergeDigestHits(topicHits, tracked)
}
