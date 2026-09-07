import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import { writeFile, mkdir } from 'node:fs/promises';
import { compile, Session, standardActor, scriptedCommands, generateMap } from '@statebeats/sdk';
import { initialState, transition } from '@statebeats/core';
import { sampleMap } from '@statebeats/content';
function quantile(values, p) {
  return values[Math.min(values.length - 1, Math.floor(values.length * p))];
}
const reports = [];
for (const count of [32, 128, 512]) {
  const map = generateMap({ count, seed: 53 });
  map.notes = map.notes.map((n, i) => ({ ...n, beat: 20 + (i % 4), leadMs: 60000 }));
  const program = compile(map).program;
  let state = initialState(program, [standardActor(), standardActor('partner')]);
  const commands = state.actors.flatMap((a) =>
    a.effectors.map((e) => ({
      id: a.id + e.id,
      tick: 1,
      type: 'pose',
      actorId: a.id,
      effectorId: e.id,
      position: [0, 1.4, -1],
    })),
  );
  state = transition(state, commands, program).state;
  const times = [];
  for (let i = 0; i < 1000; i++) {
    const start = performance.now();
    state = transition(state, [], program).state;
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  reports.push({
    entities: count,
    actors: 2,
    ticks: 1000,
    medianMs: quantile(times, 0.5),
    p95Ms: quantile(times, 0.95),
    p99Ms: quantile(times, 0.99),
    maxMs: times.at(-1),
  });
}
const session = await Session.create(sampleMap('showcase'), [
  standardActor(),
  standardActor('partner'),
]);
const commands = scriptedCommands(session.program),
  admin = session.client({ role: 'admin' });
for (let i = 0; i < commands.length; i += 1024) admin.submit(`b${i}`, commands.slice(i, i + 1024));
const start = performance.now();
session.advance(session.program.durationTicks);
const fullMs = performance.now() - start;
const journey = await Session.create(sampleMap('sunlit-journey'), [standardActor()]);
const journeyHost = journey.client({ role: 'admin' });
journeyHost.submit('journey-script', scriptedCommands(journey.program));
const frameTimes = [],
  journeyStart = performance.now();
let peakEntities = 0,
  peakObservationBytes = 0;
while (journey.tick < journey.program.durationTicks) {
  const before = performance.now();
  journey.advance(2);
  const observation = journeyHost.observe();
  structuredClone(observation);
  frameTimes.push(performance.now() - before);
  if (observation.entities.length > peakEntities) {
    peakEntities = observation.entities.length;
    peakObservationBytes = Buffer.byteLength(JSON.stringify(observation));
  }
}
const journeyMs = performance.now() - journeyStart;
frameTimes.sort((a, b) => a - b);
const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  os: platform(),
  arch: arch(),
  cpu: cpus()[0].model,
  tickBudgetMs: 1000 / 120,
  core: reports,
  showcase: { ticks: session.tick, wallMs: fullMs, score: session.snapshot().scores },
  journey: {
    ticks: journey.tick,
    frames: frameTimes.length,
    wallMs: journeyMs,
    p95StepObserveAndCopyMs: quantile(frameTimes, 0.95),
    p99StepObserveAndCopyMs: quantile(frameTimes, 0.99),
    peakEntities,
    peakObservationBytes,
    score: journey.snapshot().scores,
    excludes:
      'GPU rendering, browser/audio callbacks and device input; Node worker-like observation copying only.',
  },
  limitation: 'Desktop measurements; no Quest hardware performance result implied.',
  memoryAtEndBytes: process.memoryUsage(),
};
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/benchmark.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
session.close();
journey.close();
