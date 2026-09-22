import { describe, expect, it, vi } from 'vitest';

import type { DecisionResult } from '../../src/core/contracts.js';
import { DecisionError } from '../../src/core/decision-engine.js';
import { DecisionPilotApplication } from '../../src/mcp/decision-pilot-application.js';

const traceId = '123e4567-e89b-42d3-a456-426614174000';
const signals = {
  topOptionId: 'SEARCH',
  runnerUpOptionId: 'ESCALATE',
  topLogprob: -0.1,
  runnerUpLogprob: -3.1,
  logprobMargin: 3
};
const validInput = {
  state: '敏感状态正文',
  question: '敏感问题正文',
  options: [
    { id: 'SEARCH', description: '敏感候选说明' },
    { id: 'ESCALATE', description: '交给 Codex 判断' }
  ]
};
const decisionResult: DecisionResult = {
  decision: 'SEARCH',
  confidence: 0.95,
  confidenceSignals: signals,
  accepted: true,
  probabilities: { SEARCH: 0.95, ESCALATE: 0.05 },
  coverage: { complete: true, missingOptions: [] },
  usage: { promptTokens: 20, completionTokens: 1, totalTokens: 21 },
  latencyMs: 25,
  model: 'deepseek-flash'
};

function createDependencies(options: {
  decide?: () => Promise<DecisionResult>;
  recordRecommendation?: () => Promise<void>;
  recordOutcome?: () => Promise<void>;
} = {}) {
  const decide = vi.fn(options.decide ?? (async () => decisionResult));
  const recordRecommendation = vi.fn(
    options.recordRecommendation ?? (async () => undefined)
  );
  const recordOutcome = vi.fn(options.recordOutcome ?? (async () => undefined));
  const application = new DecisionPilotApplication(
    { decide },
    { recordRecommendation, recordOutcome },
    () => traceId
  );

  return { application, decide, recordRecommendation, recordOutcome };
}

