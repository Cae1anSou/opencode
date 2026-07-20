# 文献检索与全文获取组件调研报告

- 调研日期: 2026-03-27
- 调研目标: 为 Scholar CLI 的“文献搜索与下载/全文提取组件”确定可复用能力与实现路径（重点: 是否能直接拿到文本或 LaTeX，PDF 仅作为回退）。
- 结论摘要:
1. 现有 npm/GitHub 里缺少“arXiv + Semantic Scholar 一体化抓取 LaTeX（回退 HTML）再抽文本”的成熟组件。
2. 可以复用的能力是“分段式”的: arXiv/SS/OpenAlex/Unpaywall 负责定位全文链接；ar5iv/ar5ivist 可作为 LaTeX->HTML 层；其余抽取链路需我们自行实现。
3. 建议开源一个独立组件（可单独包/仓库），主工程继续 TS。

---

## 1. 调研平台与调研内容

### 1.1 平台
- GitHub（`gh search repos`, `gh repo view`）
- npm（`npm search`, `npm view`）
- 官方文档页面（arXiv / Semantic Scholar / OpenAlex / Unpaywall）

### 1.2 调研方向
1. 学术检索与下载（arXiv、Semantic Scholar）
2. DOI/OA 链接定位（OpenAlex、Unpaywall）
3. 直接获取文本能力（LaTeX/HTML）
4. 是否有可直接复用的 TS/npm SDK 或一体化工具

---

## 2. 我们检索过的主要能力与仓库/包

## 2.1 GitHub 侧（重点候选）

### A. 可直接参考/复用价值较高
1. `citation-js/citation-js`
- URL: https://github.com/citation-js/citation-js
- 用途: 引用格式与 DOI/BibTeX/CSL 处理
- 结论: 适合后续 citation 模块直接依赖

2. `thomasuebi/semanticscholarjs`
- URL: https://github.com/thomasuebi/semanticscholarjs
- 用途: Semantic Scholar API wrapper（TS）
- 结论: 可 PoC 参考，不建议核心链路强绑定

3. `eliorav/arXiv-api`
- URL: https://github.com/eliorav/arXiv-api
- 用途: arXiv API JS wrapper
- 结论: 可参考，需自行评估质量与覆盖

### B. 与“LaTeX/HTML”强相关（关键）
1. `dginev/ar5iv`
- URL: https://github.com/dginev/ar5iv
- 用途: 将 arXiv 文档转换为 HTML5（基于 LaTeXML）
- 结论: 适合作为 HTML 回退层参考（不是 npm SDK）

2. `dginev/ar5ivist`
- URL: https://github.com/dginev/ar5ivist
- 用途: 本地/容器将 LaTeX source 转为 ar5iv 风格 HTML
- 结论: 可作为“源码转 HTML”后端链路参考

### C. 不建议作为核心依赖
1. `spro/node-arxiv`
- URL: https://github.com/spro/node-arxiv
- npm: https://www.npmjs.com/package/arxiv
- 原因: 历史较久（CoffeeScript 时代）

2. DOI->PDF 脚本类仓库（如 `byigitt/doi2pdf`）
- URL: https://github.com/byigitt/doi2pdf
- 原因: 更偏脚本工具，不适合核心生产链路

### D. 其他检索到但价值偏低/偏场景
- `oksure/openalex-research-mcp`（MCP 服务形态）
- `xbghc/semanticscholar-mcp`（MCP 服务形态）
- 多个 ar5iv 浏览器扩展/转换脚本仓库（非 SDK）

---

## 2.2 npm 侧（重点候选）

### A. 建议直接采用
1. `citation-js`
- npm: https://www.npmjs.com/package/citation-js
- 用途: 引用格式处理

2. `@citation-js/plugin-doi`
- npm: https://www.npmjs.com/package/@citation-js/plugin-doi

3. `@citation-js/plugin-bibtex`
- npm: https://www.npmjs.com/package/@citation-js/plugin-bibtex

### B. 可 PoC 的 API wrapper
1. `arxiv-api-ts`
- npm: https://www.npmjs.com/package/arxiv-api-ts
- 仓库: https://github.com/isamu/arXiv-api-ts

2. `arxiv-client`
- npm: https://www.npmjs.com/package/arxiv-client
- 仓库: https://github.com/moons-14/arxiv-client

3. `arxiv-api-wrapper`
- npm: https://www.npmjs.com/package/arxiv-api-wrapper
- 仓库: https://github.com/vagdur/arxiv-api-wrapper

4. `semanticscholarjs`
- npm: https://www.npmjs.com/package/semanticscholarjs
- 仓库: https://github.com/thomasuebi/semanticscholarjs

5. OpenAlex TS 社区包
- `openalex-client`: https://www.npmjs.com/package/openalex-client
- `openalex-js`: https://www.npmjs.com/package/openalex-js
- `@accelome/openalex-sdk`: https://www.npmjs.com/package/@accelome/openalex-sdk

### C. 关键负向结论
- npm 中未发现成熟的一体化包可直接满足:
  - `arXiv/Semantic Scholar -> 优先 LaTeX -> 回退 HTML -> 回退 PDF -> 输出文本`
