# Research Agent - 架构决策记录 (ADR)

**文档版本:** 1.0
**生成时间:** 2026-03-25
**评审类型:** Engineering Review
**状态:** APPROVED

---

## 文档说明

本文档记录了 Research Agent 项目在工程评审阶段做出的所有关键架构决策。每个决策都包含:
- **背景 (Context)**: 为什么需要做这个决策
- **问题 (Problem)**: 具体要解决什么问题
- **方案对比 (Options)**: 考虑了哪些方案
- **决策 (Decision)**: 最终选择及理由
- **影响 (Consequences)**: 这个决策的正面和负面影响

---

## 决策索引

### 范围与策略
- [ADR-001] 项目范围策略
- [ADR-002] API 提供商选择

### 架构设计
- [ADR-003] SubAgent Token 池隔离
- [ADR-004] 批量处理成本控制
- [ADR-005] PDF 处理 Fallback 策略
- [ADR-006] RESEARCH.md 并发写入
- [ADR-007] Active Papers 加载策略
- [ADR-008] 论文访问统计机制

### 代码质量
- [ADR-009] PDF 处理逻辑位置
- [ADR-010] 错误处理统一模式
- [ADR-011] SubAgent Prompt 版本控制
- [ADR-012] 数据一致性检查

### 测试策略
- [ADR-013] SubAgent 质量测试方法
- [ADR-014] 回归测试策略

### 性能优化
- [ADR-015] 批量处理并发策略
- [ADR-016] Papers Index 扩展性方案
- [ADR-017] 向量数据库选型

---

## ADR-001: 项目范围策略

**状态:** ✅ ACCEPTED
**决策日期:** 2026-03-25
**决策者:** Engineering Review

### 背景

实施计划包含 7 个 Phase,预计 12-16 周。其中 Phase 2.4 (引用图谱) 和 Phase 5 (Git 自动 commit) 并非验证核心假设所必需。核心假设是:"SubAgent 读文献 + 分层记忆能否有效替代现有的 RAG 方案?"

### 问题

是否应该简化范围,先做 MVP (最小可行产品) 验证核心假设,还是按原计划实现全功能?

### 方案对比

| 方案 | 范围 | 工作量 | Completeness | 优缺点 |
|------|------|--------|--------------|--------|
| A) 简化范围,先做 MVP | Phase 1-3 (核心工具 + 文献记忆) | 6-8 周 | 8/10 | ✅ 快速验证核心假设<br>❌ 功能不完整 |
| B) 保持当前范围 | 所有 7 Phase | 12-16 周 | 10/10 | ✅ 完整功能<br>❌ 如果核心假设失败,投入浪费 |
| C) 更激进的简化 | Phase 1-2 only | 4-5 周 | 6/10 | ✅ 最快验证<br>❌ 太简陋,无法真实体验 |

### 决策

**选择方案 B: 保持当前范围 (完整实现所有 7 个 Phase)**

**理由:**
1. **Boil the Lake 原则**: 使用 Claude Code + gstack,完整实现的边际成本接近零
2. **用户承诺**: 在所有核心功能完成前不对外分享
3. **质量优先**: 追求完整性而非速度,首次发布即为高质量版本
4. **一次做对**: 避免后续因功能缺失导致的重构

### 影响

**正面影响:**
- ✅ 首次发布即为完整可用的产品
- ✅ 避免 MVP → 完整版的架构重构
- ✅ 所有组件从一开始就考虑完整性

**负面影响:**
- ❌ 开发周期较长 (12-16 周)
- ❌ 如果核心假设失败,沉没成本较高

**缓解措施:**
- 优先实现 Phase 2.3 (ReadPaper + SubAgent),尽早验证核心假设
- Phase 2.4 和 Phase 5 可在核心假设验证后再实现

---

## ADR-002: API 提供商选择

**状态:** ✅ ACCEPTED
**决策日期:** 2026-03-25
**决策者:** User

### 背景

原实施计划基于 Anthropic Claude API。在工程评审过程中,讨论了 API 限流和成本控制问题。

### 问题

应该使用哪个 LLM API 提供商?如何处理不同用户的 API 偏好?

### 决策

**使用 OpenAI 兼容 API 标准,允许用户自定义 API endpoint 和 key**

**具体实现:**
```typescript
// config.json
{
  "api": {
    "baseURL": "https://api.openai.com/v1",  // 或用户自定义
    "apiKey": "sk-...",
    "model": "gpt-4o-mini",  // 默认模型
    "embeddingModel": "text-embedding-3-small"
  }
}
```

**理由:**
1. **灵活性**: 用户可使用 OpenAI、本地模型 (Ollama/LM Studio)、第三方提供商 (Groq、Together.ai、DeepSeek)
2. **成本优化**: GPT-4o-mini 每篇论文成本 ~$0.02 (vs Claude ~$0.12)
3. **本地部署**: 支持完全离线使用 (通过本地 Qwen2.5 等)
4. **标准化**: OpenAI API 已成为事实标准,兼容性好

### 影响

**正面影响:**
- ✅ 用户可根据预算选择 API
- ✅ 支持本地模型 (零 API 成本)
- ✅ 不绑定单一提供商

**负面影响:**
- ❌ 需要处理不同 API 的细微差异 (如 temperature 范围、token 计数方式)

