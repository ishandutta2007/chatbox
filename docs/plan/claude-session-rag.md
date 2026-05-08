# Session-Scoped Attachment RAG — 技术设计文档

> **目标**：对话中用户上传的超阈值文档进入 session-rag 管线，每轮对话只把 top-k 相关片段（~2K tokens）送给 LLM，大幅降低点数消耗。
>
> **核心约束**：预处理阶段不把全文过 LLM（chunking 走规则，embedding 走云端小模型）。全文永远不会进 LLM。

---

## 1. 目标与边界

### 1.1 背景

Pro 用户月度 12M CP，在最贵常用模型（GPT 5.4，0.4 tokens/CP）下 ≈ 4.8M tokens/月。用户若上传 50K 文档做 10 轮对话，`read_file` 工具路径消耗 250K~500K tokens（占月度 5–10%），几次对话就烧完额度。问题不在于 context window 不够（现代模型 200K+），而在于按轮把整份文档送进 LLM 太贵。

### 1.2 目标

- 超阈值文档进 RAG 管线，每轮只把 top-k 相关片段（~2K tokens）送 LLM
- 10 轮对话总消耗压到 ~20K tokens 量级（相比现状 10× 降本）
- 预处理零 LLM 调用
- **仅 Desktop 实现**；Mobile/Web 保持 `read_file` 工具路径

### 1.3 非目标

- 不追求宏观总结型问题的质量（"这份文档的核心论点是什么"）—— 这类问题固有需要全文入 LLM
- 不实现 Contextual Retrieval / GraphRAG / ColBERT / ColPali
- 不支持 Mobile/Web 的向量检索
- 不做 PDF/DOCX/EPUB 的结构化解析（保留 heading、页码等）
- 不做 JSON/YAML/TOML/XML 的结构化切分

---

## 2. 核心设计

### 2.1 阈值判断（两段式）

Parse 成功后判断是否进入 session-rag：

```
1. byteLength > 32_000 ?  → session-rag（跳过 tokenizer）
2. else:
   tokens = tiktoken.encode(text)
   tokens > 7_500 ?        → session-rag
   else                    → 全文注入（现有路径）
```

**常量**：
- `BYTES_FAST_PATH_LIMIT = 32_000`
- `MAX_INLINE_FILE_TOKENS = 7_500`

> **未来与 agent mode 的冲突（TODO）**：仅以"文件大小"为单一判据，未来 agent mode 上线后会有冲突——例如 100KB 的 `.xlsx` 按字节数会被路由到 session-rag，但表格压扁成纯文本后向量检索效果差，应交给 agent mode 用 SQL/公式直接查询。届时需在本节判断流程**最前面**加一层扩展名白名单路由（常规文档类型如 PDF / DOCX / Markdown / 代码走 session-rag，表格 / 演示等走 agent mode）。V1 不实现此白名单。详见 §2.20。

**32KB 快速路径无误判**：各编码场景下 32KB 对应 tokens 均 ≥ 8K，必超 7.5K：

| 编码 | 密度 | 32KB 对应 tokens |
|---|---|---|
| 纯英文 | ~4 字节/token | ~8K |
| 中英混合 | ~3 字节/token | ~10K |
| 纯中文 UTF-8 | ~1.5–2 字节/token | ~16K |

**7.5K 阈值推导**：Pro 月度 4.8M tokens × 40% 文档预算 = 1.92M；假设 50 次文档对话/月、每次 8 轮、50% prompt cache 命中，单次对话文档消耗约 5.2T；故单文件 T ≤ 1.92M / (50 × 5.2) ≈ 7.4K。

### 2.2 父子分块（Small-to-Big）

| 指标 | 值 | 作用 |
|---|---|---|
| small chunk | 256 tokens, overlap 25 | embedding 与检索，语义聚焦 |
| parent chunk | 目标 ~800 tokens | 注入 LLM 上下文，语义完整 |
| parent hard cap | 1200 tokens | 防整章无分段导致的上下文爆炸 |
| min chunk | 64 tokens | 低于此与相邻合并，避免碎片 |

**每轮查询上下文预算**：top-3 parent × 平均 700 tokens ≈ 2.1K tokens（最坏 3 × 1200 = 3.6K）。

### 2.3 切分边界（两条显式 pipeline）

Chunking 以两条独立顶层函数表达设计意图：

```ts
// src/main/session-attachment-rag/chunking.ts
export function chunkStructuredDocument(
  content: string,
  extension: string,
): ChunkPair[]   // 用于 .md / .mdx / .py / .ts / .tsx / .js / .jsx

export function chunkPlainDocument(
  content: string,
): ChunkPair[]   // 用于所有其他扩展名（弱结构兜底）
```

两条 pipeline 的分发由扩展名判断：强结构扩展名走 `chunkStructuredDocument`，其余走 `chunkPlainDocument`。

**`chunkStructuredDocument` 内部**（按扩展名调用对应 splitter）：

| 扩展名 | 边界规则 |
|---|---|
| `.md`, `.mdx` | `^#{1,3}\s` |
| `.py` | `^(def\|class)\s` |
| `.ts`, `.tsx`, `.js`, `.jsx` | 顶层 `export function/class` + 模块级 `const`/`type`/`interface` |

产出的 chunk 带有 `section_path`（例："Section 1 > 1.2 Background"）。

**`chunkPlainDocument` 内部**：
- Recursive 字符切分：separators `["\n\n\n", "\n\n", "\n", "。", " ", ""]`
- 产出的 chunk 的 `section_path` 为空

**共享参数**（两条 pipeline 相同）：
- small chunk 256 tokens, overlap 25
- parent chunk 目标 ~800 tokens, hard cap 1200
- min chunk 64 tokens（低于此合并到相邻）

### 2.4 上下文增强：前缀注入

每个 chunk 的 embedding 输入前加 `[fileName > section_path]\n`。`section_path` 由 heading / code splitter 产出（例：`"Section 1 > 1.2 Background"`）；recursive-splitter 的 chunk 留空。

### 2.5 Embedding

- **模型与可用性从 `/api/session_rag/config` 获取**（见 §2.16），本方案不硬编码模型名；默认值（config 不可达时的兜底）：`chatbox-ai:text-embedding-3-small`，512 维
- **通道**：`/gateway/openai/v1/embeddings`
- **鉴权与计费**：backend `CheckPermission` 对 embedding 直接放行（`utils.go:64-68`，所有 plan 可用）；`CheckQuotaWithReset`（`utils.go:103`）仍计入用户 token quota；未登录（无 license key）→ 401 报错

### 2.6 文档 Parse

遵循全局 `settings.documentParser` 设置。复用 `src/main/knowledge-base/parsers/` 下的 `parseFileWithRouter` + `getEffectiveParserConfig`；调用时只传全局 config（不做 per-session 覆盖）。

