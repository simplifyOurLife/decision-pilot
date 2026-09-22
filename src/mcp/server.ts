#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { loadEnvironment } from '../config/environment.js';
import { DecisionEngine } from '../core/decision-engine.js';
import { DeepSeekCompletionProvider } from '../providers/deepseek-completion-provider.js';
import { ShadowRecorder } from '../shadow/shadow-recorder.js';
import { createDecisionPilotMcpServer } from './create-server.js';
import { DecisionPilotApplication } from './decision-pilot-application.js';

async function main(): Promise<void> {
  const environment = loadEnvironment(process.env);
  if (!environment.ok) {
    process.stderr.write('DecisionPilot MCP 配置无效\n');
    process.exitCode = 1;
    return;
  }

  const provider = new DeepSeekCompletionProvider(environment.createProviderConfig());
  const engine = new DecisionEngine(provider);
  const recorder = new ShadowRecorder();
  const application = new DecisionPilotApplication(engine, recorder);
  const server = createDecisionPilotMcpServer(application);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(() => {
  process.stderr.write('DecisionPilot MCP 启动失败\n');
  process.exitCode = 1;
});