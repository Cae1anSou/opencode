---
paperId: arxiv-1706.03762
title: Attention Is All You Need
status: read
year: 2017
authors: ["Ashish Vaswani","Noam Shazeer","Niki Parmar","Jakob Uszkoreit","Llion Jones","Aidan N. Gomez","Łukasz Kaiser","Illia Polosukhin"]
tags: ["attention","transformer","computational-complexity","self-attention","sequence-modeling","NMT"]
thesis: 提出 Transformer，一种完全基于注意力机制（摒弃循环和卷积）的序列转导模型，在机器翻译任务上达到 SOTA 的同时训练成本显著降低，其核心 Scaled Dot-Product Attention 的计算复杂度为 O(n²·d)，在 n < d 的典型场景下比 RNN 的 O(n·d²) 更快。
updatedAt: 2026-07-19T12:09:43.588Z
---

## Problem & Motivation

循环神经网络（RNN/LSTM/GRU）在序列建模任务中长期占据主导地位，但其计算沿着序列位置逐步展开（生成隐藏状态序列 h_t = f(h_{t-1}, x_t)），这种固有的顺序性带来了三个核心局限：

1. **训练无法并行化**：序列内的计算必须按时间步串行执行，在长序列上训练效率极低。
2. **长程依赖学习困难**：前向/反向信号在序列中的传播路径长度为 O(n)，导致梯度消失/爆炸问题。
3. **内存瓶颈**：需要存储所有中间隐藏状态，限制了跨样本的批处理能力。

卷积模型（如 ByteNet、ConvS2S）虽然可以并行计算所有位置，但关联两个任意位置所需的操作数随距离增长（ConvS2S 为线性，ByteNet 为对数），使得学习远距离依赖仍然困难。

论文提出的 Transformer 完全摒弃循环和卷积，仅依赖注意力机制来建模全局依赖关系，将任意两个位置之间信号传播的路径长度降为 O(1)。

## Method

### 整体架构

Transformer 沿用 encoder-decoder 结构。编码器由 N=6 个相同层堆叠，每层包含：
- Multi-Head Self-Attention 子层
- Position-wise Feed-Forward Network 子层
- 每个子层后接残差连接 + LayerNorm：LayerNorm(x + Sublayer(x))

解码器同样有 N=6 层，额外插入一个对编码器输出做 Multi-Head Attention 的子层，且 Self-Attention 子层使用掩码（masking）防止位置 i 关注位置 j > i，保持自回归特性。所有子层输出维度 d_model = 512。

### Scaled Dot-Product Attention（3.2.1 节）

注意力函数将 query 和一组 key-value 对映射为输出——输出是 values 的加权和，权重由 query 与对应 key 的兼容性函数决定。

**公式**：
$$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V$$

其中 Q、K、V 分别为 queries、keys、values 打包成的矩阵。queries 和 keys 的维度为 d_k，values 的维度为 d_v。

**缩放因子的原理**（3.2.1 节及脚注）：假设 q 和 k 的分量是均值为 0、方差为 1 的独立随机变量，则点积 q·k = Σ u_i v_i 的均值为 0，方差为 d_k。除以 √d_k 将方差归一化为 1，防止点积值过大导致 softmax 进入梯度极小的饱和区。论文 4.2 节（Justification of Scaling Factor）给出了严格的期望与方差推导。

**计算过程（矩阵形式）**：
1. 计算注意力分数矩阵 S = QK^T —— 复杂度 O(n²·d_k)
2. 缩放 + Softmax：P = softmax(S / √d_k) —— 复杂度 O(n²)
3. 加权求和输出：O = PV —— 复杂度 O(n²·d_v)

**总体复杂度**：O(n²·d_k + n²·d_v) = O(n²·d)，其中 d = max(d_k, d_v)。

### Multi-Head Attention（3.2.2 节）

与其用 d_model 维的单一注意力函数，论文将 Q、K、V 分别线性投影 h 次到 d_k、d_k、d_v 维度，在每个投影版本上并行执行注意力，将 h 个 d_v 维输出拼接后再做一次线性投影。

$$\text{MultiHead}(Q, K, V) = \text{Concat}(\text{head}_1, \ldots, \text{head}_h) W^O$$
$$\text{head}_i = \text{Attention}(QW_i^Q, KW_i^K, VW_i^V)$$

参数矩阵：W_i^Q ∈ ℝ^{d_model × d_k}，W_i^K ∈ ℝ^{d_model × d_k}，W_i^V ∈ ℝ^{d_model × d_v}，W^O ∈ ℝ^{h·d_v × d_model}

论文设置 h=8，d_k = d_v = d_model / h = 64。由于每个头的维度降低，总计算量与全维度的单头注意力相近。

**Multi-Head 的三种使用方式**：
1. **Encoder-Decoder Attention**：queries 来自前一个解码器层，keys 和 values 来自编码器输出。解码器的每个位置可以关注输入序列的所有位置。
2. **Encoder Self-Attention**：Q、K、V 均来自编码器前一层的输出。每个位置可关注编码器中的所有位置。
3. **Decoder Masked Self-Attention**：Q、K、V 来自解码器前一层的输出，但通过掩码防止关注后续位置（将 softmax 输入中非法位置设为 -∞）。

