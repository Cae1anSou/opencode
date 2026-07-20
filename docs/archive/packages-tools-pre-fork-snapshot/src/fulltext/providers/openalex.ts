import { json } from "../http"
import type { Parsed, ResolveOpts, Target, Trace } from "../types"

function allowed(input: Parsed, url?: string) {
  if (!url) return false
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    if (host.includes("arxiv.org")) return true
    if (host.includes("doi.org") && input.doi) {
      const tail = decodeURIComponent(u.pathname.replace(/^\//, "")).toLowerCase()
      return tail === input.doi.toLowerCase()
    }
    return false
  } catch {
    return false
  }
}

export async function openalex(input: Parsed, opts?: ResolveOpts): Promise<{ targets: Target[]; trace: Trace[] }> {
  if (!input.doi) {
    return {
      targets: [],
      trace: [{ step: "openalex-doi", hit: false, note: "no doi" }],
    }
  }

  const id = encodeURIComponent(`https://doi.org/${input.doi}`)
  const url = `https://api.openalex.org/works/${id}?select=best_oa_location,locations,open_access,has_fulltext,has_content`

  try {
    const data = await json(url, undefined, opts?.timeoutMs ?? 12000, 2)
    const out: Target[] = []

    const best = data?.best_oa_location
    if (allowed(input, best?.pdf_url)) {
      out.push({ kind: "pdf", source: "openalex", url: best.pdf_url, confidence: 0.8 })
    }
    if (allowed(input, best?.landing_page_url)) {
      out.push({ kind: "html", source: "openalex", url: best.landing_page_url, confidence: 0.66 })
    }

    const loc = Array.isArray(data?.locations) ? data.locations : []
    loc.forEach((it) => {
      if (!it || typeof it !== "object") return
      const pdf = "pdf_url" in it && typeof it.pdf_url === "string" ? it.pdf_url : undefined
      const html = "landing_page_url" in it && typeof it.landing_page_url === "string" ? it.landing_page_url : undefined
      if (allowed(input, pdf)) out.push({ kind: "pdf", source: "openalex", url: pdf, confidence: 0.62 })
      if (allowed(input, html)) out.push({ kind: "html", source: "openalex", url: html, confidence: 0.55 })
    })

    return {
      targets: out,
      trace: [{ step: "openalex-best_oa_location", hit: out.length > 0 }],
    }
  } catch (e) {
    return {
      targets: [],
      trace: [{ step: "openalex-best_oa_location", hit: false, note: (e as Error).message }],
    }
  }
}