describe('DecisionPilotApplication.recommend', () => {
  it('返回影子建议、遥测并记录脱敏关联事件', async () => {
    const { application, decide, recordRecommendation } = createDependencies();

    const output = await application.recommend(validInput);

    expect(output).toEqual({
      schemaVersion: 1,
      shadow: true,
      traceId,
      recommendation: {
        decision: 'SEARCH',
        accepted: true,
        confidence: 0.95,
        probabilities: { SEARCH: 0.95, ESCALATE: 0.05 },
        confidenceSignals: signals,
        coverageComplete: true
      },
      telemetry: {
        model: 'deepseek-flash',
        latencyMs: 25,
        promptTokens: 20,
        completionTokens: 1,
        totalTokens: 21
      }
    });
    expect(decide).toHaveBeenCalledWith(validInput, {});
    expect(recordRecommendation).toHaveBeenCalledWith({
      traceId,
      requestDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      optionIds: ['SEARCH', 'ESCALATE'],
      predictedAction: 'SEARCH',
      accepted: true,
      coverageComplete: true,
      confidence: 0.95,
      confidenceSignals: signals,
      model: 'deepseek-flash',
      latencyMs: 25,
      usage: { promptTokens: 20, completionTokens: 1, totalTokens: 21 }
    });
    expect(JSON.stringify(output)).not.toContain('敏感状态正文');
    expect(JSON.stringify(output)).not.toContain('敏感问题正文');
    expect(JSON.stringify(output)).not.toContain('敏感候选说明');
  });

  it('转发合法阈值并保留拒绝原因', async () => {
    const { application, decide } = createDependencies({
      decide: async () => ({
        ...decisionResult,
        accepted: false,
        rejectionReason: 'LOW_CONFIDENCE'
      })
    });

    const output = await application.recommend({ ...validInput, threshold: 0.8 });

    expect(decide).toHaveBeenCalledWith(validInput, { threshold: 0.8 });
    expect(output).toMatchObject({
      recommendation: { accepted: false, rejectionReason: 'LOW_CONFIDENCE' }
    });
  });

  it('非法请求返回脱敏错误且不调用引擎或记录器', async () => {
    const { application, decide, recordRecommendation } = createDependencies();

    const output = await application.recommend({
      ...validInput,
      state: '',
      apiKey: 'secret-key-marker'
    });

    expect(output).toEqual({
      schemaVersion: 1,
      shadow: true,
      error: { code: 'INVALID_REQUEST', message: '工具输入无效' }
    });
    expect(JSON.stringify(output)).not.toContain('secret-key-marker');
    expect(decide).not.toHaveBeenCalled();
    expect(recordRecommendation).not.toHaveBeenCalled();
  });

  it('非法阈值返回专用错误且不调用引擎', async () => {
    const { application, decide } = createDependencies();

    await expect(application.recommend({ ...validInput, threshold: 1.1 })).resolves.toEqual({
      schemaVersion: 1,
      shadow: true,
      error: { code: 'INVALID_THRESHOLD', message: '置信度阈值无效' }
    });
    expect(decide).not.toHaveBeenCalled();
  });

  it('无效生成 Token 不回显或写入 Provider 正文', async () => {
    const { application, recordRecommendation } = createDependencies({
      decide: async () => ({
        ...decisionResult,
        decision: 'provider-response-marker',
        accepted: false,
        rejectionReason: 'INVALID_GENERATED_TOKEN'
      })
    });

    const output = await application.recommend(validInput);

    expect(output).toMatchObject({
      recommendation: {
        decision: 'INVALID_GENERATED_TOKEN',
        accepted: false,
        rejectionReason: 'INVALID_GENERATED_TOKEN'
      }
    });
    expect(recordRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({ predictedAction: 'INVALID_GENERATED_TOKEN' })
    );
    expect(JSON.stringify(output)).not.toContain('provider-response-marker');
    expect(JSON.stringify(recordRecommendation.mock.calls)).not.toContain(
      'provider-response-marker'
    );
  });
  it('Provider 失败只返回稳定错误而不回显异常正文', async () => {
    const { application, recordRecommendation } = createDependencies({
      decide: async () => {
        throw new DecisionError(
          'PROVIDER_FAILURE',
          'provider-response-marker secret-key-marker'
        );
      }
    });

    const output = await application.recommend(validInput);

    expect(output).toEqual({
      schemaVersion: 1,
      shadow: true,
      error: { code: 'PROVIDER_FAILURE', message: '决策服务暂时不可用' }
    });
    expect(JSON.stringify(output)).not.toContain('provider-response-marker');
    expect(JSON.stringify(output)).not.toContain('secret-key-marker');
    expect(recordRecommendation).not.toHaveBeenCalled();
  });

  it('日志失败时丢弃建议并返回稳定错误', async () => {
    const { application } = createDependencies({
      recordRecommendation: async () => {
        throw new Error('敏感日志异常正文');
      }
    });

    const output = await application.recommend(validInput);

    expect(output).toEqual({
      schemaVersion: 1,
      shadow: true,
      error: { code: 'SHADOW_LOG_FAILURE', message: '影子记录失败' }
    });
    expect(JSON.stringify(output)).not.toContain('敏感日志异常正文');
  });
});

describe('DecisionPilotApplication.recordOutcome', () => {
  it('无需进程内 recommendation 即可记录真实动作', async () => {
    const { application, decide, recordOutcome } = createDependencies();

    const output = await application.recordOutcome({
      traceId,
      actualAction: ' SEARCH ',
      outcome: 'SUCCEEDED'
    });

    expect(output).toEqual({ schemaVersion: 1, recorded: true });
    expect(recordOutcome).toHaveBeenCalledWith({
      traceId,
      actualAction: 'SEARCH',
      outcome: 'SUCCEEDED'
    });
    expect(decide).not.toHaveBeenCalled();
  });

  it.each([
    '',
    '   ',
    'A'.repeat(129),
    'SEARCH\n',
    'SEA\rRCH'
  ])('拒绝非法实际动作标签 %j', async (actualAction) => {
    const { application, recordOutcome } = createDependencies();

    const output = await application.recordOutcome({ traceId, actualAction });

    expect(output).toEqual({
      schemaVersion: 1,
      recorded: false,
      error: { code: 'INVALID_REQUEST', message: '工具输入无效' }
    });
    expect(recordOutcome).not.toHaveBeenCalled();
  });

  it('日志失败时返回 recorded false 且不回显异常', async () => {
    const { application } = createDependencies({
      recordOutcome: async () => { throw new Error('敏感 outcome 异常'); }
    });

    const output = await application.recordOutcome({ traceId, actualAction: 'SEARCH' });

    expect(output).toEqual({
      schemaVersion: 1,
      recorded: false,
      error: { code: 'SHADOW_LOG_FAILURE', message: '影子记录失败' }
    });
    expect(JSON.stringify(output)).not.toContain('敏感 outcome 异常');
  });
});