支持的 parser：

| Parser | 能力 | 前置条件 |
|---|---|---|
| `local`（默认） | officeparser 文本抽取 + epub + iconv 读纯文本 | 无 |
| `chatbox-ai` | 远程 parse + OCR（扫描件 PDF 可用） | Chatbox AI license |
| `mineru` | 高精度远程 parse + OCR | MinerU API token |

**Parser 失败兜底**：沿用知识库现有行为——`local` parser 失败（如 officeparser 抛错）时，自动 fallback 到 `chatbox-ai` parser 重试一次。其他 parser 失败不做跨类型 fallback（直接进 §2.10 失败处理）。

**Parse 后的结构完整性**（影响 chunker 分流）：

| 源文件 | 结构保留 |
|---|---|
| `.md` / `.mdx` / `.ts` / `.py` 等文本原生 | ✅（任何 parser 都走 iconv 原样读） |
| `.pdf` / `.docx` / `.pptx` / `.xlsx` / `.epub` | ❌（所有 parser 都返回纯文本） |

Chunker 路由键是文件扩展名，与 parser 选择无关。

### 2.7 存储

单库多表 + `session_id` 字段过滤。DB 路径：`{userData}/databases/chatbox_session_rag.db`。

```
chatbox_session_rag.db
├── session_attachment          // 元数据 + 状态机
├── session_attachment_parent   // parent chunks
├── session_attachment_chunk    // small chunks
└── Mastra LibSQLVector 托管的向量表
```

### 2.8 查询架构

**V1 采用 Push 模式**：应用层在每轮消息发送前自动 recall + rerank，把证据（top-3 parent chunks）直接注入 user message。模型收到消息时已经带着相关片段，不需要额外决策。**不依赖模型 tool-use 能力**。

`src/shared/context/builder.ts` 保持纯函数，通过 `AttachmentRetriever` 抽象层访问检索结果：

```
buildContext(messages, { retriever, ... })  [shared, pure]
    │  抽 messages 中最新 user query
    │  对每个已索引的附件调 retriever.retrieve(fileKey, query, opts)
    │  把返回的 chunks 通过 buildRetrievalAttachment 拼到当前 user message 尾部
    ▼
AttachmentRetriever 接口  [src/shared/context/types.ts]
    │
    ▼ 依赖注入（renderer 实现）
RagAttachmentRetriever  [src/renderer/context/rag-retriever.ts]
    │  sessionRag:query IPC（入参含 RetrievalStrategy）
    ▼
Main: retrieval-service.query(attachmentId, query, strategy)
  1. 查 attachment.indexStatus:
     - ready    → 继续
     - failed   → 空返回（上层按 §2.10 处理 UI）
     - indexing → 短轮询（最多 2s）后再判断
     - 无记录   → 空返回
  2. 走 RAG:
     - embed query
     - vector search:
         capabilities.session_attachment_rerank = false → top-5 small chunks
         capabilities.session_attachment_rerank = true  → top-20 small chunks
     - 后者额外：rerank → top-8（失败静默 fallback 到 vector 顺序）
     - dedup by parent_id
     - fetch top-3 parent chunks (~2.1K tok)
  3. 返回 AttachmentChunk[]
```

**Pull 模式**（模型通过 tool 主动检索，与当前知识库一致）不在本方案。原因：依赖 tool-use 能力、模型可能不主动调、多一轮 API 往返，对"一次性问答"场景 ROI 不如 Push。未来若数据显示 Push 模式的 top-3 召回不够灵活（例如同一文档需多次不同角度查询），可再补 Pull 模式作为 tool-use 模型的增强路径。

### 2.9 平台分流

```ts
if (platform.type === 'desktop') {
  const byteLength = Buffer.byteLength(parsedContent, 'utf8')
  if (byteLength > 32_000) {
    → session-rag pipeline
  } else if (estimateTokens(parsedContent) > 7_500) {
    → session-rag pipeline
  } else {
    → 全文注入路径
  }
} else {
  → read_file pipeline（Mobile/Web 保持现状）
}
```

判断在 parse 成功之后进行。parse 失败的处理见 §2.10。

### 2.10 失败处理

失败直接报错，不降级到 read_file。UI 在附件 card 上显示错误码对应文案 + "重试"按钮。

| 阶段 | 场景 | 错误码 |
|---|---|---|
| Parse (all) | 抽取 < 100 字符（扫描件 PDF / 空文档） | `PARSE_EMPTY` |
| Parse (local) | officeparser 崩溃 / 编码检测失败 | `PARSE_ERROR` |
| Parse (chatbox-ai) | 网络错误 / 5xx（重试后失败） | `PARSE_REMOTE_NETWORK` |
| Parse (chatbox-ai) | 401 未登录 / license 无效 | `PARSE_REMOTE_UNAUTHED` |
| Parse (chatbox-ai) | 402 额度不足 | `PARSE_REMOTE_QUOTA` |
| Parse (chatbox-ai) | 文件 > 50MB（backend error 20010） | `PARSE_SIZE_LIMIT` |
| Parse (mineru) | API token 无效 | `PARSE_REMOTE_UNAUTHED` |
| Parse (mineru) | 文件 > 200MB | `PARSE_SIZE_LIMIT` |
| Parse (mineru) | 任务超时 / 失败 | `PARSE_REMOTE_NETWORK` |
| Embedding | 网络错误（重试 3 次后失败） | `EMBEDDING_NETWORK` |
| Embedding | 401 未登录 | `EMBEDDING_UNAUTHED` |
| Embedding | 402 quota 耗尽 | `EMBEDDING_QUOTA` |
| Embedding | 5xx | `EMBEDDING_SERVER` |
| Rerank | 任意失败 | **例外**：静默 fallback 到 vector 顺序，不标记 failed，不报错 |

失败后 `attachment.indexStatus = 'failed'`，用户可重试或删除附件。发送消息时 builder 跳过该附件的 RAG 注入（retriever 返回空）。用户可通过 UI 重试或删除附件。

### 2.11 上传前置检测

文件大小 > 32KB 时，在 `InputBox` 选择文件 callback 中、parse 之前校验前置条件：

