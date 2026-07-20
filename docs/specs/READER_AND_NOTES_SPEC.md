# 精读 SubAgent 与笔记层设计(路线图第二阶段第一片)

- 日期: 2026-07-19
- 范围: 精读笔记的 schema 与存储、`paper_note` 工具、`reader` 内置子 agent
- 依据: `docs/product/PRODUCT_VISION_v2.md` 支柱一;`docs/architecture/opencode-core-analysis-v2.md` 第五、七节
- 实现位置: fork 的 `packages/scholar/src/notes/` 与 `packages/opencode/src/{tool,agent}/`

## 设计立场

记忆图谱不从数据库开始,从文件开始。第一片只做一件事:让"读过一篇论文"这个事件留下结构化、可延续、可被后续会话廉价加载的痕迹。笔记以 markdown 文件存于项目 worktree 内(`.research/notes/<paperId>.md`),YAML frontmatter 承载结构化字段,正文承载精读内容。这样做的直接收益是:宿主现有的 read/grep/glob 工具天然可以检索笔记,Git 天然对笔记做版本管理,用户可以直接阅读和手改;而结构化字段保证了后续记忆底座(索引投影、按需加载、图谱关联)有稳定的机器可读入口。`NOTES.md` 是全部笔记的单文件投影(每篇一行:状态、标题、一句话论点),它就是未来"上下文按需加载"的第一个素材——主会话只需注入这一个小文件,就知道项目里读过什么。

写入必须串行(归档 ADR-006 的结论):`paper_note` 工具内部经模块级队列串行化所有笔记写入与索引重建,并行 reader 不会写坏索引。

## 笔记 schema

frontmatter 字段:`paperId`(必填,与文献存储的 id 一致)、`title`(必填)、`status`(to_read/reading/read)、`year`、`authors`(JSON 数组)、`tags`(JSON 数组)、`thesis`(一句话论点)、`updatedAt`(ISO 时间)。正文六个标准节:Problem & Motivation、Method、Experiments & Results、Relevance to This Project、Limitations & Open Questions、Key References。"Relevance to This Project"是本产品与通用总结工具的分界——reader 被要求结合项目上下文写这一节,而不是就论文谈论文。

## paper_note 工具

参数即 schema 字段加可选 `body`(整体替换正文)。行为是 upsert:已有笔记时合并元数据、按需替换正文;每次写入后重建 `NOTES.md` 索引。权限点 `paper_note`,主会话首次调用会询问,reader agent 的规则集里默认放行。

## reader 子 agent

内置 agent,`mode: subagent`,权限白名单:read/glob/grep + 四个 scholar 工具 + paper_note,其余全部 deny(不能改代码、不能再派生子任务)。prompt 规定精读协议:先取全文(paper_fulltext,必要时先 paper_download),通读后写结构化笔记(paper_note),数字只允许来自原文,不确定的引用用 paper_verify 核验,取不到全文时如实报告失败而不是凭摘要编造;返回给调用方的是简短综合(几百词)加笔记路径,完整内容留在笔记里——这正是 token 池隔离的意义:重活在子会话干,主会话只收结论。

主会话的使用方式不需要新机制:现有 task 工具指定 `subagent_type: "reader"` 即可,多篇论文可并行派发多个 reader,每个各写各的笔记文件,索引重建被串行队列保护。

## 本片不做

跨论文对比工具(先靠主会话读多份笔记完成)、RESEARCH.md 项目级记忆(下一片,与笔记索引一起规划注入策略)、实验与稿件对象(第三四阶段)、向量粗筛(按 ADR 处置清单推迟)。
