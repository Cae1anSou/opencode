import { describe, expect, test } from "bun:test"
import { arxiv } from "./arxiv"

describe("providers/arxiv", () => {
  test("returns src/html/pdf targets", () => {
    const out = arxiv({ raw: "1706.03762", kind: "arxiv", arxivId: "1706.03762" })
    expect(out.targets.length).toBe(3)
    expect(out.targets[0].kind).toBe("latex")
    expect(out.targets[1].kind).toBe("html")
    expect(out.targets[2].kind).toBe("pdf")
  })

  test("returns empty without id", () => {
    const out = arxiv({ raw: "x", kind: "unknown" })
    expect(out.targets.length).toBe(0)
  })
})