**需要的架构调整:**
- 实施计划中所有提到 "Anthropic API" 的地方改为 "OpenAI 兼容 API"
- 成本估算需要更新 (基于 GPT-4o-mini)
- 添加 API 配置文档

---

## ADR-003: SubAgent Token 池隔离

**状态:** ✅ ACCEPTED
**决策日期:** 2026-03-25
**决策者:** Engineering Review

### 背景

ReadPaper 工具会创建 SubAgent 生成论文总结。如果 SubAgent 与主 Agent 共享 token 池,并行处理多篇论文时会导致 token 溢出。

### 问题

SubAgent 的 token 池是否与主 Agent 隔离?如果多个 SubAgent 并行运行,如何避免 token 溢出?

### 失败场景

```
主 Agent 上下文: 115K tokens
SubAgent 1: 50K tokens
SubAgent 2: 50K tokens
SubAgent 3: 50K tokens
总计: 265K tokens → 超出 API 限制!
```

用户说:"帮我对比这 5 篇论文的实验方法" → 主 Agent 尝试并行读取 5 篇论文 → 创建 5 个 SubAgent → token 溢出 → API 调用失败。

### 方案对比

| 方案 | 描述 | Completeness | 优缺点 |
|------|------|--------------|--------|
| A) SubAgent 独立 token 池 | 每个 SubAgent 有独立的 200K token 限制 | 10/10 | ✅ 完全隔离<br>❌ 成本更高 (独立 API 调用) |
| B) 串行执行 SubAgent | 主 Agent 一次只创建 1 个 SubAgent | 8/10 | ✅ 避免溢出<br>❌ 速度慢 |
| C) 限制并发数 + queue | 最多并行 2 个 SubAgent | 9/10 | ✅ 平衡速度和资源<br>❌ 需要队列管理 |

### 决策

**选择方案 A: SubAgent 独立 token 池**

**理由:**
1. OpenCode 的 SubAgent 机制已经实现了隔离
2. 每个 SubAgent 都是独立的 API 调用,有自己的 200K token 限制
3. 完全避免主 Agent 上下文溢出的风险

### 影响

**正面影响:**
- ✅ 主 Agent 和 SubAgent 完全隔离,互不影响
- ✅ 可以安全地并行创建多个 SubAgent
- ✅ 架构清晰,易于理解

**负面影响:**
- ❌ 每个 SubAgent 都是独立 API 调用,成本更高
- ❌ 需要成本控制机制 (见 ADR-004)

---

## ADR-004: 批量处理成本控制

**状态:** ✅ ACCEPTED
**决策日期:** 2026-03-25
**决策者:** Engineering Review

### 背景

每个论文总结需要 SubAgent API 调用,成本约 $0.02-0.05 per paper (使用 GPT-4o-mini)。用户首次导入大量文献时,成本可能让人震惊。

### 问题

如何处理大批量文献导入的成本风险?

### 失败场景

博士生导入 Zotero 的 200 篇文献 → API 成本 $4-10 → 用户在 Twitter 吐槽 "Research Agent burned $10 in 10 minutes" → 产品口碑崩溃。

### 方案对比

| 方案 | 描述 | Completeness | 优缺点 |
|------|------|--------------|--------|
| A) 批量处理确认 | 检测到 >20 篇未总结论文时,弹出成本估算让用户确认 | 10/10 | ✅ 透明,用户知情<br>❌ 需要中断流程 |
| B) 增量模式 | 默认不自动总结,只在用户具体读某篇论文时才 SubAgent 总结 | 8/10 | ✅ 避免意外成本<br>❌ 第一次读会很慢 |
| C) 成本上限配置 | 用户可设置 max_monthly_cost,超出后拒绝总结 | 9/10 | ✅ 可控<br>❌ 用户可能不理解配置 |

### 决策

**选择方案 A: 批量处理确认**

**实现方式:**
```typescript
// packages/tools/src/read-paper.ts
if (pendingSummaries.length > 20) {
  const estimatedCost = pendingSummaries.length * 0.03; // $0.03 per paper (GPT-4o-mini)
  const estimatedTime = pendingSummaries.length * 2; // 2 min per paper

  await askUserConfirmation(
    `检测到 ${pendingSummaries.length} 篇论文需要总结。\n` +
    `预计成本: $${estimatedCost.toFixed(2)}\n` +
    `预计时间: ${Math.floor(estimatedTime / 60)} 小时 ${estimatedTime % 60} 分钟\n` +
    `是否继续?`
  );
}
```

**理由:**
1. 用户完全知情,不会有意外惊喜
2. 只在批量操作时触发,不影响日常使用
3. 提供清晰的成本和时间估算

### 影响

**正面影响:**
- ✅ 避免用户意外高额费用
- ✅ 建立信任 (透明成本)
- ✅ 用户可以选择分批处理

**负面影响:**
- ❌ 需要中断批量导入流程
- ❌ 首次导入大文献库体验略有影响

---

## ADR-005: PDF 处理 Fallback 策略

**状态:** ✅ ACCEPTED
**决策日期:** 2026-03-25
**决策者:** Engineering Review

### 背景

PDF 格式复杂多样,单一处理方法无法覆盖所有情况。原计划有 3 层 fallback:LaTeX 源 → pdf-parse → OCR。

### 问题

如果 3 层都失败了,论文会怎样?用户是否能知道失败原因?

### 失败场景

