import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import { getNote } from "../notes/store"
import { bibPath } from "./bibtex"
import { importBibtex, parseBibtex } from "./import"

const SAMPLE_BIB = String.raw`
@article{vaswani2017attention,
  title = {Attention Is All You Need},
  author = {Ashish Vaswani and Noam Shazeer and Niki Parmar},
  year = {2017},
  eprint = {1706.03762},
  archivePrefix = {arXiv},
}

@inproceedings{devlin2019bert,
  title = "BERT: Pre-training of Deep Bidirectional Transformers for {NLP}",
  author = "Devlin, Jacob and Chang, Ming-Wei",
  year = 2019,
  booktitle = {Proceedings of NAACL},
}

@misc{noyear,
  title = {Some Undated Preprint},
  doi = {10.1234/xyz},
}
`

describe("parseBibtex", () => {
  test("parses fields across all three value styles ({...}, \"...\", bare) and multiple entries", () => {
    const entries = parseBibtex(SAMPLE_BIB)
    expect(entries.length).toBe(3)

    const first = entries[0]
    expect(first.key).toBe("vaswani2017attention")
    expect(first.title).toBe("Attention Is All You Need")
    expect(first.authors).toEqual(["Ashish Vaswani", "Noam Shazeer", "Niki Parmar"])
    expect(first.year).toBe(2017)
    expect(first.arxivId).toBe("1706.03762")

    const second = entries[1]
    expect(second.title).toContain("BERT")
    expect(second.title).toContain("NLP") // nested {NLP} brace preserved via balanced-brace scan
    expect(second.authors).toEqual(["Jacob Devlin", "Ming-Wei Chang"]) // "Last, First" reordered
    expect(second.year).toBe(2019) // bare (unquoted) numeric value

    const third = entries[2]
    expect(third.doi).toBe("10.1234/xyz")
    expect(third.arxivId).toBeUndefined()
  })

  test("skips @comment/@string/@preamble pseudo-entries", () => {
    const withComment = `@comment{ignore me}\n${SAMPLE_BIB}`
    expect(parseBibtex(withComment).length).toBe(3)
  })
})

describe("importBibtex", () => {
  test("creates to_read notes and appends bib entries verbatim, idempotent on re-import", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scholar-import-"))
    const first = await importBibtex(dir, SAMPLE_BIB)

    expect(first.total).toBe(3)
    expect(first.notesCreated).toBe(3)
    expect(first.bibAppended).toBe(3)

    const note = await getNote(dir, "arxiv-1706.03762")
    expect(note?.status).toBe("to_read")
    expect(note?.title).toBe("Attention Is All You Need")

    const doiNote = await getNote(dir, "doi-10.1234-xyz")
    expect(doiNote?.title).toBe("Some Undated Preprint")

    const bib = await readFile(bibPath(dir), "utf8")
    expect(bib).toContain("@article{vaswani2017attention")
    expect(bib).toContain("@misc{noyear")

    // re-importing the same library should not duplicate notes or bib entries
    const second = await importBibtex(dir, SAMPLE_BIB)
    expect(second.notesCreated).toBe(0)
    expect(second.notesSkipped).toBe(3)
    expect(second.bibAppended).toBe(0)
    expect(second.bibSkipped).toBe(3)
    const bibAfter = await readFile(bibPath(dir), "utf8")
    expect(bibAfter.match(/@article\{vaswani2017attention/g)?.length).toBe(1)
  })

  test("entries without doi/arxivId fall back to a bibkey-prefixed synthetic paper id and still import", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scholar-import-"))
    const bib = `@article{orphan2020,\n  title = {No External Id Paper},\n  author = {Some One},\n  year = {2020},\n}\n`
    const result = await importBibtex(dir, bib)
    expect(result.notesCreated).toBe(1)
    expect(result.entries[0].paperId).toBe("bibkey-orphan2020")
    const note = await getNote(dir, "bibkey-orphan2020")
    expect(note?.title).toBe("No External Id Paper")
  })

  test("re-importing does not overwrite a note whose reading status has since progressed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scholar-import-"))
    await importBibtex(dir, SAMPLE_BIB)
    // simulate the user having since read the paper via the reader subagent
    const { upsertNote } = await import("../notes/store")
    await upsertNote(dir, { paperId: "arxiv-1706.03762", status: "read", thesis: "Self-attention suffices." })

    await importBibtex(dir, SAMPLE_BIB)
    const note = await getNote(dir, "arxiv-1706.03762")
    expect(note?.status).toBe("read")
    expect(note?.thesis).toContain("Self-attention")
  })

  test("accepts a file path as well as raw bibtex text", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scholar-import-"))
    const { writeFile } = await import("node:fs/promises")
    const filePath = join(dir, "library.bib")
    await writeFile(filePath, SAMPLE_BIB)
    const result = await importBibtex(dir, filePath)
    expect(result.total).toBe(3)
  })
})
