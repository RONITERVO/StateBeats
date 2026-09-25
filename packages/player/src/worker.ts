/// <reference lib="webworker" />
import { RealtimeClock, Session, standardActor, scriptedCommands } from '@statebeats/sdk';
import { sampleMap } from '@statebeats/content';
import type { Command } from '@statebeats/core';
import type { ToWorker, FromWorker, HandSample } from './protocol.js';
const ctx = self as unknown as DedicatedWorkerGlobalScope;
let session: Session | undefined,
  clock: RealtimeClock | undefined,
  generation = 0,
  loadId = 0,
  seq = 0,
  auto = false;
let latest: HandSample[] = [],
  lastInput = 0,
  inputDirty = false,
  maxPumpMs = 0;
const send = (message: FromWorker) => ctx.postMessage(message);
let chain = Promise.resolve();
let framePending = false,
  eventCursor = 0;
ctx.onmessage = (event: MessageEvent<ToWorker>) => {
  chain = chain
    .then(() => handle(event.data))
    .catch((error) => send({ type: 'error', message: String(error), loadId }));
};
async function handle(message: ToWorker) {
  if (message.type === 'load') {
    loadId = message.loadId;
    clock?.pause();
    session?.close();
    session = undefined;
    clock = undefined;
    generation++;
    framePending = false;
    eventCursor = 0;
    seq = 0;
    auto = message.autoplay;
    latest = [];
    inputDirty = false;
    maxPumpMs = 0;
    const actors = [standardActor()];
    if (message.mapId === 'duet') actors.push(standardActor('partner'));
    session = await Session.create(message.map ?? sampleMap(message.mapId), actors);
    clock = new RealtimeClock(session, 16, 300);
    if (message.stage)
      session.client({ role: 'admin' }).submit('calibration', [
        {
          id: '000:calibration',
          tick: 1,
          type: 'calibrate',
          actorId: 'player',
          ...message.stage,
        },
      ]);
    if (auto) {
      // Scripted actor still submits poses through the SDK. No forced hit or score path.
      const commands = scriptedCommands(
        session.program,
        'player',
        message.stage ? { player: message.stage } : {},
      );
      for (let i = 0; i < commands.length; i += 1024)
        session.client({ role: 'admin' }).submit(`autoplay:${i}`, commands.slice(i, i + 1024));
    } else if (message.mapId === 'duet') {
      const id = 'partner';
      session.attachActor(
        { role: 'player', actorId: id },
        {
          id: 'partner-bot',
          poll(tick, view) {
            const target = view.entities.find(
              (e) =>
                e.kind !== 'hazard' &&
                e.slots.some((s) => s.actorId === id) &&
                tick >= e.hitTick &&
                tick <= e.endTick,
            );
            if (!target) return [];
            return [
              {
                id: `partner:${tick}`,
                tick,
                type: 'pose',
                actorId: id,
                effectorId: 'right',
                position: target.position as [number, number, number],
              },
            ];
          },
        },
      );
    }
    lastInput = performance.timeOrigin + performance.now();
    send({ type: 'ready', view: session.observe({ role: 'admin' }), generation, loadId });
    return;
  }
  if (!session || !clock) return;
  switch (message.type) {
    case 'frame-ack':
      if (message.generation === generation) framePending = false;
      break;
    case 'start':
      clock.start(performance.now());
      lastInput = performance.timeOrigin + performance.now();
      break;
    case 'pause':
      clock.pause();
      break;
    case 'speed':
      clock.setSpeed(message.value);
      break;
    case 'poses':
      latest = message.samples;
      lastInput = message.sentAt;
      inputDirty = true;
      break;
    case 'commands':
      session.client({ role: 'admin' }).submit(message.requestId, message.commands);
      break;
    case 'export':
      send({
        type: 'replay',
        requestId: message.requestId,
        replay: await session.exportReplay({ role: 'admin' }),
      });
      break;
  }
}
setInterval(() => {
  if (!session || !clock) return;
  try {
    const start = performance.now(),
      age = performance.timeOrigin + start - lastInput;
    if (!auto && age > 500) clock.pause();
    if (inputDirty && !auto && clock.active && !session.snapshot().finished) {
      const commands: Command[] = latest.map((sample) => ({
        id: `input:${String(seq++).padStart(9, '0')}`,
        tick: session!.tick + 1,
        type: 'pose',
        actorId: 'player',
        effectorId: sample.id,
        position: sample.position,
        orientation: sample.orientation,
        tracked: sample.tracked,
        active: sample.active,
      }));
      if (commands.length)
        session.client({ role: 'player', actorId: 'player' }).submit(`frame:${seq}`, commands);
      inputDirty = false;
    }
    const status = clock.pump(performance.now());
    const pumpMs = performance.now() - start;
    maxPumpMs = Math.max(maxPumpMs, pumpMs);
    // One unacknowledged observation at a time. The SDK retains events with explicit overflow.
    if (framePending) return;
    const delivered = session.eventsSince({ role: 'admin' }, eventCursor, 4096);
    eventCursor = delivered.nextSeq;
    framePending = true;
    send({
      type: 'frame',
      view: session.observe({ role: 'admin' }),
      events: delivered.events,
      overflow: delivered.overflow,
      clock: status,
      metrics: { pumpMs, maxPumpMs, inputAgeMs: Math.max(0, age) },
      generation,
      loadId,
    });
  } catch (error) {
    clock?.pause();
    send({ type: 'error', message: String(error), loadId });
  }
}, 8);
