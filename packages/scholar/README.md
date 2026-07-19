# @scholar-cli/tools

Domain layer for Scholar CLI — a research copilot built on top of the opencode harness. This package is plain TypeScript with zero external dependencies (Node builtins only); the Effect-based glue lives in `packages/opencode` (tool wrappers in `src/tool/scholar.ts`, context injection in `src/session/scholar-context.ts`, subagents in `src/agent/agent.ts`).

## What it provides

Everything lives under `<worktree>/.research/`, file-based and git-friendly. Humans can read and edit any of it; agents go through tools that enforce schemas and serialize writes.

| Module | Storage | Built-in tool | Purpose |
|---|---|---|---|
| `fulltext/` | `papers/` | `paper_download`, `paper_fulltext` | Literature retrieval with fallback chain: LaTeX source → HTML → PDF text → (OCR) |
| `search-scholar` / `verify-paper` | — | `scholar_search`, `paper_verify` | arXiv + Semantic Scholar search; citation existence verification with confidence threshold |
| `notes/` | `notes/*.md` + `NOTES.md` index | `paper_note` | Structured reading notes (frontmatter + six standard sections) |
| `memory/` | `RESEARCH.md` | `research_update` | Project research memory: questions / hypotheses / findings + append-only log |
| `cite/` | `references.bib` | `paper_cite`, `cite_audit` | BibTeX generation traceable to reading notes; manuscript ↔ bib ↔ notes alignment audit |
| `experiments/` | `experiments/*.md` + `EXPERIMENTS.md` index | `experiment_log` | Structured experiment records linked to hypotheses, papers, and manuscript claims |

## Subagents

- **reader** — deep-reads one paper end to end, saves the structured note, returns a compact synthesis. Dispatch one per paper; they parallelize safely (all writes are serialized).
- **checker** — referee-minded, read-only: audits every claim-citation pair in the manuscript against reading notes (unsupported / overclaimed / number mismatch / unread source).
- **synthesizer** — read-only cross-paper comparison strictly from reading notes; surfaces genuine disagreements instead of averaging them.

## Persistent context

`ScholarContext.system()` injects three small index files (RESEARCH.md, NOTES.md, EXPERIMENTS.md) into every non-hidden agent's system prompt, clipped to budgets with pointers to full files. Projects without `.research/` pay nothing.

## Tests

```sh
cd packages/scholar && bun test          # unit tests
RUN_NET_TESTS=1 bun test integration     # includes live arXiv/S2 network tests
```
