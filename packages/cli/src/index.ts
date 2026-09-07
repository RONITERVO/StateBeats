#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import {
  EngineService,
  EngineError,
  Session,
  scriptedCommands,
  standardActor,
} from '@statebeats/sdk';
import type { ServiceRequest } from '@statebeats/sdk';
import { sampleMaps, sampleMap } from '@statebeats/content';
const service = new EngineService();
for (const map of sampleMaps) await service.addMap(map);
const output = (value: unknown) => process.stdout.write(JSON.stringify(value) + '\n');
async function save(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2));
}
const failure = (error: unknown) => ({
  error:
    error instanceof EngineError
      ? { code: error.code, message: error.message, details: error.details }
      : { code: 'ERROR', message: String(error) },
});
async function demo() {
  const session = await Session.create(sampleMap('agent-arena'), [standardActor()]);
  const admin = session.client({ role: 'admin' });
  const commands = scriptedCommands(session.program);
  admin.submit('demo-script', commands);
  session.advance(session.program.durationTicks);
  const replay = await admin.replay(),
    verification = await Session.verifyReplay(replay);
  output({ demo: 'agent-arena', scores: session.snapshot().scores, verification });
  session.close();
}
const [command, arg, out] = process.argv.slice(2);
try {
  switch (command) {
    case 'demo':
      await demo();
      break;
    case 'serve': {
      // JSON lines permit a caller to keep a session alive between discrete tool calls.
      const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
      for await (const line of lines) {
        if (!line.trim()) continue;
        try {
          output({ result: await service.dispatch(JSON.parse(line) as ServiceRequest) });
        } catch (error) {
          output(failure(error));
        }
      }
      break;
    }
    case 'run': {
      const script = JSON.parse(await readFile(arg, 'utf8'));
      if (!Array.isArray(script))
        throw new EngineError('VALIDATION', 'A run script must be an array of requests');
      const results = [];
      for (const request of script) results.push(await service.dispatch(request));
      if (out) await save(out, results);
      else output(results);
      break;
    }
    case 'validate':
      output(
        await service.dispatch({
          op: 'map.validate',
          args: { map: JSON.parse(await readFile(arg, 'utf8')) },
        }),
      );
      break;
    case 'generate': {
      const map = await service.dispatch({
        op: 'map.generate',
        args: { seed: Number(arg ?? 1), style: 'mixed', turning: true },
      });
      if (out) await save(out, map);
      else output(map);
      break;
    }
    case 'verify':
      output(
        await service.dispatch({
          op: 'replay.verify',
          args: { replay: JSON.parse(await readFile(arg, 'utf8')) },
        }),
      );
      break;
    case 'maps':
      output(await service.dispatch({ op: 'map.list' }));
      break;
    default:
      output({
        name: 'StateBeats',
        commands: [
          'demo',
          'maps',
          'generate [seed] [output.json]',
          'validate map.json',
          'verify replay.json',
          'run requests.json [results.json]',
          'serve (JSON lines on stdin/stdout)',
        ],
      });
      if (command) process.exitCode = 2;
  }
} catch (error) {
  output(failure(error));
  process.exitCode = 1;
} finally {
  service.close();
}
