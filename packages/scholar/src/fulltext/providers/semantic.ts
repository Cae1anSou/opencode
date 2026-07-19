import { json } from "../http"
import type { Parsed, ResolveOpts, Target, Trace } from "../types"

export async function semantic(input: Parsed, opts?: ResolveOpts): Promise<{ targets: Target[]; trace: Trace[] }> {
  const key = opts?.semanticKey || process.env.SEMANTIC_SCHOLAR_API_KEY

  if (!input.doi && !input.arxivId) {
    return {
      targets: [],
      trace: [{ step: "semantic-id", hit: false, note: "no doi/arxiv id" }],
    }
  }

  const pid = input.doi ? `DOI:${input.doi}` : `ARXIV:${input.arxivId}`
  const url = `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(pid)}?fields=openAccessPdf,url,title`
  const headers = key ? { "x-api-key": key } : undefined

  try {
    const data = await json(url, { headers }, opts?.timeoutMs ?? 12000, 2)
    const pdf = data?.openAccessPdf?.url
    if (!pdf) {
      return {
        targets: [],
        trace: [{ step: "semantic-openAccessPdf", hit: false, note: "no openAccessPdf" }],
      }
    }

    return {
      targets: [{ kind: "pdf", source: "semantic-scholar", url: pdf, confidence: 0.82 }],
      trace: [{ step: "semantic-openAccessPdf", hit: true }],
    }
  } catch (e) {
    return {
      targets: [],
      trace: [{ step: "semantic-openAccessPdf", hit: false, note: (e as Error).message }],
    }
  }
}
