import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import { parse, serialize } from "./frontmatter"
import { getNote, notesIndexPath, listNotes, upsertNote } from "./store"

describe("frontmatter", () => {
  test("roundtrip with arrays, numbers, and colons in values", () => {
    const src = serialize({
      paperId: "doi-10.1145-xxx",
      title: "Attention: A Survey",
      year: 2017,
      authors: ["Smith, John", "Wei Li"],
      tags: ["transformer"],
    })
    const { data } = parse(`${src}\n\nbody here`)
    expect(data.title).toBe("Attention: A Survey")
    expect(data.year).toBe(2017)
    expect(data.authors).toEqual(["Smith, John", "Wei Li"])
    expect(data.tags).toEqual(["transformer"])
  })
})

describe("notes store", () => {
  test("create requires title, then upsert merges and index regenerates", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scholar-notes-"))

    expect(upsertNote(dir, { paperId: "arxiv-1706.03762" })).rejects.toThrow("requires a title")

    const created = await upsertNote(dir, {
      paperId: "arxiv-1706.03762",
      title: "Attention Is All You Need",
      year: 2017,
      status: "reading",
    })
    expect(created.body).toContain("## Relevance to This Project")

    const updated = await upsertNote(dir, {
      paperId: "arxiv-1706.03762",
      status: "read",
      thesis: "Self-attention alone suffices for sequence transduction.",
      body: "## Method\n\nMulti-head attention.",
    })
    expect(updated.title).toBe("Attention Is All You Need")
    expect(updated.status).toBe("read")

    const fetched = await getNote(dir, "arxiv-1706.03762")
    expect(fetched?.body).toContain("Multi-head attention.")
    expect(fetched?.year).toBe(2017)

    const index = await readFile(notesIndexPath(dir), "utf8")
    expect(index).toContain("[read] **Attention Is All You Need** (2017)")
    expect(index).toContain("Self-attention alone suffices")
  })

  test("concurrent upserts are serialized and both land in the index", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scholar-notes-"))
    await Promise.all([
      upsertNote(dir, { paperId: "p1", title: "Paper One" }),
      upsertNote(dir, { paperId: "p2", title: "Paper Two" }),
      upsertNote(dir, { paperId: "doi-10.1/a:b", title: "Weird Id" }),
    ])
    const notes = await listNotes(dir)
    expect(notes.length).toBe(3)
    const index = await readFile(notesIndexPath(dir), "utf8")
    expect(index).toContain("Paper One")
    expect(index).toContain("Paper Two")
    expect(index).toContain("Weird Id")
  })
})
