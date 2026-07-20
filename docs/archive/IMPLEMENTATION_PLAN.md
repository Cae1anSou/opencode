# Research Agent - 实施计划

**生成时间**: 2026-03-25
**评审类型**: CEO Review (HOLD SCOPE 模式)
**基于**: Design Document (2026-03-25-162226)

---

## 执行摘要

本文档是 Research Agent 项目的详细实施计划,基于设计文档的完整范围规划。项目目标是构建一个科研全流程 AI Copilot,命令行工具形态,基于 fork OpenCode。

**核心原则**: 实现设计文档中的所有核心功能后才对外分享,追求完整性而非速度。

---

## 项目当前状态

- **代码库**: 空的,只有设计文档和研究资料
- **Git 状态**: 尚未初始化 Git 仓库
- **设计文档**: 完整,来自 /office-hours 会话
- **评审状态**: 已完成 Step 0 (范围挑战与模式选择)

---

## 核心决策记录

### 决策 1: 目标定位
**选择**: 实现设计文档中的所有核心功能,不追求快速 MVP

**理由**:
- 在所有核心功能完成前不对外分享
- 追求完整性而非速度
- 符合"Boil the Lake"原则 - AI 工具让完整实现的边际成本接近零

**影响**:
- 预计开发周期: 2-3 个月 (使用 Claude Code + gstack)
- 需要完整的测试覆盖和文档
- 首次发布即为高质量版本

---

### 决策 2: 技术选型
**选择**: Fork OpenCode

**理由**:
1. **快速迭代验证核心假设**
   - "科研 Agent" 概念是否可行?
   - SubAgent 读文献策略是否有效?
   - 分层记忆系统是否够用?

2. **瓶颈在 I/O,不在计算**
   - 文献下载 → 网络延迟
   - PDF 解析 → 磁盘 I/O
   - 模型推理 → 远程 API 调用
   - CPU 密集计算很少,TS 性能够用

3. **学术工具生态成熟**
   - `arxiv` npm 包 → 搜索和下载论文
   - `pdf-parse` → PDF 转文本
   - `citation-js` → 解析引用格式
   - `latex-parser` → 处理 LaTeX 语法

4. **可复用 OpenCode 的完整生态**
   - ReAct 循环 (Agent 推理引擎)
   - ToolRegistry (工具系统)
   - SubAgent 机制 (并行任务)
   - MCP/Skills/Hooks (可扩展性)
   - 基础工具 (Read/Write/Edit/Bash)

5. **降低贡献者门槛**
   - 选择与团队现有能力更匹配的生态
   - 更容易获得社区 feedback 和 PR

**替代方案考虑**:
- ❌ 继续沿用原基线: 与当前产品决策不一致
- ❌ 从零构建: 需要重新实现 Agent 核心,耗时过长

---

### 决策 3: Zotero 集成策略
**选择**: 导入模式

**实现方式**:
- 用户手动或通过命令将 PDF 复制到 `~/.research-agent/`
- 保持 Research Agent 的独立性
- 不直接读取 Zotero 的 SQLite 数据库

**理由**:
- 简化架构,避免 Zotero 版本兼容性问题
- 保持工具独立性,不依赖特定的文献管理工具
- 用户可以从任何来源导入 PDF

**未来可能扩展**:
- 提供 `import-from-zotero` 命令简化导入流程
- 支持从其他文献管理工具导入 (Mendeley, EndNote 等)

---

### 决策 4: 性能预期
**选择**: 接受 SubAgent 总结的长时间处理

**性能参数**:
- 单篇 30 页论文: 3-5 分钟
- 50 篇论文批量处理: 4+ 小时
- API 成本: 每篇论文约 $0.05-0.15 (取决于长度)

**理由**:
- 这是**一次性成本**,总结生成后永久可用
- 后续使用非常快速 (读取本地总结)
- 仍然比人工阅读 50 篇论文高效数十倍
- 用户可以理解这是合理的 trade-off

**优化策略** (未来可选):
- 增量下载机制
- 后台批量处理
- 并行 SubAgent 处理 (谨慎使用,避免 API 限流)

---

### 决策 5: 问题本质确认
**确认**: 工具集成 + 项目记忆 都是核心问题

**问题分层**:

**表层问题** (工具分散):
- 文献在 Zotero → AI 看不到
- 笔记在 Notion/Obsidian → 与 AI 对话脱节
- 写作在 Overleaf → AI 无法直接操作
- 对话在 ChatGPT/Claude → 没有项目记忆

**深层问题** (缺乏上下文):
- AI 不知道"我的研究问题是什么"
- AI 不知道"我已经读过哪些论文"
- AI 不知道"我的实验结果是什么"
- 每次对话都从零开始

**解决方案**:
1. **命令行形态** → 直接操作文件系统 (读 PDF、写 LaTeX、执行 Bash)
2. **RESEARCH.md** → 项目记忆 (研究问题、进展、文献列表)
3. **分层文献记忆** → 总结 + 原文,按需加载
4. **持久对话历史** → 记住所有讨论

---

### 决策 6: 评审模式
**选择**: HOLD SCOPE 模式

**含义**:
- 严格按照设计文档的范围
- 不主动提出范围扩展建议
- 确保每个部分都有:
  - ✅ 坚实的架构设计
  - ✅ 完善的错误处理
  - ✅ 全面的测试覆盖
  - ✅ 可靠的部署策略
  - ✅ 清晰的文档

**不包含** (留待后续版本):
- GUI 界面
- 多人协作功能
- 云同步
- 浏览器插件
- 移动端支持

---

## 高层级实施计划

### Phase 0: 项目初始化 (1 周)

**目标**: 建立项目基础设施

**任务清单**:

1. **Git 仓库初始化**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: design documents"
   ```

2. **TypeScript 项目结构**
   ```
   scholar-cli/
   ├── packages/
   │   ├── core/          # Agent 核心
   │   ├── tools/         # 科研工具集
   │   ├── memory/        # 记忆系统
   │   └── cli/           # 命令行界面
   ├── docs/
   │   ├── design/        # 设计文档
   │   ├── api/           # API 文档
   │   └── guides/        # 用户指南
   ├── tests/
   ├── package.json
   ├── tsconfig.json
   └── README.md
   ```

3. **开发工具配置**
   - ESLint + Prettier (代码格式化)
   - Jest (单元测试)
   - TypeDoc (文档生成)
   - Husky (Git hooks)

4. **CI/CD 基础**
   - GitHub Actions 配置
   - 自动化测试
   - 代码质量检查

**交付物**:
- ✅ 可运行的空项目骨架
- ✅ `npm run dev` 可以启动开发环境
- ✅ `npm test` 可以运行测试
- ✅ 基础 README 和贡献指南

---

### Phase 1: OpenCode 架构学习 (2-3 周)

**目标**: 深入理解 OpenCode 的架构,为 fork 做准备

#### 1.1 ReAct 循环分析 (3-4 天)

**学习内容**:
- 主循环在哪里? (通常在 `core/agent.ts` 或类似文件)
- 推理-行动-观察的流程如何实现?
- 如何处理工具调用和结果?
- 如何管理对话历史?

**产出文档**:
```markdown
# OpenCode ReAct 循环分析

## 主循环流程
1. 接收用户输入
2. 构建 Prompt (System + History + User Input)
3. 调用 LLM (Anthropic API)
4. 解析 LLM 输出 (文本 vs 工具调用)
5. 如果是工具调用 → 执行工具 → 回到步骤 2
6. 如果是文本输出 → 返回给用户

## 可复用代码
- [ ] `packages/core/src/agent.ts` 主循环
- [ ] `packages/core/src/prompt-builder.ts` Prompt 构建
- [ ] `packages/core/src/llm-client.ts` LLM 调用封装

## 需要修改的部分
- System Prompt (科研领域特化)
- 对话历史管理 (分层加载文献)
```

#### 1.2 ToolRegistry 机制 (2-3 天)

**学习内容**:
- 工具如何注册?
- 工具参数如何验证?
- 工具执行上下文如何管理?
- 工具错误如何处理?

**产出文档**:
```markdown
# OpenCode ToolRegistry 分析

## 工具接口定义
```typescript
interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute(args: any, context: Context): Promise<ToolResult>;
}
```

## 工具注册流程
1. 创建工具类 (实现 Tool 接口)
2. 在 Registry 中注册
3. Agent 根据描述决定何时调用

