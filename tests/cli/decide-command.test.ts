import { describe, expect, it, vi } from 'vitest';

import { runDecide } from '../../src/cli/decide-command.js';
import type { CommandIo } from '../../src/cli/io.js';
import type { DecisionResult } from '../../src/core/contracts.js';
import { DecisionError } from '../../src/core/decision-engine.js';

const request = {
  state: '当前状态',
  question: '下一步？',
  options: [
    { id: 'SEARCH', description: '搜索代码' },
    { id: 'ESCALATE', description: '交给 Codex' }
  ]
};

const decision: DecisionResult = {
  decision: 'SEARCH',
  confidence: 0.95,
  confidenceSignals: null,
  accepted: true,
  probabilities: { SEARCH: 0.95, ESCALATE: 0.05 },
  coverage: { complete: true, missingOptions: [] },
  usage: { promptTokens: 20, completionTokens: 1, totalTokens: 21 },
  latencyMs: 100,
  model: 'deepseek-flash'
};

function memoryIo(options: {
  hasStdin?: boolean;
  stdin?: string;
  file?: string;
} = {}): CommandIo & { out: string[]; error: string[] } {
  const out: string[] = [];
  const error: string[] = [];
  return {
    hasStdin: options.hasStdin ?? false,
    readStdin: async () => options.stdin ?? '',
    readFile: async () => options.file ?? '',
    writeOut: (value) => { out.push(value); },
    writeError: (value) => { error.push(value); },
    out,
    error
  };
}

describe('runDecide', () => {
  it.each([
    [{ inputPath: 'request.json' }, memoryIo({ file: JSON.stringify(request) })],
    [{}, memoryIo({ hasStdin: true, stdin: JSON.stringify(request) })]
  ])('支持文件或标准输入 %#', async (options, io) => {
    const decide = vi.fn(async () => decision);

    const code = await runDecide(options, { engine: { decide }, io });

    expect(code).toBe(0);
    expect(decide).toHaveBeenCalledWith(request, expect.any(Object));
    expect(JSON.parse(io.out.join(''))).toEqual(decision);
  });

  it('同时提供文件和标准输入时返回退出码 2', async () => {
    const io = memoryIo({ hasStdin: true, stdin: JSON.stringify(request), file: JSON.stringify(request) });
    const decide = vi.fn();

    const code = await runDecide({ inputPath: 'request.json' }, { engine: { decide }, io });

    expect(code).toBe(2);
    expect(decide).not.toHaveBeenCalled();
  });

  it('非法 JSON 返回退出码 2', async () => {
    const io = memoryIo({ hasStdin: true, stdin: '{invalid' });

    const code = await runDecide({}, { engine: { decide: vi.fn() }, io });

    expect(code).toBe(2);
    expect(io.error.join('')).toContain('JSON');
  });

  it('Provider 失败返回退出码 3', async () => {
    const io = memoryIo({ hasStdin: true, stdin: JSON.stringify(request) });
    const engine = {
      decide: vi.fn(async () => {
        throw new DecisionError('PROVIDER_FAILURE', 'DeepSeek 请求失败');
      })
    };

    const code = await runDecide({}, { engine, io });

    expect(code).toBe(3);
    expect(io.error.join('')).toContain('DeepSeek 请求失败');
  });

  it('拒绝自动决策仍返回有效 JSON 和退出码 0', async () => {
    const io = memoryIo({ hasStdin: true, stdin: JSON.stringify(request) });
    const rejected: DecisionResult = {
      ...decision,
      accepted: false,
      rejectionReason: 'LOW_CONFIDENCE'
    };

    const code = await runDecide({}, {
      engine: { decide: vi.fn(async () => rejected) },
      io
    });

    expect(code).toBe(0);
    expect(JSON.parse(io.out.join(''))).toMatchObject({
      accepted: false,
      rejectionReason: 'LOW_CONFIDENCE'
    });
  });
});
