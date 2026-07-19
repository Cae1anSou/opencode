import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import { upsertNote } from "../notes/store"
import { addCitation } from "./bibtex"
import { auditCitations, extractCiteKeys, findTexFiles } from "./audit"

describe("cite audit", () => {
  test("extracts keys from natbib/biblatex variants with options and multiples", () => {
    const tex = [
      "\\cite{vaswani2017attention}",
      "\\citep[p.~3]{rush2018annotated, beltagy2020longformer}",
      "\\textcite{kaplan2020scaling}",
      "\\autocite*[see][ch.~2]{brown2020language}",
      "\\Citet{devlin2019bert}",
    ].join("\n")
    expect(extractCiteKeys(tex).sort()).toEqual([
      "beltagy2020longformer",
      "brown2020language",
      "devlin2019bert",
      "kaplan2020scaling",
      "rush2018annotated",
      "vaswani2017attention",
    ])
  })

  test("cross-checks manuscript keys against bib and reading notes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scholar-audit-"))

    await upsertNote(dir, {
      paperId: "arxiv-1706.03762",
      title: "Attention Is All You Need",
      authors: ["Ashish Vaswani"],
      year: 2017,
    })
    await addCitation(dir, { paperId: "arxiv-1706.03762" })
    await addCitation(dir, { title: "Longformer", authors: ["Iz Beltagy"], year: 2020 })

    await mkdir(join(dir, "paper"), { recursive: true })
    await writeFile(
      join(dir, "paper", "main.tex"),
      "As shown in \\cite{vaswani2017attention}, attention works. Ghost claim \\citep{ghost2024missing}.\n" +
        "Longformer \\cite{beltagy2020longformer} extends this.",
    )

    const texFiles = await findTexFiles(dir)
    expect(texFiles.length).toBe(1)

    const audit = await auditCitations(dir, texFiles)
    expect(audit.usedKeys.sort()).toEqual(["beltagy2020longformer", "ghost2024missing", "vaswani2017attention"])
    expect(audit.missingInBib).toEqual([{ key: "ghost2024missing", files: [join("paper", "main.tex")] }])
    // vaswani 有笔记可溯源;longformer 有 bib 条目但没读过 → untraceable
    expect(audit.untraceableKeys).toEqual(["beltagy2020longformer"])
    expect(audit.bibEntries.find((e) => e.key === "vaswani2017attention")?.notePaperId).toBe("arxiv-1706.03762")
    expect(audit.unusedBibKeys).toEqual([])
  })
})
