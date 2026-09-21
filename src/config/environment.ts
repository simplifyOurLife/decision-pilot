import type { DeepSeekProviderConfig } from '../providers/deepseek-completion-provider.js';

export interface PricingConfig {
  inputPerMillion: number | null;
  outputPerMillion: number | null;
}

export type EnvironmentLoadResult =
  | {
    ok: true;
    createProviderConfig: () => DeepSeekProviderConfig;
    pricing: PricingConfig;
    summary: {
      baseUrl: string;
      model: string;
      timeoutMs: number;
      maxRetries: number;
    };
  }
  | {
    ok: false;
    errors: string[];
  };

function parsePositiveInteger(value: string | undefined, fallback: number): number | null {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseNonnegativeInteger(value: string | undefined, fallback: number): number | null {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseNonnegativeNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function loadEnvironment(
  environment: Readonly<Record<string, string | undefined>>
): EnvironmentLoadResult {
  const apiKey = environment.DEEPSEEK_API_KEY?.trim() ?? '';
  const model = environment.DEEPSEEK_MODEL?.trim() ?? '';
  const baseUrl = environment.DEEPSEEK_BASE_URL?.trim()
    || 'https://api.deepseek.com/beta';
  const timeoutMs = parsePositiveInteger(environment.DECISION_PILOT_TIMEOUT_MS, 30_000);
  const maxRetries = parseNonnegativeInteger(environment.DECISION_PILOT_MAX_RETRIES, 2);
  const errors: string[] = [];

  if (apiKey === '') errors.push('DEEPSEEK_API_KEY');
  if (model === '') errors.push('DEEPSEEK_MODEL');
  if (timeoutMs === null) errors.push('DECISION_PILOT_TIMEOUT_MS');
  if (maxRetries === null) errors.push('DECISION_PILOT_MAX_RETRIES');

  if (errors.length > 0 || timeoutMs === null || maxRetries === null) {
    return { ok: false, errors };
  }

  const inputPerMillion = parseNonnegativeNumber(
    environment.DECISION_PILOT_INPUT_PRICE_PER_MILLION
  );
  const outputPerMillion = parseNonnegativeNumber(
    environment.DECISION_PILOT_OUTPUT_PRICE_PER_MILLION
  );

  return {
    ok: true,
    createProviderConfig: () => ({
      apiKey,
      baseUrl,
      model,
      timeoutMs,
      maxRetries
    }),
    pricing: { inputPerMillion, outputPerMillion },
    summary: { baseUrl, model, timeoutMs, maxRetries }
  };
}
