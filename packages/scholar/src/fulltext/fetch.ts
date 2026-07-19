import { bytes } from "./http"
import type { FetchOpts, FetchResult, Target } from "./types"
import { Buffer } from "node:buffer"
import { defDir, getJson, setJson } from "./cache"

export async function fetchTarget(target: Target, opts?: FetchOpts): Promise<FetchResult> {
  const dir = opts?.cacheDir || defDir()
  const hit = await getJson<{ status: number; contentType: string; body: string }>(
    dir,
    "fetch",
    target.url,
    opts?.cacheTtlMs,
  )
  if (hit) {
    return {
      target,
      status: hit.status,
      contentType: hit.contentType,
      body: new Uint8Array(Buffer.from(hit.body, "base64")),
    }
  }

  const ua = opts?.userAgent || "scholar-cli/fulltext-resolver"
  const res = await bytes(
    target.url,
    {
      headers: {
        "user-agent": ua,
        accept: "text/html,application/pdf,application/x-gzip,*/*",
      },
    },
    opts?.timeoutMs ?? 18000,
    opts?.retries ?? 2,
  )

  const out = {
    target,
    status: res.status,
    contentType: res.contentType,
    body: res.body,
  }
  await setJson(dir, "fetch", target.url, {
    status: out.status,
    contentType: out.contentType,
    body: Buffer.from(out.body).toString("base64"),
  }).catch(() => undefined)
  return out
}
