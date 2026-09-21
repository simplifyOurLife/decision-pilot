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

## 设计原则

- 高置信度决策才允许被调用方接受。
- 候选概率不完整时升级，不伪造缺失概率。
- 模型、基础地址和价格均可配置，不硬编码易变化的信息。
- API Key 只通过环境变量读取，不进入日志和评测报告。
- 默认测试完全离线；真实 API 测试必须显式开启。
- 底层保持 Provider 边界，首版只实现 DeepSeek。

## 当前状态

项目正在实现 MVP。当前仓库已完成需求和架构收敛，接下来将依次交付核心评分库、DeepSeek Provider、CLI 和 Codex 路由评测集。

在 MVP 完成前，仓库不提供可安装版本，也不承诺能够降低 Codex 订阅额度。第一阶段会先用数据验证准确率、选择性覆盖率、延迟和 Token 成本，再决定是否进入 Codex 代理集成。

## 计划中的输入输出

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

DecisionPilot 是独立实验项目，不隶属于 OpenAI、Codex 或 DeepSeek。模型输出具有不确定性；即使置信度较高，也不应直接用于高风险或不可逆操作。
