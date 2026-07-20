import { parse } from "./parse"
import type { In, ResolveOpts, ResolveResult, Target } from "./types"
import { arxiv } from "./providers/arxiv"
import { semantic } from "./providers/semantic"
import { openalex } from "./providers/openalex"
import { unpaywall } from "./providers/unpaywall"
import { defDir, getJson, setJson } from "./cache"

function uniq(list: Target[]) {
  const map = new Map<string, Target>()
  list.forEach((it) => {
    const key = `${it.kind}:${it.url}`
    const old = map.get(key)
    if (!old || it.confidence > old.confidence) map.set(key, it)
  })
  return [...map.values()].sort((a, b) => b.confidence - a.confidence)
}

export async function resolve(input: In, opts?: ResolveOpts): Promise<ResolveResult> {
  const dir = opts?.cacheDir || defDir()
  const key = JSON.stringify({ input: input.value, hint: input.hint })
  const hit = await getJson<ResolveResult>(dir, "resolve", key, opts?.cacheTtlMs)
  if (hit) return hit

  const parsed = parse(input)
  const a = arxiv(parsed)
  const s = await semantic(parsed, opts)
  const o = await openalex(parsed, opts)
  const u = await unpaywall(parsed, opts)

  const out = {
    parsed,
    targets: uniq([...a.targets, ...s.targets, ...o.targets, ...u.targets]),
    trace: [...a.trace, ...s.trace, ...o.trace, ...u.trace],
  }
  await setJson(dir, "resolve", key, out).catch(() => undefined)
  return out
}
