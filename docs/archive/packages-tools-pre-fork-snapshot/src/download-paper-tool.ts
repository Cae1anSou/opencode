import { downloadPaper, type DownloadPaperArgs, type DownloadPaperResult } from "./download-paper"
import type { RunOpts } from "./fulltext"
import type { Tool } from "./tool"

export class DownloadPaperTool implements Tool<DownloadPaperArgs, DownloadPaperResult> {
  name = "download_paper"
  description = "Download paper PDF and extract raw text"

  constructor(private readonly opts?: RunOpts) {}

  execute(args: DownloadPaperArgs): Promise<DownloadPaperResult> {
    return downloadPaper(args, this.opts)
  }
}
