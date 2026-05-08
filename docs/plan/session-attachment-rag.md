# Session Attachment RAG v1

## 背景

当前聊天附件处理有两条路径：

- 小文件会直接注入对话 context
- 大文件虽然会先做 preview，但在多轮对话里仍可能通过 `read_file` / `search_file_content` 逐步把大量正文重新带入 context

这会带来两个问题：

1. 大文件 follow-up 的 token 成本容易持续上涨
2. 当前链路没有把“聊天附件问答”建模成独立的 session 级检索资产，生命周期、清理、可观测性都不足

v1 的目标不是做最强 retrieval，而是先把 desktop 端大文件附件从“渐进式读完整文”切换成“上传后 ingest，问答时检索证据”。

## 目标

- 仅在 desktop 客户端为大文件聊天附件启用 session 级 RAG
- 继续保留小文件直接内联到 context 的体验
- desktop 大文件附件的预处理 parser follow 全局 `documentParser` setting
- 当前实现中，该能力仅对支持 `read-file` tool use 的模型生效
- 复用现有远程 embedding 模型调用链
- 将大文件问答的正文注入从“逐步逼近全文”改成“按需检索少量证据”
- 为会话级附件检索资产建立独立 DB、状态机、清理机制
- 当 parse 或 embedding 失败时，直接进入失败状态并向用户显式报错
- 为后续 chunk 参数和检索策略调优提供可复跑的评测基线

## 非目标

- 不改变 web / mobile 的附件行为
- 不在 v1 引入 BM25、contextual retrieval、section 摘要
- 不把会话附件直接升级成用户可见的 Knowledge Base
- 不做 provider-specific tokenizer 分流

## 产品边界

### 平台边界

- 仅 `desktop` 启用新链路
- `web` / `mobile` 保持现状

### 文件分流

- 单文件 token 阈值固定为 `7.5k`
- desktop 附件预处理 follow 全局 `documentParser` setting，再基于解析文本做分流
- 对 parse 后文本，若字节数超过快速阈值（当前实现为 `32 KiB`），则直接进入 session-RAG，不再做全文 token 精算
- 仅对未超过字节阈值的文档继续做全文 token 估算，用于和 `7.5k` 阈值比较
- `<= 7.5k tokens`：
  - 继续沿用现有附件预处理与 `<ATTACHMENT_FILE>` 注入
  - 保留 `read_file` / `search_file_content`
- `> 7.5k tokens`：
  - 标记为 large retrieval attachment
  - 不再默认全文注入
  - 不再把“逐步读完整文”作为主路径

### 用户体验

- 大文件上传后显示索引状态：`indexing` / `ready` / `failed`
- 索引未就绪时允许发问；工具说明里会暴露附件仍在 `pending/indexing`
- 索引失败时允许重试，但不回退到旧的全文/文件工具路径
- 若大文件命中 session-RAG 分流，但当前账号缺少 Chatbox AI embedding 能力，则在附件卡片上直接标记错误并阻止发送，不进入 ingest
- 后续 UI 需要逐步补充成本可见性：
  - attachment card 展示索引状态与 chunk 数量
  - 对 quota 敏感用户展示索引成本提示

## 总体架构

### 设计原则

- 结构优先切分，大小必须受控
- 检索单元和上下文单元分离
- desktop 大文件是否使用 `local` / `chatbox-ai` / `mineru` parser 取决于全局 `documentParser` setting
- 优先复用现有 KB embedding 基础设施
- 质量优先，但不允许文档正文在多轮对话中无上限膨胀

### 数据流

1. 用户在 desktop 聊天中上传文件
2. 预处理阶段按当前 `documentParser` setting 解析文件，再用字节阈值快速判断是否直接进入 RAG；仅较小文档继续做全文 token 估算
3. 小文件走原链路；大文件进入 session attachment ingest
4. desktop main process 读取预处理阶段存下来的解析文本，再切分 parent / child、生成 embedding、写入 session-rag DB 与向量索引
5. 对话时，模型通过 session attachment retrieval tools 检索当前问题相关证据
6. 系统回拉 bounded parent blocks 注入到模型，而不是回读整份文件

