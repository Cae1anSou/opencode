function wait(ms: number) {
  return new Promise((ok) => setTimeout(ok, ms))
}

export async function json(url: string, init?: RequestInit, timeoutMs = 12000, retries = 2) {
  let err: Error | undefined

  for (let i = 0; i <= retries; i += 1) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)

    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal })
      clearTimeout(t)

      if (res.ok) return await res.json()

      if (res.status === 429 || res.status >= 500) {
        if (i < retries) {
          await wait(400 * 2 ** i)
          continue
        }
      }

      throw new Error(`http ${res.status}`)
    } catch (e) {
      clearTimeout(t)
      err = e as Error
      if (i < retries) {
        await wait(400 * 2 ** i)
        continue
      }
    }
  }

  throw err ?? new Error("request failed")
}

export async function bytes(url: string, init?: RequestInit, timeoutMs = 18000, retries = 2) {
  let err: Error | undefined

  for (let i = 0; i <= retries; i += 1) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)

    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal })
      clearTimeout(t)

      if (res.ok) {
        const body = new Uint8Array(await res.arrayBuffer())
        return {
          status: res.status,
          contentType: (res.headers.get("content-type") || "").toLowerCase(),
          body,
        }
      }

      if (res.status === 429 || res.status >= 500) {
        if (i < retries) {
          await wait(400 * 2 ** i)
          continue
        }
      }

      throw new Error(`http ${res.status}`)
    } catch (e) {
      clearTimeout(t)
      err = e as Error
      if (i < retries) {
        await wait(400 * 2 ** i)
        continue
      }
    }
  }

  throw err ?? new Error("request failed")
}
