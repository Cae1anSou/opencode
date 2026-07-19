import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { InstanceState } from "@/effect/instance-state"
import { searchScholar, type PaperMetadata } from "@scholar-cli/tools/search-scholar"
import { downloadPaper } from "@scholar-cli/tools/download-paper"
import { verifyPaper } from "@scholar-cli/tools/verify-paper"
import { run as fulltextRun } from "@scholar-cli/tools/fulltext/run"

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
