import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { EngineService, SILENT_FEATURES } from '@statebeats/sdk';
import type { ServiceRequest } from '@statebeats/sdk';
import { sampleMaps } from '@statebeats/content';
const requests: ServiceRequest[] = [
  { op: 'session.create', sessionId: 'parity', args: { mapId: 'agent-arena' } },
  {
    op: 'command.submit',
    sessionId: 'parity',
    requestId: 'pose1',
    args: {
      commands: [
        {
          id: 'pose1',
          tick: 1,
          type: 'pose',
          actorId: 'player',
          effectorId: 'left',
          position: [0, 1.4, -0.8],
        },
      ],
    },
  },
  { op: 'clock.advance', sessionId: 'parity', requestId: 'advance1', args: { ticks: 250 } },
  { op: 'observe', sessionId: 'parity' },
  { op: 'perception.describe', sessionId: 'parity', args: { maxTargets: 3 } },
  {
    op: 'music.generate',
    requestId: 'music-fixture',
    args: {
      music: {
        version: 1,
        tickRate: 120,
        algorithm: 'test/steady-v1',
        frames: [
          { tick: 480, features: { ...SILENT_FEATURES, rms: 0.2, bass: 0.5 } },
          { tick: 2400, features: { ...SILENT_FEATURES, rms: 0.2, bass: 0.5 } },
        ],
      },
      options: { id: 'music-fixture', seed: 71, turning: true },
    },
  },
  { op: 'map.compile', args: { mapId: 'music-fixture' } },
];
function cli(lines: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const process = spawn(globalThis.process.execPath, ['packages/cli/dist/index.js', 'serve'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '';
    process.stdout.on('data', (d) => (stdout += String(d)));
    process.stderr.on('data', (d) => (stderr += String(d)));
    process.on('error', reject);
    process.on('close', (code) => {
      if (code !== 0) reject(new Error(stderr));
      else
        try {
          resolve(
            stdout
              .trim()
              .split('\n')
              .map((s) => JSON.parse(s)),
          );
        } catch (error) {
          reject(error);
        }
    });
    process.stdin.end(lines);
  });
}
describe('one SDK service through real process protocols', () => {
  it('CLI and SDK produce identical structured results', async () => {
    const service = new EngineService();
    for (const map of sampleMaps) await service.addMap(map);
    const sdk = [];
    for (const r of requests) sdk.push({ result: await service.dispatch(r) });
    const result = await cli(requests.map((r) => JSON.stringify(r)).join('\n'));
    expect(result).toEqual(sdk);
    service.close();
  });
  it('a real MCP client initializes, discovers tools/resources and reaches the same result', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['packages/mcp/dist/index.js'],
      stderr: 'pipe',
    });
    const client = new Client({ name: 'statebeats-conformance', version: '1.0.0' });
    try {
      await client.connect(transport);
      expect((await client.listTools()).tools.some((t) => t.name === 'rhythm')).toBe(true);
      expect((await client.readResource({ uri: 'rhythm://maps' })).contents).toHaveLength(1);
      const service = new EngineService();
      for (const map of sampleMaps) await service.addMap(map);
      for (const request of requests) {
        const expected = await service.dispatch(request);
        const response = await client.callTool({ name: 'rhythm', arguments: { ...request } });
        expect(response.isError).not.toBe(true);
        const blocks = response.content as { type: string; text: string }[];
        expect(JSON.parse(blocks[0].text)).toEqual(expected);
      }
      const bad = await client.callTool({
        name: 'rhythm',
        arguments: { op: 'clock.advance', sessionId: 'missing', args: { ticks: 1 } },
      });
      expect(bad.isError).toBe(true);
      service.close();
    } finally {
      await client.close();
      await transport.close();
    }
  });
});
