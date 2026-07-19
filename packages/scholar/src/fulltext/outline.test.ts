import { describe, expect, test } from "bun:test"
import { bestMatch, outlineHtml, outlineLatex, outlinePdfLayout, sliceFor } from "./outline"

const SAMPLE_TEX = String.raw`
\documentclass{article}
\begin{document}
\section{Introduction}
This work studies sparse attention. % a comment with \section{Fake} inside
Prior work is limited.
\subsection{Motivation}
Dense attention is $O(n^2)$.
\subsubsection{A detail}
Fine-grained point.
\section{Method}
We propose a sparse pattern.
\subsection{Locality Bias}
Details of the bias term.
\section{Experiments}
Results on five benchmarks.
\end{document}
`

describe("outlineLatex", () => {
  test("finds section/subsection/subsubsection with correct levels, ignores commented-out headings", () => {
    const { marks } = outlineLatex(SAMPLE_TEX)
    expect(marks.map((m) => [m.level, m.title])).toEqual([
      [1, "Introduction"],
      [2, "Motivation"],
      [3, "A detail"],
      [1, "Method"],
      [2, "Locality Bias"],
      [1, "Experiments"],
    ])
  })

  test("slicing a section includes its subsections but stops at the next same-level section", () => {
    const { marks, source } = outlineLatex(SAMPLE_TEX)
    const introIdx = marks.findIndex((m) => m.title === "Introduction")
    const slice = sliceFor(marks, introIdx, source)
    expect(slice).toContain("sparse attention")
    expect(slice).toContain("Dense attention")
    expect(slice).toContain("Fine-grained point")
    expect(slice).not.toContain("sparse pattern") // that's under Method, must not leak in

    const methodIdx = marks.findIndex((m) => m.title === "Method")
    const methodSlice = sliceFor(marks, methodIdx, source)
    expect(methodSlice).toContain("sparse pattern")
    expect(methodSlice).toContain("Locality Bias")
    expect(methodSlice).not.toContain("Results on five benchmarks")
  })
})

const SAMPLE_HTML = `
<html><body>
<h1>Paper Title</h1>
<h2>1 Introduction</h2>
<p>Intro text with <b>bold</b> markup.</p>
<h3>1.1 Motivation</h3>
<p>Why this matters.</p>
<h2>2 Method</h2>
<p>Our approach.</p>
</body></html>
`

describe("outlineHtml", () => {
  test("remaps h1-title-paper to level 1 baseline from the shallowest heading actually used as a section", () => {
    const { marks } = outlineHtml(SAMPLE_HTML)
    // h1 (Paper Title) is the shallowest -> becomes level 1; h2 -> level 2; h3 -> level 3
    expect(marks.map((m) => [m.level, m.title])).toEqual([
      [1, "Paper Title"],
      [2, "1 Introduction"],
      [3, "1.1 Motivation"],
      [2, "2 Method"],
    ])
  })

  test("slicing strips nested tags from the section body", () => {
    const { marks, source } = outlineHtml(SAMPLE_HTML)
    const idx = marks.findIndex((m) => m.title === "1 Introduction")
    const slice = sliceFor(marks, idx, source)
    expect(slice).toContain("Intro text with")
    expect(slice).toContain("Why this matters")
  })
})

const SAMPLE_PDF_LAYOUT = `Attention Is All You Need

Abstract
We propose a new architecture.

1 Introduction
Recurrent models are slow.

2 Related Work
Prior sequence models.

2.1 Attention Mechanisms
Various attention variants.

References
[1] Some citation.
`

describe("outlinePdfLayout", () => {
  test("detects numbered headings and known keyword headings, ignores body prose", () => {
    const { marks } = outlinePdfLayout(SAMPLE_PDF_LAYOUT)
    expect(marks.map((m) => [m.level, m.title])).toEqual([
      [1, "Abstract"],
      [1, "Introduction"],
      [1, "Related Work"],
      [2, "Attention Mechanisms"],
      [1, "References"],
    ])
  })

  test("does not misfire on the paper title or a long prose line", () => {
    const { marks } = outlinePdfLayout(SAMPLE_PDF_LAYOUT)
    expect(marks.some((m) => m.title.includes("Attention Is All You Need"))).toBe(false)
    expect(marks.some((m) => m.title.includes("Recurrent models"))).toBe(false)
  })
})

describe("bestMatch", () => {
  const marks = [
    { level: 1, title: "Introduction", start: 0, end: 0 },
    { level: 1, title: "Related Work", start: 0, end: 0 },
    { level: 1, title: "Experimental Setup and Results", start: 0, end: 0 },
  ]

  test("exact match wins over fuzzy", () => {
    expect(bestMatch(marks, { title: "Related Work" })).toBe(1)
  })

  test("substring / fuzzy match finds the closest title", () => {
    expect(bestMatch(marks, { title: "experiments" })).toBe(2)
  })

  test("1-based index resolves to the right entry", () => {
    expect(bestMatch(marks, { index: 2 })).toBe(1)
  })

  test("no match returns -1", () => {
    expect(bestMatch(marks, { title: "Nonexistent Topic Entirely" })).toBe(-1)
  })
})
