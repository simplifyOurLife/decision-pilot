import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pluginRoot = resolve(repositoryRoot, 'plugins', 'decision-pilot');

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
}

describe('decision-pilot Codex 插件', () => {
  it('manifest 只声明实际存在的 Skill 与 MCP companion', async () => {
    const manifest = await readJson(resolve(pluginRoot, '.codex-plugin', 'plugin.json'));

    expect(manifest).toMatchObject({
      name: 'decision-pilot',
      version: '0.1.0',
      description: expect.any(String),
      author: { name: 'simplifyOurLife' },
      repository: 'https://github.com/simplifyOurLife/decision-pilot',
      skills: './skills/',
      mcpServers: './.mcp.json'
    });
    await expect(access(resolve(pluginRoot, 'skills'))).resolves.toBeUndefined();
    await expect(access(resolve(pluginRoot, '.mcp.json'))).resolves.toBeUndefined();
    expect(manifest).not.toHaveProperty('apps');
    expect(manifest).not.toHaveProperty('hooks');
  });

  it('仓库 marketplace 使用本地相对路径与明确安装策略', async () => {
    const marketplace = await readJson(
      resolve(repositoryRoot, '.agents', 'plugins', 'marketplace.json')
    ) as { plugins?: unknown[] };

    expect(marketplace.plugins).toContainEqual(expect.objectContaining({
      name: 'decision-pilot',
      source: { source: 'local', path: './plugins/decision-pilot' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
      category: 'Productivity'
    }));
  });

  it('stdio 配置从插件根目录指向构建后的 MCP 入口', async () => {
    const mcp = await readJson(resolve(pluginRoot, '.mcp.json')) as {
      mcpServers?: Record<string, {
        command?: string;
        cwd?: string;
        args?: string[];
        env_vars?: string[];
      }>;
    };
    const server = mcp.mcpServers?.['decision-pilot'];

    expect(server?.command).toBe('node');
    expect(server?.cwd).toBe('.');
    expect(server?.args).toEqual(['./mcp/server.bundle.mjs']);
    expect(server?.env_vars).toEqual(expect.arrayContaining([
      'DEEPSEEK_API_KEY',
      'DEEPSEEK_MODEL',
      'DEEPSEEK_BASE_URL',
      'DECISION_PILOT_TIMEOUT_MS',
      'DECISION_PILOT_MAX_RETRIES'
    ]));
    expect(resolve(pluginRoot, server!.args![0]!)).toBe(
      resolve(pluginRoot, 'mcp', 'server.bundle.mjs')
    );
    expect(server?.env_vars).toContain('DECISION_PILOT_SHADOW_DIR');

    const packageJson = await readJson(resolve(repositoryRoot, 'package.json')) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(packageJson.scripts?.build).toContain('esbuild src/mcp/server.ts');
    expect(packageJson.scripts?.build).toContain(
      '--outfile=plugins/decision-pilot/mcp/server.bundle.mjs'
    );
    expect(packageJson.devDependencies).toHaveProperty('esbuild');
    await expect(access(resolve(repositoryRoot, 'src', 'mcp', 'server.ts')))
      .resolves.toBeUndefined();
  });

  it('路由 Skill 具有可发现且判别明确的 frontmatter', async () => {
    const skill = await readFile(
      resolve(pluginRoot, 'skills', 'decision-pilot-router', 'SKILL.md'),
      'utf8'
    );
    const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? '';

    expect(frontmatter).toContain('name: decision-pilot-router');
    expect(frontmatter).toMatch(/description: Use when .+/u);
    expect(frontmatter.length).toBeLessThanOrEqual(1024);
  });
});
