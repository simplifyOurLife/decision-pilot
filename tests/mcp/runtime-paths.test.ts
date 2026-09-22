import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveShadowRoot } from '../../src/mcp/runtime-paths.js';

describe('resolveShadowRoot', () => {
  it('默认把影子日志放在用户目录而不是插件缓存目录', () => {
    const homeDirectory = resolve('D:/users/tester');

    expect(resolveShadowRoot({}, homeDirectory)).toBe(
      resolve(homeDirectory, '.decision-pilot', 'shadow')
    );
  });

  it('允许用环境变量覆盖日志目录', () => {
    const homeDirectory = resolve('D:/users/tester');
    const configured = resolve('D:/decision-pilot-logs');

    expect(resolveShadowRoot(
      { DECISION_PILOT_SHADOW_DIR: configured },
      homeDirectory
    )).toBe(configured);
  });
});