### Position-wise Feed-Forward Networks（3.3 节）

$$\text{FFN}(x) = \max(0, xW_1 + b_1)W_2 + b_2$$

两个线性变换 + ReLU 激活，等价于 kernel size=1 的卷积。输入输出维度 d_model=512，中间层维度 d_ff=2048。

### 位置编码（3.5 节）

因为模型不含循环和卷积，需要注入位置信息。使用正弦/余弦函数：
$$PE_{(pos, 2i)} = \sin(pos / 10000^{2i/d_{model}})$$
$$PE_{(pos, 2i+1)} = \cos(pos / 10000^{2i/d_{model}})$$

选择正弦函数的原因：对于任意固定偏移 k，PE_{pos+k} 可以表示为 PE_{pos} 的线性函数，因此模型可能更容易学习相对位置关系；此外正弦版本可能允许模型泛化到训练时未见过的序列长度。

---

## 注意力机制计算复杂度详细分析

### 论文 Table 1：Self-Attention 与 RNN/CNN 对比（3.5 节）

论文从三个维度比较不同层类型：

| 层类型 | 每层复杂度 | 最少顺序操作数 | 最大路径长度 |
|---|---|---|---|
| Self-Attention | O(n²·d) | O(1) | O(1) |
| Recurrent | O(n·d²) | O(n) | O(n) |
| Convolutional | O(k·n·d²) | O(1) | O(log_k(n)) |
| Self-Attention (restricted) | O(r·n·d) | O(1) | O(n/r) |

其中 n=序列长度，d=表示维度，k=卷积核宽度，r=受限自注意力的邻域大小。

### 各项复杂度的推导

**Self-Attention O(n²·d)**：
以 Encoder Self-Attention 为例。输入 X ∈ ℝ^{n × d_model}。
- 线性投影得到 Q = XW^Q, K = XW^K, V = XW^V：各 O(n·d_model·d_k)
- 计算注意力分数 S = QK^T：Q ∈ ℝ^{n × d_k}，K^T ∈ ℝ^{d_k × n}，结果为 ℝ^{n × n}，复杂度 O(n²·d_k)
- Softmax：O(n²)
- 加权求和 PV：P ∈ ℝ^{n × n}，V ∈ ℝ^{n × d_v}，复杂度 O(n²·d_v)
- 输出投影（Multi-Head 的拼接投影）：O(n·h·d_v·d_model)

主导项为 O(n²·max(d_k, d_v)) = O(n²·d)。

**Recurrent O(n·d²)**：
RNN 每个时间步的隐藏状态更新为 h_t = f(W·[x_t, h_{t-1}])，其中矩阵乘法涉及 d×d 的权重矩阵，单步计算量 O(d²)，n 个时间步总复杂度 O(n·d²)。

**Convolutional O(k·n·d²)**：
标准 1D 卷积，每个位置与 k 个邻域位置做 d×d 的变换，总计 O(k·n·d²)。可分离卷积（Separable Convolutions）可将复杂度降至 O(k·n·d + n·d²)。即使 k=n，可分离卷积的复杂度也等价于一个 Self-Attention 层 + 一个 Point-wise FFN 层的组合——这正是 Transformer 所用的方案。

### 复杂度交叉点分析

Self-Attention 在 **n < d** 时比 RNN 更快（计算量更少）。论文指出，在机器翻译的典型场景中（使用 word-piece 或 byte-pair 编码的句子表示），n 通常小于 d（例如 d_model=512，而多数句子长度 n < 512），因此 Self-Attention 在实际中更具计算效率。

### 受限 Self-Attention 作为长序列优化方案

论文提出，对于非常长的序列，可以将 Self-Attention 限制为只关注以输出位置为中心的邻域（大小为 r），复杂度降为 O(r·n·d)。代价是最大路径长度增加到 O(n/r)。论文将此列为未来工作方向。

### 顺序操作数与并行性

- Self-Attention：所有位置的计算完全并行（O(1) 顺序操作），因为注意力矩阵 QK^T 是一次性矩阵乘法。
- RNN：必须按序列顺序逐个时间步计算（O(n) 顺序操作），这是其训练并行化的根本瓶颈。
- CNN：所有位置可并行计算（O(1) 顺序操作），但要建立远距离依赖需要堆叠多层。

### 最大路径长度与长程依赖

路径长度衡量信号从输入序列任意位置传播到输出序列任意位置所需经过的最少层数/操作数：
- Self-Attention：任意两个位置直接相连 → O(1)
- RNN：信号需依次经过 n 个时间步 → O(n)，梯度消失/爆炸风险大
- CNN：使用空洞卷积时需 O(log_k(n)) 层才能覆盖全序列
- 受限 Self-Attention：需要 O(n/r) 步覆盖全序列

这是 Transformer 能够有效建模长程依赖的关键理论优势。

---

## Experiments & Results

### 机器翻译

