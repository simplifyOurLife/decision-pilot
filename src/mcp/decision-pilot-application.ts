import { randomUUID } from 'node:crypto';

import {
  parseDecisionRequest,
  type DecisionResult
} from '../core/contracts.js';
import {
  DecisionError,
  type DecisionErrorCode
} from '../core/decision-engine.js';
import type {
  OutcomeLogInput,
  RecommendationLogInput
} from '../shadow/contracts.js';
import { createRequestDigest } from '../shadow/request-digest.js';
import type {
  RecommendErrorCode,
  RecommendToolFailure,
  RecommendToolOutput,
  RecordOutcomeToolFailure,
  RecordOutcomeToolOutput
} from './contracts.js';
import {
  recommendInputSchema,
  recordOutcomeInputSchema
} from './schemas.js';

interface DecisionRunner {
  decide(
    input: unknown,
    options?: { threshold?: number; signal?: AbortSignal }
  ): Promise<DecisionResult>;
}

interface ShadowWriter {
  recordRecommendation(input: RecommendationLogInput): Promise<void>;
  recordOutcome(input: OutcomeLogInput): Promise<void>;
}

const errorMessages = {
  INVALID_REQUEST: '工具输入无效',
  INVALID_THRESHOLD: '置信度阈值无效',
  PROVIDER_FAILURE: '决策服务暂时不可用',
  SHADOW_LOG_FAILURE: '影子记录失败'
} as const;

function recommendFailure(code: RecommendErrorCode): RecommendToolFailure {
  return {
    schemaVersion: 1,
    shadow: true,
    error: { code, message: errorMessages[code] }
  };
}

function outcomeFailure(
  code: 'INVALID_REQUEST' | 'SHADOW_LOG_FAILURE'
): RecordOutcomeToolFailure {
  return {
    schemaVersion: 1,
    recorded: false,
    error: { code, message: errorMessages[code] }
  };
}

function mapDecisionError(error: unknown): RecommendErrorCode {
  if (!(error instanceof DecisionError)) return 'PROVIDER_FAILURE';

  const code: DecisionErrorCode = error.code;
  return code;
}

export class DecisionPilotApplication {
  constructor(
    private readonly engine: DecisionRunner,
    private readonly recorder: ShadowWriter,
    private readonly createTraceId: () => string = randomUUID
  ) {}

  async recommend(input: unknown): Promise<RecommendToolOutput> {
    const parsed = recommendInputSchema.safeParse(input);
    if (!parsed.success) {
      const thresholdOnly = parsed.error.issues.length > 0
        && parsed.error.issues.every((issue) => issue.path[0] === 'threshold');
      return recommendFailure(thresholdOnly ? 'INVALID_THRESHOLD' : 'INVALID_REQUEST');
    }

    const { threshold, ...requestInput } = parsed.data;
    const request = parseDecisionRequest(requestInput);
    let result: DecisionResult;
    try {
      result = await this.engine.decide(
        request,
        threshold === undefined ? {} : { threshold }
      );
    } catch (error) {
      return recommendFailure(mapDecisionError(error));
    }

    const traceId = this.createTraceId();
    try {
      await this.recorder.recordRecommendation({
        traceId,
        requestDigest: createRequestDigest(request),
        optionIds: request.options.map(({ id }) => id),
        predictedAction: result.decision,
        accepted: result.accepted,
        ...(result.rejectionReason === undefined
          ? {}
          : { rejectionReason: result.rejectionReason }),
        coverageComplete: result.coverage.complete,
        confidence: result.confidence,
        confidenceSignals: result.confidenceSignals,
        model: result.model,
        latencyMs: result.latencyMs,
        usage: result.usage
      });
    } catch {
      return recommendFailure('SHADOW_LOG_FAILURE');
    }

    return {
      schemaVersion: 1,
      shadow: true,
      traceId,
      recommendation: {
        decision: result.decision,
        accepted: result.accepted,
        confidence: result.confidence,
        probabilities: { ...result.probabilities },
        confidenceSignals: result.confidenceSignals,
        coverageComplete: result.coverage.complete,
        ...(result.rejectionReason === undefined
          ? {}
          : { rejectionReason: result.rejectionReason })
      },
      telemetry: {
        model: result.model,
        latencyMs: result.latencyMs,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens
      }
    };
  }

  async recordOutcome(input: unknown): Promise<RecordOutcomeToolOutput> {
    const parsed = recordOutcomeInputSchema.safeParse(input);
    if (!parsed.success) return outcomeFailure('INVALID_REQUEST');

    try {
      await this.recorder.recordOutcome({
        traceId: parsed.data.traceId,
        actualAction: parsed.data.actualAction,
        ...(parsed.data.outcome === undefined ? {} : { outcome: parsed.data.outcome })
      });
      return { schemaVersion: 1, recorded: true };
    } catch {
      return outcomeFailure('SHADOW_LOG_FAILURE');
    }
  }
}