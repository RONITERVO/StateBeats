import { sampleMaps, sampleMap } from '@statebeats/content';
import {
  compile,
  describeEvent,
  describeObservation,
  Session,
  standardActor,
  scriptedCommands,
} from '@statebeats/sdk';
import type { MapDefinition, Observation } from '@statebeats/sdk';
import type { Command, Vec3 } from '@statebeats/core';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let session: Session | undefined,
  custom: MapDefinition | undefined,
  sequence = 0,
  cursor = 0;
const catalog = el<HTMLSelectElement>('map');
for (const map of sampleMaps) {
  const option = document.createElement('option');
  option.value = map.id;
  option.textContent = map.title;
  catalog.add(option);
}
catalog.value = 'agent-arena';
const selectedMap = () => (custom?.id === catalog.value ? custom : sampleMap(catalog.value));
const run = (action: () => void | Promise<void>) => {
  el('error').textContent = '';
  void Promise.resolve()
    .then(action)
    .catch((error) => {
      el('error').textContent = String(error);
    });
};
const button = (id: string, action: () => void | Promise<void>) =>
  el(id).addEventListener('click', () => run(action));
const admin = () => {
  if (!session) throw new Error('Start a sequence first.');
  return session.client({ role: 'admin' });
};
function save(data: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function update(message?: string) {
  const view = admin().observe(),
    description = describeObservation(view);
  const active = document.activeElement as HTMLElement | null,
    focusKey = active?.dataset.focus;
  el('title').textContent = view.title;
  el('score').textContent = description.summary;
  el('scene').textContent = view.scene
    ? `${view.scene.label} ${view.scene.objects.map((object) => `${object.label}: ${object.position.map((value) => value.toFixed(1)).join(', ')} metres.`).join(' ')}`
    : '';
  el('json').textContent = JSON.stringify(view, null, 2);
  el('empty').hidden = description.targets.length > 0;
  el('empty').textContent = view.finished
    ? 'Sequence complete. Save your replay or choose another map.'
    : 'No active targets. Advance to the next cue.';
  const fragment = document.createDocumentFragment();
  for (const cue of description.targets) {
    const article = document.createElement('article'),
      text = document.createElement('p');
    article.setAttribute('aria-label', cue.label);
    text.textContent = cue.text;
    article.append(text);
    const action = (title: string, key: string, fn: () => void) => {
      const button = document.createElement('button');
      button.textContent = title;
      button.dataset.focus = `${cue.id}:${key}`;
      button.onclick = () => run(fn);
      article.append(button);
    };
    if (cue.action === 'avoid') {
      action('Duck through this interval', 'avoid', () => avoid(cue.id));
    } else {
      action('Reach with left at beat', 'left', () => reach(cue.id, ['left']));
      action('Reach with right at beat', 'right', () => reach(cue.id, ['right']));
      action('Reach with both at beat', 'both', () => reach(cue.id, ['left', 'right']));
      if (cue.holdSeconds)
        action('Maintain this hold', 'hold', () =>
          advance(Math.ceil(cue.holdSeconds * view.tickRate)),
        );
    }
    fragment.append(article);
  }
  el('targets').replaceChildren(fragment);
  if (focusKey) {
    const restored = [...el('targets').querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.dataset.focus === focusKey,
    );
    (restored ?? el('next')).focus();
  }
  const events = admin().events(cursor, 4096);
  cursor = events.nextSeq;
  const outcomes = events.events.map(describeEvent).filter((value): value is string => !!value);
  for (const text of outcomes) {
    const item = document.createElement('li');
    item.textContent = text;
    el('transcript').append(item);
  }
  while (el('transcript').children.length > 80) el('transcript').firstElementChild!.remove();
  el('status').textContent =
    [...outcomes.slice(-4), ...(message ? [message] : [])].join(' ') ||
    `Time is held at tick ${view.tick}. ${description.targets.length} targets available.`;
  for (const id of ['next', 'quarter', 'advance', 'pose', 'release', 'duck', 'stand'])
    el<HTMLButtonElement>(id).disabled = view.finished;
}
async function start() {
  const map = selectedMap(),
    actors = [standardActor()];
  if (map.id === 'duet') actors.push(standardActor('partner'));
  const next = await Session.create(map, actors);
  session?.close();
  session = next;
  sequence = 0;
  cursor = 0;
  el('transcript').replaceChildren();
  if (actors.length > 1) {
    const commands = scriptedCommands(session.program).filter(
      (command) => 'actorId' in command && command.actorId === 'partner',
    );
    for (let i = 0; i < commands.length; i += 1024)
      admin().submit(`partner:${i}`, commands.slice(i, i + 1024));
  }
  // A real tracked head allows hazards to have the same meaning in manual and VR play.
  admin().submit('head', [
    {
      id: 'head',
      tick: 1,
      type: 'pose',
      actorId: 'player',
      effectorId: 'head',
      position: [0, 1.65, 0],
    },
  ]);
  update('Sequence ready. Time stays still until you act.');
}
function advance(ticks: number) {
  if (!Number.isInteger(ticks) || ticks < 0 || ticks > 10000)
    throw new Error('Advance from 0 to 10,000 whole ticks.');
  admin().advance(ticks);
  update();
}
function find(id: string): Observation['entities'][number] {
  const target = admin()
    .observe()
    .entities.find((entity) => entity.id === id);
  if (!target) throw new Error('That target has already resolved.');
  return target;
}
function pose(effectorId: string, position: Vec3) {
  const id = `text:${sequence++}`;
  session!.client({ role: 'player', actorId: 'player' }).submit(id, [
    {
      id,
      tick: session!.tick + 1,
      type: 'pose',
      actorId: 'player',
      effectorId,
      position,
      tracked: true,
      active: true,
    },
  ]);
  advance(1);
}
function reach(id: string, hands: string[]) {
  const target = find(id),
    tick = Math.max(session!.tick + 2, target.hitTick);
  const requestId = `reach:${sequence++}`,
    position = (target.targetPosition ?? target.position) as Vec3;
  const commands: Command[] = hands.flatMap((hand) => [
    {
      id: `${requestId}:${hand}:release`,
      tick: session!.tick + 1,
      type: 'pose' as const,
      actorId: 'player',
      effectorId: hand,
      position,
      tracked: false,
      active: false,
    },
    {
      id: `${requestId}:${hand}:reach`,
      tick,
      type: 'pose' as const,
      actorId: 'player',
      effectorId: hand,
      position,
      tracked: true,
      active: true,
    },
  ]);
  session!.client({ role: 'player', actorId: 'player' }).submit(requestId, commands);
  // All intervening ticks are evaluated. Other simultaneous requirements still need a legal hand.
  advance(tick - session!.tick);
}
function avoid(id: string) {
  const target = find(id);
  pose('head', [0, 1, 0]);
  advance(Math.max(0, Math.min(10000, target.endTick + 1 - session!.tick)));
}
button('start', start);
button('next', () => {
  const view = admin().observe();
  const candidates = [
    ...view.entities.flatMap((entity) => {
      const cue = entity.presentation;
      return [
        entity.hitTick,
        ...(cue?.readiness
          ? [cue.readiness.previewTick, cue.readiness.prepareTick, cue.readyTick]
          : []),
      ];
    }),
    ...session!.program.entities.map((entity) => entity.spawnTick),
    session!.program.durationTicks,
  ].filter((tick) => tick > view.tick);
  advance(Math.min(10000, Math.min(...candidates) - view.tick));
});
button('quarter', () => advance(Math.round(session!.program.rules.tickRate / 4)));
button('advance', () => advance(Number(el<HTMLInputElement>('ticks').value)));
button('pose', () =>
  pose(el<HTMLSelectElement>('effector').value, [
    Number(el<HTMLInputElement>('x').value),
    Number(el<HTMLInputElement>('y').value),
    Number(el<HTMLInputElement>('z').value),
  ]),
);
button('duck', () => pose('head', [0, 1, 0]));
button('stand', () => pose('head', [0, 1.65, 0]));
button('release', () => {
  const requestId = `release:${sequence++}`;
  session!.client({ role: 'player', actorId: 'player' }).submit(
    requestId,
    ['left', 'right'].map((hand) => ({
      id: `${requestId}:${hand}`,
      tick: session!.tick + 1,
      type: 'pose',
      actorId: 'player',
      effectorId: hand,
      position: [0, 1, 0],
      active: false,
      tracked: false,
    })),
  );
  advance(1);
});
button('replay', async () =>
  save(await admin().replay(), `statebeats-${session!.map.id}-manual-replay.json`),
);
button('save-map', () => save(session!.map, `statebeats-${session!.map.id}.json`));
el<HTMLInputElement>('file').onchange = () =>
  run(async () => {
    const file = el<HTMLInputElement>('file').files?.[0];
    if (!file) return;
    if (file.size > 16_000_000) throw new Error('Map must be smaller than 16 MB.');
    custom = compile(JSON.parse(await file.text())).map;
    for (const option of [...catalog.options]) if (option.dataset.custom) option.remove();
    const option = document.createElement('option');
    option.value = custom.id;
    option.textContent = custom.title;
    option.dataset.custom = 'true';
    catalog.add(option);
    catalog.value = custom.id;
    await start();
  });
addEventListener('pagehide', () => session?.close());
run(start);
