import { verifyPaper, type VerifyPaperArgs, type VerifyPaperResult } from "./verify-paper"
import type { Tool } from "./tool"

export class VerifyPaperTool implements Tool<VerifyPaperArgs, VerifyPaperResult> {
  name = "verify_paper"
  description = "Resolve a citation (title/authors/year/doi/arxivId) to the single matching paper with a confidence score"

  execute(args: VerifyPaperArgs): Promise<VerifyPaperResult> {
    return verifyPaper(args)
  }
}
