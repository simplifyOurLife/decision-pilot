import { describe, expect, it } from 'vitest';

import { loadEnvironment } from '../../src/config/environment.js';
import { DecisionEngine } from '../../src/core/decision-engine.js';
import { DeepSeekCompletionProvider } from '../../src/providers/deepseek-completion-provider.js';

const online = process.env.DECISION_PILOT_ONLINE_TEST === '1' ? it : it.skip;

describe('DeepSeek 在线契约', () => {
  online('返回完整候选概率和单 Token 用量', async () => {
    const environment = loadEnvironment(process.env);
    if (!environment.ok) {
      throw new Error(`在线测试环境配置缺失：${environment.errors.join(', ')}`);
    }

    const engine = new DecisionEngine(
      new DeepSeekCompletionProvider(environment.createProviderConfig())
    );
    const result = await engine.decide({
      state: '尚未定位用户提到的类型定义',
      question: '下一步应该做什么？',
      options: [
        { id: 'SEARCH', description: '搜索类型定义' },
        { id: 'READ', description: '读取已定位文件' },
        { id: 'ESCALATE', description: '交给 Codex 深入判断' }
      ]
    });

    expect(result.coverage.complete).toBe(true);
    expect(result.usage.completionTokens).toBe(1);
  });
});
