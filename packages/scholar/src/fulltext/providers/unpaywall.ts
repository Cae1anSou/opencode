import { json } from "../http"
import type { Parsed, ResolveOpts, Target, Trace } from "../types"

export async function unpaywall(input: Parsed, opts?: ResolveOpts): Promise<{ targets: Target[]; trace: Trace[] }> {
  if (!input.doi) {
    return {
      targets: [],
      trace: [{ step: "unpaywall-doi", hit: false, note: "no doi" }],
    }
  }

  const mail = opts?.unpaywallMail || process.env.UNPAYWALL_EMAIL
  if (!mail) {
    return {
      targets: [],
      trace: [{ step: "unpaywall-email", hit: false, note: "UNPAYWALL_EMAIL missing" }],
    }
  }

  const url = `https://api.unpaywall.org/v2/${encodeURIComponent(input.doi)}?email=${encodeURIComponent(mail)}`

  try {
    const data = await json(url, undefined, opts?.timeoutMs ?? 12000, 2)
    const best = data?.best_oa_location
    const out: Target[] = []

    if (best?.url_for_pdf) out.push({ kind: "pdf", source: "unpaywall", url: best.url_for_pdf, confidence: 0.78 })
    if (best?.url) out.push({ kind: "html", source: "unpaywall", url: best.url, confidence: 0.6 })

    return {
      targets: out,
      trace: [{ step: "unpaywall-url_for_pdf", hit: out.length > 0 }],
    }
  } catch (e) {
    return {
      targets: [],
      trace: [{ step: "unpaywall-url_for_pdf", hit: false, note: (e as Error).message }],
    }
  }
}
