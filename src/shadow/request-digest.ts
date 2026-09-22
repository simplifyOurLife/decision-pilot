import { createHash } from 'node:crypto';

import type { DecisionRequest } from '../core/contracts.js';

export function createRequestDigest(request: DecisionRequest): string {
  const canonicalRequest = {
    state: request.state,
    question: request.question,
    options: request.options.map(({ id, description }) => ({ id, description }))
  };

  return createHash('sha256')
    .update(JSON.stringify(canonicalRequest), 'utf8')
    .digest('hex');
}