用户导入一个扫描版 PDF → LaTeX 源不存在 → pdf-parse 无法识别 → OCR 超时 → 异常被主 Agent 捕获 → 主 Agent 回复 "抱歉,处理失败" → 用户再试一次 → 再次失败 → 用户放弃这篇论文,但不确定是否应该手动处理。

### 决策

**4 层 Fallback 策略 + 失败标记**

**完整流程:**
```
1. 尝试下载 arXiv LaTeX 源 → 转文本 (最干净,最快)
2. 使用 pdf-parse 提取文本 (快速,适合大部分论文)
3. OCR (Tesseract.js) (慢,但能处理扫描版)
4. 直接发 PDF 给 SubAgent (Claude/GPT-4 可以读 PDF) (最贵,但保底能处理)
5. 如果都失败 → 标记为 'processing_failed',保留 PDF
```

**失败处理:**
```typescript
// packages/tools/src/download-paper.ts
class DownloadPaperTool {
  async processPDF(pdfPath: string, paperId: string): Promise<Result<string, Error>> {
    // 策略 1-4 依次尝试...

    // 所有策略都失败
    return {
      success: false,
      error: new PDFProcessingError(
        `无法处理 PDF: ${paperId}。请检查文件是否损坏或加密。`,
        { paperId, pdfPath }
      )
    };
  }
}

// papers.json 中标记
{
  "papers": {
    "arxiv-123": {
      "status": "processing_failed",
      "error": "PDF 处理失败: 所有 4 种策略都无法提取文本",
      "pdfPath": "~/.research-agent/papers/pdfs/arxiv-123.pdf"
    }
  }
}
```

**用户可以:**
```bash
$ research-agent list-papers --status failed
发现 3 篇论文处理失败:
  - arxiv-123: PDF 处理失败
  - arxiv-456: PDF 损坏
  - arxiv-789: PDF 加密

$ research-agent retry arxiv-123  # 重试处理
```

### 影响

**正面影响:**
- ✅ 4 层 fallback 覆盖 >95% 的 PDF
- ✅ 失败论文不会"消失",用户能查看和重试
- ✅ 清晰的失败原因

**负面影响:**
- ❌ 策略 4 (发 PDF 给 SubAgent) 成本较高
- ❌ 需要额外的错误状态管理

---

## ADR-006: RESEARCH.md 并发写入

**状态:** ✅ ACCEPTED
**决策日期:** 2026-03-25
**决策者:** Engineering Review

### 背景

RESEARCH.md 会在多个地方自动更新:添加新文献、完成实验、Agent 每次对话后更新进展。

### 问题

如果用户在并行执行多个操作,会发生什么?

### 失败场景

```
用户: "帮我找 10 篇论文,同时跑一下 baseline 实验"

Agent:
  Thread 1: SearchScholar → 找到 10 篇论文 → 逐篇更新 RESEARCH.md "关键文献"
  Thread 2: RunExperiment → 实验完成 → 更新 RESEARCH.md "实验记录"

结果: 文件冲突 → 其中一个写入丢失
```

### 方案对比

| 方案 | 描述 | Completeness | 优缺点 |
|------|------|--------------|--------|
| A) 文件锁 + 重试 | 使用 fs.lock,写入前加锁,冲突时重试 3 次 | 10/10 | ✅ 成熟方案<br>❌ 需要处理锁超时 |
| B) 串行化所有写入 | 所有更新进队列,单线程处理 | 9/10 | ✅ 简单<br>❌ 需要全局队列 |
| C) 不自动更新 | Agent 只读 RESEARCH.md,用户手动维护 | 5/10 | ✅ 最安全<br>❌ 丢失自动化价值 |

### 决策

**选择方案 B: 串行化所有写入**

**实现方式:**
```typescript
// packages/memory/src/research-md.ts
class RESEARCHmd {
  private updateQueue: Promise<void> = Promise.resolve();

  async update(section: string, content: string): Promise<void> {
    // 将更新加入队列
    this.updateQueue = this.updateQueue.then(async () => {
      const md = await this.read();
      const updated = this.updateSection(md, section, content);
      await fs.writeFile(this.mdPath, updated);
    });
    return this.updateQueue;
  }
}
```

**理由:**
1. 简单,无需外部依赖
2. Promise chain 自然地实现了串行化
3. 适合 Node.js 单线程环境

### 影响

**正面影响:**
- ✅ 完全避免文件冲突
- ✅ 代码简单,易于维护
- ✅ 无需处理锁超时

**负面影响:**
- ❌ 如果队列很长,后续更新会等待
- ❌ 需要确保 queue 不会无限增长

---

## ADR-007: Active Papers 加载策略

**状态:** ✅ ACCEPTED
**决策日期:** 2026-03-25
**决策者:** Engineering Review + User

### 背景

计划中的分层加载策略需要决定哪些论文加载到 "Active Papers" 上下文 (~50K tokens)。

### 问题

如何决定哪些论文加载到 Active Papers 上下文?

### 失败场景

用户说 "帮我写 related work,参考我之前看过的那几篇关于 sparse attention 的论文"
→ Agent 不知道"之前看过的"指哪些
→ 只能加载所有匹配 "sparse attention" 的论文
→ 可能加载 20 篇,超出 50K 限制
→ 上下文溢出或漏掉关键论文

### 方案对比

