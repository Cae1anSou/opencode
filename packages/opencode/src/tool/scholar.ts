import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { InstanceState } from "@/effect/instance-state"
import { searchScholar, type PaperMetadata } from "@scholar-cli/tools/search-scholar"
import { downloadPaper } from "@scholar-cli/tools/download-paper"
import { verifyPaper } from "@scholar-cli/tools/verify-paper"
import { run as fulltextRun } from "@scholar-cli/tools/fulltext/run"
import { upsertNote } from "@scholar-cli/tools/notes/store"
import { updateResearch } from "@scholar-cli/tools/memory/research"
import { addCitation } from "@scholar-cli/tools/cite/bibtex"
import { upsertExperiment } from "@scholar-cli/tools/experiments/store"
import { auditCitations, findTexFiles } from "@scholar-cli/tools/cite/audit"
import { paperOutline, paperSection } from "@scholar-cli/tools/fulltext/outline"
import { importBibtex } from "@scholar-cli/tools/cite/import"
import { join as pathJoin } from "node:path"

const SEARCH_DESCRIPTION = [
  "Search academic papers on arXiv and Semantic Scholar by keyword.",
  "Returns paper metadata (title, authors, abstract, year, venue, citation count, ids) merged and deduplicated across sources.",
  "Use this to locate papers before downloading or reading them. No results is a valid outcome, not an error.",
].join(" ")

const DOWNLOAD_DESCRIPTION = [
  "Download a paper into the current project's literature store (<worktree>/.research).",
  "Accepts an arXiv id (e.g. 1706.03762), a DOI, or a direct URL.",
  "Prefers the cleanest available artifact (LaTeX source over PDF) and is idempotent: an already-downloaded paper returns fromCache=true unless force is set.",
].join(" ")

const FULLTEXT_DESCRIPTION = [
  "Fetch the full text of a paper for reading. Accepts an arXiv id, DOI, or URL.",
  "Resolves the best available carrier and falls back automatically: LaTeX source, then HTML, then PDF text extraction.",
  "Returns the extracted text; the attempts trace shows which carriers were tried. Long texts are truncated with the full content saved to a file.",
  "For long papers, prefer reading section by section: call paper_outline first, then pass its section (by title or 1-based index) to this tool instead of pulling the whole text at once.",
].join(" ")

const OUTLINE_DESCRIPTION = [
  "Get the section outline (table of contents) of a paper without fetching its full text.",
  "Use this before paper_fulltext on long papers: skim the outline, then call paper_fulltext with a section title or index to read just what you need.",
  "confidence is 'structural' for LaTeX/HTML (real \\section/<h1-6> markers) and 'heuristic' for PDF-only sources (layout guesswork — may miss or misfire; verify against the text if precision matters).",
].join(" ")

const VERIFY_DESCRIPTION = [
  "Verify that a cited paper actually exists and the reference is accurate.",
  "Given a title (and optionally authors, year, doi, arXiv id), checks against Semantic Scholar and returns the matched metadata with a confidence score.",
  "Below the confidence threshold no match is returned: treat that as 'could not confirm', never invent a citation.",
].join(" ")

export const SearchParameters = Schema.Struct({
  query: Schema.String.annotate({ description: "Keyword query, e.g. 'sparse attention long context'" }),
  maxResults: Schema.optional(Schema.Number).annotate({ description: "Maximum results to return (default 20, max 100)" }),
  yearMin: Schema.optional(Schema.Number).annotate({ description: "Only include papers published in or after this year" }),
  yearMax: Schema.optional(Schema.Number).annotate({ description: "Only include papers published in or before this year" }),
  source: Schema.optional(Schema.Literals(["arxiv", "semantic-scholar", "both"])).annotate({
    description: "Which source to query (default both)",
  }),
})

