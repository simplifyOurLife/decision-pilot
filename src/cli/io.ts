import { readFile } from 'node:fs/promises';

import type { DecisionResult } from '../core/contracts.js';

export interface DecisionRunner {
  decide(
    input: unknown,
    options?: { threshold?: number; signal?: AbortSignal }
  ): Promise<DecisionResult>;
}

export interface CommandIo {
  hasStdin: boolean;
  readStdin: () => Promise<string>;
  readFile: (path: string) => Promise<string>;
  writeOut: (value: string) => void;
  writeError: (value: string) => void;
}

async function readProcessStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createProcessIo(): CommandIo {
  return {
    hasStdin: process.stdin.isTTY !== true,
    readStdin: readProcessStdin,
    readFile: (path) => readFile(path, 'utf8'),
    writeOut: (value) => { process.stdout.write(value); },
    writeError: (value) => { process.stderr.write(value); }
  };
}