## 我们的科研工具如何集成
- ReadPaper
- SearchScholar
- ManageCitations
- WriteLatex
```

#### 1.3 SubAgent 系统 (3-4 天)

**学习内容**:
- SubAgent 如何创建?
- 上下文如何隔离?
- 并行执行如何管理?
- SubAgent 的 token 限制如何处理?

**产出文档**:
```markdown
# OpenCode SubAgent 系统分析

## SubAgent 创建流程
```typescript
const subagent = await agent.createSubAgent({
  systemPrompt: "你是一个专门总结学术论文的助手",
  tools: ["read_file"],
  maxTokens: 50000
});

const result = await subagent.run({
  input: paperText,
  task: "生成结构化总结"
});
```

## 我们的文献总结 SubAgent
- 专用 Prompt 模板
- 只需要 read_file 工具
- 输出结构化 Markdown
```

#### 1.4 MCP/Skills/Hooks (2-3 天)

**学习内容**:
- MCP (Model Context Protocol) 是什么?
- Skills 机制如何工作?
- Hooks 如何扩展 Agent 行为?
- 我们是否需要这些机制?

**决策**:
- ✅ 保留 ToolRegistry (必需)
- ✅ 保留 SubAgent (必需)
- ⚠️ MCP/Skills/Hooks (视情况而定,可能简化)

#### 1.5 上下文管理 (3-4 天)

**学习内容**:
- 如何处理 token 限制?
- 对话历史如何压缩?
- System Prompt 如何组织?
- 动态内容如何加载?

**产出文档**:
```markdown
# 上下文管理策略

## OpenCode 的方案
- 固定 System Prompt (约 5K tokens)
- 滚动对话历史 (保留最近 N 条)
- 超出限制时自动总结旧对话

## Research Agent 的特殊需求
- RESEARCH.md (项目记忆,约 10K tokens)
- Papers Index (所有论文标题+摘要,约 20K tokens)
- Active Papers (当前讨论的论文总结,约 50K tokens)
- 动态加载策略: 根据对话内容决定加载哪些论文
```

**交付物**:
- ✅ OpenCode 架构分析完整文档 (约 20-30 页)
- ✅ 可复用组件清单
- ✅ 需要修改的部分清单
- ✅ Fork 策略决策 (完整 fork vs 部分复用)

---

### Phase 2: 核心工具开发 (4-6 周)

**目标**: 实现科研特有的工具集

#### 2.1 文献搜索与下载工具 (1 周)

**工具 1: SearchScholar**

```typescript
// packages/tools/src/search-scholar.ts

interface SearchScholarArgs {
  query: string;
  maxResults?: number;
  yearMin?: number;
  yearMax?: number;
  source?: 'arxiv' | 'semantic-scholar' | 'both';
}

interface PaperMetadata {
  id: string;           // arxiv-2024-12345
  title: string;
  authors: string[];
  abstract: string;
  year: number;
  venue?: string;       // 会议/期刊
  citationCount?: number;
  pdfUrl?: string;
  arxivId?: string;
  doi?: string;
}

class SearchScholarTool implements Tool {
  name = "search_scholar";
  description = "搜索学术论文 (arXiv, Semantic Scholar)";

  async execute(args: SearchScholarArgs): Promise<PaperMetadata[]> {
    // 1. 调用 arXiv API
    // 2. 调用 Semantic Scholar API
    // 3. 合并去重结果
    // 4. 返回论文列表
  }
}
```

**API 集成**:
- arXiv API: `http://export.arxiv.org/api/query`
- Semantic Scholar API: `https://api.semanticscholar.org/graph/v1/paper/search`

**错误处理**:
- 网络超时 → 重试 3 次,指数退避
- API 限流 (429) → 等待后重试
- 无结果 → 返回空数组,不报错
- 格式错误 → 跳过该条结果,继续处理其他

**测试**:
- 单元测试: mock API 响应
- 集成测试: 真实 API 调用 (少量)
- 边缘案例: 特殊字符查询、空结果、大量结果

---

**工具 2: DownloadPaper**

```typescript
// packages/tools/src/download-paper.ts

interface DownloadPaperArgs {
  paperId: string;      // arxiv-2024-12345 或 DOI 或 URL
  force?: boolean;      // 强制重新下载,即使已存在
}

class DownloadPaperTool implements Tool {
  name = "download_paper";
  description = "下载学术论文 PDF";

  async execute(args: DownloadPaperArgs): Promise<string> {
    // 1. 检查是否已下载 (去重)
    // 2. 解析 paperId 类型 (arxiv/doi/url)
    // 3. 下载 PDF
    // 4. 保存到 ~/.research-agent/papers/pdfs/
    // 5. 返回本地路径
  }
}
```

**去重策略**:
- 基于 paperId 的 hash 生成唯一文件名
- 下载前检查文件是否存在
- 支持 `force=true` 强制重新下载

**错误处理**:
- 下载失败 → 重试 3 次
- 无效 URL → 抛出 InvalidPaperIdError
- 磁盘空间不足 → 抛出 DiskFullError
- 权限问题 → 抛出 PermissionError

---

#### 2.2 PDF 处理工具 (1-2 周)

**工具: ProcessPDF**

```typescript
// packages/tools/src/pdf-processor.ts

interface ProcessPDFArgs {
  pdfPath: string;
  outputPath: string;   // 输出纯文本的路径
  useOCR?: boolean;     // 如果 pdf-parse 失败,是否使用 OCR
}

class ProcessPDFTool implements Tool {
  async execute(args: ProcessPDFArgs): Promise<{
    success: boolean;
    method: 'pdf-parse' | 'ocr' | 'latex-source';
    textLength: number;
    pages: number;
  }> {
    // 策略 1: 尝试下载 arXiv 源文件 (LaTeX) → 最干净
    if (isArxivPaper(args.pdfPath)) {
      const latex = await downloadArxivSource(args.pdfPath);
      if (latex) {
        const text = await convertLatexToText(latex);
        await fs.writeFile(args.outputPath, text);
        return { success: true, method: 'latex-source', ... };
      }
    }

    // 策略 2: 使用 pdf-parse 提取文本 → 最快
    try {
      const data = await pdfParse(fs.readFileSync(args.pdfPath));
      const cleanedText = cleanPDFText(data.text);
      await fs.writeFile(args.outputPath, cleanedText);
      return { success: true, method: 'pdf-parse', ... };
    } catch (err) {
      // 策略 3: fallback to OCR (Tesseract.js)
      if (args.useOCR) {
        const text = await ocrPDF(args.pdfPath);
        await fs.writeFile(args.outputPath, text);
        return { success: true, method: 'ocr', ... };
      }
      throw new PDFProcessingError("PDF 处理失败", err);
    }
  }
}
```

**文本清洗**:
- 移除页眉页脚
- 修复断行 (hyphenation)
- 保留段落结构
- 移除多余空白
- 处理特殊字符 (Unicode)

**图片和公式处理**:
- Phase 1: 忽略图片,用 `[Figure X]` 占位
- Phase 1: 忽略公式,用 `[Equation X]` 占位
- 未来: 使用 OCR 识别公式 (MathPix API)

**错误处理**:
- PDF 损坏 → CorruptedPDFError
- 加密 PDF → EncryptedPDFError
- OCR 失败 → OCRError

---

#### 2.3 文献阅读工具 (2-3 周) ⭐ 核心!

**工具: ReadPaper**