function renderSearchResult(items: PaperMetadata[]) {
  if (items.length === 0) return "No papers found."
  return items
    .map((p, i) => {
      const line = [
        `${i + 1}. ${p.title} (${p.year ?? "n.d."})`,
        `   authors: ${p.authors.slice(0, 6).join(", ")}${p.authors.length > 6 ? " et al." : ""}`,
        `   source: ${p.source}${p.citationCount !== undefined ? ` | citations: ${p.citationCount}` : ""}`,
        `   ids: ${[p.arxivId && `arxiv:${p.arxivId}`, p.doi && `doi:${p.doi}`].filter(Boolean).join(" ") || p.id}`,
        p.abstract ? `   abstract: ${p.abstract.slice(0, 400)}${p.abstract.length > 400 ? "…" : ""}` : undefined,
      ]
        .filter(Boolean)
        .join("\n")
      return line
    })
    .join("\n\n")
}

export const ScholarSearchTool = Tool.define(
  "scholar_search",
  Effect.succeed({
  description: SEARCH_DESCRIPTION,
  parameters: SearchParameters,
  execute: (params: Schema.Schema.Type<typeof SearchParameters>, _ctx: Tool.Context) =>
    Effect.gen(function* () {
      const items = yield* Effect.promise(() =>
        searchScholar({
          query: params.query,
          maxResults: params.maxResults,
          yearMin: params.yearMin,
          yearMax: params.yearMax,
          source: params.source,
        }),
      )
      return {
        title: `scholar search: ${params.query}`,
        metadata: { count: items.length },
        output: renderSearchResult(items),
      }
    }),
  }),
)

export const DownloadParameters = Schema.Struct({
  paperId: Schema.String.annotate({ description: "arXiv id (e.g. 1706.03762), DOI, or direct URL of the paper" }),
  force: Schema.optional(Schema.Boolean).annotate({ description: "Re-download even if already present (default false)" }),
})

export const PaperDownloadTool = Tool.define(
  "paper_download",
  Effect.succeed({
  description: DOWNLOAD_DESCRIPTION,
  parameters: DownloadParameters,
  execute: (params: Schema.Schema.Type<typeof DownloadParameters>, ctx: Tool.Context) =>
    Effect.gen(function* () {
      yield* ctx.ask({
        permission: "paper_download",
        patterns: [params.paperId],
        always: ["*"],
        metadata: { paperId: params.paperId, force: params.force ?? false },
      })
      const instance = yield* InstanceState.context
      const result = yield* Effect.promise(() =>
        downloadPaper({ paperId: params.paperId, projectDir: instance.worktree, force: params.force }),
      )
      return {
        title: `download: ${result.id}`,
        metadata: { ...result },
        output: JSON.stringify(result, null, 2),
      }
    }),
  }),
)

export const FulltextParameters = Schema.Struct({
  paper: Schema.String.annotate({ description: "arXiv id, DOI, or URL identifying the paper" }),
  hint: Schema.optional(Schema.Literals(["arxiv", "doi", "url"])).annotate({
    description: "Optional hint for how to interpret the identifier",
  }),
  section: Schema.optional(Schema.String).annotate({
    description: "Section title (fuzzy match) or 1-based index (e.g. '3' or '3.1') to read only that section instead of the full text. Get titles/indices from paper_outline first.",
  }),
})