```
const parserType = settings.documentParser?.type ?? 'local'
const hasChatboxLicense = !!getLicenseKey()
const config = hasChatboxLicense ? await getSessionRagConfig() : null   // 见 §2.16

// 分支 1：BYOK / 未登录用户 — 引导走知识库（不引导登录）
if (!hasChatboxLicense) {
  → 弹引导 modal：
      "该文件较大，session-rag 索引需要 Chatbox AI 账号。
       建议改用「知识库」功能管理大文档（支持 BYOK 自配 embedding 模型，
       且文档持久化保留以便长期查询）。"
      [ 前往知识库 ]  [ 取消上传 ]
  return  // 不再进入后续逻辑
}

// 分支 2：已登录用户的能力/配置校验
const missing: string[] = []

// embedding 能力（已登录用户也可能因 capability 关闭而不可用）
if (!config!.capabilities.session_attachment_embedding) {
  missing.push('embedding-not-available')
}

// parser 特定前置条件
if (parserType === 'mineru' && !settings.documentParser.mineru?.apiToken) {
  missing.push('mineru-token')
}

if (missing.length) {
  → 弹阻塞 modal，按 missing 内容展示提示
    [ Open Settings ]  [ Cancel upload ]
}
```

用文件字节数而非 token 数作为前置阈值：token 判断需要先 parse，前置检测阶段用 `file.size` 可以零成本拿到；32KB 下必然触发 session-rag，无误判。

**BYOK fallback 设计原则**：
- **不引导用户登录 Chatbox AI**（避免强制绑卡换功能的体验问题）
- **引导到知识库**：知识库已经支持 BYOK 自配 embedding provider（OpenAI / Voyage / Mistral 等），且文件持久化保留，比临时 session-rag 更适合"我有自己的 OpenAI key 想做大文档问答"的用户
- 如果用户后续主动登录 Chatbox AI，session-rag 自动可用，无需用户做额外操作

**覆盖矩阵**（file > 32KB）：

| 登录状态 × parser | 结果 |
|---|---|
| 登录 + local | 进入 session-rag |
| 登录 + chatbox-ai parser | 进入 session-rag |
| 登录 + mineru（有 token） | 进入 session-rag |
| 登录 + mineru（无 token） | modal 引导配置 token |
| **未登录 / 纯 BYOK** | **modal 引导改用知识库**（不引导登录） |

### 2.12 Rerank

**模型与可用性从 `/api/session_rag/config` 获取**（见 §2.16）。默认兜底：`chatbox-ai:chatbox-rerank-1`。

**启用策略**：仅当 `capabilities.session_attachment_rerank === true` 时，`RetrievalStrategy` 才打开 rerank。前端通过该 flag 预判，避免对不支持的用户发无效请求。

| 用户状态 | Vector top-N | Rerank | 失败降级 |
|---|---|---|---|
| `capabilities.session_attachment_rerank = false` | 5 | 跳过 | N/A |
| `capabilities.session_attachment_rerank = true` | 20 | 精排 → top-8 | 静默 fallback 到 vector 顺序 |

扩大初始召回到 top-20 是 rerank 起效的前提 —— 足够多的候选才能让 rerank 重排出差异。

**延迟预算**：embed 200ms + vector 50ms + rerank 400ms + fetch 20ms ≈ 700ms，发生在 LLM 调用之前。

**紧急关闭**：env flag `CHATBOX_SESSION_RAG_RERANK_DISABLED=1`。

### 2.13 入库时机（Parse → Embed 无间隔）

**原则**：用户上传文件后，**parse 结束立即触发 embedding，不等待用户点发送**。整条管线 `preparation → indexing → embedding` 在上传流程内串联跑完，中间无用户交互阻塞点。

**执行顺序**（由 `indexing-worker.ts` 驱动）：

```
file selected
  ↓
InputBox 前置检测（§2.11）—— 阻塞点 1（可能弹 modal）
  ↓
INSERT session_attachment(indexStatus='pending')
  ↓
preparation-service.prepare()
  ├─ parse（file-parser-adapter）
  ├─ 阈值分流（§2.1）
  └─ 产出 PreparedAttachment
  ↓
indexStatus 'pending' → 'indexing'
  ↓
indexing-service.index()   ← 紧接 parse 之后，无人工延迟
  ├─ chunking
  ├─ embedding（cloud call，可能并发批量）
  └─ 写入 db + vectors
  ↓
indexStatus 'indexing' → 'ready'
```

**UI 语义**：
- 上传瞬间：card 显示"准备中"（preparation 阶段，通常 < 1s；远程 parser 可能 5-15s）
- Parse 成功后无缝切到"索引中…" + 取消按钮
- 完成后显示"已索引 · N chunks"

**为什么不等用户点发送**：
- 用户上传往往和发送意图紧紧相邻；等点发送再 embed 会让首次对话平白多 5-15s 延迟
- 用户上传后即使不发送，浪费的只是 embedding tokens（Pro 用户月度 1%）—— 比发送时卡顿好
- 前置检测（§2.11）已拦截"无 license / 无 token"等确定浪费的场景

**取消（只有这一种中断方式，无"暂停"概念）**：
- **取消 = 删除附件**，产品上是同一动作。用户在附件 card 上点击"删除"即等同于取消上传；**不单独做"取消索引"UI 入口**
- 执行动作：中止 worker 任务 + 删除 `session_attachment` 表行（含 CASCADE 清理已写入的 parent/chunk + vectors）
- **上传过程中用户切走 session 视同取消**：worker 检测到 session 切换后中止任务并执行同样的清理（不保留 pending 记录，不做暂停续跑）

**不做"懒 indexing"**：不支持"用户点发送时才开始 embed"的延迟模式。这是有意决策（性能 > 理论节约）。

> ⚠️ **实现注意：临时状态 + 新 session 关联**
>
> 本节定义的"上传即 index、切走视同取消"规则，在实现层面涉及多处**时序与关联关系**尚未收敛，Phase 1 进入编码前需产出详细实施方案。待澄清点至少包括：
>
> 1. **Attachment 与 session 的绑定时机**：上传时 `message_id` 还未生成（消息尚未发送）；`session_attachment` 表的 `message_id` 字段在 indexing 阶段写什么？（候选：上传阶段生成一个 pending message id / 置空直到发送时回填）
> 2. **新建 session 的场景**：用户在 session A 上传文件后，点击"新建 session" / "发送到新对话" / 侧栏切到别的 session 分别如何处理？哪些算"切走"？
> 3. **Session 切换的精确判定**：`currentSessionId` 变化 = 切走？需要考虑后台自动切换、模态框打开等边缘触发源
> 4. **取消时的资源释放**：正在调用的 embedding / parser 远程请求如何 abort（需要 `AbortController` 串联）；已写入的部分 vectors 如何回滚（保证幂等删除）
> 5. **取消后再回到 session 的用户期望**：此时附件已消失，还是保留一个"已取消"占位？（本方案倾向完全清理，需确认 UI 是否一致）
> 6. **多附件并发上传中部分取消**：一条消息绑定 3 个附件，用户只取消其中 1 个，怎么处理其余在 pending/indexing 状态的附件
> 7. **消息发送前的 `session_attachment` 孤儿**：用户上传但一直未发送也不取消，这些记录的归属与过期策略
>
> 落地时建议先产出 "state 时序图 + session 切换事件列表 + 7 种边缘场景对照表"，code review 后再开始实现。实现原则是尽可能简单，例如新对话中无论何种状态，只要切走一律算作取消，不做任何保留

