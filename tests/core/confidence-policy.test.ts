import { describe, expect, it } from 'vitest';

import { ConfidencePolicy } from '../../src/core/confidence-policy.js';
import type { NormalizedProbabilities } from '../../src/core/probability-normalizer.js';

function normalized(
  confidence: number,
  options: { complete?: boolean; generatedOptionId?: string } = {}
): NormalizedProbabilities {
  const generatedOptionId = options.generatedOptionId ?? 'SEARCH';
  return {
    ...(options.generatedOptionId === '' ? {} : { generatedOptionId }),
    probabilities: {
      SEARCH: confidence,
      ESCALATE: 1 - confidence
    },
    coverage: {
      complete: options.complete ?? true,
      missingOptions: options.complete === false ? ['ESCALATE'] : []
    }
  };
}

describe('ConfidencePolicy', () => {
  it.each([
    [normalized(0.89), false, 'LOW_CONFIDENCE'],
    [normalized(0.99, { complete: false }), false, 'INCOMPLETE_COVERAGE'],
    [normalized(0.99, { generatedOptionId: '' }), false, 'INVALID_GENERATED_TOKEN'],
    [normalized(0.9), true, undefined]
  ] as const)('应用置信度策略 %#', (result, accepted, reason) => {
    expect(new ConfidencePolicy(0.9).evaluate(result)).toEqual({
      accepted,
      confidence: result.generatedOptionId === undefined
        ? 0
        : result.probabilities[result.generatedOptionId],
      ...(reason === undefined ? {} : { rejectionReason: reason })
    });
  });

  it.each([-0.1, 1.1, Number.NaN])('拒绝非法默认阈值 %s', (threshold) => {
    expect(() => new ConfidencePolicy(threshold)).toThrow('0 到 1');
  });

  it('允许单次调用覆盖阈值', () => {
    expect(new ConfidencePolicy(0.9).evaluate(normalized(0.8), 0.8).accepted).toBe(true);
  });
});
