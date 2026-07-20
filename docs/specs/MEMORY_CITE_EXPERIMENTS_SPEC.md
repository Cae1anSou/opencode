# 记忆注入、引用层与实验记录设计(路线图第二至四阶段)

- 日期: 2026-07-19
- 范围: 项目研究记忆(RESEARCH.md)与常驻上下文注入、引用层(paper_cite / references.bib)、实验记录层(experiment_log / EXPERIMENTS.md)
- 前置: `READER_AND_NOTES_SPEC.md`(笔记层与 reader agent)
- 实现位置: fork 的 `packages/scholar/src/{memory,cite,experiments}/`、`packages/opencode/src/session/scholar-context.ts`

## 项目研究记忆与常驻注入(第二阶段第二片)

`.research/RESEARCH.md` 是项目级记忆:三个"当前认知"小节(Research Questions、Hypotheses、Findings & Decisions)整节替换,承载随研究推进而演化的判断;Log 小节只增不改,自动落日期,承载时间线。agent 经 `research_update` 工具更新,人可以直接手改——固定标题缺失时写入端按需补回,不破坏其余内容。写入与笔记层同样串行化。

注入机制是本片的关键:`ScholarContext.system()` 挂在宿主主循环的 system prompt 组装处(`prompt.ts` 的 `Effect.all` 一组),把三个小文件注入每个非 hidden agent 的系统上下文——RESEARCH.md(预算 6K 字符)、NOTES.md 精读索引(4K)、EXPERIMENTS.md 实验索引(3K)。超限截尾并附全文路径,提示 agent 用 read 工具看完整内容;文件不存在时返回空数组,非科研项目零开销。这个设计落实了愿景里"领域对象换入换出优先于通用压缩"的主张:常驻的只是索引投影,重内容(完整笔记、实验日志)按需经 read 工具加载。hidden agent(title/compaction)不注入。至此"三周后回来它还记得"闭环:新会话开场即知道项目的问题、假设、读过什么、跑过什么。

## 引用层(第三阶段)

`paper_cite` 把引用建立在"项目真正读过的论文"上:给 paperId 时元数据自动从精读笔记解析(标题/作者/年份),没有笔记也没有显式标题就大声失败——引用必须可溯源,这是与"临时搜一条引用"的本质区别。产物是 `.research/references.bib`,LaTeX 稿件直接 `\bibliography` 引用。key 生成规则是"第一作者姓 + 年份 + 标题首个实义词"(如 `vaswani2017attention`);幂等性是硬约束:同一篇论文重复 cite 返回既有 key(稿件里的 `\cite{}` 锚点永不漂移),不同论文撞 key 时加后缀。arXiv 论文自动带 eprint/archivePrefix 字段。

## 实验记录层(第四阶段)

`experiment_log` 与笔记层同构:`.research/experiments/<id>.md`(frontmatter + 正文五节:Setup/Command/Results/Interpretation/Next Steps)加 `EXPERIMENTS.md` 单文件索引,upsert 语义、串行写入。结构化字段里有记忆图谱的第一批边:`hypothesis` 指向 RESEARCH.md 里的假设,`papers` 指向方法来源的论文 id(与笔记对应),`claims` 指向稿件中由该实验支撑的主张(自由文本或表格锚点)。跑实验本身用宿主的 shell/edit 工具——这正是 fork 成熟 harness 的红利,我们只添加领域记录层。

## 图谱现状与后续

至此四类一等对象全部有了持久化形态与关联边:论文(papers/ + 笔记)↔ 项目认知(RESEARCH.md)↔ 实验(experiments/,经 papers/hypothesis/claims 字段关联)↔ 稿件(references.bib 的稳定 key + claims 锚点)。边目前以字段内的 id 引用表达,够用且人类可读;若后续需要反向查询("哪些实验用了这篇论文"),再考虑从文件投影出索引,不预先引入数据库。

## 审稿人视角与跨论文综合(后续同日落地)

审稿检查分两层。确定性层是 `cite_audit` 工具:解析稿件全部 `\cite` 变体(natbib/biblatex,含可选参数与多键),与 references.bib、精读笔记三方对齐,报告"引了但 bib 没有"(编译断裂)、"bib 有但从未引用"(残留)、"引了但项目从没读过"(bib 条目溯源不到笔记)。语义层是 `checker` 只读子 agent:先跑 cite_audit 拿机械事实,再逐条把稿件主张与被引论文的笔记对照,按严重度分类报告——UNSUPPORTED(笔记不支持或相悖)、NUMBER MISMATCH(数字与笔记不符)、OVERCLAIMED(以偏概全)、UNREAD SOURCE,并给出修改建议;只报告,不改稿。

跨论文对比由 `synthesizer` 只读子 agent 承担:输入研究问题与论文集合,通读全部相关笔记全文(重上下文隔离在子会话),产出对比表、真实分歧点(不许和稀泥)、对项目研究问题的含义与建议后续阅读;证据严格限于笔记,没读过的论文如实列为缺口而非凭记忆补齐。

维持推迟:RAG 粗筛。

## 写作子 agent 与引用元数据补全(功能规划第二批,2026-07-20)

`writer` 是第一个有写权限的领域子 agent(白名单:read/glob/grep/list + write/edit + paper_cite/cite_audit/paper_verify,其余全部 deny)。它的证据纪律与 checker 对称但方向相反——checker 审查已写的稿子,writer 约束将要写的稿子:只从精读笔记取证据,没有笔记支撑的论断宁可留 TODO 或声明"需要先读哪篇论文",也不写;引用一律经 `paper_cite` 拿稳定 key,不允许猜测式的 author-year 裸引用;写完自跑 `cite_audit` 自检,发现问题最多修正一轮,仍解决不了就如实报告而不是隐瞒。"拒绝写没有依据的论断"在 prompt 里被明确定性为正确行为而非要道歉的失败。

`paper_cite` 补充了元数据补全:`PaperMetadata` 新增 `venue` 字段(随 Semantic Scholar 请求字段一并拿到),`addCitation` 增加可选的 `enrich` 开关——默认关闭,保持离线单测和原有快速本地写入路径不受影响;开启时若 venue 或 doi/arxivId 缺失,调用已有的 `verifyPaper` 做置信度核验查找,命中且置信度达标才回填缺失字段,查不到或网络失败一律静默降级,不影响引用条目本身正常建立。这个网络查询被特意放在文件写入的串行锁**之外**执行,因为它是只读操作,不该让并行的其他 `paper_cite` 调用排队等一次网络往返。`paper_cite` 工具层默认开启补全。

开发中用真实调用发现 Semantic Scholar 未认证 API 的公开限流相当严格(单次批量调试即触发 429),这是外部已知约束(此前 `LITERATURE_FULLTEXT_TOOLING_SURVEY` 已提及),代码通过 `SEMANTIC_SCHOLAR_API_KEY` 环境变量提供逃生舱,补全失败时的静默降级设计因此显得更重要——它保证限流不会拖慢或打断引用建立这个核心动作。
