import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  RecommendToolFailure,
  RecommendToolSuccess,
  RecordOutcomeToolSuccess
} from '../../src/mcp/contracts.js';
import { createDecisionPilotMcpServer } from '../../src/mcp/create-server.js';

const input = {
  state: '需要定位权限实现',
  question: '下一步做什么？',
  options: [
    { id: 'SEARCH', description: '搜索代码' },
    { id: 'ESCALATE', description: '交给 Codex 判断' }
  ]
};
const success: RecommendToolSuccess = {
  schemaVersion: 1,
  shadow: true,
  traceId: '123e4567-e89b-42d3-a456-426614174000',
  recommendation: {
    decision: 'SEARCH',
    accepted: true,
    confidence: 0.95,
    probabilities: { SEARCH: 0.95, ESCALATE: 0.05 },
    confidenceSignals: {
      topOptionId: 'SEARCH',
      runnerUpOptionId: 'ESCALATE',
      topLogprob: -0.1,
      runnerUpLogprob: -3.1,
      logprobMargin: 3
    },
    coverageComplete: true
  },
  telemetry: {
    model: 'deepseek-flash',
    latencyMs: 25,
    promptTokens: 20,
    completionTokens: 1,
    totalTokens: 21
  }
};
const failure: RecommendToolFailure = {
  schemaVersion: 1,
  shadow: true,
  error: { code: 'PROVIDER_FAILURE', message: '决策服务暂时不可用' }
};
const outcomeSuccess: RecordOutcomeToolSuccess = { schemaVersion: 1, recorded: true };

const closeables: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.allSettled(closeables.splice(0).map(async (item) => item.close()));
});

async function connect(application: {
  recommend(input: unknown): Promise<RecommendToolSuccess | RecommendToolFailure>;
  recordOutcome(input: unknown): Promise<RecordOutcomeToolSuccess>;
}): Promise<{ client: Client; server: McpServer }> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createDecisionPilotMcpServer(application);
  const client = new Client({ name: 'decision-pilot-test', version: '1.0.0' });
  closeables.push(client, server);
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport)
  ]);
  return { client, server };
}

describe('createDecisionPilotMcpServer', () => {
  it('发现两个影子工具并明确建议不授权执行', async () => {
    const application = {
      recommend: vi.fn(async () => success),
      recordOutcome: vi.fn(async () => outcomeSuccess)
    };
    const { client } = await connect(application);

    const tools = await client.listTools();

    expect(tools.tools.map(({ name }) => name)).toEqual([
      'decision_pilot_recommend',
      'decision_pilot_record_outcome'
    ]);
    expect(tools.tools[0]?.description).toContain('仅供影子观测');
    expect(tools.tools[0]?.description).toContain('不授权执行任何动作');
  });

  it('通过结构化内容返回建议并原样传递已校验输入', async () => {
    const application = {
      recommend: vi.fn(async () => success),
      recordOutcome: vi.fn(async () => outcomeSuccess)
    };
    const { client } = await connect(application);

    const result = await client.callTool({
      name: 'decision_pilot_recommend',
      arguments: input
    });

    expect(result.structuredContent).toEqual(success);
    expect(result.isError).not.toBe(true);
    expect(application.recommend).toHaveBeenCalledWith(input);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0]!.text)).toEqual(success);
  });

  it('记录 outcome 但不触发 recommendation', async () => {
    const application = {
      recommend: vi.fn(async () => success),
      recordOutcome: vi.fn(async () => outcomeSuccess)
    };
    const { client } = await connect(application);
    const outcomeInput = {
      traceId: '123e4567-e89b-42d3-a456-426614174000',
      actualAction: 'SEARCH',
      outcome: 'SUCCEEDED'
    };

    const result = await client.callTool({
      name: 'decision_pilot_record_outcome',
      arguments: outcomeInput
    });

    expect(result.structuredContent).toEqual(outcomeSuccess);
    expect(application.recordOutcome).toHaveBeenCalledWith(outcomeInput);
    expect(application.recommend).not.toHaveBeenCalled();
  });

  it('业务失败标记 isError 且不会关闭后续调用', async () => {
    const recommend = vi.fn()
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(success);
    const application = {
      recommend,
      recordOutcome: vi.fn(async () => outcomeSuccess)
    };
    const { client } = await connect(application);

    const first = await client.callTool({
      name: 'decision_pilot_recommend',
      arguments: input
    });
    const second = await client.callTool({
      name: 'decision_pilot_recommend',
      arguments: input
    });

    expect(first.isError).toBe(true);
    expect(first.structuredContent).toEqual(failure);
    expect(second.isError).not.toBe(true);
    expect(second.structuredContent).toEqual(success);
    expect(recommend).toHaveBeenCalledTimes(2);
  });
});