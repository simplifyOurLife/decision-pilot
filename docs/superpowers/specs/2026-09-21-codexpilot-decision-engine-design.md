# CodexPilot 决策引擎设计

## 1. 背景与目标

CodexPilot 的长期目标是在 Codex 前增加一个低成本决策层，把搜索、读取、测试、重试、回答或升级等高频小判断交给廉价模型，复杂推理和代码修改仍由 Codex 完成。

第一阶段不接管 Codex 流量，也不自动执行任何工具。它只验证一个前置假设：通过 DeepSeek Completion API 的单 Token 候选概率，能否以足够高的准确率、足够低的延迟和成本完成 Codex 开发流程中的路由判断。

第一阶段交付一个 Node.js/TypeScript CLI 和可复用核心库，并附带 JSONL 评测工具及 Codex 路由场景数据集。

## 2. 成功标准

第一阶段必须能够回答以下问题：

1. 单次决策能否稳定返回候选项及可信的候选内归一化概率。
2. 在 Codex 路由评测集上，各类决策的准确率和混淆关系如何。
3. 在不同置信度阈值下，自动决策覆盖率、自动决策准确率和升级率如何变化。
4. 单次请求的延迟、输入 Token、输出 Token 和可配置费用估算是多少。
5. 当前 DeepSeek 账号、模型和 Beta 接口是否满足响应契约。

本阶段不预设最终上线阈值。默认以 `0.90` 作为保守参考值，同时报告 `0.70`、`0.80`、`0.90`、`0.95` 四档结果，由评测数据决定后续阈值。

## 3. 范围

### 3.1 包含内容

- `doctor`：验证环境变量、接口连通性、模型支持和响应结构。
- `decide`：读取 JSON 文件或标准输入，执行一次决策并输出结构化结果。
- `eval`：批量读取 JSONL 数据集，统计质量、覆盖率、延迟和 Token 指标。
- 可复用的 TypeScript 决策引擎接口。
- DeepSeek Completion Provider。
- 约 50 条 Codex 开发流程初始评测样本。
- 单元测试、响应契约测试和显式启用的在线测试。

### 3.2 不包含内容

- HTTP 服务。
- Codex 流量代理或 `codexpilot` 启动器。
- Dashboard。
- 多模型 Provider 实现。
- shell、文件读写、测试运行等工具的自动执行。
- Codex 订阅额度节省比例的最终结论。

上述能力仅在第一阶段数据证明决策引擎值得继续后进入第二阶段设计。

## 4. 技术方案

### 4.1 技术栈

- Node.js 22。
- TypeScript。
- npm。
- Node.js 原生 `fetch` 发送请求。
- 使用轻量的 CLI、运行时 Schema 校验和测试依赖；避免引入 Web 框架。

### 4.2 模块结构

```text
src/
├─ core/
│  ├─ contracts.ts
│  ├─ prompt-builder.ts
│  ├─ probability-normalizer.ts
│  ├─ confidence-policy.ts
│  └─ decision-engine.ts
├─ providers/
│  ├─ decision-provider.ts
│  └─ deepseek-completion-provider.ts
├─ evaluation/
│  ├─ dataset-loader.ts
│  ├─ evaluator.ts
│  ├─ metrics.ts
│  └─ report-writer.ts
└─ cli/
   ├─ doctor-command.ts
   ├─ decide-command.ts
   ├─ eval-command.ts
   └─ main.ts
```

模块职责如下：

- `DecisionEngine`：校验请求、构建候选映射、调用 Provider、归一化概率并应用置信度策略。
- `PromptBuilder`：把状态、问题和候选项编码成机械化分类提示词。
- `ProbabilityNormalizer`：从首个生成位置提取候选 Token 的 logprob，并使用稳定 softmax 计算候选内概率。
- `ConfidencePolicy`：判断结果是否可接受，失败时选择升级。
- `DecisionProvider`：隔离模型调用与核心评分逻辑。
- `DeepSeekCompletionProvider`：实现 DeepSeek Beta Completion API 的请求和响应解析。
- `evaluation`：负责数据集校验、批量运行、指标聚合和报告生成。

## 5. 数据契约

### 5.1 决策请求

```json
{
  "state": "用户要求定位权限校验实现",
  "question": "下一步应该做什么？",
  "options": [
    {"id": "SEARCH", "description": "搜索相关代码"},
    {"id": "READ", "description": "读取已定位文件"},
    {"id": "ESCALATE", "description": "交给 Codex 判断"}
  ]
}
```

约束：

- `state` 和 `question` 均为非空字符串。
- 候选项数量为 2 至 9。
- `options[].id` 在单个请求中唯一。
- 评测数据中的 `expected` 必须引用已有候选 ID。
- `ESCALATE` 是 Codex 路由数据集的必备候选项；通用库不强制业务方使用这个名称。

### 5.2 决策结果

```json
{
  "decision": "SEARCH",
  "confidence": 0.9563,
  "accepted": true,
  "probabilities": {
    "SEARCH": 0.9563,
    "READ": 0.0311,
    "ESCALATE": 0.0126
  },
  "coverage": {
    "complete": true,
    "missingOptions": []
  },
  "usage": {
    "promptTokens": 57,
    "completionTokens": 1,
    "totalTokens": 58
  },
  "latencyMs": 286,
  "model": "deepseek-flash"
}
```

当概率覆盖不完整、响应无效或置信度不足时，`accepted` 为 `false`。在 Codex 路由场景中，调用方将其解释为 `ESCALATE`；核心库保留模型原始首选项和拒绝原因，避免把升级结果误计为模型预测。

## 6. 提示词与评分算法

### 6.1 单 Token 映射

引擎按请求顺序把候选项映射为数字 `1..9`。提示词明确要求模型只输出一个候选数字，并以 `ANSWER=` 结束，让下一个生成 Token 直接承担分类结果。

