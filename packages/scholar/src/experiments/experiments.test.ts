import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import { experimentsIndexPath, getExperiment, upsertExperiment } from "./store"

describe("experiments store", () => {
  test("lifecycle: plan, run, record results with paper links", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scholar-exp-"))

    expect(upsertExperiment(dir, { id: "e1" })).rejects.toThrow("requires a title")

    await upsertExperiment(dir, {
      id: "sparse-attn-baseline",
      title: "Sparse attention baseline on LRA",
      hypothesis: "H1: locality bias suffices for long context",
      papers: ["arxiv-1706.03762"],
      status: "planned",
    })

    const done = await upsertExperiment(dir, {
      id: "sparse-attn-baseline",
      status: "done",
      claims: ["Table 2: sparse matches dense within 0.5%"],
      body: "## Results\n\nAccuracy 84.2 vs dense 84.6.",
    })
    expect(done.title).toBe("Sparse attention baseline on LRA")
    expect(done.hypothesis).toContain("H1")
    expect(done.papers).toEqual(["arxiv-1706.03762"])

    const fetched = await getExperiment(dir, "sparse-attn-baseline")
    expect(fetched?.body).toContain("84.2")
    expect(fetched?.claims?.[0]).toContain("Table 2")

    const index = await readFile(experimentsIndexPath(dir), "utf8")
    expect(index).toContain("[done] **Sparse attention baseline on LRA** `sparse-attn-baseline`")
    expect(index).toContain("papers: arxiv-1706.03762")
  })
})
