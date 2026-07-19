import { describe, expect, test } from "bun:test"
import { assembleLatexSource } from "./extract"

describe("assembleLatexSource", () => {
  test("expands \\input references in document order, not tar-listing alphabetical order", () => {
    // "background.tex" sorts before "main.tex" alphabetically, but main.tex
    // \inputs it in the middle — the assembled text must follow main's order.
    const files = new Map([
      ["background.tex", "BACKGROUND CONTENT"],
      [
        "main.tex",
        String.raw`\documentclass{article}
\begin{document}
INTRO CONTENT
\input{background}
CONCLUSION CONTENT
\end{document}`,
      ],
    ])
    const { raw, note } = assembleLatexSource(files)
    const introAt = raw.indexOf("INTRO CONTENT")
    const bgAt = raw.indexOf("BACKGROUND CONTENT")
    const conclAt = raw.indexOf("CONCLUSION CONTENT")
    expect(introAt).toBeGreaterThanOrEqual(0)
    expect(bgAt).toBeGreaterThan(introAt)
    expect(conclAt).toBeGreaterThan(bgAt)
    expect(note).not.toContain("not \\input-referenced")
  })

  test("handles \\include and extension-less refs, recurses into nested inputs", () => {
    const files = new Map([
      ["intro.tex", "INTRO"],
      ["method.tex", String.raw`METHOD START \input{method-details} METHOD END`],
      ["method-details.tex", "DETAILS"],
      [
        "main.tex",
        String.raw`\documentclass{article}
\input{intro}
\include{method}`,
      ],
    ])
    const { raw } = assembleLatexSource(files)
    expect(raw).toContain("INTRO")
    expect(raw).toContain("METHOD START")
    expect(raw).toContain("DETAILS")
    expect(raw).toContain("METHOD END")
    expect(raw.indexOf("DETAILS")).toBeGreaterThan(raw.indexOf("METHOD START"))
    expect(raw.indexOf("DETAILS")).toBeLessThan(raw.indexOf("METHOD END"))
  })

  test("files never referenced by \\input are appended at the end, not dropped", () => {
    const files = new Map([
      ["main.tex", String.raw`\documentclass{article}\input{intro}`],
      ["intro.tex", "INTRO CONTENT"],
      ["orphan-appendix.tex", "ORPHAN CONTENT"],
    ])
    const { raw, note } = assembleLatexSource(files)
    expect(raw).toContain("INTRO CONTENT")
    expect(raw).toContain("ORPHAN CONTENT")
    expect(raw.indexOf("ORPHAN CONTENT")).toBeGreaterThan(raw.indexOf("INTRO CONTENT"))
    expect(note).toContain("not \\input-referenced")
  })

  test("commented-out \\input is not followed inline — file still surfaces as an unreferenced orphan, not silently dropped", () => {
    const files = new Map([
      ["main.tex", String.raw`\documentclass{article}% \input{secret}
VISIBLE`],
      ["secret.tex", "SECRET CONTENT"],
    ])
    const { raw, note } = assembleLatexSource(files)
    expect(raw).toContain("VISIBLE")
    // not inlined at the (commented-out) reference point:
    expect(raw.indexOf("SECRET CONTENT")).toBeGreaterThan(raw.indexOf("VISIBLE"))
    expect(note).toContain("not \\input-referenced")
  })

  test("no \\documentclass found anywhere falls back to plain concatenation", () => {
    const files = new Map([
      ["a.tex", "A CONTENT"],
      ["b.tex", "B CONTENT"],
    ])
    const { raw, note } = assembleLatexSource(files)
    expect(raw).toContain("A CONTENT")
    expect(raw).toContain("B CONTENT")
    expect(note).toContain("no root file detected")
  })

  test("circular \\input does not infinite-loop", () => {
    const files = new Map([
      ["main.tex", String.raw`\documentclass{article}\input{a}`],
      ["a.tex", String.raw`A_TOP \input{b} A_BOTTOM`],
      ["b.tex", String.raw`B_TOP \input{a} B_BOTTOM`],
    ])
    const { raw } = assembleLatexSource(files)
    expect(raw).toContain("A_TOP")
    expect(raw).toContain("B_TOP")
    expect(raw).toContain("B_BOTTOM")
    expect(raw).toContain("A_BOTTOM")
  })
})
