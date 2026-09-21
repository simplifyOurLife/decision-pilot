import { z } from 'zod';

const decisionOptionSchema = z.object({
  id: z.string().trim().min(1, 'id 不能为空'),
  description: z.string().trim().min(1, 'description 不能为空')
});

export const decisionRequestSchema = z.object({
  state: z.string().trim().min(1, 'state 不能为空'),
  question: z.string().trim().min(1, 'question 不能为空'),
  options: z.array(decisionOptionSchema)
    .min(2, 'options 至少需要 2 个候选项')
    .max(9, 'options 最多允许 9 个候选项')
}).superRefine((request, context) => {
  const seen = new Set<string>();
  request.options.forEach((option, index) => {
    if (seen.has(option.id)) {
      context.addIssue({
        code: 'custom',
        path: ['options', index, 'id'],
        message: '候选 id 必须唯一'
      });
    }
    seen.add(option.id);
  });
});

export type DecisionOption = z.infer<typeof decisionOptionSchema>;
export type DecisionRequest = z.infer<typeof decisionRequestSchema>;

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ProviderResult {
  generatedToken: string;
  topLogprobs: ReadonlyMap<string, number>;
  usage: TokenUsage;
  latencyMs: number;
  model: string;
  finishReason: string;
}

export type RejectionReason =
  | 'LOW_CONFIDENCE'
  | 'INCOMPLETE_COVERAGE'
  | 'INVALID_GENERATED_TOKEN'
  | 'INVALID_PROVIDER_RESPONSE';

export interface DecisionResult {
  decision: string;
  confidence: number;
  accepted: boolean;
  rejectionReason?: RejectionReason;
  probabilities: Readonly<Record<string, number>>;
  coverage: {
    complete: boolean;
    missingOptions: string[];
  };
  usage: TokenUsage;
  latencyMs: number;
  model: string;
}

export class DecisionValidationError extends Error {
  readonly code = 'INVALID_DECISION_REQUEST';

  constructor(message: string) {
    super(message);
    this.name = 'DecisionValidationError';
  }
}

export function parseDecisionRequest(input: unknown): DecisionRequest {
  const result = decisionRequestSchema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  const message = result.error.issues
    .map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`)
    .join('；');
  throw new DecisionValidationError(`决策请求无效：${message}`);
}