| 方案 | 描述 | Completeness | 优缺点 |
|------|------|--------------|--------|
| A) LLM 决策 + fallback | 主 Agent 分析用户问题,决定加载哪些论文。如果不确定,加载 RESEARCH.md "关键文献" + 最近 5 轮对话提到的论文 | 10/10 | ✅ 智能<br>❌ 依赖 LLM 判断 |
| B) 固定策略 | 总是加载 RESEARCH.md "关键文献" 中的前 10 篇 | 7/10 | ✅ 简单<br>❌ 可能漏掉相关论文 |
| C) 用户显式指定 | 用户必须明确说 "load paper-123" | 6/10 | ✅ 最可控<br>❌ 体验差 |

### 决策

**选择方案 A: LLM 决策 + fallback + `@` 语法**

**实现方式:**

1. **System Prompt 添加能力:**
```typescript
const SYSTEM_PROMPT = `
你有一个 Papers Index,包含所有论文的标题和摘要。
在回答用户问题前,分析需要哪些论文的详细内容。
调用 load_papers([paper_ids]) 工具将论文总结加载到上下文。

用户也可以用 '@paper-id' 语法显式指定论文。
例如: "@arxiv-1706-03762 的实验用了什么数据集?"
`;
```

2. **Fallback 策略:**
```typescript
async function selectActivePapers(userQuery: string): Promise<string[]> {
  // 1. 检查用户是否用 '@' 语法
  const mentioned = extractMentionedPapers(userQuery); // ["@arxiv-123"]
  if (mentioned.length > 0) {
    return mentioned;
  }

  // 2. LLM 决策
  const llmSelected = await agent.call("analyze_query_papers", { query: userQuery });
  if (llmSelected.length > 0) {
    return llmSelected;
  }

  // 3. Fallback: RESEARCH.md 关键文献 + 最近对话
  const keyPapers = await readRESEARCHmd().getKeyPapers().slice(0, 5);
  const recentPapers = getRecentConversationPapers(5);
  return [...keyPapers, ...recentPapers];
}
```

**理由:**
1. LLM 决策最智能,能理解隐含的"之前看过的"
2. `@` 语法给用户完全控制权
3. Fallback 确保总能加载相关论文

### 影响

**正面影响:**
- ✅ 智能加载,符合用户意图
- ✅ 用户可以显式控制 (用 `@`)
- ✅ 有 fallback,不会完全失败

**负面影响:**
- ❌ 依赖 LLM 判断,可能不准确
- ❌ 需要额外的 API 调用 (分析查询)

---

## ADR-008: 论文访问统计机制

**状态:** ✅ ACCEPTED
**决策日期:** 2026-03-25
**决策者:** Engineering Review

### 背景

主 Agent 需要"学习"哪些论文重要,以便优先加载到上下文。

### 问题

是否添加论文访问统计,让 Agent 学习哪些论文重要?

### 决策

**添加访问统计**

**数据结构:**
```json
{
  "papers": {
    "arxiv-2024-12345": {
      "id": "arxiv-2024-12345",
      "title": "...",
      "accessCount": 15,           // ← 新增
      "lastAccessed": "2026-03-25",// ← 新增
      "mentionedInConversations": 8,// ← 新增
      "citedInDrafts": 3            // ← 新增
    }
  }
}
```

**使用方式:**
```typescript
async function selectActivePapers(userQuery: string, maxTokens: number = 50000): Promise<string[]> {
  // 1. 获取候选论文 (RAG 检索或 fallback)
  const candidates = await searchSimilar(userQuery, 20);

  // 2. 按访问统计排序
  candidates.sort((a, b) => {
    const scoreA = a.accessCount * 2 + a.mentionedInConversations * 3 + a.citedInDrafts * 5;
    const scoreB = b.accessCount * 2 + b.mentionedInConversations * 3 + b.citedInDrafts * 5;
    return scoreB - scoreA;
  });

  // 3. 加载直到达到 token 限制
  const selected = [];
  let usedTokens = 0;
  for (const paper of candidates) {
    const tokens = countTokens(paper.summary);
    if (usedTokens + tokens > maxTokens) break;
    selected.push(paper);
    usedTokens += tokens;
  }

  return selected;
}
```

**理由:**
1. Agent 会随着使用变得更智能
2. 高频论文自动优先加载
3. 无需额外 API 调用

### 影响

**正面影响:**
- ✅ Agent 具备自适应能力
- ✅ 用户高频使用的论文总是可用
- ✅ 符合"学习型系统"的设计理念

**负面影响:**
- ❌ 需要维护统计数据
- ❌ papers.json 略微变大

---

## ADR-009: PDF 处理逻辑位置

**状态:** ✅ ACCEPTED
**决策日期:** 2026-03-25
**决策者:** Engineering Review

### 背景

PDF 处理 (ProcessPDF) 是一个独立工具,但 ReadPaper 需要原文 (rawPath)。这导致可能的重复逻辑。

### 问题

PDF 处理逻辑应该在哪里?

### 方案对比

| 方案 | 描述 | Completeness | 优缺点 |
|------|------|--------------|--------|
| A) DownloadPaper 自动调用 ProcessPDF | Download 后立即处理,确保 rawPath 总是存在 | 10/10 | ✅ 逻辑集中,符合 DRY<br>❌ Download 变慢 |
| B) ReadPaper 检查并调用 ProcessPDF | 惰性处理,只在需要时转文本 | 8/10 | ✅ 延迟处理<br>❌ ReadPaper 逻辑变复杂 |
| C) 独立工具 ImportPaper | 创建 ImportPaper(download + process + summarize) | 9/10 | ✅ 高层抽象<br>❌ 增加一个工具 |

