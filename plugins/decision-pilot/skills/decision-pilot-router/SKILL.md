---
name: decision-pilot-router
description: Use when Codex has at least two reasonable next actions and the DecisionPilot MCP tools are available for shadow-mode routing.
---

# DecisionPilot Router

## 核心边界

DecisionPilot 的建议只是观测信号，不是执行授权。无论建议、置信度或 accepted 为何，都必须独立遵守用户意图、权限、安全规则和正常的 Codex 工作流。

## 工作流

1. 仅当下一步存在至少两个合理候选动作时调用；候选中始终包含 ESCALATE。
2. 构造最小必要输入。state 只描述决策所需状态，不发送密钥、完整文件、长日志或无关上下文。options 必须是对象数组：

    {
      "state": "已定位到失败测试，但尚未修改代码",
      "question": "下一步做什么？",
      "options": [
        { "id": "SEARCH", "description": "继续收集根因证据" },
        { "id": "EDIT", "description": "修改已确认的问题" },
        { "id": "ESCALATE", "description": "请求用户提供关键选择或权限" }
      ]
    }

3. 调用 decision_pilot_recommend 一次。把返回值当作参考，独立选择实际动作；绝不因推荐结果自动执行、扩大权限或绕过确认。
4. 通过正常 Codex 流程执行实际选择。
5. 若响应含 traceId，调用 decision_pilot_record_outcome，如实记录：
   - actualAction：实际采取的候选 id，即使它与推荐不同。
   - outcome：只能是 SUCCEEDED、FAILED 或 SKIPPED。
   - 不为了“匹配推荐”而修改结果标签。

## 故障处理

任一 DecisionPilot 调用失败时，不循环重试，不阻塞原任务，也不改变正常决策流程。继续按已有证据工作；没有 traceId 时不记录结果。

## 快速检查

- 至少两个合理候选，且包含 ESCALATE
- options 是 { id, description } 对象数组
- 输入最小化且无秘密
- 推荐不等于授权
- 记录真实动作和枚举结果
- 工具失败时正常降级
