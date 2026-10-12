import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('built CommonJS package entry points', () => {
  for (const entry of ['', '/react', '/r3f']) {
    it(`loads @jonobr1/force-directed-graph${entry} without require(ESM)`, () => {
      const args = process.allowedNodeEnvironmentFlags.has('--no-experimental-require-module')
        ? ['--no-experimental-require-module'] : [];
      const output = execFileSync(process.execPath, [...args, '-e', `
        const assert = require('node:assert/strict');
        const entry = require('@jonobr1/force-directed-graph${entry}');
        assert.ok(entry.ForceDirectedGraph);
        console.log('loaded');
      `], { cwd: process.cwd(), encoding: 'utf8' });
      expect(output.trim()).toBe('loaded');
    });
  }
});
