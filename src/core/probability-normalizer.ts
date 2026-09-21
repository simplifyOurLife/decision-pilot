import type { ProviderResult } from './contracts.js';
import type { PromptPlan } from './prompt-builder.js';

export interface NormalizedProbabilities {
  generatedOptionId?: string;
  probabilities: Readonly<Record<string, number>>;
  coverage: {
    complete: boolean;
    missingOptions: string[];
  };
}

export function normalizeToken(token: string): string {
  return token.trim();
}

function logAddExp(left: number, right: number): number {
  const maximum = Math.max(left, right);
  return maximum + Math.log(Math.exp(left - maximum) + Math.exp(right - maximum));
}

export function normalizeCandidateProbabilities(
  plan: PromptPlan,
  result: ProviderResult
): NormalizedProbabilities {
  const candidateLogprobs = new Map<string, number>();

  for (const [rawToken, logprob] of result.topLogprobs) {
    if (!Number.isFinite(logprob)) {
      continue;
    }

    const token = normalizeToken(rawToken);
    if (!plan.tokenToOptionId.has(token)) {
      continue;
    }

    const existing = candidateLogprobs.get(token);
    candidateLogprobs.set(
      token,
      existing === undefined ? logprob : logAddExp(existing, logprob)
    );
  }

  const missingOptions: string[] = [];
  const available = [...plan.tokenToOptionId.entries()].flatMap(([token, optionId]) => {
    const logprob = candidateLogprobs.get(token);
    if (logprob === undefined) {
      missingOptions.push(optionId);
      return [];
    }
    return [{ optionId, logprob }];
  });

  const probabilities: Record<string, number> = {};
  if (available.length > 0) {
    const maximum = Math.max(...available.map(({ logprob }) => logprob));
    const weighted = available.map(({ optionId, logprob }) => ({
      optionId,
      weight: Math.exp(logprob - maximum)
    }));
    const total = weighted.reduce((sum, { weight }) => sum + weight, 0);
    for (const { optionId, weight } of weighted) {
      probabilities[optionId] = weight / total;
    }
  }

  const generatedOptionId = plan.tokenToOptionId.get(normalizeToken(result.generatedToken));
  return {
    ...(generatedOptionId === undefined ? {} : { generatedOptionId }),
    probabilities,
    coverage: {
      complete: missingOptions.length === 0,
      missingOptions
    }
  };
}