## 存储设计

### 独立数据库

v1 使用独立 DB：

- `chatbox_session_rag.db`

原因：

- Knowledge Base 是用户长期资产
- Session attachment RAG 是会话临时资产
- 两者生命周期、清理策略、排障边界不同

### 元数据表

#### `session_attachment`

- `id`
- `session_id`
- `message_id`
- `attachment_storage_key`
- `filename`
- `mime_type`
- `file_size`
- `token_estimate`
- `parser_type`
- `status`
- `error`
- `created_at`
- `processing_started_at`
- `completed_at`

#### `session_attachment_parent`

- `id`
- `attachment_id`
- `parent_order`
- `section_path`
- `doc_type`
- `page_start`
- `page_end`
- `text`
- `token_estimate`
- `char_count`

#### `session_attachment_chunk`

- `id`
- `attachment_id`
- `parent_id`
- `chunk_order`
- `section_path`
- `page_start`
- `page_end`
- `raw_text`
- `embedded_text`
- `token_estimate`

### 向量索引

- 每个大附件独立一个向量索引
- 索引名：`sa_{attachment_id}`

这样删除附件时可以直接删除整份索引，不需要在共享大索引里做复杂清理。

## 解析、切分与 Embedding

### Parser

附件预处理遵循全局 `documentParser` setting：

- `desktop` 默认值是 `local`
- `web` / `mobile` 默认值是 `none`
- `web` / `mobile` 虽然共享同一个 parser setting，但不会进入 session-RAG
- 只有 `desktop` 在命中大文件分流后，才会把 parse 结果送入 session-RAG ingest
- 对纯文本文件，当前实现仍优先走本地解析
- 当 parser setting 为 `local` 时，当前实现仍保留“local 失败或空内容时 fallback 到 Chatbox AI parser”的旧逻辑
- 若 parse 失败，则不进入 session-RAG ingest，直接向用户报错

### 中间表示

当前实现中的 ingest 数据主要保留：

- `text`
- `section_path`
- `parent_order`
- `chunk_order`
- `token_estimate`
- `char_count`

另外，表结构中已经预留了 `doc_type`、`page_start`、`page_end` 等字段，但当前 session attachment ingest 还没有稳定填充页码 / 位置范围。

### 切分策略

v1 采用“两段式”策略：

- 强结构类型：先按结构切分，再按大小兜底
- 其他类型：直接固定大小切分

#### Parent block

- 作用：给模型阅读的上下文单元
- 强结构类型先按标题、列表、代码块、表格等结构边界切分
- 其他类型直接按固定大小切分，不做结构启发式
- 默认参数：
  - `target = 1600 tokens`
  - `hard cap = 2400 tokens`
- 强结构类型中，任何 parent 超过 `hard cap` 必须继续拆分
- 当前参数以实现稳定性优先；后续应基于评测结果考虑收紧 parent 尺寸，减少单轮证据注入成本

#### Child chunk

- 作用：embedding 与检索单元
- 从 parent 内继续切分
- 默认参数：
  - `size = 448 tokens`
  - `overlap = 64 tokens`
- 当前参数以实现稳定性优先；后续应基于评测结果验证是否收紧到更小、更聚焦的 child chunk

### 类型规则

- 强结构类型：
  - `md`
  - `mdx`
  - `json`
  - `jsonl`
  - `ts`
  - `tsx`
  - `js`
  - `jsx`
  - `py`
  - `go`
- 这些类型先走结构切分，再按大小兜底
- 其他所有本地 parser 可读文本一律按固定大小切分

### Embedding

#### 复用现有模型调用链

不新增新的 embedding provider 协议。直接复用现有 KB 链路：

