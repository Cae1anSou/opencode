import { describe, expect, test } from "bun:test"
import { matchScore } from "./verify-paper"
import type { PaperMetadata } from "./search-scholar"

function paper(over: Partial<PaperMetadata>): PaperMetadata {
  return {
    id: "p",
    source: "arxiv",
    title: "Attention Is All You Need",
    authors: ["Ashish Vaswani", "Noam Shazeer"],
    abstract: "",
    year: 2017,
    ...over,
  }
}

describe("verifyPaper matchScore", () => {
  test("exact title/author/year scores high", () => {
    const s = matchScore(
      { title: "Attention Is All You Need", authors: ["Ashish Vaswani"], year: 2017 },
      paper({}),
    )
    expect(s).toBeGreaterThanOrEqual(0.8)
  })

  test("unrelated title scores low even with matching year", () => {
    const s = matchScore({ title: "Deep Residual Learning for Image Recognition", year: 2017 }, paper({}))
    expect(s).toBeLessThan(0.5)
  })

  test("off-by-one year does not sink an otherwise strong match", () => {
    const s = matchScore(
      { title: "Attention Is All You Need", authors: ["Ashish Vaswani"], year: 2018 },
      paper({}),
    )
    expect(s).toBeGreaterThanOrEqual(0.8)
  })

  test("missing year on the query neither helps nor hurts", () => {
    const withYear = matchScore({ title: "Attention Is All You Need" }, paper({}))
    const withoutYear = matchScore({ title: "Attention Is All You Need" }, paper({ year: undefined }))
    expect(withYear).toBe(withoutYear)
  })
})
