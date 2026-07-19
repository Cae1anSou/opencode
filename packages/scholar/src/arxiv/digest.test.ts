import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import { upsertNote } from "../notes/store"
import { alreadyTrackedMatcher, mergeDigestHits, normTitle } from "./digest"
import type { PaperMetadata } from "../search-scholar"

function hit(over: Partial<PaperMetadata & { publishedAt?: string }>): PaperMetadata & { publishedAt?: string } {
  return {
    id: over.id ?? `arxiv-${over.arxivId ?? "0000.00000"}`,
    source: "arxiv",
    title: over.title ?? "Untitled",
    authors: over.authors ?? [],
    abstract: over.abstract ?? "",
    arxivId: over.arxivId,
    publishedAt: over.publishedAt,
  }
}

describe("mergeDigestHits", () => {
  const notTracked = () => false

  test("dedupes a paper found under multiple topics and records which topics matched", () => {
    const shared = hit({ arxivId: "1111.11111", title: "Shared Paper" })
    const result = mergeDigestHits(
      [
        { topic: "sparse attention", hits: [shared] },
        { topic: "long context", hits: [shared] },
      ],
      notTracked,
    )
    expect(result.entries.length).toBe(1)
    expect(result.entries[0].matchedTopics.sort()).toEqual(["long context", "sparse attention"])
  })

  test("multi-topic matches rank above single-topic matches", () => {
    const single = hit({ arxivId: "2222.22222", title: "Single Topic Paper", publishedAt: "2026-07-19T00:00:00Z" })
    const dual = hit({ arxivId: "3333.33333", title: "Dual Topic Paper", publishedAt: "2026-07-01T00:00:00Z" })
    const result = mergeDigestHits(
      [
        { topic: "a", hits: [single, dual] },
        { topic: "b", hits: [dual] },
      ],
      notTracked,
    )
    expect(result.entries[0].title).toBe("Dual Topic Paper")
    expect(result.entries[1].title).toBe("Single Topic Paper")
  })

  test("within the same match count, more recently published sorts first", () => {
    const older = hit({ arxivId: "4444.44444", title: "Older", publishedAt: "2026-01-01T00:00:00Z" })
    const newer = hit({ arxivId: "5555.55555", title: "Newer", publishedAt: "2026-07-01T00:00:00Z" })
    const result = mergeDigestHits([{ topic: "x", hits: [older, newer] }], notTracked)
    expect(result.entries.map((e) => e.title)).toEqual(["Newer", "Older"])
  })

  test("tracked papers are excluded and counted, not silently dropped", () => {
    const tracked = hit({ arxivId: "6666.66666", title: "Already Read" })
    const fresh = hit({ arxivId: "7777.77777", title: "New Paper" })
    const isTracked = (e: { arxivId?: string }) => e.arxivId === "6666.66666"
    const result = mergeDigestHits([{ topic: "x", hits: [tracked, fresh] }], isTracked)
    expect(result.entries.length).toBe(1)
    expect(result.entries[0].title).toBe("New Paper")
    expect(result.excludedAlreadyTracked).toBe(1)
  })
})

describe("alreadyTrackedMatcher", () => {
  test("matches by arXiv id and by normalized title, ignoring reading status", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scholar-digest-"))
    await upsertNote(dir, { paperId: "arxiv-1706.03762", title: "Attention Is All You Need", status: "to_read" })
    await upsertNote(dir, { paperId: "bibkey-legacy", title: "A Title-Only Match: With Punctuation!", status: "read" })

    const isTracked = await alreadyTrackedMatcher(dir)
    expect(isTracked({ arxivId: "1706.03762", title: "irrelevant" })).toBe(true)
    expect(isTracked({ title: "a title only match with punctuation" })).toBe(true)
    expect(isTracked({ arxivId: "9999.99999", title: "Something Entirely New" })).toBe(false)
  })
})

describe("normTitle", () => {
  test("normalizes case and punctuation for fuzzy comparison", () => {
    expect(normTitle("BERT: Pre-training of Deep Bidirectional Transformers")).toBe(
      normTitle("bert pre training of deep bidirectional transformers"),
    )
  })
})
