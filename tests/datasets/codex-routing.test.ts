import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  evaluationCategories,
  loadDataset
} from '../../src/evaluation/dataset-loader.js';

describe('Codex 路由评测数据集', () => {
  it('包含 49 条均衡、唯一且可执行的样本', async () => {
    const contents = await readFile(
      resolve(process.cwd(), 'datasets/codex-routing.jsonl'),
      'utf8'
    );
    const samples = loadDataset(contents);

    expect(samples).toHaveLength(49);
    expect(new Set(samples.map((sample) => sample.id)).size).toBe(49);

    for (const category of evaluationCategories) {
      expect(samples.filter((sample) => sample.category === category)).toHaveLength(7);
    }

    for (const sample of samples) {
      const optionIds = sample.request.options.map((option) => option.id);
      expect(optionIds).toContain(sample.expected);
      expect(optionIds).toContain('ESCALATE');
    }
  });
});
