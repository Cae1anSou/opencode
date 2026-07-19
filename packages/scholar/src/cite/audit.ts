import { join, relative } from "node:path"
import { readFile, readdir } from "node:fs/promises"
import { bibPath } from "./bibtex"
import { listNotes } from "../notes/store"

/**
 * 引用审计:稿件 \cite 键、references.bib 条目、精读笔记三方对齐的
 * 确定性核对。这一层是机械事实(键存不存在、对不对得上笔记),
 * 语义层(主张与笔记内容是否相符)交给 checker 子 agent 判断。
 */

export interface BibEntryInfo {
  key: string
  title?: string
  /** 标题归一化后与某篇精读笔记匹配,说明这条引用可溯源到真正读过的论文。 */
  notePaperId?: string
}

export interface CiteAuditResult {
  files: string[]
  usedKeys: string[]
  /** 稿件引用了但 references.bib 里不存在的键——编译会失败或产生 [?]。 */
  missingInBib: { key: string; files: string[] }[]
  /** bib 里有但稿件从未引用的键(可能是残留)。 */
  unusedBibKeys: string[]
  /** bib 里有、稿件也引用了,但项目里没有对应精读笔记——引用了没读过的论文。 */
  untraceableKeys: string[]
  bibEntries: BibEntryInfo[]
}

// 覆盖 natbib/biblatex 常见变体;可选参数(页码等)最多两个。
const CITE_RE = /\\[a-zA-Z]*[cC]ite[a-zA-Z]*\*?(?:\[[^\]]*\]){0,2}\{([^}]+)\}/g

export function extractCiteKeys(tex: string): string[] {
  const out = new Set<string>()
  for (const m of tex.matchAll(CITE_RE)) {
    for (const key of m[1].split(",")) {
      const k = key.trim()
      if (k) out.add(k)
    }
  }
  return [...out]
}

function normTitle(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

export function parseBibEntries(bib: string): { key: string; title?: string }[] {
  const out: { key: string; title?: string }[] = []
  for (const m of bib.matchAll(/@\w+\{\s*([^,\s]+)\s*,([\s\S]*?)\n\}/g)) {
    const title = m[2].match(/title\s*=\s*\{(.+?)\}/)?.[1]
    out.push({ key: m[1], title })
  }
  return out
}

const SKIP_DIRS = new Set([".git", "node_modules", ".research", "dist", "build"])

/** 在 worktree 内找 .tex 文件(默认稿件发现),浅递归、跳过常见噪音目录。 */
export async function findTexFiles(projectDir: string, cap = 50): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string, depth: number) {
    if (out.length >= cap || depth > 4) return
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const e of entries) {
      if (out.length >= cap) return
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) await walk(join(dir, e.name), depth + 1)
      } else if (e.name.endsWith(".tex")) {
        out.push(join(dir, e.name))
      }
    }
  }
  await walk(projectDir, 0)
  return out.sort()
}

export async function auditCitations(projectDir: string, texPaths: string[]): Promise<CiteAuditResult> {
  const keyToFiles = new Map<string, Set<string>>()
  const files: string[] = []
  for (const p of texPaths) {
    const content = await readFile(p, "utf8").catch(() => undefined)
    if (content === undefined) continue
    const rel = relative(projectDir, p)
    files.push(rel)
    for (const key of extractCiteKeys(content)) {
      if (!keyToFiles.has(key)) keyToFiles.set(key, new Set())
      keyToFiles.get(key)!.add(rel)
    }
  }

  const bib = await readFile(bibPath(projectDir), "utf8").catch(() => "")
  const entries = parseBibEntries(bib)
  const notes = await listNotes(projectDir)
  const noteByTitle = new Map(notes.map((n) => [normTitle(n.title), n.paperId]))

  const bibEntries: BibEntryInfo[] = entries.map((e) => ({
    key: e.key,
    title: e.title,
    notePaperId: e.title ? noteByTitle.get(normTitle(e.title)) : undefined,
  }))
  const bibKeys = new Set(entries.map((e) => e.key))
  const usedKeys = [...keyToFiles.keys()].sort()

  return {
    files,
    usedKeys,
    missingInBib: usedKeys
      .filter((k) => !bibKeys.has(k))
      .map((k) => ({ key: k, files: [...keyToFiles.get(k)!].sort() })),
    unusedBibKeys: [...bibKeys].filter((k) => !keyToFiles.has(k)).sort(),
    untraceableKeys: usedKeys.filter((k) => {
      const entry = bibEntries.find((e) => e.key === k)
      return !!entry && !entry.notePaperId
    }),
    bibEntries,
  }
}
