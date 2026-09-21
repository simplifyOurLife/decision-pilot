import { DecisionError } from '../core/decision-engine.js';
import type { CommandIo, DecisionRunner } from './io.js';

export interface DecideOptions {
  inputPath?: string;
  threshold?: number;
}

export async function runDecide(
  options: DecideOptions,
  dependencies: { engine: DecisionRunner; io: CommandIo }
): Promise<number> {
  const { engine, io } = dependencies;
  if (options.inputPath !== undefined && io.hasStdin) {
    io.writeError('不能同时使用 --input 和标准输入。\n');
    return 2;
  }
  if (options.inputPath === undefined && !io.hasStdin) {
    io.writeError('请使用 --input 指定 JSON 文件，或通过标准输入传入 JSON。\n');
    return 2;
  }

  let input: unknown;
  try {
    const text = options.inputPath === undefined
      ? await io.readStdin()
      : await io.readFile(options.inputPath);
    input = JSON.parse(text);
  } catch {
    io.writeError('无法读取有效的 JSON 决策请求。\n');
    return 2;
  }

  try {
    const result = await engine.decide(input, options.threshold === undefined
      ? {}
      : { threshold: options.threshold });
    io.writeOut(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : '决策执行失败';
    io.writeError(`${message}\n`);
    return error instanceof DecisionError && error.code !== 'PROVIDER_FAILURE' ? 2 : 3;
  }
}
