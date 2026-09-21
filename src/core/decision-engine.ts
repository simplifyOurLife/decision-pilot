import {
  DecisionValidationError,
  type DecisionResult
} from './contracts.js';
import { parseDecisionRequest } from './contracts.js';
import { ConfidencePolicy } from './confidence-policy.js';
import { normalizeCandidateProbabilities } from './probability-normalizer.js';
import { buildDecisionPrompt } from './prompt-builder.js';
import type { DecisionProvider } from '../providers/decision-provider.js';
import { ProviderError } from '../providers/provider-error.js';

export type DecisionErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_THRESHOLD'
  | 'PROVIDER_FAILURE';

export class DecisionError extends Error {
  constructor(
    readonly code: DecisionErrorCode,
    message: string,
    options: { cause?: unknown } = {}
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'DecisionError';
  }

  toJSON(): Record<string, string> {
    return { name: this.name, code: this.code, message: this.message };
  }
}

export class DecisionEngine {
  constructor(
    private readonly provider: DecisionProvider,
    private readonly policy = new ConfidencePolicy(0.9)
  ) {}

  async decide(
    input: unknown,
    options: { threshold?: number; signal?: AbortSignal } = {}
  ): Promise<DecisionResult> {
    try {
      const request = parseDecisionRequest(input);
      const plan = buildDecisionPrompt(request);
      const providerResult = await this.provider.score(plan.prompt, options.signal);
      const normalized = normalizeCandidateProbabilities(plan, providerResult);
      const evaluation = this.policy.evaluate(normalized, options.threshold);
      const decision = normalized.generatedOptionId ?? providerResult.generatedToken;

      return {
        decision,
        confidence: evaluation.confidence,
        accepted: evaluation.accepted,
        ...(evaluation.rejectionReason === undefined
          ? {}
          : { rejectionReason: evaluation.rejectionReason }),
        probabilities: normalized.probabilities,
        coverage: normalized.coverage,
        usage: providerResult.usage,
        latencyMs: providerResult.latencyMs,
        model: providerResult.model
      };
    } catch (error) {
      if (error instanceof DecisionValidationError) {
        throw new DecisionError('INVALID_REQUEST', error.message, { cause: error });
      }
      if (error instanceof RangeError) {
        throw new DecisionError('INVALID_THRESHOLD', error.message, { cause: error });
      }
      if (error instanceof ProviderError) {
        throw new DecisionError('PROVIDER_FAILURE', error.message, { cause: error });
      }
      if (error instanceof DecisionError) {
        throw error;
      }
      throw new DecisionError('PROVIDER_FAILURE', '决策引擎执行失败', { cause: error });
    }
  }
}