### 决策

**选择方案 A: DownloadPaper 自动调用 ProcessPDF**

**实现方式:**
```typescript
class DownloadPaperTool implements Tool {
  async execute(args: DownloadPaperArgs): Promise<{
    pdfPath: string;
    rawPath: string;
    metadata: PaperMetadata;
  }> {
    // 1. 去重检查
    if (this.alreadyDownloaded(args.paperId) && !args.force) {
      return this.getExistingPaths(args.paperId);
    }

    // 2. 下载 PDF
    const pdfPath = await this.downloadPDF(args.paperId);

    // 3. 处理 PDF → raw text (4 层 fallback) ← 自动调用
    const rawPath = await this.processPDF(pdfPath, args.paperId);

    // 4. 提取元数据
    const metadata = await this.extractMetadata(args.paperId);

    // 5. 更新 papers.json
    await this.updatePapersIndex(args.paperId, metadata);

    return { pdfPath, rawPath, metadata };
  }
}
```

**理由:**
1. "一次做对" - 下载后立即处理完整
2. ReadPaper 只需要读 rawPath,逻辑简单
3. 符合 DRY 原则,逻辑集中在一处

### 影响

**正面影响:**
- ✅ DRY,无重复逻辑
- ✅ ReadPaper 简化
- ✅ 用户下载后立即可用

**负面影响:**
- ❌ DownloadPaper 变慢 (需要处理 PDF)
- ❌ 批量下载时用户需要等待

**缓解措施:**
- 显示进度:"下载 paper-123... 处理 PDF... 完成"

---

## ADR-010: 错误处理统一模式

**状态:** ✅ ACCEPTED
**决策日期:** 2026-03-25
**决策者:** Engineering Review

### 背景

原计划中不同工具的错误处理策略不一致:
- SearchScholar: "无结果 → 返回空数组,不报错"
- DownloadPaper: "下载失败 → 抛出 InvalidPaperIdError"
- ProcessPDF: "PDF 损坏 → CorruptedPDFError"

### 问题

错误处理策略应该统一吗?

### 失败场景

```typescript
const papers = await agent.call("search_scholar", { query: "transformer" });
// → API 超时,返回 []
// Agent: "没有找到相关论文"  ← 错误!实际是 API 失败
```

主 Agent 无法区分"真的没结果"和"API 出错了"。

### 方案对比

| 方案 | 描述 | Completeness | 优缺点 |
|------|------|--------------|--------|
| A) 统一使用 Result<T, Error> | 所有工具返回 `{ success: boolean, data?: T, error?: Error }` | 10/10 | ✅ 明确区分"成功但空"和"失败"<br>❌ 所有调用处需要检查 |
| B) 统一抛异常 | 所有错误都 throw,主 Agent catch 并重试 | 7/10 | ✅ 简单<br>❌ 无法区分"无结果"和"出错" |
| C) 保持当前策略 | 不同工具不同策略,在 description 中说明 | 6/10 | ✅ 灵活<br>❌ Agent 需要学习每个工具 |

### 决策

**选择方案 A: 统一使用 Result<T, Error> 模式**

**实现方式:**
```typescript
// packages/core/src/types/result.ts
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

// 工具返回示例
class SearchScholarTool {
  async execute(args): Promise<Result<PaperMetadata[], SearchError>> {
    try {
      const papers = await this.searchAPI(args.query);
      return { success: true, data: papers };  // 空数组也是成功
    } catch (err) {
      return { success: false, error: new SearchError("API timeout", err) };
    }
  }
}

// 主 Agent 调用
const result = await agent.call("search_scholar", { query });
if (!result.success) {
  return `搜索失败: ${result.error.message}`;
}
if (result.data.length === 0) {
  return `没有找到相关论文,尝试换个关键词?`;
}
```

**理由:**
1. 明确区分三种情况:成功有数据、成功无数据、失败
2. 类型安全 (TypeScript)
3. 主 Agent 可以清晰地处理每种情况

### 影响

**正面影响:**
- ✅ 错误处理清晰,不会误导用户
- ✅ 类型安全
- ✅ 便于测试

**负面影响:**
- ❌ 所有调用处需要检查 `result.success`
- ❌ 代码略微冗长

---

## ADR-011: SubAgent Prompt 版本控制

**状态:** ✅ ACCEPTED
**决策日期:** 2026-03-25
**决策者:** Engineering Review

### 背景

PAPER_SUMMARY_PROMPT 是 SubAgent 生成总结的核心。如果后续修改 Prompt,会导致新旧总结格式不一致。

### 问题

SubAgent Prompt 模板如何版本控制?

### 失败场景

```
v1 Prompt: 生成 "**可引用的点**" section
v2 Prompt: 改名为 "**Citeable Claims**"

用户: "列出所有可引用的点"
Agent 解析 1000 篇旧总结 → 找到 "**可引用的点**"
Agent 解析 50 篇新总结 → 找不到 "**可引用的点**" → 报错
```

### 方案对比

