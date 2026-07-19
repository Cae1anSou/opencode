import { describe, expect, test } from "bun:test"
import { parse } from "./parse"

describe("parse", () => {
  test("parses arxiv id", () => {
    const out = parse({ value: "1706.03762" })
    expect(out.kind).toBe("arxiv")
    expect(out.arxivId).toBe("1706.03762")
  })

  test("parses doi", () => {
    const out = parse({ value: "10.48550/arXiv.1706.03762" })
    expect(out.kind).toBe("doi")
    expect(out.doi).toBe("10.48550/arXiv.1706.03762")
    expect(out.arxivId).toBe("1706.03762")
  })

  test("parses arxiv url", () => {
    const out = parse({ value: "https://arxiv.org/abs/1706.03762" })
    expect(out.kind).toBe("arxiv")
    expect(out.arxivId).toBe("1706.03762")
  })
})
