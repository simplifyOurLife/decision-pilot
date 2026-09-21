#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { runDecide } from './decide-command.js';
import { runDoctor } from './doctor-command.js';
import { createProcessIo, type CommandIo } from './io.js';
import { loadEnvironment } from '../config/environment.js';
import { DecisionEngine } from '../core/decision-engine.js';
import { DeepSeekCompletionProvider } from '../providers/deepseek-completion-provider.js';

function usage(): string {
  return [
    '用法：',
    '  decision-pilot doctor',
    '  decision-pilot decide [--input <file>] [--threshold <0..1>]',
    '  decision-pilot eval --dataset <file> --report <file>'
  ].join('\n') + '\n';
}

function createEngine(
  config: ConstructorParameters<typeof DeepSeekCompletionProvider>[0]
): DecisionEngine {
  return new DecisionEngine(new DeepSeekCompletionProvider(config));
}

export async function runCli(args: string[], io: CommandIo = createProcessIo()): Promise<number> {
  const [command, ...commandArgs] = args;
  if (command === undefined || command === '--help' || command === '-h') {
    io.writeOut(usage());
    return 0;
  }

  const environment = loadEnvironment(process.env);
  if (command === 'doctor') {
    return runDoctor({ environment, createEngine, io });
  }

  if (command === 'decide') {
    let values: { input?: string; threshold?: string };
    try {
      ({ values } = parseArgs({
        args: commandArgs,
        options: {
          input: { type: 'string' },
          threshold: { type: 'string' }
        },
        strict: true
      }));
    } catch {
      io.writeError(usage());
      return 2;
    }

    if (!environment.ok) {
      io.writeError(`环境配置缺失或无效：${environment.errors.join(', ')}\n`);
      return 2;
    }
    const threshold = values.threshold === undefined ? undefined : Number(values.threshold);
    return runDecide({
      ...(values.input === undefined ? {} : { inputPath: values.input }),
      ...(threshold === undefined ? {} : { threshold })
    }, { engine: createEngine(environment.createProviderConfig()), io });
  }

  io.writeError(usage());
  return 2;
}

const entryPath = process.argv[1];
if (entryPath !== undefined && import.meta.url === pathToFileURL(entryPath).href) {
  process.exitCode = await runCli(process.argv.slice(2));
}
