import { describe, expect, it } from 'vitest';

import { loadDataset } from '../../src/evaluation/dataset-loader.js';

function sample(id = 'sample-1', expected = 'SEARCH'): Record<string, unknown> {
  return {
    id,
    category: 'SEARCH',
    expected,
    rationale: '需要先定位实现',
    request: {
      state: '用户尚未提供文件位置',
      question: '下一步做什么？',
      options: [
        { id: 'SEARCH', description: '搜索代码' },
        { id: 'ESCALATE', description: '交给 Codex' }
      ]
    }
  };
}

describe('loadDataset', () => {
  it('加载 JSONL 并忽略空行', () => {
    const result = loadDataset(`${JSON.stringify(sample())}\n\n`);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('sample-1');
  });

  it.each([
    ['', '至少一条'],
    ['{invalid', '第 1 行'],
    [[sample('same'), sample('same')].map((item) => JSON.stringify(item)).join('\n'), '重复'],
    [JSON.stringify(sample('bad-expected', 'READ')), 'expected'],
    [JSON.stringify({
      ...sample('no-escalate'),
      request: {
        ...(sample().request as object),
        options: [
          { id: 'SEARCH', description: '搜索代码' },
          { id: 'ANSWER', description: '直接回答' }
        ]
      }
    }), 'ESCALATE']
  ])('拒绝非法数据集 %#', (jsonl, message) => {
    expect(() => loadDataset(jsonl)).toThrow(message);
  });

  it('错误不回显完整状态', () => {
    const secretState = '这是不应出现在错误中的完整敏感状态';
    const invalid = sample('secret');
    invalid.request = { state: secretState, question: '', options: [] };

    try {
      loadDataset(JSON.stringify(invalid));
      throw new Error('期望校验失败');
    } catch (error) {
      expect(String(error)).not.toContain(secretState);
    }
  });
});
