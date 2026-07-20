# OpenCode 核心机制分析 v2(Effect 化之后)

- 日期: 2026-07-19
- 分析对象: 上游 dev 分支 HEAD(v1.18.3 之后,2026-07-19),即我们 fork(github.com/Cae1anSou/opencode)的基线
- 前版: `opencode-core-analysis.md` 记录的是 2026-03-30 Effect 化重构之前的形态,其概念划分仍可参照,实现细节以本文为准
- 本文目的: 为编排层二开提供地图——上游已经替我们做了什么、嫁接点在哪、还缺什么

## 一、总体架构:一切皆 Effect 服务

Effect 化之后,`packages/opencode/src` 下的每个子系统都是一个 `Context.Service`:用 `Layer.effect` 声明如何构造,用 `LayerNode.make({ service, layer, deps })` 显式声明依赖图。SessionPrompt 的服务构造器一次性注入了约二十四个服务(Session、Agent、Provider、Processor、Compaction、Plugin、Permission、MCP、LSP、ToolRegistry、Truncate、LLM、Database 等,见 `session/prompt.ts:113-143`),依赖关系完全显式,这对二开是好消息:我们的领域服务(记忆、精读、引用)按同样模式声明成 LayerNode 就能挂进依赖图,不需要侵入任何现有文件。

另一个底层变化是存储:消息读写走 `Database.Service`(SQLite,经由 effect-drizzle-sqlite),不再是三月版的纯文件事件溯源。monorepo 也大幅扩容,新增了 `core`(共享 schema 与领域类型,`@opencode-ai/core`)、`llm`(自研 LLM 客户端,`@opencode-ai/llm`)、`protocol`、`sdk-next` 等包。

## 二、Agent Loop:SessionPrompt.runLoop

主循环在 `session/prompt.ts:1081` 的 `runLoop`,是一个 `Effect.fn` 生成器里的 `while (true)`。每轮的次序是:置会话状态为 busy;经 `MessageV2.filterCompactedEffect` 读出"压缩视界内"的消息;做退出判断——最近一条 assistant 消息已有 finish 原因、不含未回灌的工具调用、且晚于最近的 user 消息,则 break(有个防御分支:部分 provider 在有工具调用时也返回 stop,此时强制继续循环把工具结果送回模型,`prompt.ts:1103-1109`);第一轮 fork 一个后台 fiber 生成会话标题;然后从消息里弹出待处理任务——subtask 任务走 `handleSubtask`,compaction 任务走 `compaction.process`,都处理完才轮到正常推理;若上一轮 token 已判定溢出(`compaction.isOverflow`),入队一个自动压缩任务后 continue;最后解析 agent 配置、应用 SessionReminders、创建 assistant 消息壳、`processor.create` 建流处理句柄(挂了 `Effect.onInterrupt` 保证中断时把消息标记为 aborted 并落库)、`SessionTools.resolve` 解析本轮工具集,发起 LLM 流式请求并由 processor 消费,产出 `"break" | "continue"` 的结论。

与三月版相比,循环的概念结构(subtask/compaction 作为队列任务插入主循环、溢出触发自动压缩)没变,但控制流的每一段都变成了可中断、可观测的 Effect:取消经由 fiber 中断传播,日志与 span 全程携带 session.id。

## 三、工具系统:契约、包装管线与 AI SDK 桥接

工具契约在 `tool/tool.ts`:`Tool.define(id, initEffect)` 返回 `Info{id, init}`,参数用 Effect Schema 声明(不再是 zod)。`wrap()`(`tool.ts:99-149`)给每个工具的 execute 套上一条固定管线:参数解码失败抛类型化的 `InvalidArgumentsError`——它的 message 是写给模型看的("请按 schema 重写输入"),会作为工具结果回灌,让模型自我修复;执行成功后自动过 `Truncate.output` 截断大输出(截断后原文落盘并附 outputPath);整体包 `Effect.withSpan` 打遥测。解码器在工具初始化时编译一次而非每次调用,是刻意的性能优化。

