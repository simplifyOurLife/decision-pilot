import type {
  ConfidenceSignals,
  DecisionOption,
  RejectionReason
} from '../core/contracts.js';
import type { OutcomeStatus } from '../shadow/contracts.js';

export interface RecommendToolInput {
  state: string;
  question: string;
  options: DecisionOption[];
  threshold?: number;
}

export type RecommendErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_THRESHOLD'
  | 'PROVIDER_FAILURE'
  | 'SHADOW_LOG_FAILURE';

export type RecordOutcomeErrorCode = 'INVALID_REQUEST' | 'SHADOW_LOG_FAILURE';

export interface ToolError<Code extends string> {
  code: Code;
  message: string;
}

export interface RecommendToolSuccess {
  schemaVersion: 1;
  shadow: true;
  traceId: string;
  recommendation: {
    decision: string;
    accepted: boolean;
    confidence: number;
    probabilities: Record<string, number>;
    confidenceSignals: ConfidenceSignals | null;
    coverageComplete: boolean;
    rejectionReason?: RejectionReason;
  };
  telemetry: {
    model: string;
    latencyMs: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface RecommendToolFailure {
  schemaVersion: 1;
  shadow: true;
  error: ToolError<RecommendErrorCode>;
}

export type RecommendToolOutput = RecommendToolSuccess | RecommendToolFailure;

export interface RecordOutcomeToolInput {
  traceId: string;
  actualAction: string;
  outcome?: OutcomeStatus;
}

export interface RecordOutcomeToolSuccess {
  schemaVersion: 1;
  recorded: true;
}

export interface RecordOutcomeToolFailure {
  schemaVersion: 1;
  recorded: false;
  error: ToolError<RecordOutcomeErrorCode>;
}

export type RecordOutcomeToolOutput =
  | RecordOutcomeToolSuccess
  | RecordOutcomeToolFailure;