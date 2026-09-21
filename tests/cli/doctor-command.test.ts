import { describe, expect, it, vi } from 'vitest';

import { runDoctor } from '../../src/cli/doctor-command.js';
import type { CommandIo } from '../../src/cli/io.js';
import type { DecisionResult } from '../../src/core/contracts.js';
import { loadEnvironment } from '../../src/config/environment.js';

function memoryIo(): CommandIo & { out: string[]; error: string[] } {
  const out: string[] = [];
  const error: string[] = [];
  return {
    hasStdin: false,
    readStdin: async () => '',
    readFile: async () => '',
    writeOut: (value) => { out.push(value); },
    writeError: (value) => { error.push(value); },
    out,
    error
  };
}

const healthyResult: DecisionResult = {
  decision: 'ANSWER',
  confidence: 0.97,
  accepted: true,
  probabilities: { ANSWER: 0.97, ESCALATE: 0.03 },
  coverage: { complete: true, missingOptions: [] },
  usage: { promptTokens: 20, completionTokens: 1, totalTokens: 21 },
  latencyMs: 123,
  model: 'deepseek-flash'
};

describe('runDoctor', () => {
  it('环境变量不完整时返回退出码 2', async () => {
    const io = memoryIo();

    const code = await runDoctor({
      environment: loadEnvironment({}),
      createEngine: vi.fn(),
      io
    });

    expect(code).toBe(2);
    expect(io.error.join('')).toContain('DEEPSEEK_API_KEY');
  });

  it('契约健康时只输出脱敏摘要', async () => {
    const io = memoryIo();
    const decide = vi.fn(async () => healthyResult);
    const environment = loadEnvironment({
      DEEPSEEK_API_KEY: 'secret-key-123456',
      DEEPSEEK_MODEL: 'deepseek-flash'
    });

    const code = await runDoctor({
      environment,
      createEngine: () => ({ decide }),
      io
    });

    expect(code).toBe(0);
    expect(decide).toHaveBeenCalledTimes(1);
    const output = io.out.join('');
    expect(output).toContain('deepseek-flash');
    expect(output).toContain('123');
    expect(output).toContain('完整');
    expect(output).not.toContain('secret-key-123456');
    expect(output).not.toContain('ANSWER=');
  });
});
