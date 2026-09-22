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