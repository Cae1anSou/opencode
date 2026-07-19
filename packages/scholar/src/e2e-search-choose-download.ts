import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { downloadPaper, searchScholar } from "./index"

async function main() {
  const projectDir = await mkdtemp(join(tmpdir(), "scholar-cli-e2e-"))
  const query = "1706.03762"
  const expected = "1706.03762"

  const list = await searchScholar({
    query,
    source: "arxiv",
    maxResults: 20,
  })

  if (!list.length) {
    throw new Error("e2e failed: search returned empty")
  }

  const pick = list.find((it) => it.arxivId === expected) || list[0]
  const paperId = pick.arxivId || pick.doi || pick.id

  if (!paperId) {
    throw new Error("e2e failed: chosen result has no usable paper id")
  }

  const dl = await downloadPaper({ paperId, projectDir, force: true })

  if (!dl.filePath || dl.bytes <= 0 || !dl.checksum.startsWith("sha256:")) {
    throw new Error("e2e failed: download output invalid")
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        query,
        chosen: {
          title: pick.title,
          arxivId: pick.arxivId,
          doi: pick.doi,
          id: pick.id,
        },
        download: {
          filePath: dl.filePath,
          textPath: dl.textPath,
          bytes: dl.bytes,
          checksum: dl.checksum,
        },
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(String(err))
  process.exit(1)
})
