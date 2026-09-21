import type { PricingConfig } from '../config/environment.js';
import type { DecisionResult, TokenUsage } from '../core/contracts.js';
import type { EvaluationCategory } from './dataset-loader.js';

export interface EvaluationRecord {
  id: string;
  category: EvaluationCategory;
  expected: string;
  result?: DecisionResult;
  errorCode?: string;
}

export interface ThresholdMetrics {
  accepted: number;
  acceptanceRate: number;
  acceptedAccuracy: number;
  escalationRate: number;
}

export interface EvaluationMetrics {
  schemaVersion: 1;
  generatedAt: string;
  model: string | null;
  requests: { total: number; succeeded: number; failed: number };
  accuracy: number;
  coverageRate: number;
  perCategory: Record<string, { total: number; correct: number; accuracy: number }>;
  confusionMatrix: Record<string, Record<string, number>>;
  thresholds: Record<string, ThresholdMetrics>;
  latency: { averageMs: number; p50Ms: number; p95Ms: number };
  usage: TokenUsage;
  estimatedCost: number | null;
}

const thresholds = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95] as const;

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? 0;
}

export function calculateMetrics(
  records: readonly EvaluationRecord[],
  pricing: PricingConfig
): EvaluationMetrics {
  const successful = records.filter(
    (record): record is EvaluationRecord & { result: DecisionResult } => record.result !== undefined
  );
  const correct = successful.filter((record) => record.result.decision === record.expected).length;
  const complete = successful.filter((record) => record.result.coverage.complete).length;
  const latencyValues = successful.map((record) => record.result.latencyMs);
  const usage = successful.reduce<TokenUsage>((total, record) => ({
    promptTokens: total.promptTokens + record.result.usage.promptTokens,
    completionTokens: total.completionTokens + record.result.usage.completionTokens,
    totalTokens: total.totalTokens + record.result.usage.totalTokens
  }), { promptTokens: 0, completionTokens: 0, totalTokens: 0 });

  const perCategory: EvaluationMetrics['perCategory'] = {};
  const confusionMatrix: EvaluationMetrics['confusionMatrix'] = {};
  for (const record of records) {
    const category = perCategory[record.category] ?? { total: 0, correct: 0, accuracy: 0 };
    category.total += 1;
    if (record.result?.decision === record.expected) category.correct += 1;
    category.accuracy = ratio(category.correct, category.total);
    perCategory[record.category] = category;

    const predicted = record.result?.decision ?? 'ERROR';
    const row = confusionMatrix[record.expected] ?? {};
    row[predicted] = (row[predicted] ?? 0) + 1;
    confusionMatrix[record.expected] = row;
  }

  const thresholdMetrics: Record<string, ThresholdMetrics> = {};
  for (const threshold of thresholds) {
    const acceptedRecords = successful.filter(
      (record) => record.result.coverage.complete && record.result.confidence >= threshold
    );
    const acceptedCorrect = acceptedRecords.filter(
      (record) => record.result.decision === record.expected
    ).length;
    const acceptanceRate = ratio(acceptedRecords.length, records.length);
    thresholdMetrics[threshold.toFixed(2)] = {
      accepted: acceptedRecords.length,
      acceptanceRate,
      acceptedAccuracy: ratio(acceptedCorrect, acceptedRecords.length),
      escalationRate: 1 - acceptanceRate
    };
  }

  const models = [...new Set(successful.map((record) => record.result.model))];
  const estimatedCost = pricing.inputPerMillion === null || pricing.outputPerMillion === null
    ? null
    : (usage.promptTokens * pricing.inputPerMillion
      + usage.completionTokens * pricing.outputPerMillion) / 1_000_000;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    model: models.length === 1 ? models[0] ?? null : models.length === 0 ? null : 'mixed',
    requests: {
      total: records.length,
      succeeded: successful.length,
      failed: records.length - successful.length
    },
    accuracy: ratio(correct, records.length),
    coverageRate: ratio(complete, records.length),
    perCategory,
    confusionMatrix,
    thresholds: thresholdMetrics,
    latency: {
      averageMs: ratio(latencyValues.reduce((total, value) => total + value, 0), latencyValues.length),
      p50Ms: percentile(latencyValues, 0.5),
      p95Ms: percentile(latencyValues, 0.95)
    },
    usage,
    estimatedCost
  };
}
