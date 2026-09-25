import type { DomainEvent } from '@statebeats/core';
import type { HandGuidanceFrame } from '@statebeats/sdk';
export interface HapticCue {
  hand: 'left' | 'right';
  intensity: number;
  milliseconds: number;
  reason: 'hit' | 'hold' | 'lost-hold';
}
/** A tick-based cue planner. The browser owns hardware calls; the engine still owns scoring. */
export class HapticPlanner {
  private holds = new Map<string, { id: string; aligned: boolean; tick: number }>();
  update(
    frame: HandGuidanceFrame | undefined,
    events: DomainEvent[],
    tickRate: number,
    running: boolean,
  ): HapticCue[] {
    if (!running) {
      this.reset();
      return [];
    }
    const result = new Map<string, HapticCue>();
    for (const event of events)
      if (event.type === 'interaction.hit' && event.actorId === 'player') {
        const slots =
          (event.data as { slots?: { actorId: string; effectorId: string }[] }).slots ?? [];
        for (const slot of slots) {
          if (slot.actorId !== 'player') continue;
          const hand =
            frame?.hands.find((h) => h.id === slot.effectorId)?.semantic ?? slot.effectorId;
          if (hand === 'left' || hand === 'right')
            result.set(hand, { hand, intensity: 0.2, milliseconds: 35, reason: 'hit' });
        }
      }
    const active = new Set<string>();
    for (const hand of frame?.hands ?? []) {
      const t = hand.target;
      if (!hand.tracked || !t || t.phase !== 'hold') continue;
      active.add(hand.id);
      const old = this.holds.get(hand.id);
      if (!result.has(hand.semantic)) {
        if (
          t.aligned &&
          (!old || old.id !== t.id || !old.aligned || frame!.tick - old.tick >= tickRate * 0.15)
        ) {
          result.set(hand.semantic, {
            hand: hand.semantic,
            intensity: 0.065,
            milliseconds: 18,
            reason: 'hold',
          });
          this.holds.set(hand.id, { id: t.id, aligned: true, tick: frame!.tick });
        } else if (!t.aligned && old?.id === t.id && old.aligned) {
          result.set(hand.semantic, {
            hand: hand.semantic,
            intensity: 0.12,
            milliseconds: 65,
            reason: 'lost-hold',
          });
          this.holds.set(hand.id, { id: t.id, aligned: false, tick: frame!.tick });
        }
      }
    }
    for (const id of this.holds.keys()) if (!active.has(id)) this.holds.delete(id);
    return [...result.values()];
  }
  reset() {
    this.holds.clear();
  }
}
