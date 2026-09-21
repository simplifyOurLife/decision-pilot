import type { PricingConfig } from '../config/environment.js';
import type { DecisionRunner } from '../cli/io.js';
import type { EvaluationSample } from './dataset-loader.js';
import {
  calculateMetrics,
  type EvaluationMetrics,
  type EvaluationRecord
} from './metrics.js';

export interface EvaluationResultItem {
  id: string;
  category: string;
  expected: string;
  decision?: string;
  confidence?: number;
  accepted?: boolean;
  coverageComplete?: boolean;
  errorCode?: 'DECISION_FAILED';
}

export interface EvaluationReport extends EvaluationMetrics {
  results: EvaluationResultItem[];
}

export async function evaluateDataset(
  samples: readonly EvaluationSample[],
  engine: DecisionRunner,
  pricing: PricingConfig
): Promise<EvaluationReport> {
  const records: EvaluationRecord[] = [];
  const results: EvaluationResultItem[] = [];

  for (const sample of samples) {
    try {
      const result = await engine.decide(sample.request);
      records.push({
        id: sample.id,
        category: sample.category,
        expected: sample.expected,
        result
      });
      results.push({
        id: sample.id,
        category: sample.category,
        expected: sample.expected,
        decision: result.decision,
        confidence: result.confidence,
        accepted: result.accepted,
        coverageComplete: result.coverage.complete
      });
    } catch {
      records.push({
        id: sample.id,
        category: sample.category,
        expected: sample.expected,
        errorCode: 'DECISION_FAILED'
      });
      results.push({
        id: sample.id,
        category: sample.category,
        expected: sample.expected,
        errorCode: 'DECISION_FAILED'
      });
    }
  }

  return { ...calculateMetrics(records, pricing), results };
}
