import { z } from 'zod';

import {
  decisionRequestSchema,
  type DecisionRequest
} from '../core/contracts.js';

export const evaluationCategories = [
  'SEARCH',
  'READ',
  'EDIT',
  'TEST',
  'EXECUTE',
  'ANSWER',
  'ESCALATE'
] as const;

export type EvaluationCategory = (typeof evaluationCategories)[number];

export interface EvaluationSample {
  id: string;
  category: EvaluationCategory;
  expected: string;
  rationale: string;
  request: DecisionRequest;
}

const evaluationSampleSchema = z.object({
  id: z.string().trim().min(1),
  category: z.enum(evaluationCategories),
  expected: z.string().trim().min(1),
  rationale: z.string().trim().min(1),
  request: decisionRequestSchema
});

export class DatasetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatasetValidationError';
  }
}

export function loadDataset(jsonl: string): EvaluationSample[] {
  const lines = jsonl.split(/\r?\n/u);
  const samples: EvaluationSample[] = [];
  const ids = new Set<string>();

  lines.forEach((line, index) => {
    if (line.trim() === '') return;

    let input: unknown;
    try {
      input = JSON.parse(line);
    } catch {
      throw new DatasetValidationError(`数据集第 ${index + 1} 行不是有效 JSON`);
    }

    const parsed = evaluationSampleSchema.safeParse(input);
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))]
        .filter(Boolean)
        .join(', ');
      throw new DatasetValidationError(
        `数据集第 ${index + 1} 行结构无效${fields === '' ? '' : `：${fields}`}`
      );
    }

    const sample = parsed.data;
    if (ids.has(sample.id)) {
      throw new DatasetValidationError(`数据集存在重复 id：${sample.id}`);
    }

    const optionIds = new Set(sample.request.options.map((option) => option.id));
    if (!optionIds.has(sample.expected)) {
      throw new DatasetValidationError(`数据集第 ${index + 1} 行的 expected 不在候选项中`);
    }
    if (!optionIds.has('ESCALATE')) {
      throw new DatasetValidationError(`数据集第 ${index + 1} 行缺少 ESCALATE 候选项`);
    }

    ids.add(sample.id);
    samples.push(sample);
  });

  if (samples.length === 0) {
    throw new DatasetValidationError('数据集至少一条样本');
  }

  return samples;
}
