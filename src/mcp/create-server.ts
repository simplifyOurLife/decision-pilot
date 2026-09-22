import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type {
  RecommendToolOutput,
  RecordOutcomeToolOutput
} from './contracts.js';
import {
  recommendInputSchema,
  recommendToolOutputSchema,
  recordOutcomeInputSchema,
  recordOutcomeToolOutputSchema
} from './schemas.js';

export interface DecisionPilotTools {
  recommend(input: unknown): Promise<RecommendToolOutput>;
  recordOutcome(input: unknown): Promise<RecordOutcomeToolOutput>;
}

function toolResult(output: RecommendToolOutput | RecordOutcomeToolOutput) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(output) }],
    structuredContent: { ...output },
    ...('error' in output ? { isError: true } : {})
  };
}

export function createDecisionPilotMcpServer(
  application: DecisionPilotTools
): McpServer {
  const server = new McpServer({ name: 'decision-pilot', version: '0.1.0' });

  server.registerTool(
    'decision_pilot_recommend',
    {
      title: 'DecisionPilot 影子建议',
      description: '对下一步候选动作评分。输出仅供影子观测，不授权执行任何动作。',
      inputSchema: recommendInputSchema,
      outputSchema: recommendToolOutputSchema
    },
    async (input) => toolResult(await application.recommend(input))
  );

  server.registerTool(
    'decision_pilot_record_outcome',
    {
      title: 'DecisionPilot 记录实际动作',
      description: '记录 Codex 已独立选择的实际动作标签，不会触发或执行该动作。',
      inputSchema: recordOutcomeInputSchema,
      outputSchema: recordOutcomeToolOutputSchema
    },
    async (input) => toolResult(await application.recordOutcome(input))
  );

  return server;
}