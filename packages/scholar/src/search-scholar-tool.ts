import { searchScholar, type SearchScholarArgs, type PaperMetadata } from "./search-scholar"
import type { Tool } from "./tool"

export class SearchScholarTool implements Tool<SearchScholarArgs, PaperMetadata[]> {
  name = "search_scholar"
  description = "Search academic papers from arXiv and Semantic Scholar"

  execute(args: SearchScholarArgs): Promise<PaperMetadata[]> {
    return searchScholar(args)
  }
}
