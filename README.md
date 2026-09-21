# DecisionPilot

DecisionPilot 是一个面向 Coding Agent 的轻量决策引擎实验项目。它尝试把“下一步搜索、读取、测试、执行、回答还是升级”这类高频小判断交给低成本模型，并把复杂推理和代码修改继续留给 Codex。

## 项目目标

传统 Agent 往往让大模型为每一个工具选择重新读取上下文并生成解释。DecisionPilot 的第一阶段使用 DeepSeek Completion API 的单 Token `logprobs`，把候选操作映射为数字并直接获得候选概率，以验证这种方式能否降低决策成本和延迟。

```text
状态 + 问题 + 候选项
          ↓
   DecisionPilot
          ↓
DeepSeek 单 Token 评分
          ↓
候选概率 + 置信度 + 是否接受
```

## 第一阶段范围

计划提供三个命令：

```text
decision-pilot doctor   验证模型、接口和响应契约
decision-pilot decide   执行一次概率化决策
decision-pilot eval     批量评测准确率、覆盖率、延迟和 Token 用量
```

第一阶段聚焦独立决策引擎和评测，不代理 Codex 流量，不提供 Dashboard，也不会自动执行 shell、文件修改或测试命令。

## 快速开始

运行环境需要 Node.js 22 或更高版本。

```powershell
npm install
npm run build
```

DecisionPilot 不自动读取 `.env` 文件。请在当前终端通过环境变量提供配置，API Key 不要提交到 Git：

```powershell
$env:DEEPSEEK_API_KEY = '你的 API Key'
$env:DEEPSEEK_MODEL = '支持 Completion logprobs 的模型名称'

# 可选配置
$env:DEEPSEEK_BASE_URL = 'https://api.deepseek.com/beta'
$env:DECISION_PILOT_TIMEOUT_MS = '30000'
$env:DECISION_PILOT_MAX_RETRIES = '2'
$env:DECISION_PILOT_INPUT_PRICE_PER_MILLION = '0'
$env:DECISION_PILOT_OUTPUT_PRICE_PER_MILLION = '0'
```

先检查接口和单 Token 概率契约：

```powershell
node dist/src/cli/main.js doctor
```

从文件执行一次决策：

```powershell
node dist/src/cli/main.js decide --input examples/decision-request.json --threshold 0.90
```

也可以通过管道传入 JSON：

```powershell
Get-Content examples/decision-request.json -Raw |
  node dist/src/cli/main.js decide --threshold 0.90
```

## 离线评测

仓库提供 49 条平衡的 Codex 路由样本，每类各 7 条：`SEARCH`、`READ`、`EDIT`、`TEST`、`EXECUTE`、`ANSWER` 和 `ESCALATE`。

```powershell
node dist/src/cli/main.js eval `
  --dataset datasets/codex-routing.jsonl `
  --report reports/codex-routing.json
```

报告包含总体与分类准确率、候选概率覆盖率、混淆矩阵、不同置信度阈值下的接受率与接受样本准确率、P50/P95 延迟、Token 用量和可选成本估算。单条 API 失败不会中断整个批次，报告只保存稳定错误码，不保存原始状态或异常详情。

## 测试

默认测试完全离线：

```powershell
npm test
npm run typecheck
```

真实 DeepSeek 契约测试必须显式开启，并会产生 API 请求和费用：

```powershell
$env:DECISION_PILOT_ONLINE_TEST = '1'
npm test -- tests/online/deepseek-online.test.ts
```

在线测试依赖 DeepSeek Beta Completion API 的 `logprobs`、单 Token 输出和候选覆盖行为。Beta 接口及模型能力可能变化；升级模型或更改基础地址后应先运行 `doctor` 和在线契约测试，不能把历史评测结果视为持续保证。

## 设计原则

- 高置信度决策才允许被调用方接受。
- 候选概率不完整时升级，不伪造缺失概率。
- 模型、基础地址和价格均可配置，不硬编码易变化的信息。
- API Key 只通过环境变量读取，不进入日志和评测报告。
- 默认测试完全离线；真实 API 测试必须显式开启。
- 底层保持 Provider 边界，首版只实现 DeepSeek。

## 当前状态

当前仓库已实现核心评分库、DeepSeek Provider、CLI、离线评测和 Codex 路由评测集。它仍是验证性 MVP，不承诺降低 Codex 订阅额度；应先验证准确率、选择性覆盖率、延迟和 Token 成本，再决定是否进入更深层集成。

## 输入输出

请求示例：

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

结果示例：

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
  }
}
```

## 项目边界

DecisionPilot 是独立实验项目，不隶属于 OpenAI、Codex 或 DeepSeek。它不代理或拦截 Codex 请求，也不会替 Codex 自动执行工具、shell、测试或文件修改。模型输出具有不确定性；即使置信度较高，也不应直接用于高风险或不可逆操作。
