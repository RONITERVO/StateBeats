import { describe, expect, it, vi } from 'vitest';
import {
  Session,
  standardActor,
  describeHandGuidance,
  describeObservation,
  scriptedCommands,
  fitMapToPlayer,
} from '@statebeats/sdk';
import type { MapInput, Observation } from '@statebeats/sdk';
import type { Shape, Vec3 } from '@statebeats/core';
import { audioTutorial } from '@statebeats/content';
import { HapticPlanner } from '../packages/player/src/haptics.js';
import { Narrator, SpokenMenu } from '../packages/player/src/spoken-controls.js';
const admin = { role: 'admin' } as const;
const map = (shape: Shape = { kind: 'sphere', radius: 0.2 }): MapInput => ({
  version: 1,
  id: 'guide',
  title: 'Guide',
  durationBeats: 12,
  tempo: [{ beat: 0, bpm: 120 }],
  notes: [
    {
      id: 'target',
      beat: 4,
      preset: 'left',
      position: [0, 1, -1],
      shape,
      leadMs: 2000,
      earlyMs: 0,
      lateMs: 100,
      presentation: { readiness: { preview: { beats: 3 }, prepare: { beats: 1 } } },
    },
  ],
});
async function fixture(input = map(), position: Vec3 = [0.5, 1, -1]) {
  const s = await Session.create(input, [standardActor()]);
  s.submit(
    admin,
    'poses',
    ['left', 'right'].map((hand) => ({
      id: hand,
      type: 'pose' as const,
      tick: 1,
      actorId: 'player',
      effectorId: hand,
      position,
      tracked: true,
      active: true,
    })),
  );
  return s;
}
describe('shared nonvisual contact guidance', () => {
  it('respects readiness and hit windows, leaves state unchanged and agrees with text cues', async () => {
    const s = await fixture();
    s.advance(100);
    expect(describeHandGuidance(s.observe(admin)).hands.every((h) => !h.target)).toBe(true);
    s.advance(100);
    const before = s.snapshot(),
      view = s.observe(admin),
      frame = describeHandGuidance(view);
    expect(frame.hands[0].target).toMatchObject({
      id: 'target',
      phase: 'prepare',
      aligned: false,
      action: 'reach',
    });
    expect(frame.hands[0].target!.gapMetres).toBeCloseTo(0.23);
    expect(frame.hands[1].target).toBeUndefined();
    expect(describeObservation(view).targets[0].id).toBe(frame.hands[0].target!.id);
    frame.hands[0].target!.position[0] = 999;
    expect(s.snapshot()).toEqual(before);
    s.advance(60);
    expect(describeHandGuidance(s.observe(admin)).hands.every((h) => !h.target)).toBe(true);
    expect(() => describeHandGuidance(view, { lookaheadSeconds: NaN })).toThrow();
    s.close();
  });
  it.each<Shape>([
    { kind: 'sphere', radius: 0.2 },
    { kind: 'capsule', a: [0, -0.2, 0], b: [0, 0.2, 0], radius: 0.2 },
    { kind: 'box', half: [0.1, 0.2, 0.3], rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] },
  ])(
    'matches actual engine contact for $kind shapes, not just distance to centre',
    async (shape) => {
      const s = await fixture(map(shape), [0.26, 1, -1]);
      s.advance(239);
      const target = describeHandGuidance(s.observe(admin)).hands[0].target!;
      expect(target.aligned).toBe(true);
      expect(target.gapMetres).toBe(0);
      expect(s.snapshot().scores[0].hits).toBe(0); // Alignment is not a pre-beat hit.
      s.advance(1);
      expect(s.snapshot().scores[0].hits).toBe(1);
      s.close();
    },
  );
  it('binds holds to their real participant and measures against the moving world position', async () => {
    const input = map();
    input.notes[0] = {
      id: 'hold',
      beat: 4,
      preset: 'hold',
      slots: [{}],
      earlyMs: 0,
      holdMs: 1500,
      durationBeats: 4,
      position: [0, 1, -1],
      motion: [
        { beat: 4, position: [0, 1, -1] },
        { beat: 8, position: [1, 1, -1] },
      ],
    };
    const s = await fixture(input, [5, 1, -1]);
    s.submit(admin, 'right-contact', [
      {
        id: 'rc',
        type: 'pose',
        tick: 240,
        actorId: 'player',
        effectorId: 'right',
        position: [0, 1, -1],
      },
    ]);
    s.advance(240);
    const view = s.observe(admin);
    expect(view.entities[0].participants).toEqual([
      { slot: 0, actorId: 'player', effectorId: 'right' },
    ]);
    const frame = describeHandGuidance(view);
    expect(frame.hands[0].target).toBeUndefined();
    expect(frame.hands[1].target).toMatchObject({
      phase: 'hold',
      aligned: true,
      position: view.entities[0].position,
    });
    s.advance(12);
    expect(describeHandGuidance(s.observe(admin)).hands[1].target!.position[0]).toBeGreaterThan(0);
    s.close();
  });
  it('reserves simultaneous required hands and flags mechanics it cannot describe honestly', async () => {
    const s = await fixture();
    s.advance(210);
    const view = s.observe(admin),
      left = view.entities[0];
    view.entities.unshift({ ...left, id: 'either', slots: [{}] });
    expect(describeHandGuidance(view).hands.map((h) => h.target?.id)).toEqual(['target', 'either']);
    view.entities = [
      { ...left, policyId: 'custom/rule' },
      { ...left, id: 'fast', minSpeed: 2 },
      { ...left, id: 'shared', distinctActors: true },
    ];
    expect(describeHandGuidance(view).unsupported.map((e) => e.reason)).toEqual([
      'directional-strike',
      'multiple-actors',
      'custom-policy',
    ]);
    expect(describeHandGuidance(view).hands.every((h) => !h.target)).toBe(true);
    s.close();
  });
  it('completes the same calibrated tutorial through normal commands and verifies its replay', async () => {
    const s = await Session.create(
      fitMapToPlayer(audioTutorial(), { height: 1.5, roomScale: 0.8 }),
      [standardActor()],
    );
    const commands = scriptedCommands(s.program);
    for (let i = 0; i < commands.length; i += 1024)
      s.submit(admin, `script-${i}`, commands.slice(i, i + 1024));
    let observed = false;
    while (!s.observe(admin).finished) {
      s.advance(30);
      const view = s.observe(admin),
        state = s.snapshot();
      const a = describeHandGuidance(view),
        b = describeHandGuidance(view);
      expect(a).toEqual(b);
      expect(s.snapshot()).toEqual(state);
      if (a.hands.some((h) => h.target)) observed = true;
    }
    expect(observed).toBe(true);
    expect(s.snapshot().scores[0]).toMatchObject({ hits: 9, misses: 0, hazards: 0 });
    expect((await Session.verifyReplay(await s.exportReplay(admin))).verified).toBe(true);
    s.close();
  });
  it('routes actual hit events to the matching hand and throttles hold feedback', async () => {
    const s = await fixture(map(), [0, 1, -1]);
    s.advance(239);
    const before = s.observe(admin);
    s.advance(1);
    const planner = new HapticPlanner();
    const events = s.eventsSince(admin, 0, 512).events;
    expect(planner.update(describeHandGuidance(before), events, 120, true)).toEqual([
      { hand: 'left', intensity: 0.2, milliseconds: 35, reason: 'hit' },
    ]);
    const frame = describeHandGuidance(before);
    frame.hands[0].target!.phase = 'hold';
    expect(planner.update(frame, [], 120, true)[0].reason).toBe('hold');
    frame.tick++;
    expect(planner.update(frame, [], 120, true)).toEqual([]);
    frame.hands[0].target!.aligned = false;
    expect(planner.update(frame, [], 120, true)[0].reason).toBe('lost-hold');
    expect(planner.update(frame, [], 120, false)).toEqual([]);
    s.close();
  });
});
it('keeps spoken menu focus by action identity when choices change', () => {
  const heard: string[] = [],
    chosen: string[] = [],
    menu = new SpokenMenu((text) => heard.push(text));
  const action = (id: string) => ({
    id,
    label: id,
    run: () => {
      chosen.push(id);
    },
  });
  menu.set([action('play'), action('learn')]);
  menu.move(-1);
  expect(heard.at(-1)).toBe('2 of 2. learn');
  menu.set([action('restart'), action('play'), action('learn')]);
  menu.activate();
  expect(chosen).toEqual(['learn']);
  menu.move(1);
  expect(heard.at(-1)).toBe('1 of 3. restart');
});
it('keeps text announcements when browser speech fails, and interrupts rather than queues speech', () => {
  const status = { textContent: '' } as HTMLElement,
    narrator = new Narrator(status);
  const speak = vi.fn(),
    cancel = vi.fn();
  try {
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(public text: string) {}
      },
    );
    vi.stubGlobal('speechSynthesis', { speak, cancel, getVoices: () => [] });
    narrator.enabled = true;
    narrator.speak('First');
    narrator.speak('Second');
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(speak).toHaveBeenCalledTimes(2);
    narrator.muted = true;
    narrator.speak('Muted');
    expect(status.textContent).toBe('Muted');
    expect(speak).toHaveBeenCalledTimes(2);
    narrator.muted = false;
    cancel.mockImplementation(() => {
      throw new Error('Unavailable');
    });
    expect(() => narrator.speak('Text remains')).not.toThrow();
    expect(() => narrator.stop()).not.toThrow();
    expect(status.textContent).toBe('Text remains');
  } finally {
    vi.unstubAllGlobals();
  }
});