export const PaperFulltextTool = Tool.define(
  "paper_fulltext",
  Effect.succeed({
  description: FULLTEXT_DESCRIPTION,
  parameters: FulltextParameters,
  execute: (params: Schema.Schema.Type<typeof FulltextParameters>, ctx: Tool.Context) =>
    Effect.gen(function* () {
      yield* ctx.ask({
        permission: "paper_fulltext",
        patterns: [params.paper],
        always: ["*"],
        metadata: { paper: params.paper },
      })

      if (params.section !== undefined) {
        const idx = /^\d+$/.test(params.section.trim()) ? Number(params.section.trim()) : undefined
        const query = idx !== undefined ? { index: idx } : { title: params.section }
        const result = yield* Effect.promise(() =>
          paperSection({ value: params.paper, hint: params.hint }, query),
        )
        const sectionMeta: { error?: string; format?: string; confidence?: string; section?: string; chars?: number } =
          "error" in result
            ? { error: result.error }
            : { format: result.format, confidence: result.confidence, section: result.entry.title, chars: result.text.length }
        if ("error" in result) {
          return {
            title: `fulltext: ${params.paper} § "${params.section}" (not found)`,
            metadata: sectionMeta,
            output: [
              `Could not resolve section "${params.section}": ${result.error}`,
              result.outline.length ? "Available sections:" : "No outline could be built for this paper.",
              ...result.outline.map((o) => `${"  ".repeat(o.level - 1)}${o.index + 1}. ${o.title}`),
            ].join("\n"),
          }
        }
        return {
          title: `fulltext: ${params.paper} § ${result.entry.title} (${result.format}, ${result.confidence})`,
          metadata: sectionMeta,
          output: result.text,
        }
      }

      const result = yield* Effect.promise(() => fulltextRun({ value: params.paper, hint: params.hint }))
      const metadata: { format: string; source?: string; chars: number; attempts: typeof result.attempts } = {
        format: result.format,
        source: result.target?.source,
        chars: result.text.length,
        attempts: result.attempts,
      }
      if (result.format === "none") {
        return {
          title: `fulltext: ${params.paper} (failed)`,
          metadata,
          output: [
            "Could not retrieve full text.",
            `note: ${result.note ?? "unknown"}`,
            "attempts:",
            ...result.attempts.map((a) => `- [${a.ok ? "ok" : "fail"}] ${a.target.kind} via ${a.target.source}: ${a.note ?? ""}`),
          ].join("\n"),
        }
      }
      return {
        title: `fulltext: ${params.paper} (${result.format})`,
        metadata,
        output: result.text,
      }
    }),
  }),
)

export const OutlineParameters = Schema.Struct({
  paper: Schema.String.annotate({ description: "arXiv id, DOI, or URL identifying the paper" }),
  hint: Schema.optional(Schema.Literals(["arxiv", "doi", "url"])).annotate({
    description: "Optional hint for how to interpret the identifier",
  }),
})

export const PaperOutlineTool = Tool.define(
  "paper_outline",
  Effect.succeed({
    description: OUTLINE_DESCRIPTION,
    parameters: OutlineParameters,
    execute: (params: Schema.Schema.Type<typeof OutlineParameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        yield* ctx.ask({
          permission: "paper_fulltext",
          patterns: [params.paper],
          always: ["*"],
          metadata: { paper: params.paper },
        })
        const result = yield* Effect.promise(() => paperOutline({ value: params.paper, hint: params.hint }))
        const outlineMeta: { format: string; confidence: string; sections?: number } = {
          format: result.format,
          confidence: result.confidence,
          sections: result.outline.length || undefined,
        }
        if (!result.outline.length) {
          return {
            title: `outline: ${params.paper} (unavailable)`,
            metadata: outlineMeta,
            output: `Could not build an outline. ${result.note ?? ""} Fall back to paper_fulltext for the full text.`,
          }
        }
        return {
          title: `outline: ${params.paper} (${result.format}, ${result.confidence}, ${result.outline.length} sections)`,
          metadata: outlineMeta,
          output: [
            `Source: ${result.format} (${result.confidence}${result.note ? ` — ${result.note}` : ""})`,
            ...result.outline.map((o) => `${"  ".repeat(o.level - 1)}${o.index + 1}. ${o.title}`),
          ].join("\n"),
        }
      }),
  }),
)

export const VerifyParameters = Schema.Struct({
  title: Schema.String.annotate({ description: "Title of the cited paper to verify" }),
  authors: Schema.optional(Schema.Array(Schema.String)).annotate({ description: "Author names, if known" }),
  year: Schema.optional(Schema.Number).annotate({ description: "Publication year, if known" }),
  doi: Schema.optional(Schema.String).annotate({ description: "DOI, if known — enables direct lookup" }),
  arxivId: Schema.optional(Schema.String).annotate({ description: "arXiv id, if known — enables direct lookup" }),
})

