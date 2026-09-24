// SPDX-License-Identifier: Apache-2.0
import type * as THREE from 'three';
type Point = [number, number, number];
export interface Motion {
  strike: number;
  recoil: number;
  prepare: number;
  flash: number;
}
export class InkBatch {
  constructor(parent: THREE.Group, options?: { capacity?: number });
  meshes: Record<string, THREE.InstancedMesh>;
  material: THREE.MeshBasicMaterial;
  fillMaterial: THREE.MeshBasicMaterial;
  overflow: number;
  triangles: number;
  begin(): void;
  end(): void;
  dispose(): void;
  model(x: number, y: number, z: number, scale?: number, face?: number, yaw?: number): void;
  line(a: Point, b: Point, radius?: number, color?: string): void;
  part(shape: string, p: Point, size: Point, color?: string, rotation?: Point, fill?: string): void;
  outlineBall(p: Point, radius: number, color?: string): void;
  point(p: Point): Point;
}
export class BookPaper extends THREE.Group {
  constructor();
  setAge(age: number): void;
  dispose(): void;
}
type Paths = Point[][];
export function bookPaths(): Paths;
export function landscapePaths(age: number, wide?: boolean): Paths;
export function pencilMesh(paths: Paths, color?: string, radius?: number): THREE.Mesh;
export const CHAPTERS: { title: string; motif: string; base: string }[];
export const TEAM_COLORS: Record<number, string>;
export const REST: Motion;
export function chapterPalette(age: number): { paper: string; accent: string; body: string };
export function baseModel(
  batch: InkBatch,
  age: number,
  x: number,
  team: number,
  progress?: number,
): void;
export function unitModel(
  batch: InkBatch,
  age: number,
  index: number,
  options?: {
    x?: number;
    y?: number;
    z?: number;
    scale?: number;
    team?: number;
    yaw?: number;
    time?: number;
    walking?: boolean;
    held?: boolean;
    motion?: Motion;
    detailed?: boolean;
  },
): void;
export function cannonModel(
  batch: InkBatch,
  age: number,
  index: number,
  color: string,
  held?: boolean,
  motion?: Motion,
  detailed?: boolean,
): void;
export function projectileModel(batch: InkBatch, type: string, team: number, age?: number): void;
export function specialModel(
  batch: InkBatch,
  age: number,
  time: number,
  team: number,
  detailed?: boolean,
): void;
export function dockPosition(
  slot: number,
  team?: number,
): { x: number; y: number; z: number } | null;
export function unitMotion(
  unit: { attackCooldown: number; attackSpeed: number; isAttacking: boolean; drawProgress: number },
  running?: boolean,
): Motion;
export function attackMotion(
  cooldown: number,
  period: number,
  engaged?: boolean,
  progress?: number,
): Motion;
