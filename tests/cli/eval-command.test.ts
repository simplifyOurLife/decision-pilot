import { describe, expect, it, vi } from 'vitest';

import { runEval } from '../../src/cli/eval-command.js';
import type { CommandIo } from '../../src/cli/io.js';

function ioWithDataset(dataset: string): CommandIo & { out: string[]; error: string[] } {
  const out: string[] = [];
  const error: string[] = [];
  return {
    hasStdin: false,
    readStdin: async () => '',
    readFile: async () => dataset,
    writeOut: (value) => { out.push(value); },
    writeError: (value) => { error.push(value); },
    out,
    error
  };
}

const dataset = JSON.stringify({
  id: 'sample-1', category: 'SEARCH', expected: 'SEARCH', rationale: '搜索',
  request: {
    state: '未定位实现', question: '下一步？',
    options: [{ id: 'SEARCH', description: '搜索' }, { id: 'ESCALATE', description: '升级' }]
  }
});

describe('runEval', () => {
  it('运行评测、写报告并输出摘要', async () => {
    const io = ioWithDataset(dataset);
    const write = vi.fn(async () => undefined);
    const engine = {
      decide: vi.fn(async () => ({
        decision: 'SEARCH', confidence: 0.95, accepted: true,
        probabilities: { SEARCH: 0.95, ESCALATE: 0.05 },
        coverage: { complete: true, missingOptions: [] },
        usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
        latencyMs: 10, model: 'deepseek-flash'
      }))
    };

    const code = await runEval({ datasetPath: 'data.jsonl', reportPath: 'report.json' }, {
      engine, io, pricing: { inputPerMillion: null, outputPerMillion: null }, writeReport: write
    });

    expect(code).toBe(0);
    expect(write).toHaveBeenCalledWith('report.json', expect.objectContaining({ accuracy: 1 }));
    expect(io.out.join('')).toContain('100.00%');
  });

  it('数据集非法时返回退出码 2', async () => {
    const io = ioWithDataset('');
    const code = await runEval({ datasetPath: 'data.jsonl', reportPath: 'report.json' }, {
      engine: { decide: vi.fn() }, io,
      pricing: { inputPerMillion: null, outputPerMillion: null },
      writeReport: vi.fn()
    });
    expect(code).toBe(2);
    expect(io.error.join('')).toContain('数据集');
  });
});
