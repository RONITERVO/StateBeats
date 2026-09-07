#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { EngineError, EngineService, operations } from '@statebeats/sdk';
import type { Capability, ServiceRequest } from '@statebeats/sdk';
import { sampleMaps } from '@statebeats/content';
const service = new EngineService();
for (const map of sampleMaps) await service.addMap(map);
const configuredRole = process.env.STATEBEATS_ROLE ?? 'admin';
if (!['admin', 'player', 'director', 'observer'].includes(configuredRole))
  throw new Error('Invalid STATEBEATS_ROLE');
const capability: Capability =
  configuredRole === 'player'
    ? { role: 'player', actorId: process.env.STATEBEATS_ACTOR ?? 'player' }
    : ({ role: configuredRole } as Capability);
capability.controlTime = process.env.STATEBEATS_ALLOW_ADVANCE === '1';
// Restricted connections get a pre-created session. They cannot change their own role.
if (configuredRole !== 'admin')
  await service.dispatch({
    op: 'session.create',
    sessionId: 'default',
    args: { mapId: process.env.STATEBEATS_MAP ?? 'agent-arena' },
  });
const server = new McpServer({ name: 'statebeats', version: '0.2.0' });
server.registerTool(
  'rhythm',
  {
    title: 'Spatial rhythm engine',
    description:
      'Deterministic SDK operations. Read observations without advancing time; submit timestamped commands, then explicitly advance with a host/admin connection. No LLM dependency. Use session.create with args.mapId=agent-arena to begin. Mutating command requests require requestId. Maps are JSON data.',
    inputSchema: {
      op: z.enum(operations),
      sessionId: z.string().optional(),
      requestId: z.string().optional(),
      args: z.record(z.string(), z.unknown()).optional(),
    },
  },
  async (request) => {
    try {
      const result = await service.dispatch(request as ServiceRequest, capability);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: { result },
      };
    } catch (error) {
      const e =
        error instanceof EngineError
          ? { code: error.code, message: error.message, details: error.details }
          : { code: 'ERROR', message: String(error) };
      return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(e) }] };
    }
  },
);
server.registerResource(
  'maps',
  'rhythm://maps',
  { mimeType: 'application/json', description: 'Available built-in maps' },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(await service.dispatch({ op: 'map.list' }, capability)),
      },
    ],
  }),
);
process.on('SIGINT', () => {
  service.close();
  void server.close();
});
process.on('SIGTERM', () => {
  service.close();
  void server.close();
});
await server.connect(new StdioServerTransport());
