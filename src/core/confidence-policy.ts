import type { RejectionReason } from './contracts.js';
import type { NormalizedProbabilities } from './probability-normalizer.js';

export interface ConfidenceEvaluation {
  accepted: boolean;
  confidence: number;
  rejectionReason?: RejectionReason;
}

function assertThreshold(threshold: number): void {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError('置信度阈值必须位于 0 到 1 之间');
  }
}

export class ConfidencePolicy {
  constructor(private readonly defaultThreshold = 0.9) {
    assertThreshold(defaultThreshold);
  }

  evaluate(
    result: NormalizedProbabilities,
    threshold = this.defaultThreshold
  ): ConfidenceEvaluation {
    assertThreshold(threshold);

    if (result.generatedOptionId === undefined) {
      return {
        accepted: false,
        confidence: 0,
        rejectionReason: 'INVALID_GENERATED_TOKEN'
      };
    }

    const confidence = result.probabilities[result.generatedOptionId];
    if (!result.coverage.complete) {
      return {
        accepted: false,
        confidence: confidence ?? 0,
        rejectionReason: 'INCOMPLETE_COVERAGE'
      };
    }

    if (confidence === undefined || !Number.isFinite(confidence)) {
      return {
        accepted: false,
        confidence: 0,
        rejectionReason: 'INVALID_PROVIDER_RESPONSE'
      };
    }

    if (confidence < threshold) {
      return {
        accepted: false,
        confidence,
        rejectionReason: 'LOW_CONFIDENCE'
      };
    }

    return { accepted: true, confidence };
  }
}
