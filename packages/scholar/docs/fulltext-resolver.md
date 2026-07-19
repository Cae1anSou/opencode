# Fulltext Resolver（packages/tools）

## 目标
在 tools 层提供统一入口，解决“如何拿到可用全文文本”问题。

## 对外接口（草案）
- `resolve(input): Promise<ResolveResult>`
- `fetch(target): Promise<FetchResult>`
- `extract(target): Promise<ExtractResult>`
- `run(input): Promise<RunResult>`（推荐，一键走完整回退链路）

## 输入
- arXiv ID
- DOI
- URL

## 输出
- 结构化命中结果（kind/url/source/confidence）
- 文本与 trace

## 说明
当前为骨架阶段，后续会逐步接入真实 provider 与下载/抽取能力。

## 环境变量
- `SEMANTIC_SCHOLAR_API_KEY`: Semantic Scholar API key（可选，但建议配置）。
- `UNPAYWALL_EMAIL`: Unpaywall 必填邮箱（用于 DOI -> OA 解析）。

## 当前实现边界（v0）
- `resolve`:
  - 已接入 arXiv 规则解析（`src`/`ar5iv`/`pdf` 候选）
  - 已接入 Semantic Scholar `openAccessPdf` 查询
  - 已接入 OpenAlex `best_oa_location/locations` 查询
  - 已接入 Unpaywall `best_oa_location.url_for_pdf` 查询
- `extract`:
  - `latex/html` 为轻量规则抽取
  - `pdf` 先调用本机 `pdftotext`
  - 若失败/为空，回退 `pdftoppm + tesseract` OCR（最多前 3 页）

## 系统依赖（用于 PDF 抽取）
- `pdftotext`（poppler）
- `pdftoppm`（poppler）
- `tesseract`

## 用法示例
```ts
import { run } from "./src/fulltext"

const out = await run({ value: "1706.03762" }, { unpaywallMail: "you@example.com" })
console.log(out.format, out.target?.url, out.text.slice(0, 500))
```

命令行 smoke:
```bash
bun packages/tools/src/fulltext/smoke.ts 1706.03762
```

固定样例 E2E（search -> choose -> download）:
```bash
bun packages/tools/src/e2e-search-choose-download.ts
```

## 与工具链集成
当前仓库已提供三个上层入口：
- `packages/tools/src/search-scholar.ts`：宽松发现，给关键词返回一批候选供挑选。
- `packages/tools/src/verify-paper.ts`：高精度定位，给标题/作者/年份/DOI/arXiv 返回唯一最佳匹配及置信度，服务于引用核验场景，不是"再搜一次"。
- `packages/tools/src/download-paper.ts`：把选中的论文落到项目本地存储。

快速调用：
```ts
import { searchScholar, verifyPaper, downloadPaper, run } from "../src"

const list = await searchScholar({ query: "attention is all you need", source: "both", maxResults: 10 })
const hit = list[0]

const vr = await verifyPaper({ title: hit.title, authors: hit.authors, year: hit.year })
// vr.match 为空说明置信度不够,不要把它当成确认过的引用

const projectDir = process.cwd() // 宿主(OpenCode)里是当前项目的 worktree 路径
const dl = await downloadPaper({ paperId: hit.arxivId || hit.doi || hit.id, projectDir })
const ft = await run({ value: hit.arxivId || hit.doi || hit.id })
```

`downloadPaper` 要求显式传入 `projectDir`——论文按项目隔离存储（见下），不再有"不属于任何项目"的下载。返回值包含:
- `bytes`
- `checksum`（`sha256:...`）
- `artifactFormat`：落盘原件的真实格式(`pdf` / `html` / `latex-archive` / `latex-source`)。四级回退不总能拿到 PDF，`filePath` 的扩展名会如实反映实际格式，不再恒定伪装成 `.pdf`。

存储路径按项目隔离在 `<projectDir>/.research/papers/`（`artifacts/` 存原件、`raw/` 存抽取出的纯文本、`index/papers.jsonl` 记录下载历史）。网络抓取缓存（HTTP 响应、resolve 结果）与项目无关，继续走全局 `~/.research-agent/cache/fulltext`。
