# 章节感知全文阅读(功能规划第一批第 2 项)

- 日期: 2026-07-20
- 范围: `paper_outline` 工具、`paper_fulltext` 的 `section` 参数、多文件 LaTeX 源码的文档序拼装修复
- 实现位置: fork 的 `packages/scholar/src/fulltext/{outline,extract}.ts`

## 动机

`paper_fulltext` 原先只能整篇拉取,长论文(50 页以上)会撑爆 reader 的上下文窗口,只能靠截断落盘再分段用 read 工具读,行为很粗糙,也不符合人类精读"先看目录、再按需读方法节和实验节"的方式。这是功能规划第一批里判定为"精读质量最直接杠杆"的一项。

## 三种来源的可靠度如实标注

大纲提取不走 `extract()` 的纯文本管线——那条管线的 `stripLatex` 会把 `\section{Introduction}` 连同标题文字一起吃掉(这是发现于本次开发的一个既有小缺陷,顺手在注释里记录清楚,但因为不影响现有纯文本输出的正确性,没有单独修)。`outline.ts` 直接在原始载体上找结构:LaTeX 认 `\section`/`\subsection`/`\subsubsection`,HTML 认 `<h1>`-`<h6>`(自动把最浅层级重映射为 1,使语义与 LaTeX 的 section/subsection 对齐)。这两种是 `confidence: "structural"`,可信度高。PDF 没有任何结构标记,只能在 `pdftotext -layout` 保留的行版式上猜:编号行("3.1 Method Details")或已知章节关键词的独立短行,标为 `confidence: "heuristic"`,工具描述和 reader prompt 都明确告知调用方——可能漏检或误判,遇到抓不到或明显不对时应该回退到整篇 `paper_fulltext`。

## 一个真实发现的准确性缺陷

用 arXiv 1706.03762(Attention Is All You Need)做端到端验证时发现:这篇论文的 LaTeX 源码被拆成多个 `.tex` 文件,原来的拼装逻辑按 `tar -tzf` 列出的字母序简单拼接,导致文档结构被打乱——Introduction 排到了第 9 位,因为字母序把另一个文件排在了主文件前面。这不是 outline 模块本身的 bug,而是暴露了 `extract.ts` 里 `rawLatexSource` 一直存在的问题(此前的纯文本输出同样受影响,只是没有大纲可供肉眼发现)。

修复是 `assembleLatexSource()`:找到含 `\documentclass` 的根文件,沿 `\input{}`/`\include{}` 的引用顺序递归展开(支持无后缀/`.tex`/`.ltx`、子目录路径、循环引用防护);没找到根文件时退化为原来的字母序拼接(不是没有输出,只是失去顺序保证);展开后仍未被引用到的文件(附录、被注释掉的引用对应的文件等)按原序追加在末尾——**绝不因为顺序问题丢内容**,这与既有的"4 层 fallback,失败也要保底能给东西"的设计原则一致。修复后在同一篇论文上重新验证,顺序完全正确:Introduction → Background → Model Architecture(含正确嵌套的 Encoder/Decoder Stacks、Attention 及其子节)→ ... → Conclusion。

## 接口

`paper_outline(paper, hint?)` 返回大纲列表(标题、层级、序号)与来源置信度,不拉取全文,用于让 agent 先"翻目录"。`paper_fulltext(paper, hint?, section?)` 的 `section` 参数接受标题(模糊匹配,词根前缀重合即算命中,应付 experiment/experiments/experimental 这类词形差异)或 1-based 序号(如 "3" 或 "3.1" 对应大纲里的第几项),命中的章节切片包含其所有子章节正文、止于下一个同级或更高级标题——这样"要 Method 节"会连带拿到 Method 下所有子节,符合读者的直觉;未命中时返回可用章节列表而不是干瘪的报错,方便 agent 重试。

## reader 子 agent 的调整

prompt 增加一条协议:长论文优先 `paper_outline` 再逐节 `paper_fulltext`,而不是每次都整篇拉取;明确告知 PDF 来源的大纲是启发式的,抓空或明显不对就退回整篇读。权限白名单相应加了 `paper_outline`。

## 未做

跨章节的语义对齐(比如把大纲标题和笔记里的 "Method" 小节自动关联)——目前是 reader 自己读完整合,没有额外结构化;HTML 大纲对非 ar5iv 风格的通用网页效果未知(设计针对 ar5iv 转换出的语义化标题标签,通用网页可能标题层级混乱);PDF 启发式的关键词列表是英文学术论文的常见小标题,非英文论文或非常规命名的章节标题识别不到。
