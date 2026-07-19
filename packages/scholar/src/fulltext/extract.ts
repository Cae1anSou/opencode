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

function stripHtml(v: string) {
  return v
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function stripLatex(v: string) {
  return v
    .replace(/%.*$/gm, "")
    .replace(/\\begin\{[^}]+\}|\\end\{[^}]+\}/g, " ")
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function isGzip(body: Uint8Array) {
  return body.length > 2 && body[0] === 0x1f && body[1] === 0x8b
}

async function latex(body: Uint8Array): Promise<ExtractResult> {
  if (!isGzip(body)) {
    return { format: "latex", text: stripLatex(txt(body)) }
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
      return { format: "latex", text: "", note: "src archive has no .tex files" }
    }

    let raw = ""
    for (const name of names) {
      try {
        const out = await run("tar", ["-xOf", inPath, name])
        raw += `\n${out.stdout || ""}`
      } catch {
        continue
      }
    }

    const clean = stripLatex(raw)
    if (clean) return { format: "latex", text: clean, note: "extracted from arXiv src archive" }
    return { format: "latex", text: "", note: "src archive extracted but empty text" }
  } catch {
    return { format: "latex", text: "", note: "failed to unpack latex source archive" }
  } finally {
    await unlink(inPath).catch(() => undefined)
  }
}

async function pdf(body: Uint8Array): Promise<ExtractResult> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const inPath = join(tmpdir(), `${id}.pdf`)

  await writeFile(inPath, body)

  try {
    const out = await run("pdftotext", ["-q", "-layout", inPath, "-"])
    const text = `${out.stdout || ""}`.replace(/\s+/g, " ").trim()

    if (text) return { format: "pdf", text }
    return ocr(inPath)
  } catch {
    return ocr(inPath)
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
