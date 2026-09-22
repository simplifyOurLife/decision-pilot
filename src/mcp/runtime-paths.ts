import { homedir } from 'node:os';
import { resolve } from 'node:path';

export function resolveShadowRoot(
  environment: NodeJS.ProcessEnv,
  homeDirectory = homedir()
): string {
  const configured = environment.DECISION_PILOT_SHADOW_DIR?.trim();
  return configured === undefined || configured === ''
    ? resolve(homeDirectory, '.decision-pilot', 'shadow')
    : resolve(homeDirectory, configured);
}