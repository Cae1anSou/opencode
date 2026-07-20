import type { In, Parsed } from "./types"

const aid = /^(\d{4}\.\d{4,5})(v\d+)?$/i
const doi = /(10\.\d{4,9}\/[\w.()\-;/:+]+)(?=$|\s)/i

function clean(v: string) {
  return v.trim().replace(/^doi:\s*/i, "")
}

function arxivFromDoi(v: string) {
  const m = v.match(/10\.48550\/arxiv\.(\d{4}\.\d{4,5})(v\d+)?/i)
  return m?.[1]
}

function fromUrl(raw: string): Parsed {
  const u = new URL(raw)
  const host = u.hostname.toLowerCase()
  const path = u.pathname

  if (host.includes("arxiv.org")) {
    const abs = path.match(/^\/abs\/(\d{4}\.\d{4,5})(v\d+)?/i)
    if (abs) return { raw, kind: "arxiv", arxivId: abs[1], url: raw }

    const html = path.match(/^\/html\/(\d{4}\.\d{4,5})(v\d+)?/i)
    if (html) return { raw, kind: "arxiv", arxivId: html[1], url: raw }

    const pdf = path.match(/^\/pdf\/(\d{4}\.\d{4,5})(v\d+)?\.pdf/i)
    if (pdf) return { raw, kind: "arxiv", arxivId: pdf[1], url: raw }

    const src = path.match(/^\/src\/(\d{4}\.\d{4,5})(v\d+)?/i)
    if (src) return { raw, kind: "arxiv", arxivId: src[1], url: raw }
  }

  if (host.includes("doi.org")) {
    const id = decodeURIComponent(path.replace(/^\//, ""))
    if (doi.test(id)) {
      const ax = arxivFromDoi(id)
      if (ax) return { raw, kind: "doi", doi: id, arxivId: ax, url: raw }
      return { raw, kind: "doi", doi: id, url: raw }
    }
  }

  const d = decodeURIComponent(`${u.pathname} ${u.search}`).match(doi)
  if (d) {
    const ax = arxivFromDoi(d[1])
    if (ax) return { raw, kind: "doi", doi: d[1], arxivId: ax, url: raw }
    return { raw, kind: "doi", doi: d[1], url: raw }
  }

  return { raw, kind: "url", url: raw }
}

export function parse(input: In): Parsed {
  const raw = clean(input.value)

  if (input.hint === "arxiv") return { raw, kind: "arxiv", arxivId: raw }
  if (input.hint === "doi") {
    const ax = arxivFromDoi(raw)
    if (ax) return { raw, kind: "doi", doi: raw, arxivId: ax }
    return { raw, kind: "doi", doi: raw }
  }
  if (input.hint === "url") return { raw, kind: "url", url: raw }

  if (/^https?:\/\//i.test(raw)) {
    return fromUrl(raw)
  }

  const a = raw.match(aid)
  if (a) return { raw, kind: "arxiv", arxivId: a[1] }

  const d = raw.match(doi)
  if (d) {
    const ax = arxivFromDoi(d[1])
    if (ax) return { raw, kind: "doi", doi: d[1], arxivId: ax }
    return { raw, kind: "doi", doi: d[1] }
  }

  return { raw, kind: "unknown" }
}