### 2.14 Context 注入格式

RAG 返回的 parent chunks 在发送时拼到**当前**用户最新 message 的文本尾部，不触碰历史 message：

```xml
<ATTACHMENT_FILE>
  <FILE_INDEX>1</FILE_INDEX>
  <FILE_NAME>paper.pdf</FILE_NAME>
  <FILE_KEY>parseFile-abc123</FILE_KEY>
  <FILE_LINES>1234</FILE_LINES>
  <FILE_SIZE>52341 bytes</FILE_SIZE>
  <INDEX_INFO>indexed · 87 chunks · retrieval mode</INDEX_INFO>
  <RETRIEVED_CONTEXT count="3">
    <CHUNK index="1" section="Chapter 3 > Methods" lines="142-189">
      ...parent chunk 1 text...
    </CHUNK>
    <CHUNK index="2" section="Chapter 5 > Results" lines="302-341">
      ...parent chunk 2 text...
    </CHUNK>
    <CHUNK index="3" section="Appendix A" lines="801-823">
      ...parent chunk 3 text...
    </CHUNK>
  </RETRIEVED_CONTEXT>
  <HINT>Top-3 retrieved sections auto-injected for this query. These are excerpts, not the full file.</HINT>
</ATTACHMENT_FILE>
```

外壳沿用现有 `<ATTACHMENT_FILE>` 以复用 `FILE_KEY` 作为未来扩展 tool 的引用锚点。内芯用 `<RETRIEVED_CONTEXT>` + `<CHUNK>` 明确"这是片段而非全文"，每个 chunk 带 `section` 和 `lines` 帮助模型精确引用位置。注入逻辑在 `src/shared/context/attachment-payload.ts` 新增 `buildRetrievalAttachment(fileMeta, chunks)`。

### 2.15 两层 Ingest 架构（PreparationService + IndexingService）

入库流程拆成两个独立的 service，各自单一职责、独立测试面：

```
PreparationService                     IndexingService
─────────────────────────────          ─────────────────────────────
职责：                                 职责：
  • 文件可读性                          • chunking（§2.3 两条 pipeline）
  • parser 选择（§2.6）                 • embedding
  • 文本抽取 + 失败 fallback            • vector index 写入
  • byteLength / tokens 阈值分流        • indexStatus 状态机
                                        (pending → indexing → ready/failed)
输出 PreparedAttachment:               消费 PreparedAttachment：
  { content, parserUsed, extension,    chunk → embed → 写 repo
    byteLength, tokens, fileMeta }
```

两层解耦的实际意义：
- Parser 迭代（新增 OCR、调参）只动 PreparationService 与 file-parser-adapter
- Indexing 升级（换 chunker、加 rerank、批量 embedding）不影响 PreparationService
- 测试可分别 mock 一端：测 IndexingService 时注入一个固定的 `PreparedAttachment` 即可

两者由 `workers/indexing-worker.ts` 顺序组装：`PreparationService.prepare()` → 若成功则 `IndexingService.index()`。Service 之间不直接互相 import（见 §7.2 分层约束）。

### 2.16 Backend Config Endpoint

Embedding / rerank 的模型名和 license 级可用性从 backend 获取，不在客户端硬编码：

```
GET /api/session_rag/config
Authorization: Bearer <licenseKey>

Response:
{
  "data": {
    "models": {
      "embedding": "chatbox-ai:text-embedding-3-small",
      "rerank":    "chatbox-ai:chatbox-rerank-1"
    },
    "capabilities": {
      "session_attachment_embedding": true,
      "session_attachment_rerank":    false
    }
  }
}
```

**客户端缓存策略**：
- 主进程在 app 启动时拉一次，写入内存
- 每次用户切换 license（登录/登出/换 key）时刷新
- TTL 1 小时，后台自动续期
- 若 config 拉取失败：使用默认值（`chatbox-ai:text-embedding-3-small` / `chatbox-ai:chatbox-rerank-1`），capabilities 按保守策略（embedding 允许，rerank 禁用）

**capabilities 使用点**：
- `session_attachment_embedding = false` → 触发 §2.11 前置 modal（上传前阻塞）
- `session_attachment_rerank = false` → `RetrievalStrategy.rerank.enabled = false`（查询时跳过 rerank）

### 2.17 Retrieval Strategy（内部策略对象）

Renderer → Main 的 query IPC 传策略对象而非散参数。对 LLM tool 仍暴露简单接口。

```ts
// 内部：IPC 契约
interface RetrievalStrategy {
  vectorTopK: number              // 初始向量召回
  parentTopK: number              // 最终 parent chunks 数（默认 3）
  rerank: {
    enabled: boolean
    model: string                 // 从 /api/session_rag/config 注入
    topK: number                  // rerank 保留数（默认 8）
  }
}

// renderer 构造（基于 capabilities）：
const strategy: RetrievalStrategy = capabilities.session_attachment_rerank
  ? {
      vectorTopK: 20,
      parentTopK: 3,
      rerank: { enabled: true, model: config.models.rerank, topK: 8 },
    }
  : {
      vectorTopK: 5,
      parentTopK: 3,
      rerank: { enabled: false, model: '', topK: 0 },
    }

// IPC:
await window.electron.sessionRag.query({
  attachmentId,
  query,
  strategy,
})
```

策略对象的收益：
- IPC 契约稳定：将来加 `bm25Weight` / `sectionFilter` / `recencyBoost` 不需要改方法签名
- Renderer 负责业务语义（"这用户用不用 rerank"），Main 进程只管执行策略
- 测试主进程 retrieval 时，传入各种 strategy 覆盖分支即可
- 若未来引入 `search_document` tool（§10 展望），tool 只暴露 `query` + `limit` 给模型，内部构造完整 strategy，界面稳定

### 2.18 Availability vs IndexStatus（运行时分离）

两个维度的状态分开理解：

| 维度 | 来源 | 取值 |
|---|---|---|
| **availability** | 运行时从 `/api/session_rag/config` 的 capabilities 推导（不落表） | `allowed` / `blocked` |
| **indexStatus** | DB 字段，随 indexing pipeline 推进 | `pending` / `indexing` / `ready` / `failed` |

组合语义：

| availability | indexStatus | UI 表现 |
|---|---|---|
| blocked | — | "需要 Chatbox AI 订阅" / "需登录"（阻塞上传或提示升级） |
| allowed | pending | "等待入库" |
| allowed | indexing | "索引中…" + 取消按钮 |
| allowed | ready | "已索引 · N chunks" |
| allowed | failed | 错误码对应文案 + 重试按钮 |

