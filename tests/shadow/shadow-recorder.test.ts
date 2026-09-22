import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { RecommendationLogInput } from '../../src/shadow/contracts.js';
import { ShadowLogError, ShadowRecorder } from '../../src/shadow/shadow-recorder.js';

const recommendationInput: RecommendationLogInput = {
  traceId: 'trace-1',
  requestDigest: 'a'.repeat(64),
  optionIds: ['SEARCH', 'ESCALATE'],
  predictedAction: 'SEARCH',
  accepted: true,
  coverageComplete: true,
  confidence: 0.95,
  confidenceSignals: {
    topOptionId: 'SEARCH',
    runnerUpOptionId: 'ESCALATE',
    topLogprob: -0.1,
    runnerUpLogprob: -3.1,
    logprobMargin: 3
  },
  model: 'deepseek-flash',
  latencyMs: 120,
  usage: { promptTokens: 20, completionTokens: 1, totalTokens: 21 }
};

function fixedNow(): Date {
  return new Date('2026-09-22T01:02:03.000Z');
}

describe('ShadowRecorder', () => {
  it('按调用顺序串行追加可关联的完整 JSONL 事件', async () => {
    const writes: string[] = [];
    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const recorder = new ShadowRecorder({
      rootDirectory: 'C:\\shadow-test',
      now: fixedNow,
      mkdir: async () => undefined,
      appendFile: async (_path, data) => {
        const eventType = JSON.parse(String(data)).eventType as string;
        order.push(`start:${eventType}`);
        if (eventType === 'recommendation') await firstGate;
        writes.push(String(data));
        order.push(`finish:${eventType}`);
      }
    });

    const recommendation = recorder.recordRecommendation(recommendationInput);
    const outcome = recorder.recordOutcome({ traceId: 'trace-1', actualAction: 'SEARCH' });

    await vi.waitFor(() => expect(order).toEqual(['start:recommendation']));
    releaseFirst?.();
    await Promise.all([recommendation, outcome]);

    expect(order).toEqual([
      'start:recommendation',
      'finish:recommendation',
      'start:outcome',
      'finish:outcome'
    ]);
    expect(writes).toHaveLength(2);
    expect(writes.every((line) => line.endsWith('\n'))).toBe(true);
    expect(writes.map((line) => JSON.parse(line).eventType)).toEqual([
      'recommendation',
      'outcome'
    ]);
    expect(writes.map((line) => JSON.parse(line).traceId)).toEqual(['trace-1', 'trace-1']);
  });

  it('使用 UTC 日期文件名并递归创建日志目录', async () => {
    const mkdir = vi.fn(async () => undefined);
    const appendFile = vi.fn(async () => undefined);
    const rootDirectory = 'C:\\shadow-test';
    const recorder = new ShadowRecorder({ rootDirectory, now: fixedNow, mkdir, appendFile });

    await recorder.recordOutcome({
      traceId: 'trace-2',
      actualAction: 'ESCALATE',
      outcome: 'SKIPPED'
    });

    expect(mkdir).toHaveBeenCalledWith(rootDirectory, { recursive: true });
    expect(appendFile).toHaveBeenCalledWith(
      join(rootDirectory, '2026-09-22.jsonl'),
      expect.stringContaining('"eventType":"outcome"'),
      'utf8'
    );
  });

  it('只序列化白名单字段而不接受调用方附带的敏感正文', async () => {
    const writes: string[] = [];
    const recorder = new ShadowRecorder({
      rootDirectory: 'C:\\shadow-test',
      now: fixedNow,
      mkdir: async () => undefined,
      appendFile: async (_path, data) => { writes.push(String(data)); }
    });
    const inputWithSecrets = {
      ...recommendationInput,
      state: '敏感状态正文',
      question: '敏感问题正文',
      description: '敏感候选说明',
      apiKey: 'secret-key-marker',
      providerBody: 'provider-response-marker'
    } as RecommendationLogInput & Record<string, unknown>;

    await recorder.recordRecommendation(inputWithSecrets);

    const serialized = writes.join('');
    expect(serialized).not.toContain('敏感状态正文');
    expect(serialized).not.toContain('敏感问题正文');
    expect(serialized).not.toContain('敏感候选说明');
    expect(serialized).not.toContain('secret-key-marker');
    expect(serialized).not.toContain('provider-response-marker');
  });

  it('前一次追加失败后仍尝试下一次写入并返回脱敏错误', async () => {
    const appendFile = vi.fn()
      .mockRejectedValueOnce(new Error('敏感异常正文'))
      .mockResolvedValueOnce(undefined);
    const recorder = new ShadowRecorder({
      rootDirectory: 'C:\\shadow-test',
      now: fixedNow,
      mkdir: async () => undefined,
      appendFile
    });

    const error = await recorder.recordRecommendation(recommendationInput)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ShadowLogError);
    expect(error).toMatchObject({ message: '影子日志写入失败' });
    expect(JSON.stringify(error)).not.toContain('敏感异常正文');
    await expect(recorder.recordOutcome({
      traceId: 'trace-3',
      actualAction: 'SEARCH',
      outcome: 'SUCCEEDED'
    })).resolves.toBeUndefined();
    expect(appendFile).toHaveBeenCalledTimes(2);
  });
});