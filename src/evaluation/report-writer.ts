import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function writeReport(path: string, report: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, undefined, 2)}\n`, 'utf8');
}
