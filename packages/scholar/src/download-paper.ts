import { createHash } from "node:crypto"
import { join } from "node:path"
import { stat, writeFile } from "node:fs/promises"
import { parse } from "./fulltext/parse"
import { resolve } from "./fulltext/resolve"
import { fetchTarget } from "./fulltext/fetch"
import { isGzip } from "./fulltext/extract"
import { run } from "./fulltext/run"
import { ensure, artifactDir, rawDir } from "./fulltext/fs"
import { appendIndex, latestIndexEntry, type PaperIndex } from "./fulltext/store"
import type { RunOpts, Target } from "./fulltext/types"

export interface DownloadPaperArgs {
  paperId: string
  /** 宿主里当前项目的 worktree 路径，论文按项目隔离存储，见 fulltext/fs.ts。 */
  projectDir: string
  force?: boolean
}

export interface DownloadPaperResult {
  id: string
  filePath: string
  /** 实际落盘的原件格式——不再假定它一定是 PDF，见下方 artifactFormat 说明。 */
  artifactFormat: PaperIndex["artifactFormat"]
  textPath?: string
  fromCache: boolean
  targetUrl: string
  bytes: number
  checksum: string
}

function hash(v: string) {
  return createHash("sha1").update(v).digest("hex")
}

function safe(v: string) {
  return v.replace(/[^a-zA-Z0-9_.-]/g, "_")
}

function pickId(raw: string) {
  const p = parse({ value: raw })
  if (p.arxivId) return `arxiv-${safe(p.arxivId)}`
  if (p.doi) return `doi-${safe(p.doi.toLowerCase())}`
  if (p.url) return `url-${hash(p.url)}`
  return `paper-${hash(raw)}`
}

/**
 * `Target.kind` 只区分 pdf/html/latex，但 arXiv 的 latex 源既可能是打包的
 * tar.gz，也可能是单个 .tex 文件——只有拿到字节内容后才能靠 magic bytes 分辨，
 * 所以文件名和格式标签必须在 fetch 之后才能最终确定，不能像旧实现那样在下载前
 * 就把文件名硬编码成 `.pdf`。
 */
function artifactFormat(kind: Target["kind"], body: Uint8Array): PaperIndex["artifactFormat"] {
  if (kind === "pdf") return "pdf"
  if (kind === "html") return "html"
  return isGzip(body) ? "latex-archive" : "latex-source"
}

function extFor(format: PaperIndex["artifactFormat"]) {
  if (format === "pdf") return ".pdf"
  if (format === "html") return ".html"
  if (format === "latex-archive") return ".tar.gz"
  return ".tex"
}

export async function downloadPaper(args: DownloadPaperArgs, opts?: RunOpts): Promise<DownloadPaperResult> {
  await ensure(args.projectDir)

  const id = pickId(args.paperId)

  if (!args.force) {
    const entry = await latestIndexEntry(args.projectDir, id)
    if (entry) {
      try {
        const s = await stat(entry.artifactPath)
        return {
          id,
          filePath: entry.artifactPath,
          artifactFormat: entry.artifactFormat,
          textPath: entry.textPath,
          fromCache: true,
          targetUrl: entry.sourceUrl,
          bytes: s.size,
          checksum: entry.checksum,
        }
      } catch {
        // 索引里记的文件被外部删掉了，穿透到重新下载
      }
    }
  }

  const rr = await resolve({ value: args.paperId }, opts)
  const pick = rr.targets.find((it) => it.kind === "pdf") || rr.targets[0]
  if (!pick) throw new Error("no downloadable target")

  const f = await fetchTarget(pick, opts)
  const format = artifactFormat(pick.kind, f.body)
  const filePath = join(artifactDir(args.projectDir), `${id}${extFor(format)}`)
  await writeFile(filePath, f.body)
  const bytes = f.body.byteLength
  const checksum = createHash("sha256").update(f.body).digest("hex")

  const textPath = join(rawDir(args.projectDir), `${id}.txt`)
  const out = await run({ value: args.paperId }, { ...opts, minChars: 50 })
  if (out.text) {
    await writeFile(textPath, out.text, "utf-8")
  }

  await appendIndex(args.projectDir, {
    paperId: id,
    artifactPath: filePath,
    artifactFormat: format,
    textPath: out.text ? textPath : undefined,
    checksum: `sha256:${checksum}`,
    bytes,
    downloadedAt: new Date().toISOString(),
    sourceUrl: pick.url,
  }).catch(() => undefined)

  return {
    id,
    filePath,
    artifactFormat: format,
    textPath: out.text ? textPath : undefined,
    fromCache: false,
    targetUrl: pick.url,
    bytes,
    checksum: `sha256:${checksum}`,
  }
}