- `src/main/knowledge-base/model-providers.ts`
- `createModel()`
- `getTextEmbeddingModel()`
- `embedMany()`

所有 embedding 都在 desktop main process 中执行。

#### 模型来源

- session attachment RAG 不再复用 KB 的 embedding 配置选择
- 固定使用：`chatbox-ai:text-embedding-3-small`
- 不新增“聊天附件 RAG 专用 embedding 设置页”
- 这使 session attachment RAG 的 embedding 行为保持一致，避免因用户 KB 配置变化导致结果漂移

#### `embedded_text` 构造

每个 child 在 embedding 前构造：

```text
[文件名 > section_path > page_range]
raw_text
```

规则：

- 文件名必带
- `section_path` 有则带上
- `page_range` 有则带上
- `raw_text` 保持原文
- `embedded_text` 仅用于 embedding / retrieval，不直接向用户展示

## Retrieval 与对话注入

### 总体策略

当前实现采用固定两段式检索：

1. 先做 embedding 粗召回，`recallTopK = 20`
2. 若当前用户允许使用 rerank，且成功拿到 `/api/remote_config/knowledge_base_models` 返回的 `rerank` 模型，则对 child chunk 候选做 rerank
3. 对 rerank 后结果按 `parentId` 去重，再返回较小结果集

若当前用户不允许使用 rerank，或 rerank 失败，则直接回退到纯 embedding 排序结果。

### Toolset

desktop large attachment 注入新的 retrieval tools：

- `list_session_attachments`
- `query_session_attachment`
- `read_session_attachment_parents`

small attachment 继续使用现有文件工具。

### Rerank

- rerank 模型不单独配置，renderer 侧通过 `/api/remote_config/knowledge_base_models` 获取
- 当前使用 `knowledge_base_models.rerank`
- session attachment RAG 复用现有 Cohere-compatible rerank 逻辑
- 只对 child chunk 候选做 rerank
- parent block 不参与 rerank，只在最终结果阶段按 `parentId` 去重
- 免费用户不使用 rerank，直接走 embedding 排序
- rerank 失败时静默降级回 embedding 排序，不影响主链路

### 返回数量

- embedding 粗召回固定 `20`
- 最终返回数量由 `limit` 控制，默认 `8`，最大 `12`
- 当前不再保留 `focused / expanded / broad` 模式

### Context 注入

- large attachment 不再直接注入全文
- large attachment 不再默认注入大 preview
- 系统只通过 retrieval tools 访问大文件
- 注入内容使用 bounded parent blocks，而不是整章或整份文件
- 如果 attachment 的 session-RAG 状态为 `failed`，则保留失败状态并提示用户重试

### 多轮对话

v1 不追求“每轮总 token 不增长”，而追求：

- 文档证据部分不失控
- 不再因为大文件逐步读完而逼近全文

策略：

- 每轮默认重新检索
- 当前未实现“最近命中的 `parent_ids` 作为优先候选”的状态记忆
- 当前也未实现自动去重注入策略，主要依赖模型选择合适的 tool 调用

## 评测与参数校准

v1 虽然先以稳定落地为主，但后续迭代必须由评测驱动，而不是仅凭感觉调整 chunk 大小和 top-k。

### 评测目标

- 衡量检索是否能稳定命中正确证据
- 衡量多轮问答的文档相关 token 成本是否明显低于旧链路
- 为 parent / child 默认参数调整提供依据

### 最小评测集

- 至少准备 3 类文件：
  - 长 PDF / 报告
  - Markdown / 技术文档
  - 长代码文件
- 至少准备 20-30 条 query，并为其标注期望命中的证据片段或 parent block

### 评测指标

- `recall@5`
- `recall@10`
- 平均注入 parent 数量
- 平均文档相关注入 tokens
- 最终回答正确率或人工通过率

### 参数调整原则