**schema 只存 indexStatus**（见 §4.1），availability 是查询时从 config 推导出来的 derived state。这样 user plan 变化时无需写回 DB，前端每次查 config 就能拿到最新状态。

### 2.19 对模型能力的要求

**V1 不依赖模型 tool-use 能力**。Push 模式下，top-3 parent chunks 在发送前已通过 `buildRetrievalAttachment` 拼到 user message 内，任何能理解文本的模型都能直接使用。

所有 provider / 模型（含未支持 tool-use 的模型）都能使用 session-rag。

### 2.20 与 Agent Mode 的边界（TODO，V1 不实现）

**问题**：V1 仅按文件大小（§2.1）路由到 session-rag。这在未来 agent mode 上线后会冲突——某些文件类型用 agent mode 处理更合适：
- 表格（`.xlsx` / `.xls` / `.ods`）：压扁为纯文本后丢失公式 / 单元格关系 / 行列结构，向量检索召回文本碎片，不如 agent mode 用 SQL / 公式直接查
- 演示（`.pptx` / `.ppt` / `.odp`）：丢失 slide 顺序与版式，不如 agent mode 按 slide 单位浏览

**未来扩展点**：在 §2.1 判断流程**最前面**加一层"扩展名白名单"路由：白名单内的常规文档（PDF / DOCX / Markdown / 代码 / 数据文本等）走 session-rag；白名单外的（表格 / 演示等）路由到 agent mode。

**V1 不实现此白名单**。当前所有文件按 §2.1 单一规则走，可能造成上述类型的回答质量略差。等 agent mode 设计就绪时再做此项扩展。

**预留接入点**：未来集中维护 `SESSION_RAG_ALLOWED_EXTENSIONS` const（位置待定），上线 agent mode 时只动这个 const 与 §2.1 判断流程，session-rag 内部实现不变。

---

## 3. 上传 & 查询管线

```
┌──────────────────────────────────────────────────────────────────┐
│                        Upload Pipeline                           │
│                                                                  │
│  User selects file                                               │
│        │                                                         │
│        ▼                                                         │
│  [ file.size > 32KB? ]  (pre-parse)                              │
│     No │     Yes ─────────────────────────┐                      │
│        │                                  ▼                      │
│        │   Pre-flight checks:                                    │
│        │     • 未登录 / 纯 BYOK ──► 引导走「知识库」modal          │
│        │     • MinerU token 缺失 ──► 引导配置 modal                │
│        │     • embedding capability=false ──► 提示不可用           │
│        │     Pass │                                              │
│        │         ▼                                               │
│        │   parseFileWithRouter(config=settings.documentParser)   │
│        │             │                                           │
│        │             ▼                                           │
│        │   [ content length ≥ 100? ]                             │
│        │     No ──► Mark FAILED (PARSE_EMPTY / PARSE_*)          │
│        │     Yes │                                               │
│        ▼         │                                               │
│  full-inline    parse done                                       │
│                  │                                               │
│                  ▼                                               │
│            [ tokens > 7.5K? ]                                    │
│              No ──► full-inline                                  │
│              Yes │                                               │
│                  ▼                                               │
│            Route splitter by extension:                          │
│              .md/.mdx          → heading-splitter                │
│              .py/.ts/.tsx/     → code-splitter                   │
│                .js/.jsx                                          │
│              else              → recursive-splitter              │
│                  │                                               │
│                  ▼                                               │
│            Build small / parent chunk pairs                      │
│              small 256 tok, overlap 25                           │
│              parent ~800, hard cap 1200                          │
│                  │                                               │
│                  ▼                                               │
│            Prefix-inject "[fileName > section_path]\n"           │
│                  │                                               │
│                  ▼                                               │
│            Cloud embedding (chatbox-ai:text-embedding-3-small)   │
│            Success → write libsql + vectors                      │
│            Failure → mark FAILED (EMBEDDING_*)                   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                         Query Pipeline                           │
│                                                                  │
│  User sends message                                              │
│        │                                                         │
│        ▼                                                         │
│  Embed query (cloud)                                             │
│        │                                                         │
│        ▼                                                         │
│  Vector search:                                                  │
│    Free  → top-5                                                 │
│    Lite+ → top-20                                                │
│        │                                                         │
│        ▼                                                         │
│  [ Plan is Lite+? ]                                              │
│     No │     Yes ───────┐                                        │
│        │                ▼                                        │
│        │     Rerank (chatbox-rerank-1) → top-8                   │
│        │     on failure: keep vector order                       │
│        │                │                                        │
│        ▼◄───────────────┘                                        │
│  Dedup by parent_id                                              │
│        │                                                         │
│        ▼                                                         │
│  Fetch top-3 parent chunks (~2.1K tok)                           │
│        │                                                         │
│        ▼                                                         │
│  Build <RETRIEVED_CONTEXT> XML,                                  │
│  append to current user message                                  │
│        │                                                         │
│        ▼                                                         │
│  LLM call                                                        │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. 数据模型

### 4.1 libsql schema

```sql
CREATE TABLE session_attachment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  attachment_storage_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER,
  token_estimate INTEGER,
  parser_type TEXT,
  index_status TEXT NOT NULL,    -- 'pending' | 'indexing' | 'ready' | 'failed'
  error TEXT,
  error_code TEXT,               -- PARSE_* / EMBEDDING_*，供 UI 区分失败类型
                                 -- 注意：availability 不存 DB，运行时从 §2.16 config 推导
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processing_started_at DATETIME,
  completed_at DATETIME
);

CREATE TABLE session_attachment_parent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attachment_id INTEGER NOT NULL,
  parent_order INTEGER NOT NULL,
  section_path TEXT,
  doc_type TEXT,
  page_start INTEGER, page_end INTEGER,
  text TEXT NOT NULL,
  token_estimate INTEGER,
  char_count INTEGER,
  FOREIGN KEY (attachment_id) REFERENCES session_attachment(id) ON DELETE CASCADE
);

