import type { ProviderResult } from '../core/contracts.js';

export interface DecisionProvider {
  score(prompt: string, signal?: AbortSignal): Promise<ProviderResult>;
}