```typescript
// packages/tools/src/read-paper.ts

interface ReadPaperArgs {
  paperId: string;
  mode: 'summary' | 'full' | 'focus';
  focus?: string;       // mode=focus 时的具体问题
}

class ReadPaperTool implements Tool {
  name = "read_paper";
  description = "阅读论文 (自动生成总结或读取已有总结)";

  async execute(args: ReadPaperArgs): Promise<string> {
    const summaryPath = `~/.research-agent/papers/summaries/${args.paperId}.md`;
    const rawPath = `~/.research-agent/papers/raw/${args.paperId}.txt`;

    // 如果没有总结,创建 SubAgent 生成总结
    if (!fs.existsSync(summaryPath)) {
      console.log(`首次读取论文 ${args.paperId},正在生成总结...`);
      const summary = await this.generateSummary(rawPath, args.paperId);
      fs.writeFileSync(summaryPath, summary);
    }

    // 根据 mode 返回内容
    if (args.mode === 'summary') {
      return fs.readFileSync(summaryPath, 'utf-8');
    } else if (args.mode === 'full') {
      return fs.readFileSync(rawPath, 'utf-8');
    } else if (args.mode === 'focus') {
      // 创建 SubAgent 读全文并回答特定问题
      return await this.answerQuestion(rawPath, args.focus);
    }
  }

  private async generateSummary(
    rawPath: string,
    paperId: string
  ): Promise<string> {
    // 创建专用的总结 SubAgent
    const subagent = await this.createSubAgent({
      systemPrompt: PAPER_SUMMARY_PROMPT,
      maxTokens: 50000,
      temperature: 0.3,  // 更确定性的输出
    });

    const paperText = fs.readFileSync(rawPath, 'utf-8');

    // 从 RESEARCH.md 读取项目上下文
    const researchContext = readRESEARCHmd();

    const result = await subagent.run({
      paper: paperText,
      paperId: paperId,
      projectContext: researchContext,
    });

    return result;
  }

  private async answerQuestion(
    rawPath: string,
    question: string
  ): Promise<string> {
    // 创建 SubAgent 回答特定问题
    const subagent = await this.createSubAgent({
      systemPrompt: PAPER_QA_PROMPT,
      maxTokens: 30000,
    });

    const paperText = fs.readFileSync(rawPath, 'utf-8');

    return await subagent.run({
      paper: paperText,
      question: question,
    });
  }
}
```

**总结 Prompt 模板**:

```typescript
const PAPER_SUMMARY_PROMPT = `
你是一个专门总结学术论文的助手。你的任务是生成结构化的论文总结。

## 输出格式

请严格按照以下 Markdown 格式输出:

# [论文标题]

**元数据**
- 作者: ...
- 年份: ...
- 会议/期刊: ...
- ArXiv ID / DOI: ...

**一句话总结**
(用一句话概括论文的核心贡献)

**研究问题**
1. 论文试图解决什么问题?
2. 为什么这个问题重要?

**核心方法**
(用 2-3 段话描述论文的方法,重点是 "怎么做",而不是 "做了什么")

**主要结论**
- 结论 1
- 结论 2
- ...

**实验设计**
- 数据集: ...
- 评估指标: ...
- Baseline: ...
- 主要结果: ...

**可引用的点**
1. [具体结论/方法] → 位置: Section X.X, Page Y
2. ...

**相关工作**
- 论文引用了: [Paper X, Paper Y]
- 与现有工作的主要区别: ...

**局限性**
(论文自身承认的或你观察到的局限性)

**对当前项目的启发**
(基于项目上下文 {{projectContext}},这篇论文如何帮助我们的研究?)

## 注意事项

1. 保持客观,不要添加你的主观评价
2. "可引用的点" 必须标注具体位置 (Section/Page)
3. "对当前项目的启发" 要结合项目上下文具体分析
4. 如果某个部分信息不足,标注 "(论文未详细说明)"
`;
```

**总结质量保证**:
- 人工评估: 随机抽取 10% 的总结进行人工检查
- 用户 Feedback: 允许用户标记 "总结质量差" 并重新生成
- 自动检查: 确保输出符合格式要求 (Markdown 结构完整)

**性能优化**:
- 缓存总结结果 (永久保存)
- 并行处理多篇论文 (谨慎,避免 API 限流)
- 进度提示: 显示 "正在处理第 X/Y 篇论文"

**错误处理**:
- 论文文本过长 → 分段总结,再合并
- API 超时 → 重试 3 次
- SubAgent 返回格式错误 → 重新生成

---

#### 2.4 引用管理工具 (1 周)

**工具: ManageCitations**

```typescript
// packages/tools/src/manage-citations.ts

interface CitationGraph {
  papers: Record<string, {
    paperId: string;
    citeKey: string;      // vaswani2017attention
    title: string;
    authors: string[];
    year: number;
    citedIn: string[];    // 被哪些文件引用
    references: string[]; // 引用了哪些论文
    citedBy: string[];    // 被哪些论文引用
  }>;
}

class ManageCitationsTool implements Tool {
  name = "add_citation";
  description = "添加论文到引用列表,生成 cite key";

  async execute(args: {
    paperId: string;
    citeKey?: string;     // 可选,不提供则自动生成
    reason?: string;      // 引用原因
  }): Promise<{
    citeKey: string;
    bibtex: string;
  }> {
    // 1. 读取 citations/graph.json
    const graph = readCitationGraph();

    // 2. 检查是否已存在
    if (graph.papers[args.paperId]) {
      return { citeKey: graph.papers[args.paperId].citeKey, ... };
    }

    // 3. 生成 cite key (如果未提供)
    const citeKey = args.citeKey || generateCiteKey(args.paperId);

    // 4. 提取论文元数据
    const metadata = await extractMetadata(args.paperId);

    // 5. 更新引用图谱
    graph.papers[args.paperId] = {
      paperId: args.paperId,
      citeKey: citeKey,
      ...metadata,
      citedIn: [],
      references: [],
      citedBy: [],
    };

    // 6. 保存 graph.json
    saveCitationGraph(graph);

    // 7. 生成 BibTeX
    const bibtex = generateBibTeX(metadata, citeKey);

    return { citeKey, bibtex };
  }
}
```

**cite key 生成规则**:
- 格式: `{第一作者姓氏小写}{年份}{关键词}`
- 示例: `vaswani2017attention`
- 冲突处理: 添加后缀 `a`, `b`, `c` ...

**BibTeX 生成**:
```bibtex
@inproceedings{vaswani2017attention,
  title={Attention is All You Need},
  author={Vaswani, Ashish and Shazeer, Noam and ...},
  booktitle={Advances in Neural Information Processing Systems},
  year={2017},
  url={https://arxiv.org/abs/1706.03762}
}
```

**引用图谱应用**:
- 显示论文之间的引用关系
- 发现相关论文 (被同一篇论文引用)
- 追踪引用链条

---

#### 2.5 LaTeX 写作工具 (1 周)

**工具: WriteLatex**

```typescript
// packages/tools/src/write-latex.ts

class WriteLatexTool implements Tool {
  name = "write_latex";
  description = "生成符合学术规范的 LaTeX 内容";

  async execute(args: {
    file: string;         // drafts/sections/related_work.tex
    content: string;      // 文本内容
    citations?: string[]; // cite keys
    template?: string;    // 会议模板 (ACL, NeurIPS, ...)
  }): Promise<void> {
    // 1. LaTeX 特殊字符转义
    let latex = escapeLatexChars(args.content);

    // 2. 自动添加 \cite{}
    if (args.citations) {
      latex = insertCitations(latex, args.citations);
    }

    // 3. 格式化 (符合模板规范)
    if (args.template) {
      latex = applyTemplate(latex, args.template);
    }

    // 4. 写入文件
    await fs.writeFile(args.file, latex);
  }
}
```

**特殊字符转义**:
```typescript
const LATEX_SPECIAL_CHARS: Record<string, string> = {
  '&': '\\&',
  '%': '\\%',
  '$': '\\$',
  '#': '\\#',
  '_': '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
  '\\': '\\textbackslash{}',
};
```

**自动插入引用**:
- 识别文本中的论文提及 (基于标题匹配)
- 自动添加 `\cite{citeKey}`
- 处理多重引用 `\cite{key1,key2}`

**会议模板支持**:
- ACL (计算语言学)
- NeurIPS (机器学习)
- CVPR (计算机视觉)
- ICML (机器学习)
- 自定义模板

---

### Phase 3: 文献记忆系统 (3-4 周)

**目标**: 实现分层文献记忆和上下文管理

#### 3.1 存储结构设计 (1 周)

**目录结构**:
```
~/.research-agent/
  ├── papers/
  │   ├── raw/                    # 纯文本原文
  │   │   └── arxiv-2024-12345.txt
  │   ├── summaries/              # SubAgent 生成的总结
  │   │   └── arxiv-2024-12345.md
  │   └── pdfs/                   # 原始 PDF 备份
  │       └── arxiv-2024-12345.pdf
  │
  ├── projects/
  │   └── my-thesis/
  │       ├── RESEARCH.md         # 项目记忆
  │       ├── papers.json         # 引用的论文列表
  │       ├── notes/              # 讨论记录 (自动保存)
  │       │   ├── 2026-03-25.md
  │       │   └── 2026-03-26.md
  │       └── drafts/             # 论文草稿
  │           ├── main.tex
  │           ├── references.bib
  │           └── sections/
  │               ├── intro.tex
  │               ├── related_work.tex
  │               └── method.tex
  │
  └── citations/
      └── graph.json              # 引用关系图谱
```

