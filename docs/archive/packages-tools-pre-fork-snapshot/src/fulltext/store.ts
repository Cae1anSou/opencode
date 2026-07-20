import { appendFile, mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { papers } from "./fs"

export interface PaperIndex {
  paperId: string
  artifactPath: string
  artifactFormat: "pdf" | "html" | "latex-archive" | "latex-source"
  textPath?: string
  checksum: string
  bytes: number
  downloadedAt: string
  sourceUrl: string
}

export function indexPath(projectDir: string) {
  return join(papers(projectDir), "index", "papers.jsonl")
}

export async function appendIndex(projectDir: string, row: PaperIndex) {
  const path = indexPath(projectDir)
  await mkdir(join(papers(projectDir), "index"), { recursive: true })
  await appendFile(path, `${JSON.stringify(row)}\n`, "utf-8")
}

/**
 * papers.jsonl 是追加写入的，同一 paperId 可能有多条历史记录（比如 --force
 * 重新下载过）；下载工具用它做缓存命中判断时，只关心最近一次成功写入的记录。
 */
export async function latestIndexEntry(projectDir: string, paperId: string): Promise<PaperIndex | undefined> {
  const raw = await readFile(indexPath(projectDir), "utf-8").catch(() => "")
  if (!raw) return undefined

  let out: PaperIndex | undefined
  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const row = JSON.parse(trimmed) as PaperIndex
      if (row.paperId === paperId) out = row
    } catch {
      continue
    }
  }
  return out
}
