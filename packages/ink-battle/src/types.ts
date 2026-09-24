// SPDX-License-Identifier: Apache-2.0
import type { Vec3 } from '@statebeats/core';
/** Positions already expressed in metres on the enlarged book, around its centre. */
export type BattleUnit = [
  id: number,
  team: number,
  role: number,
  x: number,
  y: number,
  z: number,
  heading: number,
  scale: number,
  drawProgress: number,
  cooldown: number,
  period: number,
  attacking: number,
  moving: number,
];
export type BattleShot = [id: number, team: number, type: string, x: number, y: number, z: number];
export interface BattleFrame {
  tick: number;
  units: BattleUnit[];
  shots: BattleShot[];
  sides: { hp: number; turrets: (null | number[])[] }[];
  specials: number[][];
}
export interface BattleLaunch {
  tick: number;
  id: number;
  team: number;
  type: string;
  sourceId: number | null;
  sourceRole: number | null;
  origin: Vec3;
}
export interface BattleChapter {
  age: number;
  name: string;
  special: string;
  unitNames: string[];
  seed: number;
  warmupTicks: number;
  replayDigest: string;
  frames: BattleFrame[];
  launches: BattleLaunch[];
}
