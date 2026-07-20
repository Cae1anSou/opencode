import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import { searchScholar } from "./search-scholar"
import { downloadPaper } from "./download-paper"

const net = process.env.RUN_NET_TESTS === "1"

describe("integration", () => {
  test.if(net)("search arxiv", async () => {
    const out = await searchScholar({ query: "attention is all you need", source: "arxiv", maxResults: 5 })
    expect(out.length > 0).toBe(true)
    expect(typeof out[0].title).toBe("string")
  })

  test.if(net)("download arxiv", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "scholar-cli-test-"))
    const out = await downloadPaper({ paperId: "1706.03762", projectDir, force: true })
    expect(out.fromCache).toBe(false)
    expect(out.bytes > 0).toBe(true)
    expect(out.checksum.startsWith("sha256:")).toBe(true)
    expect(out.artifactFormat).toBe("pdf")
  })
})
