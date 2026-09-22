import { z } from 'zod';

import { decisionRequestSchema } from '../core/contracts.js';

export const confidenceSignalsSchema = z.object({
  topOptionId: z.string(),
  runnerUpOptionId: z.string().nullable(),
  topLogprob: z.number(),
  runnerUpLogprob: z.number().nullable(),
  logprobMargin: z.number().nullable()
});

export const recommendInputSchema = decisionRequestSchema.safeExtend({
  threshold: z.number().min(0).max(1).optional()
});

const actualActionSchema = z.string()
  .refine((value) => !/[\r\n]/u.test(value), 'actualAction 不能包含换行')
  .transform((value) => value.trim())
  .pipe(z.string().min(1).max(128));

export const recordOutcomeInputSchema = z.object({
  traceId: z.string().trim().uuid(),
  actualAction: actualActionSchema,
  outcome: z.enum(['SUCCEEDED', 'FAILED', 'SKIPPED']).optional()
});

// MCP SDK 会在 handler 前校验输入。逐字段把非法值替换为固定无效哨兵，
// 既保留工具发现 Schema，又让应用层返回稳定且不泄露输入的错误契约。
export const recommendTransportInputSchema = z.object({
  state: recommendInputSchema.shape.state.catch(''),
  question: recommendInputSchema.shape.question.catch(''),
  options: recommendInputSchema.shape.options.catch([]),
  threshold: recommendInputSchema.shape.threshold.catch(Number.NaN)
}).passthrough();

export const recordOutcomeTransportInputSchema = z.object({
  traceId: recordOutcomeInputSchema.shape.traceId.catch(''),
  actualAction: recordOutcomeInputSchema.shape.actualAction.catch(''),
  outcome: recordOutcomeInputSchema.shape.outcome.catch(
    'INVALID_OUTCOME' as z.output<typeof recordOutcomeInputSchema.shape.outcome>
  )
}).passthrough();

export const recommendToolOutputSchema = z.object({
  schemaVersion: z.literal(1),
  shadow: z.literal(true),
  traceId: z.string(),
  recommendation: z.object({
    decision: z.string(),
    accepted: z.boolean(),
    confidence: z.number(),
    probabilities: z.record(z.string(), z.number()),
    confidenceSignals: confidenceSignalsSchema.nullable(),
    coverageComplete: z.boolean(),
    rejectionReason: z.enum([
      'LOW_CONFIDENCE',
      'INCOMPLETE_COVERAGE',
      'INVALID_GENERATED_TOKEN',
      'INVALID_PROVIDER_RESPONSE'
    ]).optional()
  }),
  telemetry: z.object({
    model: z.string(),
    latencyMs: z.number(),
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number()
  })
});

export const recordOutcomeToolOutputSchema = z.object({
  schemaVersion: z.literal(1),
  recorded: z.literal(true)
});