import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import { readResearch, updateResearch } from "./research"

describe("research memory", () => {
  test("section replace and log append coexist; sections survive repeated updates", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scholar-research-"))

    await updateResearch(dir, { section: "questions", content: "- Can sparse attention match dense quality?" })
    await updateResearch(dir, { log: "Read Attention Is All You Need." })
    const afterBoth = await updateResearch(dir, {
      section: "hypotheses",
      content: "- H1: locality bias suffices for long context.",
      log: "Formulated H1.",
    })

    expect(afterBoth).toContain("## Research Questions\n- Can sparse attention match dense quality?")
    expect(afterBoth).toContain("## Hypotheses\n- H1: locality bias suffices for long context.")
    expect(afterBoth).toContain("Read Attention Is All You Need.")
    expect(afterBoth).toContain("Formulated H1.")

    const replaced = await updateResearch(dir, { section: "questions", content: "- Updated question." })
    expect(replaced).toContain("- Updated question.")
    expect(replaced).not.toContain("sparse attention match dense")
    expect(replaced).toContain("- H1: locality bias suffices for long context.")

    expect(await readResearch(dir)).toBe(replaced)
  })

  test("invalid update rejects", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scholar-research-"))
    expect(updateResearch(dir, {})).rejects.toThrow("requires")
  })
})
