import {
  appendFile as appendFileToDisk,
  mkdir as makeDirectory
} from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { ConfidenceSignals } from '../core/contracts.js';
import type {
  OutcomeLogInput,
  RecommendationLogInput
} from './contracts.js';

type MkdirOperation = (
  path: string,
  options: { recursive: true }
) => Promise<unknown>;

type AppendFileOperation = (
  path: string,
  data: string,
  encoding: 'utf8'
) => Promise<void>;

export interface ShadowRecorderOptions {
  rootDirectory?: string;
  now?: () => Date;
  mkdir?: MkdirOperation;
  appendFile?: AppendFileOperation;
}

interface ShadowEventBase {
  schemaVersion: 1;
  timestamp: string;
  traceId: string;
}

interface RecommendationShadowEvent extends ShadowEventBase {
  eventType: 'recommendation';
  requestDigest: string;
  optionIds: string[];
  predictedAction: string;
  accepted: boolean;
  rejectionReason?: string;
  coverageComplete: boolean;
  confidence: number;
  confidenceSignals: ConfidenceSignals | null;
  model: string;
  latencyMs: number;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

interface OutcomeShadowEvent extends ShadowEventBase {
  eventType: 'outcome';
  actualAction: string;
  outcome?: OutcomeLogInput['outcome'];
}

type ShadowEvent = RecommendationShadowEvent | OutcomeShadowEvent;

export class ShadowLogError extends Error {
  readonly code = 'SHADOW_LOG_FAILURE';

  constructor() {
    super('影子日志写入失败');
    this.name = 'ShadowLogError';
  }

  toJSON(): Record<string, string> {
    return { name: this.name, code: this.code, message: this.message };
  }
}

function copyConfidenceSignals(signals: ConfidenceSignals | null): ConfidenceSignals | null {
  if (signals === null) return null;

  return {
    topOptionId: signals.topOptionId,
    runnerUpOptionId: signals.runnerUpOptionId,
    topLogprob: signals.topLogprob,
    runnerUpLogprob: signals.runnerUpLogprob,
    logprobMargin: signals.logprobMargin
  };
}

export class ShadowRecorder {
  private readonly rootDirectory: string;
  private readonly now: () => Date;
  private readonly mkdir: MkdirOperation;
  private readonly appendFile: AppendFileOperation;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: ShadowRecorderOptions = {}) {
    this.rootDirectory = options.rootDirectory
      ?? resolve(process.cwd(), '.decision-pilot', 'shadow');
    this.now = options.now ?? (() => new Date());
    this.mkdir = options.mkdir ?? (async (path, mkdirOptions) => {
      await makeDirectory(path, mkdirOptions);
    });
    this.appendFile = options.appendFile ?? appendFileToDisk;
  }

  async recordRecommendation(input: RecommendationLogInput): Promise<void> {
    const timestamp = this.now().toISOString();
    const event: RecommendationShadowEvent = {
      schemaVersion: 1,
      eventType: 'recommendation',
      timestamp,
      traceId: input.traceId,
      requestDigest: input.requestDigest,
      optionIds: [...input.optionIds],
      predictedAction: input.predictedAction,
      accepted: input.accepted,
      ...(input.rejectionReason === undefined
        ? {}
        : { rejectionReason: input.rejectionReason }),
      coverageComplete: input.coverageComplete,
      confidence: input.confidence,
      confidenceSignals: copyConfidenceSignals(input.confidenceSignals),
      model: input.model,
      latencyMs: input.latencyMs,
      usage: {
        promptTokens: input.usage.promptTokens,
        completionTokens: input.usage.completionTokens,
        totalTokens: input.usage.totalTokens
      }
    };

    await this.enqueue(event);
  }

  async recordOutcome(input: OutcomeLogInput): Promise<void> {
    const event: OutcomeShadowEvent = {
      schemaVersion: 1,
      eventType: 'outcome',
      timestamp: this.now().toISOString(),
      traceId: input.traceId,
      actualAction: input.actualAction,
      ...(input.outcome === undefined ? {} : { outcome: input.outcome })
    };

    await this.enqueue(event);
  }

  private async enqueue(event: ShadowEvent): Promise<void> {
    const operation = this.queue
      .catch(() => undefined)
      .then(() => this.appendEvent(event));
    this.queue = operation;
    await operation;
  }

  private async appendEvent(event: ShadowEvent): Promise<void> {
    try {
      await this.mkdir(this.rootDirectory, { recursive: true });
      const fileName = `${event.timestamp.slice(0, 10)}.jsonl`;
      await this.appendFile(
        join(this.rootDirectory, fileName),
        `${JSON.stringify(event)}\n`,
        'utf8'
      );
    } catch {
      throw new ShadowLogError();
    }
  }
}