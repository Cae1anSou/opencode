import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import { searchScholar } from "./search-scholar"
import { downloadPaper } from "./download-paper"
import { paperOutline, paperSection } from "./fulltext/outline"

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

  test.if(net)("outline and section-read a real paper", async () => {
    // two sequential fetch+extract round trips (outline, then a section);
    // the default 5s timeout flakes under parallel test-file network load.
    const outline = await paperOutline({ value: "1706.03762", hint: "arxiv" })
    // whichever carrier wins (latex/html/pdf), a real paper should yield a
    // detectable structure — this is the end-to-end check unit tests on
    // synthetic fixtures can't give us.
    expect(outline.outline.length).toBeGreaterThan(0)
    expect(["structural", "heuristic"]).toContain(outline.confidence)

    const withMethod = outline.outline.find((o) => /method|model|approach|architecture/i.test(o.title))
    if (withMethod) {
      const section = await paperSection({ value: "1706.03762", hint: "arxiv" }, { title: withMethod.title })
      expect("entry" in section).toBe(true)
      if ("entry" in section) expect(section.text.length).toBeGreaterThan(50)
    }
  }, 20000)
})
