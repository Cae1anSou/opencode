import { resolve } from "./resolve"
import { fetchTarget } from "./fetch"
import { rawLatexSource, decodeBytes, stripLatex, stripHtml, pdfLayoutText } from "./extract"
import type { In, RunOpts, Target, Trace } from "./types"

/**
 * 章节感知阅读:在 resolve/fetch 拿到的原始载体上直接找章节边界,
 * 不经过 extract() 的纯文本管线——那条管线会把 LaTeX 标题文字连同命令
 * 一起吃掉(见 extract.ts 的 stripLatex 注释),HTML/PDF 也丢失了结构。
 *
 * 三种来源的可靠度不同,如实标注:
 * - latex/html 是结构标记(\section{} / <h1-6>),confidence: "structural"
 * - pdf 是版式启发式(编号行、全大写短行猜测),confidence: "heuristic",
 *   可能漏检或误判,不承诺完整覆盖
 */

export type OutlineConfidence = "structural" | "heuristic"

export interface OutlineEntry {
  title: string
  level: number
  index: number
}

export interface Mark {
  level: number
  title: string
  start: number
  end: number
}

function toOutline(marks: Mark[]): OutlineEntry[] {
  return marks.map((m, i) => ({ title: m.title, level: m.level, index: i }))
}

/** 从 mark[i] 结束处切到下一个"同级或更高级"标题开始处(或文末)——
 * 子章节的正文含在父章节切片里,符合"要方法节"通常想连子节一起看的直觉。 */
export function sliceFor(marks: Mark[], i: number, source: string): string {
  const level = marks[i].level
  let end = source.length
  for (let j = i + 1; j < marks.length; j++) {
    if (marks[j].level <= level) {
      end = marks[j].start
      break
    }
  }
  return source.slice(marks[i].end, end)
}

export function outlineLatex(raw: string): { marks: Mark[]; source: string } {
  const source = raw.replace(/%.*$/gm, "")
  const re = /\\(section|subsection|subsubsection)\*?\{([^}]*)\}/g
  const marks: Mark[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    const level = m[1] === "section" ? 1 : m[1] === "subsection" ? 2 : 3
    const title = stripLatex(m[2]).trim() || m[2].trim()
    if (title) marks.push({ level, title, start: m.index, end: m.index + m[0].length })
  }
  return { marks, source }
}

export function outlineHtml(raw: string): { marks: Mark[]; source: string } {
  const re = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi
  const found: Mark[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    const title = stripHtml(m[2]).trim()
    if (title) found.push({ level: Number(m[1]), title, start: m.index, end: m.index + m[0].length })
  }
  if (!found.length) return { marks: [], source: raw }
  // ar5iv 的标题层级通常从 h2/h3 起(h1 是论文标题),把最浅层级重映射成 1
  // 这样下游看到的 level 语义与 LaTeX 的 section/subsection 一致。
  const minLevel = Math.min(...found.map((f) => f.level))
  const marks = found.map((f) => ({ ...f, level: f.level - minLevel + 1 }))
  return { marks, source: raw }
}

const PDF_KEYWORD_HEADINGS = new Set([
  "abstract",
  "introduction",
  "related work",
  "background",
  "method",
  "methods",
  "methodology",
  "experiments",
  "experimental setup",
  "results",
  "discussion",
  "limitations",
  "conclusion",
  "conclusions",
  "acknowledgments",
  "acknowledgements",
  "references",
  "appendix",
])

/** PDF 无结构标记,只能猜:编号行("3.1 Method Details")或已知章节关键词的
 * 独立短行。宁可漏检也不乱标——不在名单/编号模式里的行一律不算标题。 */
export function outlinePdfLayout(layout: string): { marks: Mark[]; source: string } {
  const marks: Mark[] = []
  let offset = 0
  const lines = layout.split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    const start = offset
    offset += line.length + 1

    if (!trimmed || trimmed.length > 90) continue

    const numbered = trimmed.match(/^(\d+(?:\.\d+){0,2})\.?\s+([A-Z][A-Za-z][^\n]{1,80})$/)
    if (numbered) {
      const level = numbered[1].split(".").length
      marks.push({ level, title: numbered[2].trim(), start, end: start + line.length })
      continue
    }

    const bare = trimmed.replace(/^\d+\.?\s*/, "").trim()
    if (PDF_KEYWORD_HEADINGS.has(bare.toLowerCase())) {
      marks.push({ level: 1, title: bare, start, end: start + line.length })
    }
  }
  return { marks, source: layout }
}

