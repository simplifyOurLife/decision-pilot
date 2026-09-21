import type { PricingConfig } from '../config/environment.js';
import { loadDataset } from '../evaluation/dataset-loader.js';
import { evaluateDataset, type EvaluationReport } from '../evaluation/evaluator.js';
import { writeReport as writeEvaluationReport } from '../evaluation/report-writer.js';
import type { CommandIo, DecisionRunner } from './io.js';

export interface EvalOptions {
  datasetPath: string;
  reportPath: string;
}

interface EvalDependencies {
  engine: DecisionRunner;
  io: CommandIo;
  pricing: PricingConfig;
  writeReport?: (path: string, report: EvaluationReport) => Promise<void>;
}

export async function runEval(
  options: EvalOptions,
  dependencies: EvalDependencies
): Promise<number> {
  let samples;
  try {
    const contents = await dependencies.io.readFile(options.datasetPath);
    samples = loadDataset(contents);
  } catch {
    dependencies.io.writeError('数据集读取或校验失败\n');
    return 2;
  }

  const report = await evaluateDataset(samples, dependencies.engine, dependencies.pricing);
  try {
    await (dependencies.writeReport ?? writeEvaluationReport)(options.reportPath, report);
  } catch {
    dependencies.io.writeError('评测报告写入失败\n');
    return 1;
  }

  dependencies.io.writeOut([
    `样本数：${report.requests.total}`,
    `准确率：${(report.accuracy * 100).toFixed(2)}%`,
    `覆盖率：${(report.coverageRate * 100).toFixed(2)}%`,
    `报告：${options.reportPath}`
  ].join('\n') + '\n');
  return report.requests.failed === 0 ? 0 : 1;
}
