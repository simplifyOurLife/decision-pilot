import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { DecisionResult } from '../../src/core/contracts.js';
import { evaluateDataset } from '../../src/evaluation/evaluator.js';
import type { EvaluationSample } from '../../src/evaluation/dataset-loader.js';
import { writeReport } from '../../src/evaluation/report-writer.js';

const samples: EvaluationSample[] = [
  {
    id: 'first', category: 'SEARCH', expected: 'SEARCH', rationale: '搜索',
    request: {
      state: '敏感状态 first', question: '下一步？',
      options: [{ id: 'SEARCH', description: '搜索' }, { id: 'ESCALATE', description: '升级' }]
    }
  },
  {
    id: 'second', category: 'READ', expected: 'READ', rationale: '读取',
    request: {
      state: '敏感状态 second', question: '下一步？',
      options: [{ id: 'READ', description: '读取' }, { id: 'ESCALATE', description: '升级' }]
    }
  }
];

function decision(): DecisionResult {
  return {
    decision: 'SEARCH', confidence: 0.95, accepted: true,
    probabilities: { SEARCH: 0.95, ESCALATE: 0.05 },
    coverage: { complete: true, missingOptions: [] },
    usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
    latencyMs: 10, model: 'deepseek-flash'
  };
}

describe('evaluateDataset', () => {
  it('按顺序执行且单条失败不终止批次', async () => {
    const order: string[] = [];
    const decide = vi.fn(async (request: unknown) => {
      const state = (request as EvaluationSample['request']).state;
      order.push(state);
      if (state.includes('second')) throw new Error('失败中包含敏感状态 second');
      return decision();
    });

    const report = await evaluateDataset(samples, { decide }, {
      inputPerMillion: null,
      outputPerMillion: null
    });

    expect(order).toEqual(['敏感状态 first', '敏感状态 second']);
    expect(report.requests).toEqual({ total: 2, succeeded: 1, failed: 1 });
    expect(JSON.stringify(report)).not.toContain('敏感状态');
    expect(report.results[1]).toMatchObject({ id: 'second', errorCode: 'DECISION_FAILED' });
  });
});

describe('writeReport', () => {
  it('递归创建目录并写入结构化 JSON', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'decision-pilot-'));
    const path = join(directory, 'nested', 'report.json');

    await writeReport(path, { schemaVersion: 1, secret: undefined });

    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ schemaVersion: 1 });
  });
});