CREATE TABLE session_attachment_chunk (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attachment_id INTEGER NOT NULL,
  parent_id INTEGER NOT NULL,
  chunk_order INTEGER NOT NULL,
  section_path TEXT,
  page_start INTEGER, page_end INTEGER,
  raw_text TEXT NOT NULL,        -- 原文
  embedded_text TEXT NOT NULL,   -- 前缀注入后的版本（实际喂给 embedding）
  token_estimate INTEGER,
  FOREIGN KEY (attachment_id) REFERENCES session_attachment(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES session_attachment_parent(id) ON DELETE CASCADE
);

CREATE INDEX idx_session_attachment_session_id ON session_attachment(session_id);
CREATE INDEX idx_session_attachment_index_status ON session_attachment(index_status);
CREATE INDEX idx_session_attachment_parent_attachment_id ON session_attachment_parent(attachment_id);
CREATE INDEX idx_session_attachment_chunk_attachment_id ON session_attachment_chunk(attachment_id);
CREATE INDEX idx_session_attachment_chunk_parent_id ON session_attachment_chunk(parent_id);
```

向量数据由 Mastra `LibSQLVector` 托管在独立 table，通过 `chunk.id` 关联。

### 4.2 MessageFile 扩展

```ts
// src/shared/types/session.ts
interface MessageFile {
  // ...existing
  ragIndexed?: boolean   // true = 已入 session-rag
  chunkCount?: number    // small chunks 数量，UI 显示用
}
```

---

## 5. 生命周期与 Maintenance

### 5.1 事件触发的生命周期操作

| 事件 | 操作 |
|---|---|
| 上传超阈值文件 | `INSERT session_attachment(indexStatus='pending')` → AttachmentPreparation → SessionAttachmentIndexing |
| 删除附件 | ① 查 `session_attachment_chunk` 拿 chunk.id<br>② `vectorStore.deleteMany(chunkIds)`<br>③ `DELETE FROM session_attachment WHERE id = ?`（CASCADE 删 parent/chunk） |
| 删除 session | `DELETE FROM session_attachment WHERE session_id = ?`（同上需显式清 vectors） |
| 应用启动 | Maintenance 模块执行：清僵尸记录 + 校验 db 占用 + 触发超限清理 |
| 用户主动"清除附件索引缓存" | Maintenance 模块提供：清空三张表 + drop Mastra vectors |

**Mastra vector 清理**：Mastra 的 vectors table 不在业务 schema 内，CASCADE 不会自动清理，删除逻辑必须在业务层显式执行（顺序见上表）。

### 5.2 Maintenance 模块

`src/main/session-attachment-rag/maintenance.ts` 集中管理所有容量治理与清理逻辑。一开始就抽成独立模块，避免将来加新策略时改动散落。

**职责**：
- 僵尸记录清理（`indexStatus='indexing'` 但无对应 worker 运行）
- 容量监控（db 大小、总 chunk 数、session 附件数）
- 超限清理策略（软上限超出时提示 + 最老附件优先建议删除）
- 用户主动清缓存入口
- 将来扩展位：LRU 淘汰、时间淘汰（N 天未访问自动删）、db 压缩

**触发时机**：
- 应用启动：执行僵尸清理 + 容量检查
- 定时（每日）：执行容量检查
- 用户操作：显式清缓存

### 5.3 Dev Pane

为便于开发阶段检查本地 libsql / vector 状态，实现一个仅 debug query 开启的 Session-RAG Dev Pane。

**入口**：
- 触发条件：`window.location.search` 包含 `debug=true`
- UI 位置：Sidebar 底部悬浮 `Dev` 按钮
- 点击后打开 `Session-RAG Dev Pane`
- 仅 Desktop 可用；非 Desktop 无需 dev pane

**展示内容**：
- DB 路径
- DB 文件大小
- 总数统计
- 状态统计
- 向量索引表名列表
- 最近 attachments 列表

**操作**：
- `Refresh`：重新读取 debug snapshot
- `Run Maintenance`：手动执行一次 maintenance pass，并刷新 snapshot
- `Clear DB`：二次确认后清空全部 Session-RAG libsql 数据与 vector indexes


**边界**：
- Dev Pane 只用于开发和本地排障，不作为面向用户的 storage 管理入口

---

## 6. 配额与设置

### 6.1 软配额

- 全局 db 大小软上限 **1GB**
- 单 session 入库大文件数上限 **10**
- 全局总 chunk 数软上限 **100,000**

超上限时 UI 提示用户清理。

### 6.2 附件 Card 显示

入库后附件 card 显示"已索引 · N chunks · 消耗 X tokens"，让用户对成本有可量化感知。

**Free 用户不做上传前 modal 阻塞**：embedding 单价极低，Free 用户即使索引一份中等文档，quota 消耗也可忽略；rerank 这种昂贵特性对 Free 用户已经在 capability 层关闭（§2.12）。直接允许 Free 用户上传，card 上的"消耗 X tokens"已提供足够的事后反馈。

### 6.3 Settings 入口

`Settings → Storage` 新增：
- **清除所有附件索引缓存**：清空三张表 + drop Mastra vectors
- 显示占用空间（db 文件大小 + 总 chunk 数）

---

## 7. 模块清单

### 7.1 主进程（`src/main/session-attachment-rag/`）

扁平结构，每个文件单一职责，按后缀识别角色（`*-service.ts` 为业务服务）。

```
src/main/session-attachment-rag/
├── index.ts                 // barrel：导出公共 API
├── ipc.ts                   // IPC 薄适配器（不含业务）
├── types.ts                 // 类型 + 错误码 + IndexStatus（集中定义）
├── db.ts                    // libsql 连接 + schema + 类型化查询函数
├── embedder.ts              // /gateway/openai/v1/embeddings 调用
├── reranker.ts              // /v1/rerank 调用
├── file-parser-adapter.ts   // 适配 knowledge-base/parsers（含 local→chatbox-ai fallback）
├── config-service.ts        // /api/session_rag/config 调用 + 内存缓存 + 刷新
├── preparation-service.ts   // parse + 阈值分流 → PreparedAttachment
├── indexing-service.ts      // 消费 PreparedAttachment：chunk → embed → 写库 + 状态机
├── retrieval-service.ts     // 按 RetrievalStrategy 编排 embed → vector → rerank → parent
├── maintenance-service.ts   // 僵尸清理、容量检查、用户清缓存
├── chunking.ts              // 导出 chunkStructuredDocument / chunkPlainDocument
├── splitter/
│   ├── heading.ts           // .md / .mdx
│   ├── code.ts              // .py / .ts 家族
│   └── recursive.ts         // 递归兜底
└── indexing-worker.ts       // 后台 loop：poll pending → 调 preparation → indexing
```

`IndexStatus` 的状态转移不独立建模块，在 `indexing-service.ts` 内部用 switch/guard 处理即可。错误码用 `types.ts` 的 `SessionRagErrorCode` 联合字面量类型 + 普通 `Error` 即可，不需要专门的 error class。

### 7.2 唯一的依赖约束

**Service 不直接写 SQL；数据访问统一通过 `db.ts` 导出的类型化函数。**

其他依赖关系用工程判断，不引入形式化层级规则：
- `types.ts` 是叶子，不 import 业务逻辑
- `ipc.ts` / `indexing-worker.ts` 是入口，负责组装 service
- Service 之间如需协作可直接 import，不强制绕路

### 7.3 与雏形的对齐

雏形 `src/main/session-attachment-rag/` 已存在的文件 → 新结构映射：

| 雏形 | 新位置 |
|---|---|
| `index.ts` | 保留，作为 barrel |
| `db.ts` | 保留，扩充类型化查询函数 |
| `ipc-handlers.ts` | 改名为 `ipc.ts` |
| `file-loaders.ts` | Phase 1 拆成 `preparation-service.ts` + `indexing-service.ts` + `indexing-worker.ts` |
| `chunking.ts` | 主流程保留；splitter 抽到 `splitter/` 子目录 |
| `model-providers.ts` | 移除（embedding 模型从 config-service 注入） |

### 7.4 共享层 / 渲染层

**新增**：
| 文件 | 作用 |
|---|---|
| `src/shared/context/types.ts` 的 `AttachmentRetriever` 接口 | 检索抽象（与现有 `AttachmentResolver` 并列） |
| `src/shared/context/attachment-payload.ts` 的 `buildRetrievalAttachment()` | 构造 §2.14 的 XML |
| `src/renderer/context/rag-retriever.ts` | `RagAttachmentRetriever` 实现（调 IPC） |

**修改**：
| 文件 | 改动 |
|---|---|
| `src/shared/context/builder.ts` | 从 options 接收 `retriever`；抽当前 query；对已索引附件调 `retriever.retrieve()` 拿 chunks → `buildRetrievalAttachment` 拼到 user message 尾部 |
| `src/shared/context/types.ts` | `ContextBuilderOptions` 增加 `retriever: AttachmentRetriever` |
| `src/renderer/stores/sessionHelpers.ts` | 构造 retriever 注入 `buildContext` |
| `src/renderer/stores/session/crud.ts` | `deleteSession` 触发 rag 清理 |
| `src/renderer/components/InputBox/` | 前置检测（§2.11）；附件 card 展示 availability + indexStatus + 索引完成后消耗信息 |
| `src/shared/types/session.ts` | `MessageFile` 新增 `ragIndexed` / `chunkCount` |
| `src/renderer/modals/Settings.tsx` | 新增"清除附件索引缓存" |
| `src/preload/index.ts` | IPC 桥接：`sessionRag:insert` / `query`（入参含 strategy）/ `delete` / `getConfig` |

---

## 8. 分阶段实施

### Phase 0 — 评测集脚手架（2–3 天）

- `test/session-rag/fixtures/`：3 份测试文档（PDF、Markdown、长代码文件）
- `test/session-rag/queries/eval-set.json`：20–30 条 query + ground truth chunk ids
- `test/session-rag/eval.ts`：计算 `recall@5` / `recall@10`
- 产出：`pnpm eval:rag` 命令

### Phase 1 — 最小可跑的父子分块 RAG（1–1.5 周）

**基础设施**：
1. `types.ts`：定义 `PreparedAttachment` / `RetrievalStrategy` / `AttachmentChunk` / `SessionRagConfig` / `SessionRagErrorCode` / `IndexStatus`
2. `db.ts`：从雏形迁移，扩充类型化查询函数（attachment / parent / chunk / vector 的 CRUD）
3. `embedder.ts`：调 `/gateway/openai/v1/embeddings`
4. `file-parser-adapter.ts`：包装 `parseFileWithRouter` + `getEffectiveParserConfig`，实现 local → chatbox-ai fallback

**chunking**：
5. `chunking.ts` + `splitter/recursive.ts`：通用递归切分（small 256/25, parent ~800 hard cap 1200）；Phase 1 只导出 `chunkPlainDocument`

**services**：
6. `config-service.ts`：调 `/api/session_rag/config` + 内存缓存 + 登录态变化刷新；config 不可达时用默认值
7. `preparation-service.ts`：文件可读性 → file-parser-adapter → 两段式阈值判断（§2.1）→ `PreparedAttachment`
8. `indexing-service.ts`：消费 `PreparedAttachment` → chunking → embedder → db（含 IndexStatus 转移）
9. `retrieval-service.ts`：按 `RetrievalStrategy` 编排 embed query → vector search → parent 聚合（rerank 留 Phase 2.5）
10. `maintenance-service.ts`：应用启动时僵尸清理

**入口**：
11. `indexing-worker.ts`：后台 loop，poll pending → 调 preparation → indexing
12. `ipc.ts`：IPC 薄适配：`sessionRag:insert` / `query`（入参含 `strategy`）/ `delete` / `getConfig`

**前端集成**：
13. 前置检测（§2.11）：`InputBox` 选择文件后做两类校验：(a) 未登录/纯 BYOK → 引导改用知识库 modal；(b) 已登录用户 → 校验 capabilities + parser token
14. 失败处理（§2.10）UI：附件 card 显示 errorCode 对应文案 + 重试
15. 新增 `AttachmentRetriever` 接口 + `RagAttachmentRetriever`；`buildContext` 接收 retriever 并调用
16. Context 注入（§2.14）：`buildRetrievalAttachment()` + 附在当前 user message 尾部

**评测**：
17. 跑 Phase 0 eval 记录 recall 基线

**验收标准**：
- Desktop 登录用户上传 50K 文档 → 入库成功
- BYOK 未登录用户上传 > 32KB 文件 → modal 拦截
- Parse / embedding 失败 → 附件 card 显示错误码文案 + 重试按钮
- 10 轮对话 tokens 消耗 ≤ 30K
- `recall@5 ≥ 0.60`（基于 retriever 返回的 chunks 评测）
- 删除 session → 三张表行 + vector 一并清理
- Mobile/Web 路径不受影响
- `buildContext` 的 mock retriever 单元测试通过
- 字节数 > 32KB 的文件上传不触发 tokenizer

### Phase 2 — 强结构 chunking（3–5 天）

1. `splitter/heading.ts`：`.md` / `.mdx`，边界 `^#{1,3}\s`
2. `splitter/code.ts`：`.py` / `.ts` / `.tsx` / `.js` / `.jsx`（Python `^(def|class)\s`；TS/JS 顶层 `export function/class` + 模块级 `const`/`type`/`interface`）
3. `chunking.ts` 增加 `chunkStructuredDocument`，内部按扩展名调上述 splitter，均产出 `section_path`
4. `indexing-service.ts` 按扩展名分发到 structured 或 plain pipeline
6. 前缀注入：每个 chunk 的 embedding 输入前加 `[fileName > section_path]\n`
7. Parent hard cap 1200 强制切分逻辑
8. 评测：对比 Phase 1 的 recall 数据

**验收标准**：
- Markdown 文件 `recall@5` 提升 ≥ 10%
- Python / TS / JS 代码文件 `recall@5` 提升 ≥ 10%
- 其他扩展名回退到 recursive，行为与 Phase 1 一致
- 无 parent chunk 超过 1200 tokens

### Phase 2.5 — Rerank 精排（3–5 天）

1. `reranker.ts`：调 `/v1/rerank`，模型从 config 注入；复用 `knowledge-base/model-providers.ts:233-309` 的 CohereClient 模式
2. `retrieval-service.ts` 增加 rerank 分支：按 `RetrievalStrategy.rerank.enabled` 决定是否调 reranker
3. Renderer 侧：根据 `config.capabilities.session_attachment_rerank` 构造 strategy，避免对不支持的用户发无效请求
4. Rerank 任意失败 → 在 retrieval-service 内静默 fallback 到 vector 顺序，不阻塞 query
5. Env flag `CHATBOX_SESSION_RAG_RERANK_DISABLED=1` 紧急关闭
6. 评测：对比 Phase 2 数据

**验收标准**：
- 支持 rerank 的用户 `recall@3` 相对 Phase 2 提升 ≥ 10%
- Rerank 失败时 query 不报错
- 不支持 rerank 的用户不触发 API 调用（前端预判）
- Query 端到端延迟（含 rerank）≤ 1.2s p95

### Phase 3 — UI 完善（3–5 天）

1. UI：附件 card 显示 `availability` + `indexStatus` 组合状态（§2.18 表格）
2. UI：索引完成后附件 card 显示"已索引 · N chunks · 消耗 X tokens"（§6.2）
3. UI：失败状态的附件 card 显示 errorCode 对应文案 + 重试按钮
4. Settings 新增"清除附件索引缓存"入口（调 `maintenance-service.ts`）

**验收标准**：
- 附件 card 清楚展示 availability + indexStatus + 索引消耗信息 + 失败重试

### Phase 4 — Maintenance 强化（3–5 天）

1. `maintenance-service.ts` 扩展：
   - db 大小检测与提示
   - 单 session 文件数上限（10）
   - 总 chunk 数上限（100K）
   - 僵尸记录清理周期化（启动 + 每日）
2. session 重命名 / 导出 / 导入 的边缘情况测试

**验收标准**：
- 长期运行后无孤儿记录堆积
- 超配额时有明确提示和用户操作路径
- 所有清理/治理逻辑收敛在 `maintenance-service.ts`

### Phase 5（可选）— 性能与观测

- Embedding 批量化（单次请求多 chunk）
- Chunking 并行化（worker thread）
- 埋点：入库时长、query 延迟、recall 命中率

---

## 9. 风险与应对

| 风险 | 可能性 | 影响 | 应对 |
|---|---|---|---|
| Embedding API 延迟高 | 中 | 上传体验差 | 批量请求 + 后台异步；UI 显示"索引中" |
| Tokenizer 卡渲染进程 | 低 | 大文件阈值判断慢 | §2.1 字节数快速路径，绝大多数大文件不触发 tokenize |
| Rerank API 不稳定 | 中 | Lite+ 召回质量退回 vector 级 | 静默 fallback；日志追踪；feature flag 紧急关闭 |
| Free 感知回答质量差异 | 低 | 用户抱怨 | UI 不主动对比；质量差异作为 upgrade incentive |
| 召回精度不达预期（recall < 60%） | 中 | 回答质量下降 | Phase 3 `read_file` 兜底；后续迭代 chunker |
| libsql 向量索引规模效应 | 低 | 查询延迟 | 单 session 文件 / chunk 上限 |
| 用户跨设备同步 | 高（长期） | 索引丢失 | 不支持跨设备同步索引；同步后自动重建 |
| 需升级 embedding 模型 | 低 | 已建索引维度不兼容 | 升级时批量清空旧索引，下次查询触发重建（用户感知 1 次 loading） |
| 关闭应用时索引未完成 | 中 | 部分文件无法 RAG | 状态持久化到 DB，启动时续跑 |
| 扫描件/图片型 PDF + local parser | 中 | 索引为空 | `PARSE_EMPTY` + UI 提示切换 parser（chatbox-ai / mineru） |
| 用户切换 parser 后 | 低 | 已索引文件不受影响 | parser 只影响新上传；已 ready 沿用旧结果 |
| BYOK 未登录用户上传大文件 | 高 | 无法使用 session-rag | §2.11 modal 引导改用知识库（KB 支持 BYOK 自配 embedding） |
| 表格/演示文件被路由到 session-rag | 中 | 召回质量差（结构丢失） | 已知问题；V1 不做扩展名路由，等未来 agent mode 上线时通过白名单解决（§2.20） |
| Free 用户 embedding 消耗日度 quota | 低 | 用户抱怨 | embedding 单价极低，索引一份中等文档消耗可忽略；card 展示"消耗 X tokens"提供事后反馈 |
| `/api/session_rag/config` 不可达 | 低 | 无法判定 capabilities | 用默认值兜底；capabilities 保守（rerank 禁用、embedding 允许）；上次成功结果内存缓存 |
| Push 的 top-3 召回不够灵活（同一文档多角度提问时片段固定） | 中 | 回答质量下降 | 后续可补 `search_document` tool 让 tool-use 模型按需多查 |

---

## 10. 不在本方案中

- **Pull 模式（模型通过 tool 主动检索）**：V1 采用 Push；Pull 可作为未来增强（对 tool-use 模型补充 `search_document` tool 让其按需多次查询）
- **Agent mode 集成 + 扩展名白名单路由**：表格 / 演示等文件应交给未来 agent mode 处理；V1 仅按文件大小判断会有冲突（§2.20）。届时在 §2.1 判断流程最前面加一层扩展名白名单门控，留作 TODO
- **BYOK 自配 embedding / rerank provider**：V1 不开放（BYOK 用户被引导改用知识库，§2.11）；未来可考虑让 session-rag 也支持自配 provider，代价是 schema 加 `embedding_model` 字段
- **Mobile/Web RAG 能力**：保持 `read_file` 工具路径（mobile 可行性调研见内部记录）
- **PDF/DOCX/EPUB 的结构化解析**（保留 heading / 页码）：用户可用知识库
- **JSON/YAML/TOML/XML 的结构化切分**
- **Contextual Retrieval**：需全文过 LLM，违背成本目标
- **Multi-modal 图片 / 表格特殊处理**：需 VLM
- **跨 session 文件去重**
- **跨设备同步索引**

---

## 11. 参考资料

- [Anthropic Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)
- [LlamaIndex SentenceWindowNodeParser / AutoMergingRetriever](https://docs.llamaindex.ai/en/stable/examples/node_postprocessor/MetadataReplacementDemo/)
- [LangChain RecursiveCharacterTextSplitter](https://api.python.langchain.com/en/latest/character/langchain_text_splitters.character.RecursiveCharacterTextSplitter.html)
- 项目内参考实现：`src/main/knowledge-base/`（持久化知识库 RAG）
