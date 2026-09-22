import { describe, expect, it, vi } from 'vitest';

import type { ProviderResult } from '../../src/core/contracts.js';
import { DecisionEngine } from '../../src/core/decision-engine.js';
import type { DecisionProvider } from '../../src/providers/decision-provider.js';

const validInput = {
  state: '用户需要定位实现类',
  question: '下一步做什么？',
  options: [
    { id: 'SEARCH', description: '搜索代码' },
    { id: 'ESCALATE', description: '交给 Codex' }
  ]
};

function completeResult(confidence: number): ProviderResult {
  return {
    generatedToken: '1',
    topLogprobs: new Map([
      ['1', Math.log(confidence)],
      ['2', Math.log(1 - confidence)]
    ]),
    usage: { promptTokens: 20, completionTokens: 1, totalTokens: 21 },
    latencyMs: 25,
    model: 'deepseek-flash',
    finishReason: 'length'
  };
}

function engineWith(result: ProviderResult): {
  engine: DecisionEngine;
  score: ReturnType<typeof vi.fn<DecisionProvider['score']>>;
} {
  const score = vi.fn<DecisionProvider['score']>(async () => result);
  return {
    engine: new DecisionEngine({ score }),
    score
  };
}

describe('DecisionEngine', () => {
  it.each([
    [completeResult(0.89), false, 'LOW_CONFIDENCE'],
    [{ ...completeResult(0.99), topLogprobs: new Map([['1', Math.log(0.99)]]) }, false, 'INCOMPLETE_COVERAGE'],
    [{ ...completeResult(0.99), generatedToken: '#' }, false, 'INVALID_GENERATED_TOKEN'],
    [completeResult(0.95), true, undefined]
  ] as const)('组合决策结果 %#', async (providerResult, accepted, reason) => {
    const { engine } = engineWith(providerResult);

    const result = await engine.decide(validInput);

    expect(result.accepted).toBe(accepted);
    expect(result.rejectionReason).toBe(reason);
    expect(result.decision).toBe(reason === 'INVALID_GENERATED_TOKEN' ? '#' : 'SEARCH');
    expect(result.usage).toEqual(providerResult.usage);
    expect(result.model).toBe('deepseek-flash');
    expect(result.confidenceSignals?.topOptionId).toBe('SEARCH');
  });

  it('每次决策只调用一次 Provider 并转发取消信号', async () => {
    const { engine, score } = engineWith(completeResult(0.95));
    const controller = new AbortController();

    await engine.decide(validInput, { signal: controller.signal });

    expect(score).toHaveBeenCalledTimes(1);
    expect(score.mock.calls[0]?.[0]).toContain('ANSWER=');
    expect(score.mock.calls[0]?.[1]).toBe(controller.signal);
  });

  it('单次阈值覆盖默认策略', async () => {
    const { engine } = engineWith(completeResult(0.8));

    await expect(engine.decide(validInput, { threshold: 0.8 })).resolves.toMatchObject({
      accepted: true,
      confidence: 0.8
    });
  });

  it('把非法请求转换成安全的 DecisionError', async () => {
    const { engine, score } = engineWith(completeResult(0.95));

    await expect(engine.decide({ ...validInput, state: '' })).rejects.toMatchObject({
      code: 'INVALID_REQUEST'
    });
    expect(score).not.toHaveBeenCalled();
  });
});