| 方案 | 描述 | Completeness | 优缺点 |
|------|------|--------------|--------|
| A) 在 summary 文件中记录 prompt_version | 总结文件头部添加 `<!-- Generated with prompt v2 -->` | 10/10 | ✅ 可检测旧版本<br>❌ 需要解析文件头 |
| B) 全量重新生成 | 修改 Prompt 后,自动批量重新生成所有总结 | 9/10 | ✅ 保证一致性<br>❌ 成本高 ($100+) |
| C) 不管,容忍不一致 | 主 Agent 学会处理不同格式 | 5/10 | ✅ 简单<br>❌ 可能出错 |

### 决策

**选择方案 A: 在 summary 文件中记录 prompt_version**

**实现方式:**
```markdown
<!-- Generated by Research Agent v1.0.0 -->
<!-- Prompt version: 2.1.0 -->
<!-- Generated at: 2026-03-25T10:30:00Z -->

# [论文标题]

**元数据**
...
```

```typescript
// packages/tools/src/read-paper.ts
class ReadPaperTool {
  async execute(args) {
    const summary = await fs.readFile(summaryPath, 'utf-8');
    const promptVersion = this.extractPromptVersion(summary);

    if (promptVersion < CURRENT_PROMPT_VERSION) {
      console.warn(
        `论文 ${args.paperId} 使用旧 Prompt 生成 (v${promptVersion}),` +
        `建议重新总结。运行: research-agent regenerate ${args.paperId}`
      );
    }

    return summary;
  }
}
```

**理由:**
1. 用户可以看到哪些总结是旧版本
2. 提供重新生成的选项 (可选,不强制)
3. 不会因为 Prompt 更新而破坏现有总结

### 影响

**正面影响:**
- ✅ 用户知道哪些总结需要更新
- ✅ 可以渐进式更新,不强制
- ✅ 保持系统稳定性

**负面影响:**
- ❌ 需要管理版本号
- ❌ 用户需要手动触发重新生成

---

## ADR-012: 数据一致性检查

**状态:** ✅ ACCEPTED
**决策日期:** 2026-03-25
**决策者:** Engineering Review

### 背景

用户可能会:
- 手动删除 PDF
- 手动编辑 papers.json (格式错误)
- 网络中断导致部分下载

### 问题

是否需要数据一致性检查?

### 失败场景

```
~/.research-agent/papers/
├── pdfs/
│   ├── arxiv-123.pdf (完整)
│   ├── arxiv-456.pdf (损坏,只有 2KB)
│   └── arxiv-789.pdf (用户已删除)

papers.json 仍然记录 arxiv-456 和 arxiv-789 存在
→ Agent 尝试读取 → 失败
```

### 方案对比

| 方案 | 描述 | Completeness | 优缺点 |
|------|------|--------------|--------|
| A) 添加 `research-agent doctor` 命令 | 扫描 ~/.research-agent/,检测缺失/损坏文件,修复 papers.json | 10/10 | ✅ 类似 npm doctor<br>❌ 需要单独命令 |
| B) 惰性修复 | 读取文件时发现缺失就自动移除 papers.json 中的记录 | 8/10 | ✅ 无需单独命令<br>❌ 可能遗漏 |
| C) 不处理 | 保持简单,用户自己清理 | 4/10 | ✅ 简单<br>❌ 用户体验差 |

### 决策

**选择方案 A: 添加 `research-agent doctor` 命令**

**实现方式:**
```bash
$ research-agent doctor

🔍 检查文献数据完整性...

✓ papers.json 格式正确
✓ 找到 245 篇论文记录
✗ 发现 3 个问题:
  - arxiv-456.pdf 损坏 (2KB,应为 1.2MB)
  - arxiv-789 PDF 缺失,但 papers.json 中存在
  - arxiv-999.md 总结文件存在,但 papers.json 中无记录

🔧 修复建议:
  1. 重新下载 arxiv-456
  2. 从 papers.json 移除 arxiv-789
  3. 将 arxiv-999 添加到 papers.json

执行修复? (Y/n)
```

**理由:**
1. 从 npm/git 学到的好模式
2. 用户可以定期运行,保持数据健康
3. 清晰的问题报告和修复建议

### 影响

**正面影响:**
- ✅ 用户可以修复脏数据
- ✅ 清晰的诊断报告
- ✅ 可选的自动修复

**负面影响:**
- ❌ 需要额外开发
- ❌ 用户需要知道这个命令

---

## ADR-013: SubAgent 质量测试方法

**状态:** ✅ ACCEPTED
**决策日期:** 2026-03-25
**决策者:** Engineering Review

### 背景

SubAgent 生成的总结是核心功能,质量至关重要。

### 问题

SubAgent 总结质量如何测试?

### 方案对比

| 方案 | 描述 | Completeness | 优缺点 |
|------|------|--------------|--------|
| A) 人工评估 + 自动检测 | 随机抽 10% 总结人工评分,同时检测格式完整性 | 10/10 | ✅ 质量保证<br>❌ 需要人工参与 |
| B) 只做格式检测 | 确保总结符合 Markdown 结构 | 6/10 | ✅ 自动化<br>❌ 不验证内容准确性 |
| C) 用户 feedback 驱动 | 允许用户标记"总结质量差",收集问题样本 | 8/10 | ✅ 持续改进<br>❌ 依赖用户反馈 |

### 决策

**选择方案 C: 用户 feedback 驱动**

