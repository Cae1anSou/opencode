import type { Parsed, Target, Trace } from "../types"

export function arxiv(input: Parsed): { targets: Target[]; trace: Trace[] } {
  if (!input.arxivId) {
    return {
      targets: [],
      trace: [{ step: "arxiv-id", hit: false, note: "no arxiv id" }],
    }
  }

  const id = input.arxivId
  return {
    targets: [
      { kind: "latex", source: "arxiv", url: `https://arxiv.org/src/${id}`, confidence: 0.95 },
      { kind: "html", source: "arxiv", url: `https://ar5iv.org/abs/${id}`, confidence: 0.75 },
      { kind: "pdf", source: "arxiv", url: `https://arxiv.org/pdf/${id}.pdf`, confidence: 0.9 },
    ],
    trace: [{ step: "arxiv-id", hit: true, note: id }],
  }
}