export const PaperVerifyTool = Tool.define(
  "paper_verify",
  Effect.succeed({
  description: VERIFY_DESCRIPTION,
  parameters: VerifyParameters,
  execute: (params: Schema.Schema.Type<typeof VerifyParameters>, _ctx: Tool.Context) =>
    Effect.gen(function* () {
      const result = yield* Effect.promise(() =>
        verifyPaper({
          title: params.title,
          authors: params.authors ? [...params.authors] : undefined,
          year: params.year,
          doi: params.doi,
          arxivId: params.arxivId,
        }),
      )
      return {
        title: `verify: ${params.title.slice(0, 60)}`,
        metadata: { confidence: result.confidence, matched: !!result.match },
        output: JSON.stringify(result, null, 2),
      }
    }),
  }),
)

const NOTE_DESCRIPTION = [
  "Save or update the structured reading note for a paper in the project's literature store (.research/notes/).",
  "Upsert semantics: creating a note requires a title; later calls merge metadata and can replace the body.",
  "The body should follow the standard sections: Problem & Motivation, Method, Experiments & Results, Relevance to This Project, Limitations & Open Questions, Key References.",
  "Every write regenerates the .research/NOTES.md index. Prefer this over writing note files directly.",
].join(" ")

export const NoteParameters = Schema.Struct({
  paperId: Schema.String.annotate({ description: "Paper id, e.g. arxiv-1706.03762 or doi-10.1145-xxx" }),
  title: Schema.optional(Schema.String).annotate({ description: "Paper title (required when creating a new note)" }),
  status: Schema.optional(Schema.Literals(["to_read", "reading", "read"])).annotate({
    description: "Reading status",
  }),
  year: Schema.optional(Schema.Number).annotate({ description: "Publication year" }),
  authors: Schema.optional(Schema.Array(Schema.String)).annotate({ description: "Author names" }),
  tags: Schema.optional(Schema.Array(Schema.String)).annotate({ description: "Topic tags" }),
  thesis: Schema.optional(Schema.String).annotate({
    description: "One-sentence thesis of the paper — shown in the NOTES.md index",
  }),
  body: Schema.optional(Schema.String).annotate({
    description: "Full markdown body of the note; replaces the existing body when provided",
  }),
})

export const PaperNoteTool = Tool.define(
  "paper_note",
  Effect.succeed({
    description: NOTE_DESCRIPTION,
    parameters: NoteParameters,
    execute: (params: Schema.Schema.Type<typeof NoteParameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        yield* ctx.ask({
          permission: "paper_note",
          patterns: [params.paperId],
          always: ["*"],
          metadata: { paperId: params.paperId, status: params.status },
        })
        const instance = yield* InstanceState.context
        const record = yield* Effect.promise(() =>
          upsertNote(instance.worktree, {
            paperId: params.paperId,
            title: params.title,
            status: params.status,
            year: params.year,
            authors: params.authors ? [...params.authors] : undefined,
            tags: params.tags ? [...params.tags] : undefined,
            thesis: params.thesis,
            body: params.body,
          }),
        )
        return {
          title: `note: ${record.title || record.paperId} [${record.status}]`,
          metadata: { path: record.path, status: record.status },
          output: `Saved note to ${record.path} (status: ${record.status}). Index regenerated at .research/NOTES.md.`,
        }
      }),
  }),
)

const RESEARCH_DESCRIPTION = [
  "Update the project's research memory (.research/RESEARCH.md).",
  "Replace one of the living sections (questions / hypotheses / findings) with new content, and/or append a dated entry to the Log timeline.",
  "The memory is injected into every session's context, so keep sections short and current: prune resolved questions, record decisions in findings, and log milestones.",
].join(" ")

export const ResearchParameters = Schema.Struct({
  section: Schema.optional(Schema.Literals(["questions", "hypotheses", "findings"])).annotate({
    description: "Which living section to replace (requires content)",
  }),
  content: Schema.optional(Schema.String).annotate({
    description: "Full new markdown content for the chosen section",
  }),
  log: Schema.optional(Schema.String).annotate({
    description: "Timeline entry to append to the Log section (dated automatically)",
  }),
})

