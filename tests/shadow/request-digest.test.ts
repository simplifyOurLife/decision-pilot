import { describe, expect, it } from 'vitest';

import type { DecisionRequest } from '../../src/core/contracts.js';
import { createRequestDigest } from '../../src/shadow/request-digest.js';

const request: DecisionRequest = {
  state: '用户正在定位权限校验实现',
  question: '下一步应该做什么？',
  options: [
    { id: 'SEARCH', description: '搜索相关代码' },
    { id: 'ESCALATE', description: '交给 Codex 判断' }
  ]
};

describe('createRequestDigest', () => {
  it('为相同请求生成稳定且不含原文的 SHA-256 摘要', () => {
    const digest = createRequestDigest(request);

    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).toBe(createRequestDigest(structuredClone(request)));
    expect(digest).not.toContain(request.state);
    expect(digest).not.toContain(request.question);
  });

  it('请求内容变化时生成不同摘要', () => {
    expect(createRequestDigest({ ...request, question: '另一个问题' })).not.toBe(
      createRequestDigest(request)
    );
  });
});