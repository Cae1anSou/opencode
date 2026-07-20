# 文献搜索与下载工具：短设计说明与接口契约（Phase 2.1）

## 1. 目标
在 Phase 2.1 交付一个可用闭环：
1. 按关键词搜索论文（arXiv、Semantic Scholar）。
2. 选择论文后下载 PDF 到本地统一目录。
3. 对重复下载、网络异常、限流和无效 PDF 做稳定处理。

本阶段只覆盖“搜索 + 下载”，不包含 PDF 解析、总结生成、引用管理。

## 2. 范围与非范围
### In Scope
- `search_scholar` 工具（多源搜索、合并、去重、统一返回）。
- `download_paper` 工具（按 `paperId`/DOI/URL 下载）。
- 本地索引（记录下载状态与文件路径）。
- 错误模型与重试策略。

### Out of Scope
- 全文解析（`process_pdf`）。
- 自动总结（`read_paper` 触发 SubAgent）。
- Zotero 直连。

## 3. 核心设计原则
1. 契约优先：先固定类型和行为，再填充 provider 细节。
2. 可替换 provider：arXiv、Semantic Scholar 通过统一接口接入。
3. 幂等下载：同一论文默认不重复下载（除非 `force=true`）。
4. 强校验：下载后验证是有效 PDF，避免把 HTML 错误页当论文。
5. 失败可恢复：网络/限流错误具备有限重试能力。

## 4. 目录与模块边界（建议）
```text
packages/tools/src/
  search-scholar.ts         # Tool 入口
  download-paper.ts         # Tool 入口
  scholar/
    providers/
      arxiv.ts              # arXiv 查询
      semantic.ts           # Semantic Scholar 查询
    normalize.ts            # 转为统一 metadata
    dedup.ts                # 去重合并策略
    rank.ts                 # 结果排序策略（轻量）
  papers/
    resolve.ts              # paperId/doi/url -> pdfUrl
    fetch.ts                # 下载与重试
    validate.ts             # PDF 校验
    store.ts                # 索引读写
  errors.ts                 # 统一错误类型
```

## 5. 接口契约

### 5.1 `search_scholar`
```ts
export type ScholarSource = "arxiv" | "semantic-scholar" | "both"

export interface SearchScholarArgs {
  query: string
  maxResults?: number
  yearMin?: number
  yearMax?: number
  source?: ScholarSource
}

export interface PaperMetadata {
  id: string
  source: "arxiv" | "semantic-scholar"
  title: string
  authors: string[]
  abstract: string
  year?: number
  venue?: string
  citationCount?: number
  pdfUrl?: string
  arxivId?: string
  doi?: string
  externalIds?: Record<string, string>
}

export interface SearchScholarResult {
  items: PaperMetadata[]
  total: number
}
```

#### 行为约定
- `query` 为空或仅空白字符：抛 `InvalidArgsError`。
- 无结果：返回 `{ items: [], total: 0 }`，不视为错误。
- `source=both`：并发查询两源后合并去重。
- `maxResults` 默认 `20`，上限 `100`。

### 5.2 `download_paper`
```ts
export interface DownloadPaperArgs {
  paperId: string
  force?: boolean
}

export interface DownloadPaperResult {
  paperId: string
  path: string
  bytes: number
  checksum: string
  fromCache: boolean
}
```

#### 行为约定
- 支持三类输入：
  - 内部 `paperId`（如 `arxiv-1706.03762`、`doi-10.1145-xxxx`）。
  - DOI（如 `10.48550/arXiv.1706.03762`）。
  - URL（arXiv abs/pdf 链接或可直链 PDF）。
- 默认幂等：若本地已存在且校验通过，直接返回 `fromCache=true`。
- `force=true`：重新下载并覆盖索引记录。

## 6. 数据与存储约定

### 6.1 本地目录
```text
~/.research-agent/papers/
  pdfs/
    <paperId>.pdf
  index/
    papers.jsonl
```

### 6.2 索引记录（JSONL）
```json
{
  "paperId": "arxiv-1706.03762",
  "title": "Attention Is All You Need",
  "source": "arxiv",
  "pdfPath": "~/.research-agent/papers/pdfs/arxiv-1706.03762.pdf",
  "checksum": "sha256:...",
  "bytes": 2201456,
  "downloadedAt": "2026-03-27T14:00:00Z"
}
```

## 7. 去重与排序策略（Phase 2.1 简化版）

### 7.1 去重优先级
1. DOI 相同 -> 同一论文。
2. `arxivId` 相同 -> 同一论文。
3. `normalize(title) + year` 相同 -> 近似同一论文。

### 7.2 合并规则
- 字段更完整者覆盖缺失字段（例如有 `citationCount` 的结果覆盖空值）。
- `pdfUrl` 优先保留可下载来源（arXiv 通常优先）。

### 7.3 排序规则
- 默认优先“相关性 + 新近性”。
- `source=both` 时可加权：`score = providerScore + log(citationCount+1)`。

## 8. 错误模型
```ts
export class ScholarError extends Error {}
export class InvalidArgsError extends ScholarError {}
export class ProviderError extends ScholarError {}
export class RateLimitError extends ProviderError {}
export class DownloadFailedError extends ScholarError {}
export class InvalidPaperIdError extends ScholarError {}
export class InvalidPDFError extends ScholarError {}
export class StorageError extends ScholarError {}
```

## 9. 重试与限流策略
- 网络超时/5xx：最多 3 次，指数退避（500ms, 1s, 2s）。
- 429：读取 `Retry-After`，无该头时退避 2s/4s/8s。
- 4xx 非 429：不重试，直接失败。

## 10. 质量门禁（Definition of Done）
1. `search_scholar`：可返回 arXiv + Semantic Scholar 合并结果。
2. `download_paper`：可从 paperId/DOI/URL 下载并落盘。
3. 重复下载命中缓存（`fromCache=true`）。
4. 非 PDF 文件能被识别并失败（`InvalidPDFError`）。
5. 单测覆盖：
- `normalize/dedup/resolve/validate`。
6. 集成测试覆盖：
- `search -> pick -> download -> verify file exists`。

## 11. 开发顺序（建议 1 周）
1. Day 1: `types + errors + tool contract`。
2. Day 2: arXiv provider + `search_scholar` 基础版。
3. Day 3: Semantic Scholar provider + 去重合并。
4. Day 4: `resolve/fetch/validate/store` + `download_paper`。
5. Day 5: 单测、集成测试、CLI 接入与文档补充。

## 12. 开发前待确认（默认值）
- Semantic Scholar 是否使用 API Key：默认支持环境变量 `SEMANTIC_SCHOLAR_API_KEY`，无 key 也可降级运行。
- 下载覆盖策略：默认仅 `force=true` 覆盖。
- 目录可配置性：默认固定 `~/.research-agent/`，后续再做配置化。
