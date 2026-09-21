export type ProviderErrorCode =
  | 'AUTHENTICATION'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'NETWORK_ERROR';

export class ProviderError extends Error {
  readonly status: number | undefined;
  readonly retryable: boolean;

  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    options: { status?: number; retryable?: boolean; cause?: unknown } = {}
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ProviderError';
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      ...(this.status === undefined ? {} : { status: this.status }),
      retryable: this.retryable
    };
  }
}