`SessionTools.resolve`(`session/tools.ts:41`)负责把注册表工具转成 AI SDK 的 `tool()` 对象:execute 内部经 `EffectBridge` 把 Promise 世界桥回 Effect 世界,依次触发 `plugin.trigger("tool.execute.before")`、真正执行、`plugin.trigger("tool.execute.after")`;权限询问以 `ctx.ask` 的形式注入每个工具的上下文,规则集由 agent 权限与 session 权限合并而来。MCP 资源类工具(list/read resource)在此动态合成。

这条管线与我们移植清单里的"校验 → 权限 → 钩子 → 执行 → 钩子"高度重合——上游已经实现了大半,我们的增量主要是:Claude Code 式的声明式并发安全标记(isConcurrencySafe/isReadOnly)与分区并发调度,上游目前没有这一层(工具执行的并发行为由 AI SDK 的工具调度决定,未见显式分区)。

## 四、LLM 层:双运行时的收敛缝

`session/llm.ts` 暴露单一接口 `stream(input): Stream<LLMEvent>`,内部有两条运行时:默认路径把请求交给 AI SDK `streamText()`(工具分发由 AI SDK 承担),经 `LLMAISDK.toLLMEvents` 把 fullStream 归一化为 `LLMEvent`;实验路径(`flags.experimentalNativeLlm`)走自研的 `LLMNativeRuntime`(`@opencode-ai/llm` 包),不支持时带原因回退到 AI SDK。**这说明上游自己也在把运行时所有权从 AI SDK 收回来**——与我们"收回循环所有权"的二开方向同向,值得持续跟踪该包的成熟度。AbortController 用 `Effect.acquireRelease` 挂在流的 Scope 上,流被中断即自动 abort。`streamText` 的 `maxRetries` 显式设为 0:重试不交给 AI SDK,由上层 `session/retry.ts` 统一处理——重试收敛在单一入口,与我们从 codex 总结的纪律一致。还有一个实用细节:`experimental_repairToolCall` 把大小写错误的工具名自动修正,无法修复的路由到 `invalid` 工具让模型看到错误。

## 五、SubAgent:task 工具

`tool/task.ts` 的 TaskTool 即子 agent 机制:子 agent 是一个完整子 session(独立上下文,即旧 ADR-003 要求的 token 池隔离),通过 `TaskPromptOps.prompt` 递归进入同一条 prompt 链路。深度控制沿 parentID 链上溯计数,超过 `subagent_depth`(默认 1)即拒绝;子会话权限由 `deriveSubagentSessionPermission` 从父会话收窄,且默认 deny 子 agent 使用 todowrite 与再派生 task;支持 `task_id` 续跑(复用既有子会话续写),支持 `background=true` 后台执行(特性开关后完成时通知)。输出以 `<task state=...><task_result>` 的 XML 包裹回灌。精读 SubAgent 可直接落在这套机制上:定义一个 reader agent 类型 + 结构化输出约定即可,无需自建 Task 框架。

## 六、压缩

`session/compaction.ts` 提供 isOverflow/estimate/select/prune/process:溢出判定基于上一轮 token 用量与模型上限;`prune`(PRUNE_MINIMUM 20K / PRUNE_PROTECT 40K)先行裁剪可牺牲的旧工具输出;真正的压缩作为队列任务插入主循环,由独立 processor 跑一次"生成延续摘要"的模型调用,摘要成为新的压缩视界起点,压缩失败时以 `ContextOverflowError` 标记消息。对照我们的规划:这套是通用兜底压缩,我们要加的"领域对象换入换出"(卸载论文笔记、保留索引行)应实现为压缩发生之前的第一道防线,即在 prompt 组装阶段控制进入上下文的领域内容量,而不是改造 compaction 本身。

## 七、对二开的直接结论

嫁接点清晰:领域工具(search/download/fulltext/精读)经 `Tool.define` + ToolRegistry 注册,自动获得校验-钩子-截断-遥测管线与权限接入;精读 SubAgent 复用 task 机制定义 reader agent;记忆底座做成新的 `Context.Service` + LayerNode 挂入依赖图,在 prompt 组装与 SessionReminders 处注入领域上下文。真正需要自研的增量收敛为三块:工具的声明式并发安全标记与分区调度(移植清单第一项)、领域对象换入换出的上下文管理(第三项)、以及记忆图谱本身。原计划"替换循环"的必要性下降——上游循环骨架质量已高,且其自研运行时方向与我们一致,优先"增强"而非"替换"。