**实现方式:**
```typescript
// packages/tools/src/read-paper.ts
async reportSummaryQuality(paperId: string, rating: 1-5, comment?: string) {
  await fs.appendFile(
    '~/.research-agent/feedback/summary-quality.jsonl',
    JSON.stringify({
      paperId,
      rating,
      comment,
      timestamp: Date.now(),
      promptVersion: CURRENT_PROMPT_VERSION
    }) + '\n'
  );
}

// CLI 命令
$ research-agent rate arxiv-123 --score 3 --comment "遗漏了实验细节"
```

**理由:**
1. "什么是好总结"很主观,需要真实用户反馈
2. 持续改进,而不是一次性评估
3. 可以针对低分总结优化 Prompt

### 影响

**正面影响:**
- ✅ 持续改进 Prompt
- ✅ 用户参与质量保证
- ✅ 可以针对性优化

**负面影响:**
- ❌ 依赖用户反馈
- ❌ 早期可能缺少数据

---

## ADR-014: 回归测试策略

**状态:** ✅ ACCEPTED
**决策日期:** 2026-03-25
**决策者:** Engineering Review

### 背景

Fork OpenCode 后会修改核心代码,需要确保原有功能不被破坏。

### 问题

如何防止 fork 后的修改破坏 OpenCode 原有功能?

### 方案对比

| 方案 | 描述 | Completeness | 优缺点 |
|------|------|--------------|--------|
| A) 复制 OpenCode 的测试套件 | fork 后第一时间复制所有测试,后续修改后重跑 | 10/10 | ✅ 最可靠<br>❌ 需要维护测试 |
| B) 只测试新功能 | 不关心 OpenCode 原有功能 | 5/10 | ✅ 简单<br>❌ 风险高 |
| C) 定期手动测试 | 每次发布前手动测试 | 6/10 | ✅ 灵活<br>❌ 不可靠 |

### 决策

**选择方案 A: 复制 OpenCode 的测试套件**

**实施步骤:**
```bash
# Phase 1.1: Fork 后第一时间
git clone <opencode-repo-url> research-agent
cd research-agent
npm install
npm test  # 确保所有测试通过 ✓

# 复制测试
cp -r tests/opencode-core tests/regression
git add tests/regression
git commit -m "Add regression tests from OpenCode"

# 后续修改后
npm test  # 包含 regression tests
```

**需要补充的测试 (如果 OpenCode 覆盖不足):**
- ReAct 循环基本流程
- ToolRegistry 注册和调用
- SubAgent 创建和执行
- 对话历史管理

**理由:**
1. 最可靠的回归测试
2. 确保 fork 不破坏原有功能
3. CI 可以自动运行

### 影响

**正面影响:**
- ✅ 防止破坏原有功能
- ✅ 可以安全地重构
- ✅ CI 自动化

**负面影响:**
- ❌ 需要维护测试 (如果 OpenCode 更新)
- ❌ 测试套件可能很大

---

## ADR-015: 批量处理并发策略

**状态:** ✅ ACCEPTED
**决策日期:** 2026-03-25
**决策者:** Engineering Review

### 背景

批量处理 50 篇论文时,需要平衡速度和 API 限制。

### 问题

批量处理论文时的并发策略?

### 方案对比

| 方案 | 描述 | Completeness | 优缺点 |
|------|------|--------------|--------|
| A) 动态调整并发数 | 根据 API rate limit 自动调整 (3-10 并发) | 10/10 | ✅ 最优性能<br>❌ 复杂 |
| B) 固定并发数 | 始终限制为 3 个并发 SubAgent | 8/10 | ✅ 简单<br>❌ 不是最优 |
| C) 串行处理 | 一次只处理 1 篇 | 6/10 | ✅ 最安全<br>❌ 最慢 (50 篇 = 50 分钟) |

### 决策

**选择方案 B: 固定并发数 (3 并发)**

**实现方式:**
```typescript
// packages/tools/src/read-paper.ts
class BatchSummarizer {
  private maxConcurrency = 3;
  private activeCount = 0;
  private queue: Array<() => Promise<void>> = [];

  async addToQueue(paperId: string): Promise<void> {
    if (this.activeCount < this.maxConcurrency) {
      this.activeCount++;
      await this.summarizePaper(paperId);
      this.activeCount--;
      this.processQueue();
    } else {
      return new Promise(resolve => {
        this.queue.push(async () => {
          await this.summarizePaper(paperId);
          resolve();
        });
      });
    }
  }

  private processQueue() {
    if (this.queue.length > 0 && this.activeCount < this.maxConcurrency) {
      const next = this.queue.shift();
      next();
    }
  }
}
```

**性能估算:**
- 单篇论文: 1-2 分钟
- 50 篇论文 (3 并发): ~20-30 分钟
- vs 串行: ~50-100 分钟

**理由:**
1. 安全,不会触发 API 限流
2. 实现简单
3. 性能可接受 (30 分钟 vs 2 小时)

### 影响

**正面影响:**
- ✅ 平衡速度和稳定性
- ✅ 实现简单
- ✅ 不会触发限流

**负面影响:**
- ❌ 不是最优性能
- ❌ 固定数字可能不适合所有 API

**未来优化:**
- 在 config.json 中允许用户设置 `maxConcurrency`

---

## ADR-016: Papers Index 扩展性方案

**状态:** ✅ ACCEPTED
**决策日期:** 2026-03-25
**决策者:** Engineering Review + User

### 背景

当用户有 1000+ 篇论文时,Papers Index 会超过预算的 20K tokens。

