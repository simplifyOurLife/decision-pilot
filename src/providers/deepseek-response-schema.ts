import { z } from 'zod';

const tokenLogprobSchema = z.object({
  token: z.string().min(1),
  logprob: z.number(),
  bytes: z.array(z.number().int().nonnegative()).nullable(),
  top_logprobs: z.array(z.object({
    token: z.string().min(1),
    logprob: z.number(),
    bytes: z.array(z.number().int().nonnegative()).nullable()
  })).min(1)
});

export const deepSeekCompletionResponseSchema = z.object({
  object: z.literal('chat.completion'),
  model: z.string().min(1),
  choices: z.array(z.object({
    message: z.object({
      role: z.literal('assistant'),
      content: z.string().min(1)
    }),
    finish_reason: z.string().min(1),
    logprobs: z.object({
      content: z.array(tokenLogprobSchema).min(1)
    })
  })).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative()
  })
});

export type DeepSeekCompletionResponse = z.infer<typeof deepSeekCompletionResponseSchema>;
