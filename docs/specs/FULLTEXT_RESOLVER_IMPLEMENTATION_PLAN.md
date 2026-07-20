# Fulltext Resolver 实施计划（v0）

- 日期: 2026-03-28
- 范围: 先完成“可用闭环”，不做过早优化
- 目标: 输入 arXiv ID / DOI / URL，输出可用文本（优先 LaTeX，回退 HTML，再回退 PDF 文本/OCR）

## 1. 交付策略
1. 先写短计划 + 稳定接口（今天完成）。
2. 再做 provider 最小实现（arXiv + Semantic Scholar）。
3. 最后接入回退链路与测试。

## 2. v0 范围
- `resolve(input)`:
  - 解析输入类型（arXiv/DOI/URL）
  - 生成候选载体链路（latex/html/pdf）
- `fetch(target)`:
  - 拉取并缓存载体
- `extract(target)`:
  - latex/html 直接转文本
  - pdf 走 text extractor
  - OCR 作为兜底

## 3. 回退顺序
1. arXiv source (`src`)
2. ar5iv HTML
3. OA PDF（SS/OpenAlex/Unpaywall）
4. PDF text
5. OCR

## 4. 模块边界
- `fulltext/types.ts`: 类型与 Result
- `fulltext/resolve.ts`: 主策略编排
- `fulltext/providers/arxiv.ts`: arXiv 解析
- `fulltext/providers/semantic.ts`: Semantic Scholar 解析
- `fulltext/providers/openalex.ts`: OpenAlex 增强
- `fulltext/providers/unpaywall.ts`: DOI -> OA PDF 增强

## 5. DoD（v0）
1. 输入 arXiv ID 能得到 `latex/html/pdf` 候选列表。
2. 输入 DOI 能通过至少一条链路得到可下载目标（若存在 OA）。
3. 输出包含 `trace`，可看到命中与回退过程。
4. 对网络失败、429、无结果有可预期错误。

## 6. 当前实施顺序（本周）
1. Day 1: 类型、接口、策略骨架。
2. Day 2: arXiv provider + `resolve` 跑通。
3. Day 3: Semantic Scholar + OpenAlex + Unpaywall 增强。
4. Day 4: `fetch/extract` + 缓存。
5. Day 5: 测试与文档。