- 若 recall 不足，则优先调整 chunking 和召回参数
- 若 recall 足够但 token 成本偏高，则优先收紧 parent / child 参数
- 参数调整应通过同一评测集做前后对比，避免主观判断

## 生命周期与清理

### 创建

- 大文件预处理后创建 `session_attachment`
- 初始状态为 `pending`
- worker 拉起 ingest 后转为 `indexing`

### 删除

以下动作都必须清理元数据和向量索引：

- 删除附件
- 删除所属消息
- 删除所属 session

### 启动清理

- 应用启动时，将残留的 `indexing` 任务标记为 `failed`
- renderer 启动后会执行一次 orphan reconcile：
  - 用当前 session / message 真相对照 session-rag DB
  - 清理 session 或 message 已不存在的 attachment 与向量索引
- 之后会周期性重复该 reconcile，避免本地长期残留孤儿 attachment

### 后续容量护栏

以下约束不要求第一阶段全部实现，但应作为后续 phase 的明确方向：

- 对 session-rag 存储占用提供可视化和清理入口
- 为单个 session 的大文件数量设置合理上限
- 为本地索引占用空间设置极端保护阈值，避免桌面端长期堆积

## 失败策略

- parser 失败：
  - 不进入 session-RAG ingest
  - 直接向用户报错
- parser 结果为空，或后续没有切出任何可检索的 parent / child chunk 时，也视为失败
- embedding 失败：`failed`
- 对明显临时性的 embedding 错误（如网络错误、429、临时 5xx），当前实现会做有限重试
- embedding 的 quota / 权限类错误同样直接失败，不回退旧路径
- 索引未完成：`indexing`
- retrieval 无结果：
  - 模型收到“未从附件中检索到足够相关内容”的显式结果
  - 不自动回退全文读入
- 固定 embedding 模型不可用、license 缺失或权限不足：
  - 对于缺少 Chatbox AI embedding 能力的情况，发送前直接阻止进入 ingest
  - 其他场景下 ingest 失败并展示错误
- 对用户可见的失败提示需要尽量区分：
  - 文档无法被索引
  - 固定 embedding 模型不可用或权限不足
  - embedding 配额或网络错误
  - 当前不再自动回退到旧文件工具路径

## Phase 拆分

### Phase 0：方案文档

- 落地本方案到 `docs/plan/session-attachment-rag.md`

### Phase 1：Session RAG 基础设施

- 新建 `chatbox_session_rag.db`
- 建立表结构与 DB 访问层
- 建立索引命名规则与基础清理能力

### Phase 2：Ingest 与 Embedding

- 新增 session-rag worker
- desktop 大文件使用预处理阶段按当前 `documentParser` setting 得到的解析文本结果
- 复用 embedding 调用链
- 实现 parent / child 切分
- 写入元数据与向量索引

### Phase 3：聊天链路接入

- 附件按 `7.5k` 分流
- desktop large attachment 创建 ingest 任务
- context builder 不再全文注入 large attachment
- 为 large attachment 注入 retrieval tools
- parse / embedding 失败时，直接失败并提示用户重试

### Phase 4：检索执行与 UI

- 实现 session attachment retrieval toolset
- 接入固定召回 + 可选 rerank
- 在附件卡片展示 indexing / ready / failed
- 完成删除联动清理
- 补充索引状态、chunk 数量和必要的成本可见性展示
- 评估是否需要对 quota 敏感用户增加上传前提示

### Phase 5：测试与评估

- 单元测试
- 集成测试
- 与旧链路做 token / 命中率 / 正确率对比
- 建立可复跑的评测集与 `recall@k` 基线
- 基于评测结果决定是否收紧 parent / child 默认参数

## 验收标准

- desktop 大文件多轮问答不再出现“逐步读完整文”
- 文档相关 token 成本明显下降
- 对复杂问题的回答质量不因死板预算明显下降
- web / mobile 行为保持不变