- `ar5iv` 方向也没有成熟 npm SDK（`npm search ar5iv` 结果为空）。

---

## 3. 我们查过的官方接口与用途

## 3.1 arXiv

### A. API 文档入口
- https://info.arxiv.org/help/api/index.html
- 用途: arXiv API 使用说明、条款、基础文档入口

### B. 检索 API（计划中采用）
- `http://export.arxiv.org/api/query`
- 用途: 元数据检索（标题、作者、摘要、id 等）

### C. 原文相关入口
1. `https://arxiv.org/abs/<id>`
- 用途: 论文详情页，可导向 PDF

2. `https://arxiv.org/pdf/<id>.pdf`
- 用途: PDF 下载

3. `https://arxiv.org/src/<id>`
- 用途: 源文件（通常是 TeX/tar.gz）获取入口
- 备注: 我们在调研时遇到过 anti-bot/reCAPTCHA 页面，实际实现需加失败处理与回退策略

### D. 价值判断
- arXiv 是最现实的“直接拿 LaTeX/源码”来源。

---

## 3.2 Semantic Scholar

### A. API 产品页
- https://www.semanticscholar.org/product/api
- 用途: 认证与限流说明（API key、RPS 等）

### B. API 教程页
- https://www.semanticscholar.org/product/api/tutorial
- 用途: 字段与示例（含 `openAccessPdf`）

### C. Graph API 文档入口
- https://api.semanticscholar.org/api-docs/graph
- 用途: 路由与字段说明

### D. 检索端点（计划中采用）
- `https://api.semanticscholar.org/graph/v1/paper/search`
- 用途: 论文检索；可请求 `fields=title,abstract,openAccessPdf,externalIds,...`

### E. 价值判断
- 可用于拿 OA PDF 链接（`openAccessPdf`），但不是 LaTeX/全文文本 API。

---

## 3.3 OpenAlex（用于 OA 全文定位增强）

### A. 文档/接口
- 文档: https://developers.openalex.org/api-reference/works
- 用途: Works 字段与过滤

### B. 我们重点关注字段
- `open_access.is_oa`
- `open_access.any_repository_has_fulltext`
- `has_fulltext`
- `has_content.pdf`
- `best_oa_location` / `locations`

### C. 价值判断
- 适合作为 DOI/Work 到 OA 全文链接的补充发现层。

---

## 3.4 Unpaywall（用于 DOI -> OA PDF）

### A. API 产品页
- https://unpaywall.org/products/api

### B. 字段解释页
- https://support.unpaywall.org/support/solutions/articles/44002142311-what-do-the-fields-in-the-api-response-and-snapshot-records-mean-
- 关键字段: `best_oa_location.url_for_pdf`

### C. best_oa_location 规则页
- https://support.unpaywall.org/support/solutions/articles/44001943223-how-is-the-best-oa-location-determined-

### D. 价值判断
- DOI 场景下非常实用，可作为 PDF 链接回填层。

---

## 4. 针对“能直接拿文字/LaTeX”的结论

1. 不是所有来源都能直接给文本。
2. arXiv 是最有机会拿到源码（LaTeX）的主来源。
3. Semantic Scholar 主要给“元数据 + OA PDF 指针”，不是全文文本仓。
4. 现实工程路径应为多级回退:
- `LaTeX/source` -> `HTML` -> `PDF 文本提取` -> `OCR`

---

## 5. 对“是否有现成包可复用”的最终判断

### 5.1 有可复用“组件”，无可复用“一体化成品”
- 可复用:
  - API wrapper（arXiv/SS/OpenAlex）
  - ar5iv/ar5ivist（LaTeX->HTML）
  - citation-js（引用处理）
- 缺失:
  - 一条龙“抓 LaTeX（回退 HTML）+ 文本输出 + 稳健错误恢复”的 TS 包

### 5.2 产品决策建议
- 我们自己实现该组件，并可独立开源（包/仓库）。
- 主体仍保持 TS，必要时把耗时步骤（如复杂转换）做可替换后端。

---

## 6. 建议的组件能力边界（供开发起步）

建议组件名（暂定）: `paper-fulltext-resolver`

核心接口建议:
1. `resolve(input)`
- 输入: arXiv ID / DOI / URL / metadata
- 输出: `{ kind: 'latex'|'html'|'pdf'|'none', url, source, confidence }`

2. `fetch(input, opts)`
- 下载并缓存原始载体（src/html/pdf）

3. `extract(input, opts)`
- 输出统一文本:
  - `text`
  - `format`（latex/html/pdf/ocr）
  - `trace`（命中策略与回退链路）

推荐策略顺序:
1. arXiv `src`
2. ar5iv / HTML
3. openAccessPdf / best_oa_location.url_for_pdf
4. PDF 提取
5. OCR 兜底

---

## 7. 这份报告用于后续开发的意义
- 已覆盖“平台、功能、接口、地址、复用可能性、关键负向结论”。
- 可以直接作为 Phase 2.1 实现前的调研基线。
- 下一步可基于本报告落 API 设计与代码骨架。