状态内容被视为不可信数据，使用显式边界包裹，并在提示词中声明边界内文本只作为状态，不得改变分类规则。该措施只能降低提示注入风险，不能作为安全边界，因此评测集中必须包含提示注入样本。

### 6.2 API 请求

DeepSeek Provider 使用可配置的：

- `DEEPSEEK_API_KEY`。
- `DEEPSEEK_BASE_URL`。
- `DEEPSEEK_MODEL`。

默认请求目标为 DeepSeek Beta Completion API。请求设置 `max_tokens=1`、`logprobs=20`、`stream=false`，并采用确定性温度配置。

模型名称和基础地址不在核心逻辑中硬编码。原因是 Beta API 的可用模型可能变化，且用户此前验证成功的 `deepseek-flash` 与当前官方文档列出的模型可能不同。`doctor` 必须通过真实的一次最小请求验证当前配置。

### 6.3 候选概率

对每个候选数字提取首个生成位置对应的 logprob，并使用 log-sum-exp 形式的稳定 softmax：

```text
p_i = exp(logprob_i - maxLogprob)
      / sum(exp(logprob_j - maxLogprob))
```

概率仅在请求候选集合内归一化，不把其他非候选 Token 当成业务候选。

### 6.4 不完整覆盖

如果任一候选数字没有出现在返回的 top logprobs 中：

- 不为缺失候选伪造极小概率。
- `coverage.complete=false`。
- `accepted=false`。
- 记录缺失候选和拒绝原因。
- Codex 路由调用方升级给 Codex。

如果模型输出非候选字符、响应结构变化、内容过滤或服务资源不足，同样拒绝自动决策。

## 7. 置信度策略

默认策略只有在以下条件同时满足时接受结果：

1. 所有候选 Token 均有 logprob。
2. 模型生成的 Token 属于候选集合。
3. 候选内最高概率不低于配置阈值。
4. API 响应和 Token 用量字段通过 Schema 校验。

默认参考阈值为 `0.90`。阈值可通过 CLI 参数覆盖，评测命令固定额外报告四个预设阈值的选择性指标。

## 8. CLI 设计

```powershell
codexpilot doctor
codexpilot decide --input .\request.json
codexpilot eval --dataset .\datasets\codex-routing.jsonl --report .\reports\result.json
```

`decide` 支持文件输入和标准输入，默认输出 JSON。`eval` 在终端输出摘要，并将完整结构化报告写入指定路径。命令失败使用非零退出码，错误输出不包含 API Key、Authorization 请求头或完整原始状态。

## 9. 评测设计

### 9.1 数据集

初始数据集约 50 条，覆盖：

- `SEARCH`：尚未定位代码，需要搜索。
- `READ`：已经定位目标文件，需要读取细节。
- `EDIT`：证据充分，可以进入修改。
- `TEST`：修改完成或需要复现验证。
- `EXECUTE`：需要运行无歧义的诊断命令。
- `ANSWER`：已有足够证据，可以直接回答。
- `ESCALATE`：场景模糊、高风险、候选不充分或需要复杂推理。

数据集中加入边界条件、相近类别、信息不足和提示注入样本。每条样本包含唯一 ID、请求、期望标签、类别和标签说明，便于人工复核。

### 9.2 指标

评测报告包含：

- Top-1 准确率。
- 各类别准确率和混淆矩阵。
- 候选概率完整覆盖率。
- `0.70`、`0.80`、`0.90`、`0.95` 阈值下的自动决策比例、自动决策准确率和升级比例。
- 平均延迟、P50 延迟和 P95 延迟。
- 请求数、成功数、失败数和重试数。
- 输入、输出和总 Token。
- 基于用户提供单价的费用估算。

价格不硬编码。若用户未配置单价，报告只输出 Token 原始数据并把费用标记为不可用。

### 9.3 重试

仅对 HTTP `429` 和 `5xx` 进行有限次数指数退避。请求校验失败、响应 Schema 错误、候选概率不完整和模型输出非法不自动重试，避免掩盖模型契约问题或人为增加成本。

## 10. 测试策略

- 单元测试：请求校验、候选映射、提示词边界、稳定 softmax、缺失候选、非法输出、置信度策略、指标和分位数计算。
- 契约测试：使用脱敏固定响应 Fixture 验证 DeepSeek Completion 响应解析。
- CLI 测试：验证标准输入、文件输入、JSON 输出、退出码和脱敏错误。
- 数据集测试：验证 ID 唯一、候选范围、期望标签和类别覆盖。
- 在线测试：只有显式设置运行开关且存在 `DEEPSEEK_API_KEY` 时才执行，默认测试不联网、不消费额度。

实现阶段采用测试驱动开发，先写失败测试，再实现满足测试的最小代码。

## 11. 安全与隐私

- API Key 仅从环境变量读取，不写入仓库、配置文件、日志或报告。
- 提供 `.env.example` 时只包含变量名和占位说明。
- 默认报告不保存完整状态文本或原始 API 响应，只记录样本 ID、预测、概率、用量、耗时和错误类别。
- 对错误消息和调试输出做请求头及密钥脱敏。
- 引擎只返回建议，不执行 shell、文件操作或任何有副作用的工具。

## 12. 第二阶段入口

第一阶段结束后，根据评测数据决定是否进入 Codex 集成。进入条件不是固定的单一准确率，而是同时考察：高置信度样本的选择性准确率、自动化覆盖率、延迟、成本以及失败时能否稳定升级。

若进入第二阶段，复用 `DecisionEngine` 和 `DecisionProvider` 接口，在其外部设计 Codex 代理、观测指标和 A/B 测试，不修改第一阶段的评分契约。