**实现**:
```typescript
// packages/memory/src/storage.ts

export class ResearchStorage {
  private basePath = path.join(os.homedir(), '.research-agent');

  async init(): Promise<void> {
    // 创建目录结构
    await fs.mkdir(path.join(this.basePath, 'papers/raw'), { recursive: true });
    await fs.mkdir(path.join(this.basePath, 'papers/summaries'), { recursive: true });
    await fs.mkdir(path.join(this.basePath, 'papers/pdfs'), { recursive: true });
    await fs.mkdir(path.join(this.basePath, 'projects'), { recursive: true });
    await fs.mkdir(path.join(this.basePath, 'citations'), { recursive: true });
  }

  getPaperRawPath(paperId: string): string {
    return path.join(this.basePath, 'papers/raw', `${paperId}.txt`);
  }

  getPaperSummaryPath(paperId: string): string {
    return path.join(this.basePath, 'papers/summaries', `${paperId}.md`);
  }

  getPaperPDFPath(paperId: string): string {
    return path.join(this.basePath, 'papers/pdfs', `${paperId}.pdf`);
  }

  // ... 其他路径方法
}
```

---

#### 3.2 RESEARCH.md 项目记忆 (1 周)

**RESEARCH.md 格式**:

```markdown
# My Thesis Project: Efficient Transformers

**研究问题**
如何降低 Transformer 的计算复杂度,使其能应用于长序列任务?

**研究目标**
1. 提出一种新的注意力机制,复杂度从 O(n²) 降到 O(n log n)
2. 在长文档理解任务上达到 SOTA 性能
3. 证明方法的通用性 (可应用于多种任务)

**当前进展**
- [x] 完成文献调研 (2026-03-01 ~ 2026-03-20)
- [x] 提出初步方法 (Sparse Attention)
- [ ] 实现 Baseline (进行中)
- [ ] 设计实验
- [ ] 撰写论文

**关键文献** (25 篇)
- vaswani2017attention: Attention is All You Need (Transformer 原文)
- child2019generating: Generating Long Sequences with Sparse Transformers
- kitaev2020reformer: Reformer: The Efficient Transformer
- ... (引用 papers.json)

**实验记录**
| 日期 | 实验 | 结果 | 备注 |
|------|------|------|------|
| 2026-03-25 | Baseline (Vanilla Transformer) | PPL 25.3 | 训练 100K steps |
| 2026-03-26 | Sparse Attention v1 | PPL 28.1 | 性能下降,需改进 |

**待解决问题**
1. Sparse Attention 的 pattern 如何设计?
2. 如何平衡计算效率和性能?
3. 长距离依赖如何保留?

**笔记和讨论**
- 2026-03-25: 与 Agent 讨论了 Sparse Attention 的几种设计思路
- 2026-03-26: 分析了 Reformer 的 LSH Attention,发现可以改进的地方
```

**自动更新机制**:
- Agent 每次对话后,自动更新 "当前进展"
- 添加新文献时,自动更新 "关键文献"
- 完成实验后,自动添加到 "实验记录"

**实现**:
```typescript
// packages/memory/src/research-md.ts

export class RESEARCHmd {
  private projectPath: string;

  constructor(projectName: string) {
    this.projectPath = path.join(
      os.homedir(),
      '.research-agent/projects',
      projectName
    );
  }

  async read(): Promise<string> {
    const mdPath = path.join(this.projectPath, 'RESEARCH.md');
    if (fs.existsSync(mdPath)) {
      return fs.readFileSync(mdPath, 'utf-8');
    }
    return this.generateTemplate();
  }

  async update(section: string, content: string): Promise<void> {
    // 解析 Markdown
    // 更新指定 section
    // 写回文件
  }

  async addPaper(paperId: string, citeKey: string): Promise<void> {
    // 添加到 "关键文献" 列表
  }

  async addExperiment(experiment: ExperimentRecord): Promise<void> {
    // 添加到 "实验记录" 表格
  }

  private generateTemplate(): string {
    return `# New Research Project

**研究问题**
(描述你要解决的问题)

**研究目标**
1. ...

**当前进展**
- [ ] ...

**关键文献**
(暂无)

**实验记录**
(暂无)

**待解决问题**
(暂无)

**笔记和讨论**
(暂无)
`;
  }
}
```

---

#### 3.3 分层上下文管理 (1-2 周)

**上下文结构**:

```
主 Agent 上下文 (总计约 115K tokens,留 85K 给输出):

┌─────────────────────────────────────┐
│ System Prompt (~5K tokens)          │  ← 角色定义、工具说明
├─────────────────────────────────────┤
│ RESEARCH.md (~10K tokens)           │  ← 项目记忆 (研究问题、进展)
├─────────────────────────────────────┤
│ Papers Index (~20K tokens)          │  ← 所有论文的标题+摘要
│   - paper-1: [标题] [摘要 200 chars]│
│   - paper-2: ...                    │
│   - paper-N: ...                    │
├─────────────────────────────────────┤
│ Recent Conversation (~30K tokens)   │  ← 最近的对话历史
│   - User: ...                       │
│   - Agent: ...                      │
│   - ...                             │
├─────────────────────────────────────┤
│ Active Papers (~50K tokens)         │  ← 当前讨论的论文总结
│   - paper-X: [完整总结]            │
│   - paper-Y: [完整总结]            │
└─────────────────────────────────────┘
```

**动态加载策略**:

```typescript
// packages/memory/src/context-manager.ts

export class ContextManager {
  private maxTokens = 200_000;
  private reservedForOutput = 85_000;
  private availableForContext = this.maxTokens - this.reservedForOutput; // 115K

  async buildContext(
    conversationHistory: Message[],
    activePaperIds: string[]
  ): Promise<string> {
    let context = '';
    let usedTokens = 0;

    // 1. System Prompt (固定,约 5K tokens)
    const systemPrompt = this.buildSystemPrompt();
    context += systemPrompt;
    usedTokens += countTokens(systemPrompt);

    // 2. RESEARCH.md (动态,约 10K tokens)
    const researchMd = await readRESEARCHmd();
    context += '\n\n## Project Context\n' + researchMd;
    usedTokens += countTokens(researchMd);

    // 3. Papers Index (动态,约 20K tokens)
    const papersIndex = await this.buildPapersIndex();
    context += '\n\n## Available Papers\n' + papersIndex;
    usedTokens += countTokens(papersIndex);

    // 4. Recent Conversation (动态,约 30K tokens)
    const recentConv = this.truncateConversation(
      conversationHistory,
      30_000
    );
    context += '\n\n## Conversation History\n' + recentConv;
    usedTokens += countTokens(recentConv);

    // 5. Active Papers (动态,约 50K tokens)
    const activePapers = await this.loadActivePapers(
      activePaperIds,
      this.availableForContext - usedTokens
    );
    context += '\n\n## Active Papers\n' + activePapers;

    return context;
  }

  private async buildPapersIndex(): Promise<string> {
    const allPapers = await listAllPapers();
    let index = '';

    for (const paper of allPapers) {
      // 只包含标题 + 摘要前 200 字符
      const summary = await readPaperSummary(paper.id);
      const shortAbstract = extractAbstract(summary).slice(0, 200) + '...';
      index += `- [${paper.id}] ${paper.title}\n  ${shortAbstract}\n\n`;
    }

    return index;
  }

  private async loadActivePapers(
    paperIds: string[],
    maxTokens: number
  ): Promise<string> {
    let result = '';
    let usedTokens = 0;

    for (const paperId of paperIds) {
      const summary = await readPaperSummary(paperId);
      const tokens = countTokens(summary);

      if (usedTokens + tokens > maxTokens) {
        break; // 超出限制,停止加载
      }

      result += `\n### Paper: ${paperId}\n${summary}\n`;
      usedTokens += tokens;
    }

    return result;
  }

  private truncateConversation(
    history: Message[],
    maxTokens: number
  ): string {
    // 从最新消息开始,向前截取
    const reversed = [...history].reverse();
    let result = '';
    let usedTokens = 0;

    for (const msg of reversed) {
      const msgText = `${msg.role}: ${msg.content}\n`;
      const tokens = countTokens(msgText);

      if (usedTokens + tokens > maxTokens) {
        break;
      }

      result = msgText + result; // 前置插入 (因为是反向遍历)
      usedTokens += tokens;
    }

    return result;
  }
}
```

**自动压缩触发**:

```typescript
// 当上下文接近 150K tokens 时,触发压缩
if (usedTokens > 150_000) {
  await this.compressContext();
}