export const ResearchUpdateTool = Tool.define(
  "research_update",
  Effect.succeed({
    description: RESEARCH_DESCRIPTION,
    parameters: ResearchParameters,
    execute: (params: Schema.Schema.Type<typeof ResearchParameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        yield* ctx.ask({
          permission: "research_update",
          patterns: [params.section ?? "log"],
          always: ["*"],
          metadata: { section: params.section, log: params.log },
        })
        const instance = yield* InstanceState.context
        const next = yield* Effect.promise(() =>
          updateResearch(instance.worktree, {
            section: params.section,
            content: params.content,
            log: params.log,
          }),
        )
        return {
          title: params.section ? `research memory: ${params.section} updated` : "research memory: log appended",
          metadata: { bytes: next.length },
          output: `RESEARCH.md updated (${next.length} chars). It is injected into future session context automatically.`,
        }
      }),
  }),
)

const CITE_DESCRIPTION = [
  "Add a citation to the project's bibliography (.research/references.bib) and get its BibTeX key for \\cite{}.",
  "Pass a paperId that has a reading note and metadata is filled in automatically; otherwise pass title/authors/year (and doi/arxivId when known) explicitly.",
  "Idempotent: citing the same paper again returns the existing key, so manuscript keys stay stable.",
  "Only cite papers the project has actually read or verified — never invent bibliography entries.",
].join(" ")

export const CiteParameters = Schema.Struct({
  paperId: Schema.optional(Schema.String).annotate({
    description: "Project paper id (e.g. arxiv-1706.03762); metadata is resolved from its reading note",
  }),
  title: Schema.optional(Schema.String).annotate({ description: "Paper title (required if no note exists)" }),
  authors: Schema.optional(Schema.Array(Schema.String)).annotate({ description: "Author names" }),
  year: Schema.optional(Schema.Number).annotate({ description: "Publication year" }),
  doi: Schema.optional(Schema.String).annotate({ description: "DOI, if known" }),
  arxivId: Schema.optional(Schema.String).annotate({ description: "arXiv id, if known" }),
  url: Schema.optional(Schema.String).annotate({ description: "URL, if no better identifier exists" }),
  venue: Schema.optional(Schema.String).annotate({ description: "Journal or conference name, if known" }),
})

export const PaperCiteTool = Tool.define(
  "paper_cite",
  Effect.succeed({
    description: CITE_DESCRIPTION,
    parameters: CiteParameters,
    execute: (params: Schema.Schema.Type<typeof CiteParameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        yield* ctx.ask({
          permission: "paper_cite",
          patterns: [params.paperId ?? params.title ?? "unknown"],
          always: ["*"],
          metadata: { paperId: params.paperId, title: params.title },
        })
        const instance = yield* InstanceState.context
        const result = yield* Effect.promise(() =>
          addCitation(
            instance.worktree,
            {
              paperId: params.paperId,
              title: params.title,
              authors: params.authors ? [...params.authors] : undefined,
              year: params.year,
              doi: params.doi,
              arxivId: params.arxivId,
              url: params.url,
              venue: params.venue,
            },
            // 缺 venue/doi 时尽力从 Semantic Scholar 补全,失败静默降级——
            // 见 addCitation 内部注释,不影响引用条目本身的建立速度。
            { enrich: true },
          ),
        )
        return {
          title: `cite: \\cite{${result.key}}${result.existed ? " (existing)" : ""}${result.enriched ? " (metadata enriched)" : ""}`,
          metadata: { key: result.key, existed: result.existed, enriched: result.enriched, path: result.path },
          output: [
            `BibTeX key: ${result.key}`,
            `Use in LaTeX: \\cite{${result.key}}`,
            result.existed ? "Entry already existed in references.bib (reused)." : "Entry appended to references.bib.",
            result.enriched ? "Metadata (venue/doi) was auto-filled from Semantic Scholar." : undefined,
            "",
            result.entry,
          ]
            .filter((line): line is string => line !== undefined)
            .join("\n"),
        }
      }),
  }),
)

