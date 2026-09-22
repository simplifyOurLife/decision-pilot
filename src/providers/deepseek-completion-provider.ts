import type { ProviderResult } from '../core/contracts.js';
import type { DecisionProvider } from './decision-provider.js';
import { deepSeekCompletionResponseSchema } from './deepseek-response-schema.js';
import { ProviderError } from './provider-error.js';

export interface DeepSeekProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
}

export interface ProviderDependencies {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  now: () => number;
  sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

function defaultSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

const defaultDependencies: ProviderDependencies = {
  fetch: globalThis.fetch.bind(globalThis),
  now: () => Date.now(),
  sleep: defaultSleep
};

export class DeepSeekCompletionProvider implements DecisionProvider {
  private readonly dependencies: ProviderDependencies;

  constructor(
    private readonly config: DeepSeekProviderConfig,
    dependencies: Partial<ProviderDependencies> = {}
  ) {
    this.dependencies = { ...defaultDependencies, ...dependencies };
  }

  async score(prompt: string, signal?: AbortSignal): Promise<ProviderResult> {
    if (signal?.aborted) {
      throw new ProviderError('ABORTED', '调用已由请求方取消');
    }

    const startedAt = this.dependencies.now();
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      const response = await this.fetchAttempt(prompt, signal);
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < this.config.maxRetries) {
          await this.sleepBeforeRetry(500 * (2 ** attempt), signal);
          continue;
        }

        throw new ProviderError(
          response.status === 401 ? 'AUTHENTICATION' : 'HTTP_ERROR',
          response.status === 401 ? 'DeepSeek 认证失败' : `DeepSeek 请求失败（HTTP ${response.status}）`,
          { status: response.status, retryable }
        );
      }

      const body = await this.readJson(response);
      const parsed = deepSeekCompletionResponseSchema.safeParse(body);
      if (!parsed.success) {
        const issuePaths = [...new Set(parsed.error.issues.map((issue) => (
          issue.path.length === 0 ? 'response' : issue.path.join('.')
        )))].slice(0, 5);
        throw new ProviderError(
          'INVALID_RESPONSE',
          `DeepSeek 返回了不符合契约的响应（字段：${issuePaths.join(', ')}）`
        );
      }

      const choice = parsed.data.choices[0]!;
      const topLogprobs = choice.logprobs.top_logprobs[0]!;
      return {
        generatedToken: choice.text,
        topLogprobs: new Map(Object.entries(topLogprobs)),
        usage: {
          promptTokens: parsed.data.usage.prompt_tokens,
          completionTokens: parsed.data.usage.completion_tokens,
          totalTokens: parsed.data.usage.total_tokens
        },
        latencyMs: this.dependencies.now() - startedAt,
        model: parsed.data.model,
        finishReason: choice.finish_reason
      };
    }

    throw new ProviderError('NETWORK_ERROR', 'DeepSeek 请求未能完成');
  }

  private async fetchAttempt(prompt: string, signal?: AbortSignal): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const onCallerAbort = (): void => controller.abort();
    signal?.addEventListener('abort', onCallerAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.config.timeoutMs);

    try {
      return await this.dependencies.fetch(this.completionsUrl(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.config.model,
          prompt,
          max_tokens: 1,
          logprobs: 20,
          stream: false,
          temperature: 0
        }),
        signal: controller.signal
      });
    } catch (error) {
      if (signal?.aborted) {
        throw new ProviderError('ABORTED', '调用已由请求方取消');
      }
      if (timedOut) {
        throw new ProviderError('TIMEOUT', 'DeepSeek 请求超时');
      }
      throw new ProviderError('NETWORK_ERROR', '无法连接 DeepSeek 服务', { cause: error });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onCallerAbort);
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw new ProviderError('INVALID_RESPONSE', 'DeepSeek 返回了无效 JSON', { cause: error });
    }
  }

  private async sleepBeforeRetry(milliseconds: number, signal?: AbortSignal): Promise<void> {
    try {
      await this.dependencies.sleep(milliseconds, signal);
    } catch (error) {
      if (signal?.aborted) {
        throw new ProviderError('ABORTED', '调用已由请求方取消');
      }
      throw new ProviderError('NETWORK_ERROR', '重试等待失败', { cause: error });
    }
  }

  private completionsUrl(): string {
    return `${this.config.baseUrl.replace(/\/+$/, '')}/completions`;
  }
}