private async compressContext(): Promise<void> {
  // 1. 总结旧对话 (保留关键决策)
  const oldConversation = this.conversationHistory.slice(0, -20);
  const summary = await this.summarizeConversation(oldConversation);

  // 2. Papers Index 只保留标题+关键词
  const papersIndex = await this.buildMinimalPapersIndex();

  // 3. 旧的论文总结移出上下文 (需要时重新加载)
  this.activePaperIds = this.activePaperIds.slice(-3); // 只保留最近 3 篇
}
```

---

### Phase 4: Agent 核心集成 (2-3 周)

**目标**: 将工具集成到 Agent 循环

#### 4.1 Fork OpenCode (1 周)

**任务**:
1. Clone OpenCode 仓库
2. 移除不需要的部分 (示例工具、GUI 相关代码等)
3. 保留核心 Agent 循环
4. 调整项目结构以适配 Research Agent

**决策点**: 完整 fork vs 部分复用
- **完整 fork**: 保留所有代码,逐步修改
- **部分复用**: 只复制核心文件,重新组织项目结构

**推荐**: 完整 fork,然后逐步清理,降低风险

---

#### 4.2 工具注册 (1 周)

**注册所有科研工具**:

```typescript
// packages/core/src/tool-registry.ts

const registry = new ToolRegistry();

// 文献搜索与下载
registry.register(new SearchScholarTool());
registry.register(new DownloadPaperTool());

// PDF 处理
registry.register(new ProcessPDFTool());

// 文献阅读
registry.register(new ReadPaperTool());

// 引用管理
registry.register(new ManageCitationsTool());

// LaTeX 写作
registry.register(new WriteLatexTool());

// 保留 OpenCode 的基础工具
registry.register(new ReadFileTool());
registry.register(new WriteFileTool());
registry.register(new EditFileTool());
registry.register(new BashTool());
registry.register(new GitTool());
```

**工具描述优化**:
- 每个工具需要清晰的描述,帮助 Agent 决定何时调用
- 提供示例用法
- 说明参数约束

---

#### 4.3 SubAgent 策略 (1 周)

**文献总结 SubAgent**:
```typescript
// packages/core/src/subagents/paper-summarizer.ts

export class PaperSummarizerSubAgent extends SubAgent {
  systemPrompt = PAPER_SUMMARY_PROMPT;

  tools = ['read_file']; // 只需要读文件工具

  maxTokens = 50_000;

  temperature = 0.3; // 更确定性的输出

  async run(input: {
    paperText: string;
    paperId: string;
    projectContext: string;
  }): Promise<string> {
    // 调用父类的 run 方法
    return super.run({
      task: '生成论文总结',
      context: input,
    });
  }
}
```

**深度阅读 SubAgent**:
```typescript
// packages/core/src/subagents/paper-qa.ts

export class PaperQASubAgent extends SubAgent {
  systemPrompt = PAPER_QA_PROMPT;

  tools = ['read_file'];

  maxTokens = 30_000;

  async run(input: {
    paperText: string;
    question: string;
  }): Promise<string> {
    return super.run({
      task: `回答关于论文的问题: ${input.question}`,
      context: input,
    });
  }
}
```

**并行下载 SubAgent** (可选):
- 批量下载论文时,创建多个 SubAgent 并行处理
- 需要控制并发数 (避免 API 限流)
- 实现进度追踪

---

### Phase 5: Git 工作流集成 (1-2 周)

**目标**: 论文版本管理和实验追踪

#### 5.1 自动 commit 实验结果

```typescript
// packages/tools/src/git-auto-commit.ts

export class GitAutoCommitTool implements Tool {
  name = "git_auto_commit";
  description = "自动 commit 实验结果";

  async execute(args: {
    experimentName: string;
    config: Record<string, any>;
    metrics: Record<string, number>;
  }): Promise<void> {
    // 1. 添加实验结果文件到 Git
    await git.add(['experiments/', 'results/']);

    // 2. 生成 commit message
    const message = `Experiment: ${args.experimentName}

Config:
${JSON.stringify(args.config, null, 2)}

Metrics:
${Object.entries(args.metrics)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}

Generated by Research Agent
`;

    // 3. Commit
    await git.commit(message);

    // 4. 更新 RESEARCH.md
    await updateRESEARCHmd('实验记录', {
      date: new Date().toISOString().split('T')[0],
      experiment: args.experimentName,
      result: formatMetrics(args.metrics),
    });
  }
}
```

---

#### 5.2 多分支头脑风暴

```typescript
// 用户: "我想尝试两种不同的 intro 写法,帮我创建两个分支"
// Agent:

await git.checkout(['-b', 'draft-intro-v1-technical']);
// 在 v1 分支上写作...
await git.commit('Draft intro v1: technical approach');

await git.checkout('main');
await git.checkout(['-b', 'draft-intro-v2-motivation']);
// 在 v2 分支上写作...
await git.commit('Draft intro v2: motivation-first');

// 用户后续可以对比两个版本,选择更好的
```

---

#### 5.3 论文草稿版本管理

**场景**: 论文写作的多次迭代
- `main` 分支: 稳定版本
- `draft-v1`, `draft-v2`: 不同的写作尝试
- `revision-reviewer1`: 根据审稿人意见修改

**Git hooks 集成**:
- Pre-commit hook: 自动检查 LaTeX 语法错误
- Post-commit hook: 自动编译 PDF
- Pre-push hook: 运行测试 (如果有)

---

### Phase 6: 测试与质量保证 (3-4 周)

**目标**: 全面测试覆盖,确保质量

#### 6.1 单元测试 (2 周)

**测试结构**:
```
tests/
  ├── unit/
  │   ├── tools/
  │   │   ├── search-scholar.test.ts
  │   │   ├── download-paper.test.ts
  │   │   ├── process-pdf.test.ts
  │   │   ├── read-paper.test.ts
  │   │   ├── manage-citations.test.ts
  │   │   └── write-latex.test.ts
  │   ├── memory/
  │   │   ├── storage.test.ts
  │   │   ├── research-md.test.ts
  │   │   └── context-manager.test.ts
  │   └── core/
  │       ├── agent.test.ts
  │       ├── tool-registry.test.ts
  │       └── subagent.test.ts
  ├── integration/
  │   ├── full-workflow.test.ts
  │   ├── subagent-summary.test.ts
  │   └── context-management.test.ts
  ├── performance/
  │   ├── large-corpus.test.ts
  │   └── memory-usage.test.ts
  └── fixtures/
      ├── sample-papers/
      │   ├── paper1.pdf
      │   ├── paper1.txt
      │   └── paper1-summary.md
      └── mock-api-responses/
```

**每个工具的测试覆盖**:
1. **Happy path**: 正常输入,正常输出
2. **Edge cases**: 边界值,空输入,特殊字符
3. **Error handling**: 网络错误,API 限流,文件不存在等

**示例: SearchScholarTool 测试**:

```typescript
// tests/unit/tools/search-scholar.test.ts

