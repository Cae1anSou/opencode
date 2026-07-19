import { fetchTarget } from "./fetch"
import { extract } from "./extract"
import { resolve } from "./resolve"
import type { In, RunOpts, RunResult } from "./types"

export async function run(input: In, opts?: RunOpts): Promise<RunResult> {
  const min = opts?.minChars ?? 200
  const rr = await resolve(input, opts)
  const attempts: RunResult["attempts"] = []

  for (const target of rr.targets) {
    try {
      const fetched = await fetchTarget(target, opts)
      const out = await extract(fetched)
      const chars = out.text.length
      const ok = chars >= min

      attempts.push({ target, ok, chars, note: out.note })

      if (!ok) continue

      return {
        parsed: rr.parsed,
        text: out.text,
        format: out.format,
        target,
        trace: rr.trace,
        attempts,
      }
    } catch (e) {
      attempts.push({ target, ok: false, chars: 0, note: (e as Error).message })
      continue
    }
  }

  return {
    parsed: rr.parsed,
    text: "",
    format: "none",
    trace: rr.trace,
    attempts,
    note: "all targets failed or text too short",
  }
}
