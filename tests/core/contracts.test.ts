import { describe, expect, it } from 'vitest';

import { parseDecisionRequest } from '../../src/core/contracts.js';

const validOptions = [
  { id: 'SEARCH', description: '搜索代码' },
  { id: 'ESCALATE', description: '交给 Codex 判断' }
];

const tenOptions = Array.from({ length: 10 }, (_, index) => ({
  id: `OPTION_${index + 1}`,
  description: `候选 ${index + 1}`
}));

const duplicateOptions = [
  { id: 'SEARCH', description: '搜索代码' },
  { id: 'SEARCH', description: '重复候选' }
];

const whitespaceIdOptions = [
  { id: '   ', description: '空白标识' },
  { id: 'ESCALATE', description: '交给 Codex 判断' }
];

describe('parseDecisionRequest', () => {
  it.each([
    [{ state: '', question: '下一步？', options: validOptions }, 'state'],
    [{ state: '状态', question: '', options: validOptions }, 'question'],
    [{ state: '状态', question: '下一步？', options: [validOptions[0]] }, 'options'],
    [{ state: '状态', question: '下一步？', options: tenOptions }, 'options'],
    [{ state: '状态', question: '下一步？', options: duplicateOptions }, '唯一'],
    [{ state: '状态', question: '下一步？', options: whitespaceIdOptions }, 'id']
  ])('拒绝非法请求 %#', (input, expectedMessage) => {
    expect(() => parseDecisionRequest(input)).toThrow(expectedMessage);
  });

  it('修剪合法字符串并返回类型化请求', () => {
    expect(parseDecisionRequest({
      state: '  当前状态  ',
      question: '  下一步？  ',
      options: [
        { id: ' SEARCH ', description: ' 搜索代码 ' },
        { id: ' ESCALATE ', description: ' 交给 Codex判断 ' }
      ]
    })).toEqual({
      state: '当前状态',
      question: '下一步？',
      options: [
        { id: 'SEARCH', description: '搜索代码' },
        { id: 'ESCALATE', description: '交给 Codex判断' }
      ]
    });
  });
});