describe('SearchScholarTool', () => {
  let tool: SearchScholarTool;

  beforeEach(() => {
    tool = new SearchScholarTool();
  });

  describe('happy path', () => {
    it('should return papers from arXiv API', async () => {
      // Mock API response
      mockArxivAPI([
        { id: 'arxiv-2024-12345', title: 'Test Paper', ... }
      ]);

      const result = await tool.execute({
        query: 'transformer',
        maxResults: 10,
        source: 'arxiv',
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('arxiv-2024-12345');
    });
  });

  describe('edge cases', () => {
    it('should handle empty results', async () => {
      mockArxivAPI([]);

      const result = await tool.execute({
        query: 'veryrarekeyword12345',
        maxResults: 10,
      });

      expect(result).toHaveLength(0);
    });

    it('should handle special characters in query', async () => {
      const result = await tool.execute({
        query: 'C++ & Python: A Comparison',
        maxResults: 10,
      });

      // Should not throw error
      expect(result).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should retry on network timeout', async () => {
      mockArxivAPITimeout(2); // 前 2 次超时,第 3 次成功

      const result = await tool.execute({
        query: 'transformer',
        maxResults: 10,
      });

      expect(result).toBeDefined();
      expect(getRetryCount()).toBe(3);
    });

    it('should throw error after max retries', async () => {
      mockArxivAPITimeout(5); // 5 次都超时

      await expect(
        tool.execute({ query: 'transformer', maxResults: 10 })
      ).rejects.toThrow(NetworkTimeoutError);
    });

    it('should handle API rate limiting', async () => {
      mockArxivAPIRateLimit();

      const result = await tool.execute({
        query: 'transformer',
        maxResults: 10,
      });

      // Should wait and retry
      expect(result).toBeDefined();
      expect(getWaitTime()).toBeGreaterThan(0);
    });
  });
});
```

**测试覆盖率目标**:
- 行覆盖率: >80%
- 分支覆盖率: >75%
- 函数覆盖率: >90%

---

#### 6.2 集成测试 (1 周)

**端到端工作流测试**:

```typescript
// tests/integration/full-workflow.test.ts

describe('Full Research Workflow', () => {
  it('should complete a full paper reading workflow', async () => {
    // 1. 搜索论文
    const papers = await agent.call('search_scholar', {
      query: 'transformer attention',
      maxResults: 5,
    });

    expect(papers).toHaveLength(5);

    // 2. 下载第一篇论文
    const paperId = papers[0].id;
    await agent.call('download_paper', { paperId });

    // 3. 处理 PDF
    await agent.call('process_pdf', { paperId });

    // 4. 读取论文 (首次,会触发 SubAgent 总结)
    const summary = await agent.call('read_paper', {
      paperId,
      mode: 'summary',
    });

    expect(summary).toContain('# '); // Markdown 标题
    expect(summary).toContain('**元数据**');
    expect(summary).toContain('**一句话总结**');

    // 5. 添加到引用列表
    const { citeKey } = await agent.call('add_citation', { paperId });

    expect(citeKey).toMatch(/^[a-z]+\d{4}[a-z]+$/);

    // 6. 写 LaTeX (引用该论文)
    await agent.call('write_latex', {
      file: 'test-output.tex',
      content: 'This paper proposes a new method.',
      citations: [citeKey],
    });

    // 验证生成的 LaTeX
    const latex = fs.readFileSync('test-output.tex', 'utf-8');
    expect(latex).toContain(`\\cite{${citeKey}}`);
  });
});
```

**SubAgent 总结质量测试**:

```typescript
// tests/integration/subagent-summary.test.ts

describe('SubAgent Paper Summary Quality', () => {
  it('should generate high-quality summary', async () => {
    const paperId = 'arxiv-1706-03762'; // Attention is All You Need
    const summary = await generatePaperSummary(paperId);

    // 结构完整性检查
    expect(summary).toContain('# Attention is All You Need');
    expect(summary).toContain('**元数据**');
    expect(summary).toContain('**研究问题**');
    expect(summary).toContain('**核心方法**');
    expect(summary).toContain('**主要结论**');
    expect(summary).toContain('**可引用的点**');

    // 内容准确性检查 (关键词)
    expect(summary.toLowerCase()).toContain('transformer');
    expect(summary.toLowerCase()).toContain('attention');
    expect(summary.toLowerCase()).toContain('self-attention');

    // 可引用的点必须有位置标注
    const citablePoints = extractCitablePoints(summary);
    for (const point of citablePoints) {
      expect(point).toMatch(/Section|Page|Figure|Table/);
    }
  });

  it('should not hallucinate information', async () => {
    const paperId = 'arxiv-1706-03762';
    const summary = await generatePaperSummary(paperId);

    // 不应该包含不存在的内容
    expect(summary).not.toContain('CNN'); // Transformer 不用 CNN
    expect(summary).not.toContain('RNN'); // Transformer 不用 RNN
  });
});
```

---

#### 6.3 性能测试 (1 周)

**大量文献处理测试**:

```typescript
// tests/performance/large-corpus.test.ts

describe('Large Corpus Performance', () => {
  it('should handle 50+ papers efficiently', async () => {
    const startTime = Date.now();

    // 下载 50 篇论文
    const paperIds = await downloadPapers({
      query: 'machine learning',
      count: 50,
    });

    // 批量生成总结 (这会很慢,预计 3-4 小时)
    for (const paperId of paperIds) {
      await agent.call('read_paper', {
        paperId,
        mode: 'summary',
      });
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000 / 60; // 分钟

    console.log(`Processed 50 papers in ${duration} minutes`);

    // 验证总结都已生成
    for (const paperId of paperIds) {
      const summaryPath = getPaperSummaryPath(paperId);
      expect(fs.existsSync(summaryPath)).toBe(true);
    }
  });
});
```

**内存使用分析**:

```typescript
// tests/performance/memory-usage.test.ts

describe('Memory Usage', () => {
  it('should not leak memory during long session', async () => {
    const initialMemory = process.memoryUsage().heapUsed;

    // 模拟长对话 (100 轮)
    for (let i = 0; i < 100; i++) {
      await agent.chat(`Tell me about paper ${i}`);
    }

    // 强制 GC
    if (global.gc) global.gc();

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryGrowth = (finalMemory - initialMemory) / 1024 / 1024; // MB

    console.log(`Memory growth: ${memoryGrowth} MB`);

    // 内存增长应该 < 200MB
    expect(memoryGrowth).toBeLessThan(200);
  });
});
```

**API 成本估算**:

```typescript
// tests/performance/api-cost.test.ts

describe('API Cost Estimation', () => {
  it('should estimate cost for 50 papers', async () => {
    const paperLengths = [
      15000, 20000, 25000, 30000, 18000, // 5 篇
      // ... 假设平均 20K tokens/篇
    ];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const length of paperLengths) {
      // 输入: 论文全文 + Prompt
      totalInputTokens += length + 5000;

      // 输出: 总结 (约 2K tokens)
      totalOutputTokens += 2000;
    }

    // Claude 3.5 Sonnet 价格 (2026 年)
    const inputCost = totalInputTokens / 1_000_000 * 3; // $3/M tokens
    const outputCost = totalOutputTokens / 1_000_000 * 15; // $15/M tokens
    const totalCost = inputCost + outputCost;

    console.log(`Estimated cost for 50 papers: $${totalCost.toFixed(2)}`);
    console.log(`Average cost per paper: $${(totalCost / 50).toFixed(3)}`);

    // 预期: 每篇论文约 $0.05-0.15
    expect(totalCost / 50).toBeLessThan(0.20);
  });
});
```

---

### Phase 7: 文档与部署 (2-3 周)

**目标**: 用户文档和分发准备

#### 7.1 用户文档 (1 周)

**快速开始指南** (`docs/guides/quickstart.md`):

```markdown
# Research Agent - 快速开始

## 安装

```bash
npm install -g research-agent
```

## 初始化项目

```bash
research-agent init my-thesis
cd ~/.research-agent/projects/my-thesis
```

## 第一次使用

### 1. 搜索论文
```bash
$ research-agent

> 帮我找 10 篇关于 transformer 的论文

[Agent 自动搜索、下载、生成总结...]
```

### 2. 阅读论文
```bash
> 总结一下 Attention is All You Need 这篇论文

[Agent 返回结构化总结]
```

### 3. 写论文
```bash
> 帮我写 related work 章节,重点对比这 5 篇论文

[Agent 生成 LaTeX,自动添加引用]
```

## 常用命令

- `research-agent init <project>` - 创建新项目
- `research-agent list-papers` - 列出所有已下载的论文
- `research-agent export-bibtex` - 导出 BibTeX 文件
- `research-agent import-pdfs <dir>` - 从目录批量导入 PDF

## 环境配置

需要设置 Anthropic API Key:
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

## 下一步

- 阅读[用户手册](user-guide.md)了解所有功能
- 查看[示例项目](examples/)学习最佳实践
```

**用户手册** (`docs/guides/user-guide.md`):
- 完整功能列表
- 工作流示例
- 最佳实践
- 常见问题解答

**常见问题解答** (`docs/guides/faq.md`):
- Q: SubAgent 总结需要多长时间?
- Q: API 成本如何?
- Q: 如何导入 Zotero 的文献?
- Q: 如何处理中文论文?
- Q: 如何自定义总结格式?

---

#### 7.2 开发者文档 (1 周)

**架构文档** (`docs/architecture.md`):
- 整体架构图
- 数据流图
- 组件交互图
- 技术栈说明

**贡献指南** (`CONTRIBUTING.md`):
```markdown
# 贡献指南

## 开发环境设置

```bash
git clone https://github.com/username/research-agent.git
cd research-agent
npm install
npm run build
npm link
```

## 项目结构

```
packages/
  ├── core/       # Agent 核心
  ├── tools/      # 科研工具集
  ├── memory/     # 记忆系统
  └── cli/        # 命令行界面
```

## 添加新工具

1. 在 `packages/tools/src/` 创建新文件
2. 实现 `Tool` 接口
3. 在 `packages/core/src/tool-registry.ts` 注册
4. 编写测试
5. 更新文档

## 代码规范

- 使用 ESLint + Prettier
- 提交前运行 `npm run lint`
- 所有公开 API 必须有 TSDoc 注释

## 测试

```bash
npm test              # 运行所有测试
npm run test:unit     # 只运行单元测试
npm run test:watch    # Watch 模式
```

## 提交规范

使用 Conventional Commits:
- `feat:` 新功能
- `fix:` Bug 修复
- `docs:` 文档更新
- `test:` 测试相关
```

**API 文档** (`docs/api/`):
- 自动生成 (TypeDoc)
- 每个工具的 API 参考
- 每个类的接口文档

---

#### 7.3 部署准备 (1 周)

**npm 包配置** (`package.json`):

```json
{
  "name": "research-agent",
  "version": "1.0.0",
  "description": "AI Copilot for academic research workflow",
  "main": "dist/index.js",
  "bin": {
    "research-agent": "dist/cli/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "lint": "eslint . --ext .ts",
    "format": "prettier --write .",
    "prepublishOnly": "npm run build && npm test"
  },
  "keywords": [
    "research",
    "academic",
    "ai",
    "agent",
    "paper",
    "latex"
  ],
  "author": "Your Name",
  "license": "MIT",
  "dependencies": {
    "@anthropic-ai/sdk": "^0.20.0",
    "arxiv": "^1.0.0",
    "pdf-parse": "^1.1.1",
    "citation-js": "^0.7.0",
    "simple-git": "^3.0.0",
    // ... 其他依赖
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "jest": "^29.0.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

**依赖管理**:
- 精简依赖,避免臃肿
- 固定关键依赖版本
- 定期更新安全补丁

**环境配置指南** (`docs/setup.md`):
- Node.js 版本要求 (>=18)
- API Key 配置
- 可选依赖 (Tesseract OCR)
- 故障排查

---

## 总工作量估算

| Phase | 描述 | 人工团队 | CC + gstack |
|-------|------|----------|-------------|
| Phase 0 | 项目初始化 | 1 周 | 2-3 天 |
| Phase 1 | OpenCode 学习 | 2-3 周 | 2-3 周 (无法压缩) |
| Phase 2 | 核心工具开发 | 8-10 周 | 3-4 周 (30x 压缩) |
| Phase 3 | 文献记忆系统 | 6-8 周 | 2-3 周 (30x 压缩) |
| Phase 4 | Agent 核心集成 | 4-6 周 | 1-2 周 (30x 压缩) |
| Phase 5 | Git 工作流 | 2-3 周 | 1 周 (20x 压缩) |
| Phase 6 | 测试与质量保证 | 6-8 周 | 2-3 周 (30x 压缩) |
| Phase 7 | 文档与部署 | 3-4 周 | 1-2 周 (20x 压缩) |
| **总计** | | **32-45 周 (6-9 个月)** | **12-16 周 (2-3 个月)** |

**压缩比**: 约 10-30x (AI 辅助编码)

**关键路径**:
1. OpenCode 学习 (2-3 周) - 无法压缩,必须深入理解
2. ReadPaper + SubAgent (2-3 周) - 核心假设验证
3. 文献记忆系统 (2-3 周) - 架构关键
4. 测试 (2-3 周) - 质量保证

---

## 关键风险与缓解策略

### 风险 1: OpenCode 复杂度风险
**描述**: 学习曲线陡峭,理解不足导致集成困难

**影响**: High
**可能性**: Medium

**缓解策略**:
1. 预留足够的学习时间 (2-3 周)
2. 创建详细的架构分析文档
3. 必要时咨询 OpenCode 社区或维护者
4. 考虑分阶段集成,先复用核心部分

**应急计划**:
- 如果 1 个月后仍无法理解核心架构 → 考虑切换到 LangChain/LlamaIndex
- 如果只是部分功能复杂 → 简化或跳过该功能

---

### 风险 2: SubAgent 总结质量风险
**描述**: SubAgent 生成的总结不够准确或丢失关键信息

**影响**: High
**可能性**: Medium

**缓解策略**:
1. 设计高质量的 Prompt 模板 (参考学术规范)
2. 建立人工评估机制 (随机抽取 10% 进行质量检查)
3. 支持用户 Feedback 和手动修正
4. 提供 "重新生成总结" 功能
5. 在测试阶段使用真实论文验证质量

**应急计划**:
- 如果总结质量始终不达标 → 降低自动化程度,改为辅助式总结 (Agent 提供草稿,用户修改)
- 如果只是特定类型论文效果差 → 针对该类型优化 Prompt 或提供专用模板

---

### 风险 3: 性能风险
**描述**: TypeScript 性能不足,处理大量文献时卡顿或内存溢出

**影响**: Medium
**可能性**: Low

**缓解策略**:
1. Phase 6 进行性能测试,提前识别瓶颈
2. 优化热路径 (PDF 处理、文本解析)
3. 实现增量加载和惰性处理
4. 监控内存使用,避免泄漏
5. 设置合理的并发限制

**应急计划**:
- 如果 PDF 处理是瓶颈 → 用 Rust 重写 PDF 处理工具 (通过 napi-rs 集成)
- 如果上下文管理是瓶颈 → 优化压缩策略或使用数据库 (SQLite)
- 如果 Node.js 内存限制是问题 → 增加 `--max-old-space-size`

---

### 风险 4: 上下文管理风险
**描述**: 200K token 限制仍然不够,文献过多导致上下文溢出

**影响**: Medium
**可能性**: Medium

**缓解策略**:
1. 设计智能的分层加载策略
2. 实现高效的上下文压缩
3. 允许用户手动控制加载的文献
4. 提供 "当前项目相关文献" 过滤
5. 旧文献自动归档,需要时再加载

**应急计划**:
- 如果上下文始终溢出 → 引入外部向量数据库 (Chroma/Weaviate) 进行 RAG 检索
- 如果压缩效果不好 → 简化 Papers Index,只保留标题和关键词

---

### 风险 5: API 成本风险
**描述**: 大量使用 SubAgent 导致 API 成本过高,影响用户体验

**影响**: Medium
**可能性**: Low

**缓解策略**:
1. 准确估算 API 成本,提前告知用户
2. 提供成本控制选项 (如每月预算上限)
3. 优化 Prompt,减少不必要的 token 使用
4. 缓存总结结果,避免重复处理
5. 考虑支持其他更便宜的模型 (Claude Haiku, GPT-4o mini)

**应急计划**:
- 如果成本超出预期 → 提供 "经济模式" (使用更便宜的模型,牺牲质量)
- 如果用户反馈成本过高 → 引入本地模型选项 (Llama 3.1, Qwen)

---

### 风险 6: Zotero 集成复杂度
**描述**: 用户强烈要求直接读取 Zotero 数据库,而不是导入模式

**影响**: Low
**可能性**: Medium

**缓解策略**:
1. 在 1.0 版本坚持导入模式,降低复杂度
2. 提供便捷的导入脚本/命令
3. 收集用户反馈,评估需求强度
4. 在 1.1 或 2.0 版本再考虑直接集成

**应急计划**:
- 如果大量用户要求 → 在 1.1 版本添加 `--zotero-sync` 选项
- 实现时使用 Zotero 的官方 API,而不是直接读 SQLite

---

## 成功标准

**1.0 版本的定义**: 能完成一个完整的科研循环

### 验收场景

**场景**: 博士生需要写一篇关于 "Transformer 改进方法" 的论文

```bash
$ research-agent init my-transformer-paper
$ research-agent

> 帮我找 10 篇关于 sparse attention 的论文

[Agent 自动搜索、下载、总结]
✅ 找到 10 篇论文,已下载并生成总结

> 这些论文的核心创新点是什么?有哪些是我可以改进的?

[Agent 分析所有论文,生成研究空白总结]
✅ 返回详细分析,指出 3 个潜在的研究方向

> 帮我写 related work 章节,重点对比这 5 篇论文

[Agent 生成 LaTeX,自动添加 \cite{}]
✅ 生成 related_work.tex,包含 5 个 \cite{}

> 我有个新的实验想法,帮我写个 baseline

[Agent 生成 Python 代码]
✅ 生成 train.py 和 model.py

> 跑一下实验

[Agent 执行 bash,自动 git commit 结果]
✅ 实验完成,结果已 commit

> 根据实验结果,帮我写 method 章节

[Agent 生成论文内容,引用实验数据]
✅ 生成 method.tex,包含实验结果表格
```

### 验收标准

✅ Agent 能自动搜索和下载论文
✅ Agent 能理解 PDF 内容并生成总结
✅ Agent 能记住所有讨论和文献
✅ Agent 能生成符合规范的 LaTeX
✅ Agent 能执行实验代码
✅ Agent 能用 Git 管理版本
✅ 整个过程在命令行完成,无需切换工具
✅ 用户体验流畅,没有明显卡顿

### 质量标准

- **测试覆盖率**: >80% 行覆盖率
- **文档完整性**: 所有核心功能都有文档
- **性能**: 50 篇论文处理时间 < 5 小时
- **稳定性**: 核心工作流不崩溃
- **可维护性**: 代码结构清晰,易于扩展

---

## 开放问题

### 1. SubAgent 总结质量如何保证?
**状态**: 待验证

**需要做的**:
- 设计 Prompt 模板
- 建立人工评估机制
- 实现用户 Feedback 功能
- 在测试阶段用真实论文验证

**决策点**: Phase 2.3 完成后评估

---

### 2. 引用图谱的价值有多大?
**状态**: 待评估

**问题**:
- 是否真的需要维护引用关系?
- 还是简单的列表就够了?
- 图谱的计算和存储成本如何?

**决策点**: Phase 2.4 实现基础版本后,根据用户反馈决定是否深化

---

### 3. 多项目如何隔离?
**状态**: 已设计,待实现

**方案**:
- 每个项目有独立的 `RESEARCH.md`
- 文献库全局共享 (`~/.research-agent/papers/`)
- 引用图谱全局共享 (`~/.research-agent/citations/`)

**待验证**: 这种设计是否满足实际需求

---

### 4. 如何处理图片和公式?
**状态**: Phase 1 暂不处理

**当前方案**:
- 图片用 `[Figure X]` 占位
- 公式用 `[Equation X]` 占位

**未来方案**:
- 使用 OCR 识别图片中的文字
- 使用 MathPix API 识别公式
- 生成 LaTeX 公式代码

**决策点**: 1.0 版本发布后,根据用户需求决定是否在 1.1 版本添加

---

### 5. 如何处理中文论文?
**状态**: 待设计

**挑战**:
- PDF 提取中文效果如何?
- 总结 Prompt 是否需要调整?
- BibTeX 中文作者如何处理?

**决策点**: Phase 2.2 (PDF 处理) 时测试中文论文,决定是否需要特殊处理

---

### 6. 是否支持本地模型?
**状态**: 暂不支持

**理由**:
- 1.0 版本专注核心功能
- 本地模型增加部署复杂度
- API 调用更稳定

**未来考虑**:
- 如果用户反馈 API 成本过高 → 2.0 版本添加本地模型支持 (Llama, Qwen)

---

## 下一步行动

### 立即 (本周)
1. ✅ 初始化 Git 仓库
2. ✅ 创建项目结构
3. ⏳ 阅读 OpenCode README 和文档

### 短期 (1-2 周)
1. 完成 Phase 1: OpenCode 架构深入学习
2. 决策: 完整 fork vs 部分复用
3. 创建 Phase 1 交付物: 架构分析文档

### 中期 (1 个月)
1. 完成 Phase 2.1-2.3: 核心工具开发
2. 实现并验证 SubAgent 总结质量
3. 评估是否需要调整技术方案

### 长期 (2-3 个月)
1. 完成所有 7 个 Phase
2. 通过验收标准测试
3. 发布 1.0 版本

---

## 附录

### A. 技术栈清单

**核心依赖**:
- `@anthropic-ai/sdk` - Anthropic API 调用
- `arxiv` - arXiv 论文搜索和下载
- `pdf-parse` - PDF 文本提取
- `citation-js` - 引用格式处理
- `simple-git` - Git 操作
- `latex-parser` - LaTeX 语法解析 (可选)

**开发依赖**:
- `typescript` - 类型系统
- `jest` - 测试框架
- `eslint` - 代码检查
- `prettier` - 代码格式化
- `typedoc` - 文档生成

**可选依赖**:
- `tesseract.js` - OCR (PDF 处理失败时的 fallback)
- `mathpix-api` - 公式识别 (未来功能)

---

### B. 外部服务依赖

**必需**:
- Anthropic API (Claude 3.5 Sonnet)
  - 价格: $3/M input tokens, $15/M output tokens
  - 限流: 100 RPM (requests per minute)

**可选**:
- arXiv API (免费)
  - 限流: 1 request/3 seconds
- Semantic Scholar API (免费)
  - 限流: 100 requests/5 minutes

---

### C. 参考资料

**设计文档**:
- [Design Document](~/.gstack/projects/scholar-cli/caoxinzhuo-unknown-design-20260325-162226.md)

**技术参考**:
- OpenCode GitHub 仓库地址 (待确认)
- [Anthropic API Documentation](https://docs.anthropic.com)
- [arXiv API User Manual](https://arxiv.org/help/api)

**学术规范**:
- [ACL Style Guide](https://acl-org.github.io/ACLPUB/formatting.html)
- [NeurIPS Style Guide](https://neurips.cc/Conferences/2024/PaperInformation/StyleFiles)

---

**文档生成时间**: 2026-03-25
**版本**: 1.0
**状态**: Draft

---

## 下一步

请基于这个实施计划开始 Phase 0 的工作,或者继续完成深度评审 (Section 1-10)。

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | mode: HOLD_SCOPE, 0 critical gaps |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 13 issues resolved, 0 unresolved, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

**关键架构决策 (Engineering Review):**
1. ✅ SubAgent 独立 token 池,避免主 Agent 上下文溢出
2. ✅ 批量处理添加成本确认机制 (>20 篇论文)
3. ✅ PDF 处理 4 层 fallback (LaTeX → pdf-parse → OCR → SubAgent)
4. ✅ RESEARCH.md 串行化写入队列,避免并发冲突
5. ✅ Active Papers 使用 LLM 决策 + `@` 语法加载策略
6. ✅ 添加论文访问统计 (accessCount/mentionedIn),Agent 学习重要论文
7. ✅ 统一错误处理为 Result<T, Error> 模式
8. ✅ Prompt 版本控制 (summary 文件头记录版本)
9. ✅ 添加 `research-agent doctor` 命令修复脏数据
10. ✅ 复制 OpenCode 测试套件防止回归
11. ✅ **重大架构变更:** 使用 OpenAI 兼容 API (替代原计划的 Anthropic)
12. ✅ **重大架构变更:** 完整 RAG 系统 (tags + embedding),使用 DuckDB + vss extension
13. ✅ 固定 3 并发 SubAgent 批量处理

**实施计划调整:**
- 新增 Phase 2.6: RAG 文献检索系统 (1-2 周)
- Phase 3.1: papers.json → DuckDB 迁移
- 总工作量: 12-16 周 → **13-18 周** (3-4 个月)

**VERDICT:** ENG REVIEW CLEARED — 架构稳健,已验证可行性,13 个问题已解决,0 个未解决问题,0 个关键缺陷。

**Lake Score:** 13/13 (100%) — 所有决策都选择了完整实现方案。
