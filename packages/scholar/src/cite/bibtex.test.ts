import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import { upsertNote } from "../notes/store"
import { addCitation, bibPath, bibtexKey, toBibtex } from "./bibtex"

describe("bibtex", () => {
  test("key generation skips stopwords and handles both author name forms", () => {
    expect(bibtexKey({ title: "Attention Is All You Need", authors: ["Ashish Vaswani"], year: 2017 })).toBe(
      "vaswani2017attention",
    )
    expect(bibtexKey({ title: "The Annotated Transformer", authors: ["Rush, Alexander"], year: 2018 })).toBe(
      "rush2018annotated",
    )
    expect(bibtexKey({ title: "A Survey" })).toBe("anonndsurvey")
  })

  test("arxiv paperId produces eprint fields", () => {
    const entry = toBibtex("vaswani2017attention", {
      paperId: "arxiv-1706.03762",
      title: "Attention Is All You Need",
      authors: ["Ashish Vaswani"],
      year: 2017,
    })
    expect(entry).toContain("eprint = {1706.03762}")
    expect(entry).toContain("archivePrefix = {arXiv}")
  })

  test("addCitation resolves metadata from the reading note and dedupes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scholar-cite-"))
    await upsertNote(dir, {
      paperId: "arxiv-1706.03762",
      title: "Attention Is All You Need",
      authors: ["Ashish Vaswani", "Noam Shazeer"],
      year: 2017,
    })

    const first = await addCitation(dir, { paperId: "arxiv-1706.03762" })
    expect(first.existed).toBe(false)
    expect(first.key).toBe("vaswani2017attention")
    expect(first.entry).toContain("Ashish Vaswani and Noam Shazeer")

    const again = await addCitation(dir, { paperId: "arxiv-1706.03762" })
    expect(again.existed).toBe(true)
    expect(again.key).toBe(first.key)

    const bib = await readFile(bibPath(dir), "utf8")
    expect(bib.match(/@misc\{vaswani2017attention,/g)?.length).toBe(1)
  })

  test("different paper with colliding key gets a suffix", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scholar-cite-"))
    await addCitation(dir, { title: "Attention Mechanisms", authors: ["Jane Vaswani"], year: 2017 })
    const second = await addCitation(dir, { title: "Attention Networks", authors: ["Jo Vaswani"], year: 2017 })
    expect(second.key).toBe("vaswani2017attentionb")
  })

  test("citing without title or note fails loudly", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scholar-cite-"))
    expect(addCitation(dir, { paperId: "arxiv-9999.00000" })).rejects.toThrow("requires a title")
  })

  test("without enrich: true, no network is attempted and enriched is false", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scholar-cite-"))
    const result = await addCitation(dir, { title: "Some Local Paper", authors: ["A. Author"], year: 2020 })
    expect(result.enriched).toBe(false)
    expect(result.entry).not.toContain("journal =")
  })
})