const EXPERIMENT_DESCRIPTION = [
  "Record or update a structured experiment log in .research/experiments/.",
  "Upsert by id (short slug, e.g. sparse-attn-baseline); creating requires a title.",
  "Link the experiment to its hypothesis, the papers its method came from (papers: paper ids), and the manuscript claims its results support (claims).",
  "Body sections: Setup, Command, Results, Interpretation, Next Steps. Update status as it progresses (planned/running/done/failed).",
  "Every write regenerates the .research/EXPERIMENTS.md index.",
].join(" ")

export const ExperimentParameters = Schema.Struct({
  id: Schema.String.annotate({ description: "Stable experiment slug, e.g. sparse-attn-baseline" }),
  title: Schema.optional(Schema.String).annotate({ description: "Experiment title (required when creating)" }),
  status: Schema.optional(Schema.Literals(["planned", "running", "done", "failed"])).annotate({
    description: "Experiment status",
  }),
  hypothesis: Schema.optional(Schema.String).annotate({
    description: "The hypothesis this experiment tests (ideally one from RESEARCH.md)",
  }),
  papers: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Paper ids whose methods this experiment uses or compares against",
  }),
  claims: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Manuscript claims (free text or table/figure anchors) this experiment's results support",
  }),
  tags: Schema.optional(Schema.Array(Schema.String)).annotate({ description: "Topic tags" }),
  body: Schema.optional(Schema.String).annotate({
    description: "Full markdown body; replaces the existing body when provided",
  }),
})

export const ExperimentLogTool = Tool.define(
  "experiment_log",
  Effect.succeed({
    description: EXPERIMENT_DESCRIPTION,
    parameters: ExperimentParameters,
    execute: (params: Schema.Schema.Type<typeof ExperimentParameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        yield* ctx.ask({
          permission: "experiment_log",
          patterns: [params.id],
          always: ["*"],
          metadata: { id: params.id, status: params.status },
        })
        const instance = yield* InstanceState.context
        const record = yield* Effect.promise(() =>
          upsertExperiment(instance.worktree, {
            id: params.id,
            title: params.title,
            status: params.status,
            hypothesis: params.hypothesis,
            papers: params.papers ? [...params.papers] : undefined,
            claims: params.claims ? [...params.claims] : undefined,
            tags: params.tags ? [...params.tags] : undefined,
            body: params.body,
          }),
        )
        return {
          title: `experiment: ${record.id} [${record.status}]`,
          metadata: { path: record.path, status: record.status },
          output: `Saved experiment log to ${record.path} (status: ${record.status}). Index regenerated at .research/EXPERIMENTS.md.`,
        }
      }),
  }),
)

const AUDIT_DESCRIPTION = [
  "Mechanically audit the manuscript's citations against .research/references.bib and the project's reading notes.",
  "Reports: keys cited but missing from the bib (compile breakage), bib keys never cited (leftovers), and cited keys whose bib entry has no matching reading note (citing papers the project never read).",
  "Pass explicit .tex file paths, or omit files to scan the worktree for .tex automatically.",
  "This is the factual layer; judging whether a claim is actually supported by the cited paper requires reading the note (use the checker subagent).",
].join(" ")

export const AuditParameters = Schema.Struct({
  files: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Manuscript .tex paths relative to the worktree; omitted = auto-discover",
  }),
})

