import type { EnvironmentLoadResult } from '../config/environment.js';
import type { DeepSeekProviderConfig } from '../providers/deepseek-completion-provider.js';
import type { CommandIo, DecisionRunner } from './io.js';

export interface DoctorDependencies {
  environment: EnvironmentLoadResult;
  createEngine: (config: DeepSeekProviderConfig) => DecisionRunner;
  io: CommandIo;
}

const doctorProbe = {
  state: '已提供完整问题和充分证据，可以直接回答。',
  question: '下一步应该做什么？',
  options: [
    { id: 'ANSWER', description: '直接回答' },
    { id: 'ESCALATE', description: '交给 Codex 判断' }
  ]
};

export async function runDoctor(dependencies: DoctorDependencies): Promise<number> {
  const { environment, createEngine, io } = dependencies;
  if (!environment.ok) {
    io.writeError(`环境配置缺失或无效：${environment.errors.join(', ')}\n`);
    return 2;
  }

  try {
    const result = await createEngine(environment.createProviderConfig()).decide(doctorProbe);
    const coverage = result.coverage.complete ? '完整' : '不完整';
    io.writeOut([
      `模型：${result.model}`,
      `延迟：${result.latencyMs}ms`,
      `概率覆盖：${coverage}`,
      `输出 Token：${result.usage.completionTokens}`
    ].join('\n') + '\n');
    return result.coverage.complete && result.usage.completionTokens === 1 ? 0 : 3;
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    io.writeError(`DeepSeek 契约检查失败：${message}\n`);
    return 3;
  }
}
