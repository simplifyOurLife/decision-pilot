import { describe, expect, it } from 'vitest';

import type { ProviderResult } from '../../src/core/contracts.js';
import type { PromptPlan } from '../../src/core/prompt-builder.js';
import {
  normalizeCandidateProbabilities,
  normalizeToken
} from '../../src/core/probability-normalizer.js';

const plan: PromptPlan = {
  prompt: 'PROMPT',
  tokenToOptionId: new Map([
    ['1', 'SEARCH'],
    ['2', 'ESCALATE']
  ]),
  optionIdToToken: new Map([
    ['SEARCH', '1'],
    ['ESCALATE', '2']
  ])
};

function providerResult(overrides: Partial<ProviderResult> = {}): ProviderResult {
  return {
    generatedToken: '1',
    topLogprobs: new Map([
      ['1', -0.05],
      ['2', -3]
    ]),
    usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
    latencyMs: 10,
    model: 'deepseek-flash',
    finishReason: 'length',
    ...overrides
  };
}

describe('normalizeToken', () => {
  it.each([
    [' 1', '1'],
    ['1\n', '1'],
    ['答案1', '答案1']
  ])('把 %j 规范为 %j', (input, expected) => {
    expect(normalizeToken(input)).toBe(expected);
  });
});

describe('normalizeCandidateProbabilities', () => {
  it('只在业务候选集合内做稳定 softmax', () => {
    const result = normalizeCandidateProbabilities(plan, providerResult({
      topLogprobs: new Map([
        ['1', -0.05],
        ['2', -3],
        ['#', -0.2]
      ])
    }));

    expect(result.coverage).toEqual({ complete: true, missingOptions: [] });
    expect(result.generatedOptionId).toBe('SEARCH');
    expect(result.probabilities.SEARCH).toBeCloseTo(0.9503, 4);
    expect(result.probabilities.ESCALATE).toBeCloseTo(0.0497, 4);
    expect(result.probabilities.SEARCH! + result.probabilities.ESCALATE!).toBeCloseTo(1);
  });

  it('识别带空白的候选 Token', () => {
    const result = normalizeCandidateProbabilities(plan, providerResult({
      generatedToken: ' 1',
      topLogprobs: new Map([
        [' 1', -0.05],
        ['2\n', -3]
      ])
    }));

    expect(result.generatedOptionId).toBe('SEARCH');
    expect(result.coverage.complete).toBe(true);
  });

  it('合并规范化后指向同一候选的概率质量', () => {
    const result = normalizeCandidateProbabilities(plan, providerResult({
      topLogprobs: new Map([
        ['1', -1],
        [' 1', -1],
        ['2', -2]
      ])
    }));

    expect(result.probabilities.SEARCH).toBeCloseTo(0.8446, 4);
    expect(result.probabilities.ESCALATE).toBeCloseTo(0.1554, 4);
  });

  it('候选缺失时标记不完整且不伪造概率', () => {
    const result = normalizeCandidateProbabilities(plan, providerResult({
      topLogprobs: new Map([['1', -0.05]])
    }));

    expect(result.coverage).toEqual({
      complete: false,
      missingOptions: ['ESCALATE']
    });
    expect(result.probabilities).not.toHaveProperty('ESCALATE');
  });

  it('非候选输出不映射为业务决策', () => {
    const result = normalizeCandidateProbabilities(plan, providerResult({
      generatedToken: '答案1'
    }));

    expect(result.generatedOptionId).toBeUndefined();
  });

  it('把非有限 logprob 视为缺失候选', () => {
    const result = normalizeCandidateProbabilities(plan, providerResult({
      topLogprobs: new Map([
        ['1', Number.NaN],
        ['2', -3]
      ])
    }));

    expect(result.coverage).toEqual({
      complete: false,
      missingOptions: ['SEARCH']
    });
  });

  it('返回第一名、第二名和原始 logprob margin', () => {
    const result = normalizeCandidateProbabilities(plan, providerResult({
      topLogprobs: new Map([
        ['1', -0.2],
        ['2', -1.7]
      ])
    }));

    expect(result.confidenceSignals).toEqual({
      topOptionId: 'SEARCH',
      runnerUpOptionId: 'ESCALATE',
      topLogprob: -0.2,
      runnerUpLogprob: -1.7,
      logprobMargin: 1.5
    });
  });

  it('并列时保持请求顺序且 margin 为零', () => {
    const result = normalizeCandidateProbabilities(plan, providerResult({
      topLogprobs: new Map([
        ['2', -1],
        ['1', -1]
      ])
    }));

    expect(result.confidenceSignals).toMatchObject({
      topOptionId: 'SEARCH',
      runnerUpOptionId: 'ESCALATE',
      logprobMargin: 0
    });
  });

  it('只有一个有效候选时第二名和 margin 为 null', () => {
    const result = normalizeCandidateProbabilities(plan, providerResult({
      topLogprobs: new Map([
        ['1', -0.4],
        ['2', Number.NaN]
      ])
    }));

    expect(result.confidenceSignals).toEqual({
      topOptionId: 'SEARCH',
      runnerUpOptionId: null,
      topLogprob: -0.4,
      runnerUpLogprob: null,
      logprobMargin: null
    });
  });

  it('没有有效业务候选时返回 null 信号', () => {
    const result = normalizeCandidateProbabilities(plan, providerResult({
      topLogprobs: new Map([
        ['#', -0.1],
        ['1', Number.NaN]
      ])
    }));

    expect(result.confidenceSignals).toBeNull();
  });
});
