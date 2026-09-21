import { z } from 'zod';

const logprobsSchema = z.object({
  tokens: z.array(z.string()).min(1),
  token_logprobs: z.array(z.number()).min(1),
  top_logprobs: z.array(z.record(z.string(), z.number())).min(1),
  text_offset: z.array(z.number()).min(1)
});

export const deepSeekCompletionResponseSchema = z.object({
  object: z.literal('text_completion'),
  model: z.string().min(1),
  choices: z.array(z.object({
    text: z.string().min(1),
    finish_reason: z.string().min(1),
    logprobs: logprobsSchema
  })).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative()
  })
});

export type DeepSeekCompletionResponse = z.infer<typeof deepSeekCompletionResponseSchema>;