### 问题

当文献库超过 200 篇时,Papers Index 如何处理?

### 决策

**完整 RAG 系统 (tags + embedding)**

**架构:**
```
SubAgent 生成总结时同时生成:
  - 结构化总结 (summaries/paper-id.md)
  - 标签数组 (tags: ["transformer", "attention", "nlp"])
  - Embedding (OpenAI text-embedding-3-small, 1536 维)

存储: DuckDB + vss extension

使用:
  用户: "帮我找关于 transformer efficiency 的论文"
  → LLM 提取关键词 ["transformer", "efficiency"]
  → 向量检索 top 50 篇相关论文 (余弦相似度)
  → 只加载这 50 篇到 Papers Index
  → 主 Agent 从 50 篇中选择最相关的加载到 Active Papers
```

**性能特征:**
- 1000 篇论文向量搜索: ~5ms
- 10,000 篇论文向量搜索: ~50ms
- Papers Index: 50 篇 * 93 tokens = 4,650 tokens (远低于 20K 预算)

**成本:**
- Embedding: $0.00002 per 1K tokens
- 每篇论文摘要 ~200 tokens → $0.000004
- 1000 篇论文 = $0.004 (几乎免费)

**理由:**
1. 可扩展到 100,000+ 篇论文
2. 检索精准 (语义搜索)
3. 成本极低
4. 符合"完整实现"原则

### 影响

**正面影响:**
- ✅ 支持大规模文献库
- ✅ 语义搜索准确
- ✅ 成本极低

**负面影响:**
- ❌ 增加 Phase 2.6 (1-2 周)
- ❌ 需要额外的 embedding API 调用

**实施计划调整:**
- 新增 Phase 2.6: RAG 文献检索系统 (1-2 周)
- 总工作量: 12-16 周 → 13-18 周

---

## ADR-017: 向量数据库选型

**状态:** ✅ ACCEPTED
**决策日期:** 2026-03-25
**决策者:** User

### 背景

实现 RAG 系统需要存储和检索 embeddings。

### 问题

使用哪种向量数据库?

### 方案对比

| 方案 | 描述 | 扩展性 | 部署复杂度 | Completeness |
|------|------|--------|-----------|--------------|
| A) 纯内存向量搜索 | JavaScript 计算余弦相似度 | 支持 5000 篇 | 零依赖 | 9/10 |
| B) DuckDB + vss | 嵌入式数据库,HNSW 索引 | 支持 100 万篇 | 单依赖 | 10/10 |
| C) pgvector (PostgreSQL) | 专业向量数据库 | 支持 1000 万篇 | 需要 PostgreSQL | 10/10 (过度设计) |

### 决策

**选择方案 B: DuckDB + vss extension**

**实现方式:**
```typescript
// packages/memory/src/vector-store.ts
import Database from 'duckdb';

class VectorStore {
  private db: Database.Database;

  async init(): Promise<void> {
    this.db = new Database.Database(':memory:');

    // 安装 vss extension
    await this.db.exec("INSTALL vss; LOAD vss;");

    // 创建向量表
    await this.db.exec(`
      CREATE TABLE papers (
        id VARCHAR PRIMARY KEY,
        title VARCHAR,
        abstract VARCHAR,
        tags VARCHAR[],
        embedding FLOAT[1536],
        access_count INTEGER,
        last_accessed TIMESTAMP
      );

      -- 创建 HNSW 索引
      CREATE INDEX papers_embedding_idx
      ON papers USING HNSW (embedding);
    `);
  }

  async searchSimilar(query: string, topK: number = 50) {
    const embedding = await this.getEmbedding(query);

    return await this.db.all(`
      SELECT id, title, abstract, tags,
             array_cosine_similarity(embedding, ?::FLOAT[1536]) as similarity
      FROM papers
      ORDER BY similarity DESC
      LIMIT ?
    `, [embedding, topK]);
  }
}
```

**理由:**
1. 嵌入式数据库,零外部依赖
2. HNSW 索引,性能优于纯内存搜索
3. 支持 SQL 查询 (可扩展性)
4. 支持 100 万级向量

### 影响

**正面影响:**
- ✅ 长期可扩展性
- ✅ 保持嵌入式简单性
- ✅ 支持高级查询 (SQL + 向量搜索)

**负面影响:**
- ❌ 增加一个 npm 依赖 (duckdb)
- ❌ 数据库文件需要管理 (可用 :memory: 避免)

---

## 总结

本文档记录了 Research Agent 项目工程评审阶段的 17 个关键架构决策。所有决策都遵循"Boil the Lake"原则,选择了完整实现方案 (Lake Score: 100%)。

**重大架构变更:**
1. 使用 OpenAI 兼容 API (替代 Anthropic)
2. 完整 RAG 系统 (tags + embedding + DuckDB)
3. 4 层 PDF 处理 fallback
4. 统一 Result<T, Error> 错误处理模式

**实施计划调整:**
- 新增 Phase 2.6: RAG 系统 (1-2 周)
- 总工作量: 12-16 周 → **13-18 周** (3-4 个月)

**下一步:** 开始 Phase 0 项目初始化。

---

**文档维护:**
- 每次重大架构变更时,添加新的 ADR
- 定期评审旧 ADR,标记已废弃的决策
- 保持决策的可追溯性

**版本历史:**
- v1.0 (2026-03-25): 初始版本,工程评审阶段决策