- **WMT 2014 EN-DE**：Transformer (big) 达到 28.4 BLEU，超过此前所有模型（含集成模型）超 2.0 BLEU。训练耗时 3.5 天（8 块 P100 GPU）。
- **WMT 2014 EN-FR**：Transformer (big) 达到 41.0 BLEU（单模型），训练成本不到此前 SOTA 的 1/4。
- **训练成本对比（FLOPs）**：Transformer (big) 在 EN-DE 上总训练 FLOPs 为 2.3×10¹⁹，而 ConvS2S 为 9.6×10¹⁸（但 ConvS2S 的 BLEU 为 25.16 vs Transformer 的 28.4），GNMT+RL 为 2.3×10¹⁹（BLEU 24.6）。

### 消融实验（Table 3）

- **注意力头数（A）**：h=1 时 BLEU 下降 0.9（25.8→24.9），h 过少/过多均导致质量下降，h=8 为最优。
- **注意力 key 维度 d_k（B）**：减小 d_k 损害模型质量，说明兼容性函数的计算并不简单，可能需要比点积更复杂的兼容性函数。
- **模型大小（C）**：更大模型更好，d_model 从 256 增至 1024，BLEU 从 24.5 升至 26.0。
- **Dropout（D）**：有效防止过拟合，P_drop=0.1 效果最佳。

### 英语成分句法解析

在 WSJ Penn Treebank 上，4 层 Transformer (d_model=1024) 在 40K 训练句的小数据场景下达到 91.3 F1，超越 BerkeleyParser；半监督设置下 92.7 F1，接近 RNN Grammar（93.3 F1）。

---

## Relevance to This Project

本项目的研究方向涉及注意力机制的底层实现与计算效率分析。Transformer 中 Self-Attention 的 O(n²·d) 复杂度是后续所有高效注意力变体（Sparse Attention、Linformer、FlashAttention 等）的基准线和比较原点。论文 Table 1 提供的四维对比框架（每层复杂度、顺序操作数、最大路径长度、受限变体）是评估任何注意力优化方案的标准化工具。

对于理解 long-context 场景下的效率瓶颈，论文 3.5 节中"当 n > d 时 Self-Attention 不再比 RNN 更高效"这一观察直接点明了长序列的根本挑战，以及论文在 3.5 节末尾提出的受限 Self-Attention（O(r·n·d)）作为优化思路——这正是后来 Sparse Attention、Sliding Window Attention、Linear Attention 等工作的思想萌芽。

此外，Multi-Head Attention 通过降维维持总计算量不变的技巧（d_k = d_v = d_model / h），是后续研究 Multi-Query Attention 和 Grouped-Query Attention 的设计依据。

---

## Limitations & Open Questions

1. **O(n²) 的空间复杂度**：注意力矩阵 P ∈ ℝ^{n × n} 需要 O(n²) 的存储空间，这在长序列上成为内存瓶颈。论文仅提出了受限自注意力的概念性方案，未做实验验证。

2. **受限自注意力未实现**：论文在 3.5 节末尾提到"我们计划在未来的工作中进一步研究这一方法"，但实际上受限自注意力并非本文贡献，而是作为未来方向提出。

3. **注意力头的作用机制**：消融实验表明单头注意力下降 0.9 BLEU，但 Multi-Head 究竟学到了什么样的多样化表示（论文附录展示了一些注意力可视化，但未给出系统性分析），在当时仍是一个开放问题。

4. **位置编码的泛化能力**：正弦位置编码的理论泛化优势（外推到更长的序列长度）未在实验中验证。

5. **训练与推理的不对称性**：训练时所有位置并行计算（teacher forcing），但推理时解码器仍需自回归逐 token 生成，这是 Transformer 推理速度的固有瓶颈，论文未做深入讨论。

6. **对超参数的敏感性**：d_k 的大小显著影响模型质量（减小 d_k 导致 BLEU 下降），说明点积并不一定是理想的兼容性函数，论文也提出"更复杂的兼容性函数可能有益"。

---

## Key References

- **Bahdanau et al. (2014)** — Neural Machine Translation by Jointly Learning to Align and Translate：首次将注意力机制引入 NMT，是 Transformer 注意力设计的重要前驱。
- **Gehring et al. (2017)** — Convolutional Sequence to Sequence Learning (ConvS2S)：基于 CNN 的序列到序列模型，是 Transformer 在 Table 2 中的主要对比对象之一，完全并行但依赖卷积。
- **Kim et al. (2017)** — Structured Attention Networks：探索注意力机制的多种结构化形式，与 Multi-Head Attention 的多子空间思路有关联。
- **Kaiser & Sutskever (2016)** — Neural GPUs Learn Algorithms：ByteNet 的前身，使用卷积处理序列，路径长度 O(log n)。
- **Wu et al. (2016)** — Google's Neural Machine Translation System (GNMT)：基于 LSTM 的当时 SOTA NMT 系统，Transformer 与之对比训练成本。
- **He et al. (2016)** — Deep Residual Learning：Transformer 中残差连接的设计来源。
- **Ba et al. (2016)** — Layer Normalization：Transformer 各子层后使用的归一化方法。
