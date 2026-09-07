export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Shape =
  | { kind: 'sphere'; radius: number }
  | { kind: 'box'; half: Vec3; rotation?: Quat }
  | { kind: 'capsule'; a: Vec3; b: Vec3; radius: number };
export interface Pose {
  position: Vec3;
  orientation: Quat;
  tracked: boolean;
  active: boolean;
}
export interface EffectorSpec {
  id: string;
  semantic: string;
  radius: number;
  position?: Vec3;
}
export interface ActorSpec {
  id: string;
  effectors: EffectorSpec[];
}
export interface EffectorState extends EffectorSpec {
  pose: Pose;
  previous: Pose;
}
export interface ActorState {
  id: string;
  index: number;
  effectors: EffectorState[];
  stage: { position: Vec3; orientation: Quat };
}
export interface RequirementSlot {
  semantic?: string;
  actorId?: string;
  effectorId?: string;
}
export interface MotionKey {
  tick: number;
  position: Vec3;
}
export interface EntitySpec {
  id: string;
  /** Namespaced trusted policy ID, e.g. builtin/contact. */
  policy: string;
  config: Json;
  kind: 'strike' | 'hold' | 'hazard';
  hitTick: number;
  spawnTick: number;
  endTick: number;
  position: Vec3;
  shape: Shape;
  motion: MotionKey[];
  /** Fixed world by default; actor stage captured at spawn otherwise. */
  anchor?: string;
  slots: RequirementSlot[];
  distinctActors: boolean;
  sameActor: boolean;
  window: [number, number];
  minSpeed: number;
  direction?: { vector: Vec3; cosine: number };
  linkTicks: number;
  holdTicks: number;
  breakTicks: number;
  group?: string;
  value: number;
}
export interface GroupSpec {
  id: string;
  members: string[];
  linkTicks: number;
  bonus: number;
  distinctActors: boolean;
}
export interface Rules {
  tickRate: number;
  maxTick: number;
  grades: { within: number; name: string; multiplier: number }[];
  hazardInterval: number;
  hazardPenalty: number;
  groupBonus: number;
  maxActors: number;
  maxEntities: number;
  maxDirectorSpawnsPerTick: number;
}
export interface PolicyContact {
  actorId: string;
  actorIndex: number;
  effectorId: string;
  semantic: string;
  effectorIndex: number;
  speed: number;
  movement: Vec3;
  inside: boolean;
}
export interface PolicyContext {
  tick: number;
  entity: EntitySpec;
  contacts: readonly PolicyContact[];
  memory: Json;
}
export interface InteractionPolicy {
  id: string;
  version: string;
  validate(config: Json): string[];
  evaluate(context: PolicyContext): { eligible: PolicyContact[]; memory: Json };
}
export interface ScoringPolicy {
  id: string;
  version: string;
  score(context: { entity: EntitySpec; error: number; rules: Rules; actor: Score }): {
    grade: string;
    points: number;
  };
}
export interface ArbitrationPolicy {
  id: string;
  version: string;
  order(
    contacts: readonly PolicyContact[],
    context: { tick: number; entityId: string; actorCount: number },
  ): PolicyContact[];
}
export interface Program {
  version: 1;
  id: string;
  title: string;
  seed: number;
  rules: Rules;
  entities: readonly EntitySpec[];
  groups: readonly GroupSpec[];
  policies: readonly InteractionPolicy[];
  durationTicks: number;
  scoring: ScoringPolicy;
  arbitration: ArbitrationPolicy;
}
export interface SlotHit {
  slot: number;
  actorId: string;
  effectorId: string;
  tick: number;
}
export interface LiveEntity {
  spec: EntitySpec;
  position: Vec3;
  previous: Vec3;
  transform: { position: Vec3; orientation: Quat };
  hits: SlotHit[];
  armedTick: number | null;
  hold: number;
  brokenFor: number;
  occupancy: { key: string; since: number; lastPenalty: number }[];
  memory: Json;
}
export interface GroupState {
  id: string;
  hits: { entityId: string; actorIds: string[]; tick: number }[];
  firstTick: number | null;
  resolved: boolean;
}
export interface Score {
  actorId: string;
  points: number;
  hits: number;
  misses: number;
  combo: number;
  bestCombo: number;
  hazards: number;
}
export interface WorldState {
  version: 1;
  programId: string;
  tick: number;
  eventSeq: number;
  rng: number;
  actors: ActorState[];
  entities: LiveEntity[];
  groups: GroupState[];
  scores: Score[];
  cursor: number;
  finished: boolean;
  resolvedCount: number;
  directorIds: string[];
}
export interface CommandBase {
  id: string;
  tick: number;
}
export type Command = CommandBase &
  (
    | { type: 'actor.add'; actor: ActorSpec }
    | { type: 'actor.remove'; actorId: string }
    | {
        type: 'pose';
        actorId: string;
        effectorId: string;
        position: Vec3;
        orientation?: Quat;
        tracked?: boolean;
        active?: boolean;
      }
    | { type: 'calibrate'; actorId: string; position: Vec3; orientation: Quat }
    | { type: 'director.spawn'; entity: EntitySpec }
  );
export interface DomainEvent {
  seq: number;
  tick: number;
  type: string;
  entityId?: string;
  actorId?: string;
  data: Json;
}
export interface TransitionResult {
  state: WorldState;
  events: DomainEvent[];
}