export const CiteAuditTool = Tool.define(
  "cite_audit",
  Effect.succeed({
    description: AUDIT_DESCRIPTION,
    parameters: AuditParameters,
    execute: (params: Schema.Schema.Type<typeof AuditParameters>, _ctx: Tool.Context) =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const result = yield* Effect.promise(async () => {
          const paths = params.files?.length
            ? params.files.map((f) => pathJoin(instance.worktree, f))
            : await findTexFiles(instance.worktree)
          return auditCitations(instance.worktree, paths)
        })
        const lines: string[] = [`Audited ${result.files.length} file(s): ${result.files.join(", ") || "(none found)"}`]
        lines.push(`Cited keys: ${result.usedKeys.length}`)
        if (result.missingInBib.length) {
          lines.push("", "MISSING FROM references.bib (cited but undefined — fix first):")
          for (const m of result.missingInBib) lines.push(`- ${m.key} (${m.files.join(", ")})`)
        }
        if (result.untraceableKeys.length) {
          lines.push("", "NO READING NOTE (cited but the project never read these — dispatch reader or remove):")
          for (const k of result.untraceableKeys) {
            const title = result.bibEntries.find((e) => e.key === k)?.title
            lines.push(`- ${k}${title ? ` — ${title}` : ""}`)
          }
        }
        if (result.unusedBibKeys.length) {
          lines.push("", "UNUSED BIB ENTRIES (in references.bib but never cited):")
          for (const k of result.unusedBibKeys) lines.push(`- ${k}`)
        }
        if (!result.missingInBib.length && !result.untraceableKeys.length && !result.unusedBibKeys.length) {
          lines.push("", "All citations resolve to bib entries backed by reading notes. Clean.")
        }
        return {
          title: `cite audit: ${result.missingInBib.length} missing, ${result.untraceableKeys.length} unread`,
          metadata: {
            missing: result.missingInBib.length,
            untraceable: result.untraceableKeys.length,
            unused: result.unusedBibKeys.length,
          },
          output: lines.join("\n"),
        }
      }),
  }),
)

const IMPORT_DESCRIPTION = [
  "Batch-import an existing BibTeX library (exported from Zotero, EndNote, or any reference manager) into this project.",
  "Pass either a .bib file path (relative to the worktree) or raw BibTeX text directly.",
  "For each entry: creates a to_read reading note (never overwrites a note whose status has since progressed — safe to re-run) and appends the entry verbatim to .research/references.bib (so existing \\cite{} keys in a manuscript being migrated keep working), deduplicating by bib key.",
  "Set download: true to also fetch open-access full text for entries with a DOI or arXiv id (best-effort; failures are reported per-entry, not fatal to the batch). Off by default — importing a large library can mean many downloads; ask the user before enabling it on more than a handful of entries.",
].join(" ")

export const ImportParameters = Schema.Struct({
  source: Schema.String.annotate({
    description: "Path to a .bib file (relative to the worktree) or raw BibTeX text",
  }),
  download: Schema.optional(Schema.Boolean).annotate({
    description: "Also download open-access full text for entries with a doi/arXiv id (default false)",
  }),
})

export const BibImportTool = Tool.define(
  "bib_import",
  Effect.succeed({
    description: IMPORT_DESCRIPTION,
    parameters: ImportParameters,
    execute: (params: Schema.Schema.Type<typeof ImportParameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        yield* ctx.ask({
          permission: "bib_import",
          patterns: [params.source.slice(0, 80)],
          always: ["*"],
          metadata: { download: params.download ?? false },
        })
        const instance = yield* InstanceState.context
        const source = params.source.startsWith("/") ? params.source : pathJoin(instance.worktree, params.source)
        const looksLikePath = !params.source.includes("@")
        const result = yield* Effect.promise(() =>
          importBibtex(instance.worktree, looksLikePath ? source : params.source, { download: params.download }),
        )
        const lines = [
          `Imported ${result.total} entries: ${result.notesCreated} new reading notes (${result.notesSkipped} already tracked), ${result.bibAppended} bib entries added (${result.bibSkipped} already present).`,
        ]
        if (params.download) {
          lines.push(`Downloads: ${result.downloaded} succeeded, ${result.downloadFailed} failed.`)
        }
        const failures = result.entries.filter((e) => e.downloadError)
        if (failures.length) {
          lines.push("Download failures:")
          for (const f of failures) lines.push(`- ${f.title}: ${f.downloadError}`)
        }
        return {
          title: `bib_import: ${result.total} entries (${result.notesCreated} new)`,
          metadata: {
            total: result.total,
            notesCreated: result.notesCreated,
            bibAppended: result.bibAppended,
            downloaded: result.downloaded,
            downloadFailed: result.downloadFailed,
          },
          output: lines.join("\n"),
        }
      }),
  }),
)
