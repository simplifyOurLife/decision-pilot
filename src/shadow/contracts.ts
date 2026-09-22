import type { ConfidenceSignals, TokenUsage } from '../core/contracts.js';

export type OutcomeStatus = 'SUCCEEDED' | 'FAILED' | 'SKIPPED';

export interface RecommendationLogInput {
  traceId: string;
  requestDigest: string;
  optionIds: string[];
  predictedAction: string;
  accepted: boolean;
  rejectionReason?: string;
  coverageComplete: boolean;
  confidence: number;
  confidenceSignals: ConfidenceSignals | null;
  model: string;
  latencyMs: number;
  usage: TokenUsage;
}

export interface OutcomeLogInput {
  traceId: string;
  actualAction: string;
  outcome?: OutcomeStatus;
}