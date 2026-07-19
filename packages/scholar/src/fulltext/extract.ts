import { tmpdir } from "node:os"
import { join } from "node:path"
import { mkdtemp, readdir, rm, unlink, writeFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { ExtractResult, FetchResult } from "./types"

const run = promisify(execFile)

function txt(body: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(body)
}

export function stripHtml(v: string) {
  return v
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// NOTE: this drops heading text along with the command — `\section{Introduction}`
// disappears entirely, not just the `\section`. That's acceptable for the
// plain-text extraction path (headings are redundant with body text) but means
// outline.ts must work from the *raw* (comment-stripped, not yet stripLatex'd)
// source to keep section titles.
export function stripLatex(v: string) {
  return v
    .replace(/%.*$/gm, "")
    .replace(/\\begin\{[^}]+\}|\\end\{[^}]+\}/g, " ")
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function decodeBytes(body: Uint8Array) {
  return txt(body)
}

export function isGzip(body: Uint8Array) {
  return body.length > 2 && body[0] === 0x1f && body[1] === 0x8b
}

/**
 * 拿到 LaTeX 的原始拼接源码(未经 stripLatex 处理,标题文本仍在)。
 * outline.ts 需要这份原始文本来定位 \section{...} 边界;extract() 的纯文本
 * 路径在此基础上再跑 stripLatex。gzip 归档走 tar 解包,纯文本源直接返回。
 */
export async function rawLatexSource(body: Uint8Array): Promise<{ raw: string; note?: string }> {
  if (!isGzip(body)) {
    return { raw: txt(body) }
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const inPath = join(tmpdir(), `${id}.tar.gz`)

  await writeFile(inPath, body)

  try {
    const list = await run("tar", ["-tzf", inPath])
    const names = `${list.stdout || ""}`
      .split("\n")
      .map((it) => it.trim())
      .filter(Boolean)
      .filter((it) => it.endsWith(".tex") || it.endsWith(".ltx"))
      .slice(0, 20)

    if (!names.length) {
      return { raw: "", note: "src archive has no .tex files" }
    }

    const files = new Map<string, string>()
    for (const name of names) {
      try {
        const out = await run("tar", ["-xOf", inPath, name])
        files.set(name, out.stdout || "")
      } catch {
        continue
      }
    }

    if (!files.size) return { raw: "", note: "src archive extracted but empty text" }

    const { raw, note } = assembleLatexSource(files)
    if (raw.trim()) return { raw, note }
    return { raw: "", note: "src archive extracted but empty text" }
  } catch {
    return { raw: "", note: "failed to unpack latex source archive" }
  } finally {
    await unlink(inPath).catch(() => undefined)
  }
}

/**
 * 多文件 LaTeX 源码按 tar 列表字母序简单拼接会打乱文档结构(比如
 * "background.tex" 字母序排在 "main.tex" 前面,但内容其实该出现在
 * main.tex 中间某个 \input 的位置)。这里找出含 \documentclass 的根文件,
 * 沿 \input{}/\include{} 的引用顺序递归展开,拼出与实际文档结构一致的源码;
 * 找不到根或有文件从未被引用到时,把它们在末尾按原序追加,不丢内容。
 */
export function assembleLatexSource(files: Map<string, string>): { raw: string; note: string } {
  const rootKey = [...files.keys()].find((k) => /\\documentclass/.test(files.get(k) ?? ""))

  if (!rootKey) {
    return { raw: [...files.values()].join("\n"), note: "extracted from arXiv src archive (no root file detected; concatenated)" }
  }

  const lookup = (ref: string): string | undefined => {
    for (const c of [ref, `${ref}.tex`, `${ref}.ltx`]) {
      if (files.has(c)) return c
      const suffixMatch = [...files.keys()].find((k) => k.endsWith(`/${c}`))
      if (suffixMatch) return suffixMatch
    }
    return undefined
  }

  const visited = new Set<string>()
  const expand = (key: string): string => {
    if (visited.has(key)) return ""
    visited.add(key)
    const content = (files.get(key) ?? "").replace(/%.*$/gm, "")
    return content.replace(/\\(?:input|include)\{([^}]+)\}/g, (whole, ref: string) => {
      const target = lookup(ref.trim())
      if (!target || visited.has(target)) return whole
      return expand(target)
    })
  }

  const raw = expand(rootKey)
  const leftover = [...files.keys()].filter((k) => !visited.has(k))
  const tail = leftover.map((k) => files.get(k) ?? "").join("\n")
  return {
    raw: tail ? `${raw}\n${tail}` : raw,
    note: leftover.length
      ? `extracted from arXiv src archive (${leftover.length} file(s) not \\input-referenced, appended at end)`
      : "extracted from arXiv src archive",
  }
}

async function latex(body: Uint8Array): Promise<ExtractResult> {
  const { raw, note } = await rawLatexSource(body)
  const clean = stripLatex(raw)
  if (clean) return { format: "latex", text: clean, note }
  return { format: "latex", text: "", note: note ?? "latex source produced empty text" }
}

/**
 * `pdftotext -layout` output with line breaks intact (not collapsed to single
 * spaces). outline.ts needs the line structure to heuristically spot headings;
 * the plain-text extraction path below collapses whitespace itself.
 */
export async function pdfLayoutText(body: Uint8Array): Promise<string | undefined> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const inPath = join(tmpdir(), `${id}.pdf`)
  await writeFile(inPath, body)
  try {
    const out = await run("pdftotext", ["-q", "-layout", inPath, "-"])
    const text = `${out.stdout || ""}`
    return text.trim() ? text : undefined
  } catch {
    return undefined
  } finally {
    await unlink(inPath).catch(() => undefined)
  }
}

async function pdf(body: Uint8Array): Promise<ExtractResult> {
  const layout = await pdfLayoutText(body)
  const text = layout?.replace(/\s+/g, " ").trim()

  if (text) return { format: "pdf", text }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const inPath = join(tmpdir(), `${id}.pdf`)
  await writeFile(inPath, body)
  try {
    return await ocr(inPath)
  } finally {
    await unlink(inPath).catch(() => undefined)
  }
}

async function ocr(pdfPath: string): Promise<ExtractResult> {
  const dir = await mkdtemp(join(tmpdir(), "scholar-ocr-"))
  const base = join(dir, "page")

  try {
    await run("pdftoppm", ["-f", "1", "-l", "3", "-png", pdfPath, base])
  } catch {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    return { format: "pdf", text: "", note: "pdftotext failed and pdftoppm unavailable" }
  }

  try {
    const names = (await readdir(dir))
      .filter((it) => it.startsWith("page-") && it.endsWith(".png"))
      .sort()

    if (!names.length) {
      return { format: "pdf", text: "", note: "ocr fallback found no pages" }
    }

    let text = ""

    for (const name of names) {
      const path = join(dir, name)
      try {
        const out = await run("tesseract", [path, "stdout", "--dpi", "300"])
        text += ` ${out.stdout || ""}`
      } catch {
        continue
      }
    }

    const clean = text.replace(/\s+/g, " ").trim()
    if (clean) return { format: "pdf", text: clean, note: "extracted by OCR fallback" }
    return { format: "pdf", text: "", note: "ocr fallback returned empty" }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function extract(input: FetchResult): Promise<ExtractResult> {
  if (input.target.kind === "html") {
    return { format: "html", text: stripHtml(txt(input.body)) }
  }

  if (input.target.kind === "latex") {
    return latex(input.body)
  }

  if (input.target.kind === "pdf") {
    return pdf(input.body)
  }

  return { format: "none", text: "", note: "unsupported kind" }
}