export function bestMatch(marks: Mark[], query: { title?: string; index?: number }): number {
  if (query.index !== undefined) {
    const i = query.index >= 1 ? query.index - 1 : query.index
    return i >= 0 && i < marks.length ? i : -1
  }
  if (!query.title) return -1
  const q = query.title.toLowerCase().trim()
  const exact = marks.findIndex((m) => m.title.toLowerCase().trim() === q)
  if (exact !== -1) return exact
  const contains = marks.findIndex((m) => m.title.toLowerCase().includes(q) || q.includes(m.title.toLowerCase()))
  if (contains !== -1) return contains
  // 词形宽松匹配:公共前缀足够长即算同词根(experiment/experiments/experimental
  // 共享前缀 "experiment"),允许词尾最多 3 个字符不同,短词(如 "and")天然够不到阈值。
  const stems = (title: string) => title.toLowerCase().split(/\W+/).filter((w) => w.length > 2)
  const commonPrefixLen = (a: string, b: string) => {
    let n = 0
    while (n < a.length && n < b.length && a[n] === b[n]) n++
    return n
  }
  const sameStem = (a: string, b: string) => {
    if (a === b) return true
    const p = commonPrefixLen(a, b)
    return p >= 5 && p >= Math.min(a.length, b.length) - 3
  }
  const qWords = stems(q)
  let best = -1
  let bestScore = 0
  marks.forEach((m, i) => {
    const words = stems(m.title)
    let overlap = 0
    for (const w of qWords) if (words.some((x) => sameStem(x, w))) overlap++
    // 相对查询词覆盖率(不是相对标题词数)——查询词全部命中即视为强匹配,
    // 即便标题里还有查询没提到的词("Experimental Setup and Results" vs "experiments")。
    const score = qWords.length ? overlap / qWords.length : 0
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  })
  return bestScore >= 0.5 ? best : -1
}

interface OutlineFetchResult {
  outline: OutlineEntry[]
  confidence: OutlineConfidence
  format: "latex" | "html" | "pdf" | "none"
  target?: Target
  trace: Trace[]
  note?: string
  // 内部字段,section() 复用同一次抓取结果,避免二次网络请求。
  _marks: Mark[]
  _source: string
}

async function fetchOutline(input: In, opts?: RunOpts): Promise<OutlineFetchResult> {
  const rr = await resolve(input, opts)

  for (const target of rr.targets) {
    try {
      const fetched = await fetchTarget(target, opts)

      if (target.kind === "latex") {
        const { raw, note } = await rawLatexSource(fetched.body)
        if (!raw.trim()) continue
        const { marks, source } = outlineLatex(raw)
        if (marks.length) {
          return {
            outline: toOutline(marks),
            confidence: "structural",
            format: "latex",
            target,
            trace: rr.trace,
            note,
            _marks: marks,
            _source: source,
          }
        }
        continue
      }

      if (target.kind === "html") {
        const raw = decodeBytes(fetched.body)
        const { marks, source } = outlineHtml(raw)
        if (marks.length) {
          return {
            outline: toOutline(marks),
            confidence: "structural",
            format: "html",
            target,
            trace: rr.trace,
            _marks: marks,
            _source: source,
          }
        }
        continue
      }

      if (target.kind === "pdf") {
        const layout = await pdfLayoutText(fetched.body)
        if (!layout) continue
        const { marks, source } = outlinePdfLayout(layout)
        if (marks.length) {
          return {
            outline: toOutline(marks),
            confidence: "heuristic",
            format: "pdf",
            target,
            trace: rr.trace,
            note: "heading detection is best-effort layout heuristics; may miss or misfire",
            _marks: marks,
            _source: source,
          }
        }
        continue
      }
    } catch {
      continue
    }
  }

  return {
    outline: [],
    confidence: "heuristic",
    format: "none",
    trace: rr.trace,
    note: "no carrier yielded a detectable section structure",
    _marks: [],
    _source: "",
  }
}

export async function paperOutline(
  input: In,
  opts?: RunOpts,
): Promise<Omit<OutlineFetchResult, "_marks" | "_source">> {
  const { _marks, _source, ...pub } = await fetchOutline(input, opts)
  return pub
}

export interface SectionTextResult {
  entry: OutlineEntry
  text: string
  format: "latex" | "html" | "pdf"
  confidence: OutlineConfidence
}

export interface SectionTextFailure {
  error: string
  outline: OutlineEntry[]
  confidence: OutlineConfidence
}

export async function paperSection(
  input: In,
  query: { title?: string; index?: number },
  opts?: RunOpts,
): Promise<SectionTextResult | SectionTextFailure> {
  const r = await fetchOutline(input, opts)
  if (!r._marks.length || r.format === "none") {
    return { error: r.note ?? "could not build an outline for this paper", outline: r.outline, confidence: r.confidence }
  }
  const i = bestMatch(r._marks, query)
  if (i === -1) {
    return { error: "no section matched the query", outline: r.outline, confidence: r.confidence }
  }
  const raw = sliceFor(r._marks, i, r._source)
  const text = r.format === "latex" ? stripLatex(raw) : r.format === "html" ? stripHtml(raw) : raw.replace(/[ \t]+/g, " ").trim()
  return {
    entry: r.outline[i],
    text,
    format: r.format as "latex" | "html" | "pdf",
    confidence: r.confidence,
  }
}
