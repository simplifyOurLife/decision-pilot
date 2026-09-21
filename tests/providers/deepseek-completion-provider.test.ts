import { readFile } from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DeepSeekCompletionProvider,
  type DeepSeekProviderConfig,
  type ProviderDependencies
} from '../../src/providers/deepseek-completion-provider.js';
import { ProviderError } from '../../src/providers/provider-error.js';

const apiKey = 'secret-key-123456';
const config: DeepSeekProviderConfig = {
  apiKey,
  baseUrl: 'https://api.deepseek.com/beta/',
  model: 'deepseek-flash',
  timeoutMs: 5_000,
  maxRetries: 2
};

async function loadFixture(): Promise<unknown> {
  const fixtureUrl = new URL('../fixtures/deepseek-completion-success.json', import.meta.url);
  return JSON.parse(await readFile(fixtureUrl, 'utf8'));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function createProvider(
  fetchImplementation: ProviderDependencies['fetch'],
  overrides: Partial<DeepSeekProviderConfig> = {},
  dependencyOverrides: Partial<ProviderDependencies> = {}
): DeepSeekCompletionProvider {
  return new DeepSeekCompletionProvider(
    { ...config, ...overrides },
    {
      fetch: fetchImplementation,
      now: () => 1_000,
      sleep: async () => undefined,
      ...dependencyOverrides
    }
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('DeepSeekCompletionProvider', () => {
  it('发送单 Token 请求并解析 Completion 响应', async () => {
    const fixture = await loadFixture();
    const fetchMock = vi.fn<ProviderDependencies['fetch']>(
      async () => jsonResponse(fixture)
    );
    const provider = createProvider(fetchMock, {}, { now: vi.fn()
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_286) });

    const result = await provider.score('PROMPT');

    expect(result.generatedToken).toBe('1');
    expect(result.topLogprobs.get('1')).toBeCloseTo(-0.059441254);
    expect(result.usage).toEqual({
      promptTokens: 57,
      completionTokens: 1,
      totalTokens: 58
    });
    expect(result.latencyMs).toBe(286);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.deepseek.com/beta/completions');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'deepseek-flash',
      prompt: 'PROMPT',
      max_tokens: 1,
      logprobs: 20,
      stream: false,
      temperature: 0
    });
  });

  it.each([
    [401, 'AUTHENTICATION'],
    [400, 'HTTP_ERROR']
  ])('HTTP %i 不重试并返回 %s', async (status, code) => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { message: apiKey } }, status));
    const provider = createProvider(fetchMock);

    const error = await provider.score('PROMPT').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ code, status });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(error)).not.toContain(apiKey);
  });

  it('只对 429 和 5xx 做有限指数退避', async () => {
    const fixture = await loadFixture();
    const responses = [
      jsonResponse({}, 429),
      jsonResponse({}, 500),
      jsonResponse(fixture)
    ];
    const fetchMock = vi.fn(async () => responses.shift()!);
    const delays: number[] = [];
    const provider = createProvider(fetchMock, {}, {
      sleep: async (milliseconds) => { delays.push(milliseconds); }
    });

    await expect(provider.score('PROMPT')).resolves.toMatchObject({ generatedToken: '1' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([500, 1_000]);
  });

  it('调用方预先取消时不发送请求', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn(async () => jsonResponse(await loadFixture()));
    const provider = createProvider(fetchMock);

    await expect(provider.score('PROMPT', controller.signal)).rejects.toMatchObject({
      code: 'ABORTED'
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('内部超时与调用方取消使用不同错误码', async () => {
    vi.useFakeTimers();
    const fetchMock: ProviderDependencies['fetch'] = async (_input, init) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      })
    );
    const provider = createProvider(fetchMock, { timeoutMs: 10, maxRetries: 0 });

    const assertion = expect(provider.score('PROMPT')).rejects.toMatchObject({
      code: 'TIMEOUT'
    });
    await vi.advanceTimersByTimeAsync(10);

    await assertion;
  });

  it.each([
    [{ object: 'text_completion', choices: [], model: 'x', usage: {} }],
    [{ object: 'text_completion', choices: [{ text: '1', finish_reason: 'length' }], model: 'x', usage: {} }],
    [{
      object: 'text_completion',
      choices: [{
        text: '1',
        finish_reason: 'length',
        logprobs: { tokens: ['1'], token_logprobs: [0], top_logprobs: [{ '1': 0 }], text_offset: [0] }
      }],
      model: 'x'
    }]
  ])('拒绝不完整响应 %#', async (body) => {
    const fetchMock = vi.fn(async () => jsonResponse(body));
    const provider = createProvider(fetchMock);

    await expect(provider.score('PROMPT')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE'
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
