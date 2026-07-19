import { createHash } from "node:crypto"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

function hash(v: string) {
  return createHash("sha256").update(v).digest("hex")
}

export function defDir() {
  return join(homedir(), ".research-agent", "cache", "fulltext")
}

function file(dir: string, ns: string, key: string) {
  return join(dir, ns, `${hash(key)}.json`)
}

export async function getJson<T>(dir: string, ns: string, key: string, ttlMs?: number): Promise<T | undefined> {
  const path = file(dir, ns, key)

  try {
    const s = await stat(path)
    if (ttlMs && Date.now() - s.mtimeMs > ttlMs) return undefined
    const raw = await readFile(path, "utf-8")
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

export async function setJson(dir: string, ns: string, key: string, data: unknown) {
  const path = file(dir, ns, key)
  await mkdir(join(dir, ns), { recursive: true })
  await writeFile(path, JSON.stringify(data), "utf-8")
}
