export type Kind = "latex" | "html" | "pdf" | "none"

export type Source = "arxiv" | "semantic-scholar" | "openalex" | "unpaywall" | "unknown"

export interface In {
  value: string
  hint?: "arxiv" | "doi" | "url"
}

export interface Parsed {
  raw: string
  kind: "arxiv" | "doi" | "url" | "unknown"
  arxivId?: string
  doi?: string
  url?: string
}

export interface Target {
  kind: Kind
  source: Source
  url: string
  confidence: number
}

export interface Trace {
  step: string
  hit: boolean
  note?: string
}

export interface ResolveOpts {
  semanticKey?: string
  unpaywallMail?: string
  timeoutMs?: number
  cacheDir?: string
  cacheTtlMs?: number
}

export interface ResolveResult {
  parsed: Parsed
  targets: Target[]
  trace: Trace[]
}

export interface FetchOpts {
  timeoutMs?: number
  retries?: number
  userAgent?: string
  cacheDir?: string
  cacheTtlMs?: number
}

export interface FetchResult {
  target: Target
  status: number
  contentType: string
  body: Uint8Array
}

export interface ExtractResult {
  format: "latex" | "html" | "pdf" | "none"
  text: string
  note?: string
}

export interface RunOpts extends ResolveOpts, FetchOpts {
  minChars?: number
}

export interface Attempt {
  target: Target
  ok: boolean
  chars: number
  note?: string
}

export interface RunResult {
  parsed: Parsed
  text: string
  format: "latex" | "html" | "pdf" | "none"
  target?: Target
  trace: Trace[]
  attempts: Attempt[]
  note?: string
}
