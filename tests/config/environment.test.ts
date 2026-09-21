import { describe, expect, it } from 'vitest';

import { loadEnvironment } from '../../src/config/environment.js';

const validEnvironment = {
  DEEPSEEK_API_KEY: 'secret-key-123456',
  DEEPSEEK_MODEL: 'deepseek-flash',
  DEEPSEEK_BASE_URL: 'https://api.deepseek.com/beta'
};

describe('loadEnvironment', () => {
  it('报告缺失的 API Key', () => {
    const result = loadEnvironment({
      ...validEnvironment,
      DEEPSEEK_API_KEY: ''
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('DEEPSEEK_API_KEY');
    }
  });

  it('报告空模型名和非法超时', () => {
    const result = loadEnvironment({
      ...validEnvironment,
      DEEPSEEK_MODEL: '   ',
      DECISION_PILOT_TIMEOUT_MS: '-1'
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(expect.arrayContaining([
        'DEEPSEEK_MODEL',
        'DECISION_PILOT_TIMEOUT_MS'
      ]));
    }
  });

  it('通过闭包提供 Provider 配置且序列化时不泄露 Key', () => {
    const result = loadEnvironment(validEnvironment);

    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain(validEnvironment.DEEPSEEK_API_KEY);
    if (result.ok) {
      expect(result.createProviderConfig()).toMatchObject({
        apiKey: validEnvironment.DEEPSEEK_API_KEY,
        model: 'deepseek-flash',
        baseUrl: 'https://api.deepseek.com/beta'
      });
    }
  });

  it('允许显式关闭 HTTP 重试', () => {
    const result = loadEnvironment({
      ...validEnvironment,
      DECISION_PILOT_MAX_RETRIES: '0'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.createProviderConfig().maxRetries).toBe(0);
    }
  });
});
