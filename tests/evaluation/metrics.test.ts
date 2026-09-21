import { describe, expect, it } from 'vitest';

import type { DecisionResult } from '../../src/core/contracts.js';
import { calculateMetrics, type EvaluationRecord } from '../../src/evaluation/metrics.js';

function result(
  decision: string,
  confidence: number,
  latencyMs: number,
  complete = true
): DecisionResult {
  return {
    decision,
    confidence,
    accepted: complete && confidence >= 0.9,
    probabilities: { [decision]: confidence },
    coverage: { complete, missingOptions: complete ? [] : ['ESCALATE'] },
    usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
    latencyMs,
    model: 'deepseek-flash'
  };
}

const records: EvaluationRecord[] = [
  { id: '1', category: 'SEARCH', expected: 'SEARCH', result: result('SEARCH', 0.95, 10) },
  { id: '2', category: 'READ', expected: 'READ', result: result('READ', 0.92, 20) },
  { id: '3', category: 'EDIT', expected: 'EDIT', result: result('SEARCH', 0.8, 30) },
  { id: '4', category: 'TEST', expected: 'TEST', result: result('TEST', 0.6, 40, false) }
];

describe('calculateMetrics', () => {
  it('统计准确率、覆盖率、延迟与阈值选择性指标', () => {
    const report = calculateMetrics(records, {
      inputPerMillion: null,
      outputPerMillion: null
    });

    expect(report.accuracy).toBe(0.75);
    expect(report.coverageRate).toBe(0.75);
    expect(report.latency).toEqual({ averageMs: 25, p50Ms: 20, p95Ms: 40 });
    expect(report.thresholds['0.90']).toEqual({
      accepted: 2,
      acceptanceRate: 0.5,
      acceptedAccuracy: 1,
      escalationRate: 0.5
    });
    expect(report.estimatedCost).toBeNull();
  });

  it('单样本的 P50 和 P95 都等于自身', () => {
    const report = calculateMetrics([records[0]!], {
      inputPerMillion: null,
      outputPerMillion: null
    });
    expect(report.latency).toMatchObject({ p50Ms: 10, p95Ms: 10 });
  });

  it('按输入输出单价分别估算费用', () => {
    const report = calculateMetrics(records, {
      inputPerMillion: 1,
      outputPerMillion: 2
    });
    expect(report.usage).toEqual({ promptTokens: 40, completionTokens: 4, totalTokens: 44 });
    expect(report.estimatedCost).toBeCloseTo(0.000048);
  });
});
