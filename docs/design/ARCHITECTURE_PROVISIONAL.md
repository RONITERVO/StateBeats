# StateBeats — Provisional Architecture (Phase 1)

**Status:** PROVISIONAL — awaiting owner approval. No implementation code until approved.
**Date:** 2026-09-07
**Author:** implementing maintainer (Claude Opus 5 session)

This document is the durable record of the Phase 1 proposal, written to remain useful after
context compaction. Values marked *(default)* are proposals, not decisions.

---

## 0. Environment inspected

`D:\Projects\3dRythm` contained exactly one file, `BUILD_BRIEF.md`. No prior code, no
`.git`, no `CLAUDE.md`, no `.claude/` at project, parent, or user scope. Nothing to preserve
beyond the brief itself.

Verified locally on 2026-09-07:

| Tool | Version |
|---|---|
| node | v25.4.0 (x64, win32) |
| npm | 11.7.0 |
| git | 2.49.0.windows.1 |
| python | 3.14.2 |
| gh | 2.96.0 |
| Chrome / Edge | present |
| Firefox | absent |
| pnpm / yarn / bun / deno | absent |
| logical CPUs | 32 |

Registry reachable. Latest published versions observed: `@modelcontextprotocol/sdk` 1.30.0,
`typescript` 7.0.2 (5.9.3 on the 5.x line), `vitest` 5.0.0 (4.1.11 on the mature V4 line),
`zod` 4.5.4, `fast-check` 4.9.0, `three` 0.185.1, `vite` 8.2.2, `@playwright/test` 1.63.0,
`commander` 15.0.0.

**Naming note:** the directory spells the project `StateBeats` (no `h`). Package scope, repo
name, and docs follow that spelling unless told otherwise. Cheap to change now, expensive
later.

---

## 1. Determinism model — the load-bearing decision

The brief demands a *stated* guarantee backed by evidence. Everything else follows from
this section.

### 1.1 What ECMAScript actually specifies

Probed directly on Node v25.4.0; the same probe becomes a CI fixture.

- `+ - * / %` on Numbers are defined by ECMA-262 as IEEE-754 binary64 operations with
  round-to-nearest-ties-to-even. Every operator rounds, and **JavaScript has no FMA
  contraction**, so expression evaluation is exactly reproducible.
- Comparisons are exact. `Math.imul`, bitwise ops, `>>>`, `|0`, and typed-array arithmetic
  are exactly specified.
- `Array.prototype.sort` is required to be stable (ES2019+).
- `Number::toString` radix 10 yields the *shortest round-tripping* decimal, exactly
  specified. Verified: `Number(String(0.1 + 0.2)) === 0.1 + 0.2`.
- `Math.sin/cos/tan/atan2/pow/exp/log/cbrt/hypot` — and, per the same ECMA-262 note,
  `Math.sqrt` — are **implementation-approximated**. Observed `Math.sin(1)` =
  `0x0.d76aa47848677` on this engine; another conforming engine may legally differ in the
  last bits.

### 1.2 The rule

> **The kernel's runtime arithmetic uses only `+ - * /`, comparisons, and integer
> operations on IEEE-754 doubles. No transcendental function and no `Math.sqrt` is called
> on any code path that can affect state or events.**

This is ordinary engineering, not heroics:

- **Contact tests use squared quantities.** Sphere / capsule / AABB / OBB overlap, swept
  segment-vs-shape, radius checks — all compare squared distances. No `sqrt`.
- **Sub-tick time of impact** is used only to *order* claims. Comparing two TOIs compares
  rationals `a1/b1 ? a2/b2` as `a1*b2 ? a2*b1` with sign handling: exact ordering, no
  division, no `sqrt`.
- **Rotations never call trig at runtime.** Poses arrive as quaternions from adapters; the
  kernel only multiplies quaternions and rotates vectors, which is `+ - *` only.
- **Trig lives in the compiler, not the runtime.** Angular authoring (`azimuth 37.5°`) is
  converted to Cartesian *once*, during map compilation, by `@statebeats/mathkit`'s own
  polynomial `sin/cos/atan2` built from `+ - * /` alone. The compiled sequence stores the
  resulting doubles and carries a content hash; the runtime replays stored numbers.
- **`detSqrt`** exists in mathkit for the few presentation and authoring places that want a
  true magnitude: bit-trick initial estimate plus a fixed Newton–Raphson iteration count
  using only `+ - * /`. Deterministic; not claimed correctly-rounded.
- **PRNG** is integer-only (`pcg32` over `Uint32Array` + `Math.imul`), seeded, with its
  state part of `WorldState`. `Math.random` is banned.

### 1.3 The guarantee actually claimed

> Given the identical published package version, identical `CompiledRules` (identified by
> hash), identical seed, identical compiled sequence (identified by content hash), and an
> identical ordered command log, StateBeats produces **bitwise-identical canonical state
> serialization and bitwise-identical event digests** on every ECMA-262-conforming engine.
> Verified in CI across Node 22/24/25 on Linux/Windows/macOS-arm64, and across
> Chromium/Firefox/WebKit via Playwright.

Not claimed: determinism across differing rules versions, across differing *major* versions
of this package, or on an engine that violates ECMA-262. Rules changes that alter physics or
evaluation create a new `rulesVersion` and therefore a replay-compatibility boundary; old
replays are rejected loudly, never silently re-scored.

### 1.4 Enforcement, not intent

1. ESLint `no-restricted-properties` / `no-restricted-globals` in `core` and `mathkit`:
   `Math.{sin,cos,tan,asin,acos,atan,atan2,pow,exp,log*,sqrt,cbrt,hypot,random}`, `Date`,
   `performance`, `setTimeout`, `queueMicrotask`, `fetch`, `crypto`, `process`, `globalThis`.
2. An import-graph check: `core` may import only `mathkit`; neither may import a Node
   builtin, a DOM lib, or any third-party package. `core/package.json` has zero
   `dependencies`. Runs in CI and as a test.
3. A **purity harness** test running a full session with `Date`, `Math.random`,
   `performance`, `setTimeout`, and `fetch` replaced by throwing stubs, with `tsconfig`
   `lib` restricted to `ES2023` (no `DOM`).
4. A **snapshot-immutability** test: every state produced in a run is deep-frozen in test
   builds, so a later tick mutating an earlier snapshot throws.

---

## 2. Language, layout, dependencies

**TypeScript, ESM, npm workspaces monorepo, Node >= 22.**

Reasoning rather than default:

- The same kernel must run headless in Node (tests, CLI, MCP) and in a browser (reference
  player, WebXR). WebXR is browser-only and is in scope. A Rust or Python core would need a
  WASM bridge or a second implementation, colliding with the brief's hard requirement of
  *one authoritative interaction implementation*.
- The official MCP SDK is TypeScript-first.
- Determinism is achievable in JS under the §1 discipline, and that discipline is
  mechanically enforceable.
- npm workspaces because npm 11.7.0 is already present and pnpm/yarn/bun are not; adding a
  package manager is a contributor tax with no benefit here.

```
StateBeats/
  packages/
    mathkit/         @statebeats/mathkit        deterministic math: vec/quat, polynomial trig
                                             (compile-time), detSqrt, pcg32, sha256,
                                             canonical JSON. Zero dependencies.
    core/            @statebeats/core           THE KERNEL: transition / observe / snapshot.
                                             Imports mathkit only. No Node, no DOM.
    schema/          @statebeats/schema         versioned zod schemas + emitted JSON Schema for
                                             map / command / observation / replay / rules.
    sdk/             @statebeats/sdk            Session service, adapter registry, clocks,
                                             compiler driver, replay engine. Node + browser.
    adapters-node/   @statebeats/adapters-node  fs MapStore / ReplayStore, monotonic clock.
    cli/             @statebeats/cli            thin wrapper over sdk (commander).
    mcp/             @statebeats/mcp            thin wrapper over sdk (MCP SDK, stdio).
    player/          @statebeats/player         browser reference client + WebXR adapter.
    content/         @statebeats/content        maps, tempo maps, procedural audio definitions.
  docs/  examples/  benchmarks/  .github/workflows/
```

Dependency direction is strictly downward and `core` is a sink. CLI, MCP, player, and bots
are peers consuming `sdk`; none may contain collision, timing, scoring, or map-generation
logic, enforced by the import-graph check.

Proposed pins, conservative on purpose and re-verified at install:
`typescript@5.9.3` (not 7.x yet — the Go-native compiler line is new; migration is a
follow-up, not a risk to absorb now), `vitest@4.1.11` (mature line, not the just-released
5.0.0), `zod@4`, `fast-check@4`, `three@0.185`, `vite@8`, `@playwright/test@1.63`,
`commander@15`, `@modelcontextprotocol/sdk@1.30`. `core` and `mathkit` have **zero** runtime
dependencies.

---

## 3. The kernel contract

```ts
transition(prev: WorldState, commands: readonly Command[], tick: Tick, rules: CompiledRules)
  : { state: WorldState; events: readonly DomainEvent[] }
```

Pure and total. It never throws for *domain* problems — illegal input produces a
`command.rejected` event and an otherwise-normal state. It throws only for programmer errors
(wrong tick, mismatched rules hash, corrupt state), which must never occur on a released
path.

`tick` is the tick being computed; `prev.tick === tick - 1` is required, and the result
satisfies `state.tick === tick`.

### 3.1 State — serializable, versioned, structurally shared, frozen in dev/test

```ts
interface WorldState {
  schemaVersion: SemVer;   rulesHash: Hex64;
  tick: Tick;              eventSeq: number;   // monotonic across the session
  rng: { hi: number; lo: number };             // pcg32, uint32 pair
  actors:   readonly ActorState[];    // dense; index = registration order = tie-break key
  entities: readonly EntityState[];   // dense; index = spawn order = primary sort key
  groups:   readonly GroupState[];    // combined / shared link groups
  sequence: { compiledHash: Hex64; cursor: number; endTick: Tick };
  scores:   readonly ScoreState[];    // one per actor, int32-bounded, saturating
  session:  { phase: "idle" | "running" | "paused" | "ended"; endReason?: string };
}
```

No `Map`, `Set`, or class instances in state — plain arrays and objects only, so canonical
serialization and structural sharing are trivial and iteration order is always explicit.

### 3.2 Tick boundary — exact ordering

For tick `T`, in this order, no exceptions:

1. **Ingest.** Commands sorted by the total order `(issuedTick, actorIndex, effectorIndex,
   commandSeq, commandId)`. Shape, finiteness, and bounds checks. Duplicate `commandId` →
   idempotent drop plus event. `issuedTick > T` → held, not applied. `issuedTick <
   T - lateGraceTicks` → rejected plus event *(default)*. A rejection mutates nothing else.
2. **Pose application.** Each effector advances `pose@T-1 → pose@T`, forming this tick's
   **swept segment**. `tracked: false` freezes the pose and excludes the effector from
   contact; the first pose after re-acquisition produces a *degenerate point sweep*, never a
   long segment across the tracking gap.
3. **Spawn.** Compiled entries with `spawnTick === T` instantiate in compiled index order, so
   a target is contactable on its spawn tick.
4. **Motion.** Entity kinematics evaluated at `T` from compiled trajectories (piecewise
   polynomial / lerp — no trig).
5. **Contact detection — geometry only, no gameplay meaning.** Swept effector volume ×
   entity hit volume → contact records with sub-tick TOI, ordered by `(entityIndex,
   actorIndex, effectorIndex)`.
6. **Requirement evaluation.** The per-entity `InteractionPolicy` turns contacts plus timing
   window, direction cone, and speed floor into *claims*.
7. **Arbitration.** Deterministic resolution of competing claims (§5.4).
8. **Resolution and lifecycle.** Hits and misses commit; groups arm, complete, or break;
   hazards apply; **expiration is evaluated after contact**, so a target can be hit on its
   final tick.
9. **Scoring commit** in canonical order.
10. **Sequence, phase, and end-condition** update.
11. **Event log finalized** — every event carries `tick` and a globally monotonic `seq`.

Observations are not part of state; `observe()` derives them on demand. Reading an
observation, listing resources, or editing an uncommitted map cannot advance time, because
only a clock calls `transition`.

### 3.3 Numeric range policy

Ticks: non-negative integers ≤ `2^31 - 1` (≈ 207 days at 120 Hz). Positions `|x| ≤ 1e4` m.
Velocities ≤ `1e3` m/s. Durations ≤ `2^24` ticks. Scores int32 with saturation. All command
numbers must be finite; `NaN`, `±Infinity`, and `-0` are rejected at ingest. Canonical
serialization normalizes `-0` to `0` and refuses non-finite values.

### 3.4 Serialization, snapshots, replay

- **Canonical JSON:** keys sorted by UTF-16 code unit, numbers via `String(x)` (shortest
  round-trip, exact), no insignificant whitespace, UTF-8 bytes.
- **Hash:** pure-TS SHA-256 in mathkit — no `node:crypto`, so it works in the browser too.
- **Snapshot** = canonical serialization of `WorldState` + rules hash + compiled-sequence
  hash. **Restore** = parse, validate, rebuild. Round-trip is hash-identical.
- **Replay file:** `{ formatVersion, engineVersion, rulesId, rulesHash, seed, tickRate,
  map: { id, version, contentHash }, initialSnapshot?, commands: [...], checkpoints:
  [{ tick, stateHash }], finalStateHash, eventDigest }`. It records the commands and rules
  needed to reproduce the decision, not the reported score. Verification re-runs and
  compares; checkpoints localize a divergence to a tick range instead of just failing.

---

## 4. Adapters

Small, explicit, few. Adapters receive frozen projections — never `WorldState`, never a
mutable internal reference. Nothing an adapter does can change simulation results.

| Contract | Required? | Purpose |
|---|---|---|
| `ActorCommandSource` | ≥1 per playing actor (0 is legal for inspection) | produce validated commands |
| `PerceptionSink` | none; many simultaneous | receive presentation frames and events |
| `ClockSource` | one; `ManualClock` is the default | decide *when* `transition` runs |
| `MapStore` | optional; in-memory default | load / save / list authoring maps |
| `ReplayStore` | optional; in-memory default | persist replays |
| `SequenceCompiler` | pure policy, versioned | authoring map + tempo → compiled sequence |
| `InteractionPolicy` / `ScoringPolicy` / `ArbitrationPolicy` | pure, versioned, inside `CompiledRules` | replaceable gameplay rules |

**Deliberately not built:** a network `Transport` interface, a generic plugin registry, an
event bus, or an adapter per math helper. Networking is out of scope, and shipping an unused
interface for it is exactly the speculative framework the brief warns against. The design's
compatibility with future lockstep networking is *documented*, not *scaffolded*.

```ts
interface ActorCommandSource {
  readonly id: string;
  readonly capabilities: ReadonlySet<"pose" | "director">;
  attach(ctx: ActorContext): void | Promise<void>;   // ctx.submit() queues for the NEXT boundary
  poll(tick: Tick): readonly Command[];              // sync, once per tick, pre-transition
  detach(): void | Promise<void>;                    // idempotent; releases all resources
}

interface PerceptionSink {
  readonly id: string;
  readonly capabilities: ReadonlySet<"visual" | "audio" | "text" | "haptic">;
  attach(ctx: PerceptionContext): void | Promise<void>;
  onTick(frame: Readonly<PresentationFrame>): void;  // droppable: keep-latest under backpressure
  onEvents(batch: Readonly<EventBatch>): void;       // lossless to a bounded buffer, then an
                                                     // explicit `events.overflow` marker
  detach(): void | Promise<void>;
}
```

**Error isolation and backpressure.** A throwing sink is caught and counted; after `N`
consecutive faults *(default 3)* it is quarantined, an `adapter.faulted` diagnostic is
emitted, and the session continues at full speed. Presentation frames are keep-latest, so a
slow renderer drops frames but never stalls or alters ticks. Event delivery is lossless up to
a bounded queue; on overflow the sink gets an explicit marker rather than a silent gap. A
slow or failing sink cannot change the simulation — asserted by a test running one fixture
with a sleeping/throwing sink and comparing final state hashes.

**Runtime swapping.** Perception sinks and actor sources attach and detach freely
mid-session. Swapping an `InteractionPolicy`, `ScoringPolicy`, or tick rate changes
`rulesHash`, which is a recorded configuration boundary: the session emits `rules.changed`,
and replays spanning the boundary are rejected unless both rule sets are present.

**Proof obligation:** substitute one actor adapter and one perception adapter without editing
the kernel. Shipped in `examples/` as a `SineWaveBot` actor source and an `AsciiRadarSink`
perception sink, each with a conformance test.

---

## 5. Spatial and interaction semantics

### 5.1 Coordinates

Right-handed, **+Y up, −Z forward**, metres — matching WebXR / glTF / three.js so no
conversion exists at the boundary that matters most. Quaternions `(x, y, z, w)`, normalized,
right-handed.

Three spaces, all conversions defined and tested:

- **world** — the simulation's fixed frame; entities live here once spawned.
- **stage** — player-relative, established at calibration: origin = head position projected
  to the floor plane, orientation = yaw-only forward reference (roll and pitch discarded).
  Authoring happens here.
- **effector-local** — per-effector, for hit-volume offsets.

`worldFromStage` is a yaw rotation plus a translation, applied **once at spawn** *(default)*,
so the player may physically turn or lean and the target stays where it was placed. An entity
may opt into `anchor: "stage"` to follow the player origin (tutorial guides).

Angles: radians internally, **degrees in authoring JSON**. Azimuth normalized to `[-π, π)` by
a single canonical `wrapAngle`. The 0/360 boundary is a property-tested invariant, as is
"rotate the stage yaw by θ and every relative result is unchanged".

Elevation is representable over the full sphere `[-90°, +90°]`; the **validator warns**
outside a comfort band of elevation `[-40°, +60°]`, azimuth unrestricted, radius `0.5–2.5 m`
*(defaults, per-map configurable)*. The kernel imposes only finite bounds — comfort is a
content policy, not a physics law.

### 5.2 Actors and effectors

```ts
ActorState    { id, index, role: "player" | "director" | "observer", capabilities,
                effectors: readonly EffectorState[] }
EffectorState { id, index, semantic?: "left" | "right", pose, prevPose, tracked, volume }
```

`"left"` and `"right"` are **default semantic bindings on named effectors**, not assumptions
baked through the engine. A three-effector actor, or one with bindings swapped for a
left-handed player, requires no kernel change. Targets state *requirements*
(`requiredSemantic: "left" | "right" | "any"`), matched against bindings.

**A display colour or mesh is never a semantic type.** The renderer maps `requiredSemantic` →
colour; the reverse never happens, enforced by keeping presentation fields out of the entity
schema entirely.

### 5.3 Separation of concerns

Three distinct, separately testable stages: **geometry** (does the swept effector volume
overlap the hit volume, and at what sub-tick TOI?) → **requirement evaluation** (does that
contact satisfy this entity's type, timing window, direction cone, and speed floor?) →
**scoring** (what grade, how many points?).

Hit volumes v1: sphere, axis-aligned box, oriented box, capsule. Effector sweep: a capsule
from `prevPose` to `pose` with the effector radius. Fast motion cannot tunnel — at 120 Hz a
20 m/s hand moves 16.7 cm per tick, larger than a 10 cm target, which is the entire reason
for the swept test; it is tested at extreme speeds.

### 5.4 Arbitration — deterministic, documented, replayed

When several claims target one entity in one tick:

1. higher requirement-satisfaction tier;
2. smaller `|contactTick − hitTick|`;
3. earlier sub-tick TOI (compared as exact rationals — no division, no `sqrt`);
4. lower `actorIndex` (registration order);
5. lower `effectorIndex` (declaration order).

No randomness anywhere. Losers receive `claim.arbitrated` events. Both effectors of one actor
hitting one target yields one hit and one `contact.duplicate` with no score. One-hit entities
set `consumedAtTick` and ignore later contacts. Repeated-hit entities use per-tick evaluation
with `cooldownTicks`.

Hazards emit `hazard.entered` on the first tick inside, `hazard.sustained` every
`hazardTickInterval` *(default 12 ticks = 100 ms)* while still inside — so remaining inside
costs a defined, testable amount instead of 120 penalties per second — and `hazard.exited` on
leaving.

---

## 6. Time and rhythm

**Simulation rate: 120 Hz** *(default; 60 / 120 / 240 configurable, and part of `rulesHash`
because it changes replay semantics)*. ±1 tick = 8.33 ms, fine enough for rhythm grading and
cheap headless.

- **`ManualClock.advance(n)`** runs exactly `n` ticks, evaluating every intermediate tick and
  never jumping past events. `advance(N)` ≡ `N × advance(1)` is a property test over
  randomized command timelines that compares full event streams, not just final state. Time
  never advances while an agent thinks, because nothing but a clock call advances it.
- **`RealtimeScheduler`** lives outside the kernel, accumulates monotonic elapsed time into
  fixed steps, and defines pause/resume, speed scaling, a catch-up cap *(default 8
  ticks/frame; surplus dropped with a `scheduler.stalled` diagnostic rather than a silently
  skipped tick)*, input-timestamp normalization, late-command policy, and handover to and
  from `ManualClock` without losing state.
- **Session mutation is serialized** by an async mutex, so an MCP call cannot interleave with
  a scheduler step. Every mutating SDK / CLI / MCP operation acquires it.

**Musical time is separate.** A tempo map (bpm segments, meter, offset, subdivisions, tempo
changes) compiles deterministically to tick positions. Boundary rounding is
round-half-to-even on the exact rational `beat × 60 × tickRate / bpm`, documented; two events
quantizing to the same tick keep compiled order and both evaluate on that tick. Audio latency
calibration is an **input/output-boundary offset** applied to command timestamps and audio
scheduling — never inside the kernel. Visual and audio callbacks can never award a hit.

---

## 7. Actors, perception, authority

Four actor paths through **one validated command interface**: human input, scripted bot,
deterministic replay source, and external agent via SDK / CLI / MCP. Defaults require no LLM
and no paid API; an LLM is an optional caller.

Role permissions are separate from input mechanism:

- `player` — submits pose and tracking commands for **its own** effectors only. Cannot set
  score, force hits, edit entities, or touch the map.
- `director` — submits a small authorized, validated, replay-recorded set
  (`director.spawn`, `director.setTempoScale`, `director.retarget`), rate-limited by rules
  config. Still cannot set score or force hits.
- `observer` — read-only.

**Observations** are structured JSON with stable versioned schemas and bounded event/delta
queries by `(sinceSeq, limit)`. `ViewSpec` is `{actor}` | `{director}` | `{debug}`; the actor
view hides RNG state, contact internals, unspawned sequence beyond `previewTicks`, and rival
detail, so a competitive agent cannot accidentally receive hidden state. Every observation
carries `tick` and `eventSeq` so a caller can act consistently and detect gaps.

**Three perception adapters ship, all real:**

1. `TextPerceptionSink` — JSON/text stream, the primary agent surface.
2. `PlayerRenderer` — minimal three.js visual reference.
3. `AudioPerceptionSink` — communicates target **timing, direction, elevation, distance,
   type, and outcome** through spatialized procedural earcons: a lead-in pitch sweep locked
   to the hit tick, timbre by interaction type, panning by azimuth, filtering by elevation,
   distinct success / miss / hazard cues. Playable with the display off. A background
   soundtrack is not audio-only perception. Limitations get documented, not certified.

---

## 8. SDK, CLI, MCP, native builder

`@statebeats/sdk` is the primary integration surface and owns the session/service layer. CLI and
MCP are **thin wrappers** that call it and contain no collision, timing, scoring, or
map-generation logic of their own — enforced by the import-graph check.

Operations (names provisional): `session.create/reset/close/list`,
`actor.register/bind/unregister`, `map.load/validate/generate/edit/compile/export/import`,
`command.submit` (batched), `pose.trajectory` (synthetic movement generator),
`clock.advance/mode/start/pause`, `observe`, `events.since`, `snapshot.save/restore`,
`replay.export/run/verify`, `diagnostics.inspect`.

Contract rules: versioned request/response schemas; explicit `protocolVersion` and
`schemaVersion`; caller-supplied `requestId` and `commandId` making retries idempotent;
bounded batch sizes *(default 1024 commands)*; **all-or-nothing batch validation** so an
invalid batch leaves no partial change; deterministic treatment of late and duplicate
commands; machine-readable results with stable error codes and meaningful process exit codes.
**MCP stdio stdout carries protocol messages only; diagnostics go to stderr** — asserted by a
test that parses stdout as strict JSON-RPC framing. Sessions are isolated and disposed
cleanly, with a test proving two sessions cannot affect each other.

MCP uses `@modelcontextprotocol/sdk` 1.30.0 and is exercised through a **real client over
stdio**, with protocol behaviour verified against official documentation at implementation
time — not a renamed custom JSON loop.

**Native builder** = headless SDK capability. Authoring maps (mutable, versioned) are
distinct from compiled sequences (immutable, content-hashed). Editing an authoring map in a
running session changes nothing until `map.compile` plus an explicit swap at a tick boundary.
Imported maps are **data, never executable**: no code, no expressions, no `eval`. Validation
covers size caps, numeric finiteness and bounds, reference integrity, duplicate IDs,
unsupported versions, and asset-path shape. Generation is seeded and reproducible; a
different seed yields a different valid map.

---

## 9. One interaction, three paths

The point of the design: after `submit()`, all three paths are the same code.

| | Human (browser) | Scripted bot | LLM agent (MCP) |
|---|---|---|---|
| origin | pointer/key → InputMapper | `poll(tick)` | tool call |
| command | `actor.pose` + synthesized lunge trajectory | `actor.pose` | `command.submit` batch |
| validation | schema at boundary + kernel invariants | same | same |
| queue | session inbox, next tick boundary | same | same, under the session mutex |
| clock | `RealtimeScheduler` | `ManualClock.advance(n)` | explicit `clock.advance(n)` |
| authority | kernel `transition` | kernel `transition` | kernel `transition` |
| feedback | sinks: renderer + audio | sinks: none or ascii | `observe` / `events.since` |

The renderer may *predict* a hit for responsiveness but reconciles to the authoritative
event, and the score UI reads only committed events. A conformance test drives one fixture
down all three paths and asserts identical final state hashes.

---

## 10. Milestones and completion checks

**M1 — Kernel and determinism foundation.** `transition`, canonical domain and schema,
snapshot, replay skeleton, one interaction type fully headless.
*Checks:* purity harness passes; import-graph check passes; `core` has zero dependencies;
canonical round-trip is hash-identical; pcg32 matches published vectors; deep-freeze
immutability test; 1000 repeated runs produce one hash.

**M2 — Spatial, all approved types, arbitration, tempo, builder.**
*Checks:* one focused test per approved type; the boundary suite (window edges ±1 tick,
20 m/s sweep, 0/360 wrap, rotated-origin property test, combined and shared contacts,
competing claims, hazard dwell, duplicate and late commands, tracking loss, NaN and schema
rejection); tempo golden files; generation reproducible by seed, and a different seed
producing a different valid map.

**M3 — SDK, clocks, adapters, CLI, MCP.**
*Checks:* `advance(N)` ≡ N × `advance(1)` including intermediate events; manual versus
jittered simulated-realtime agree on one input timeline; snapshot/restore plus remaining
inputs ≡ an uninterrupted run; SDK, CLI, and MCP produce identical results on one fixture; a
real stdio MCP round trip; stdout purity; session isolation; malformed-request behaviour;
adapter-substitution examples passing conformance.

**M4 — Player, audio, XR, content.**
*Checks:* Playwright boot → play → results → dispose; a scripted browser run completing the
tutorial map with a recorded score; an audio-only event stream carrying timing, direction,
type, and outcome for every entity; the XR adapter driven by synthetic controller poses
through the same command contract; an explicit list of real-device checks still outstanding.

**M5 — Conformance, benchmark, release preparation.**
*Checks:* clean-copy install / build / test / play on Windows; cross-runtime determinism
(Node 22/24/25 × Chromium/Firefox/WebKit) producing identical hashes; a benchmark reporting
tick cost and memory at a documented load with headroom against 120 Hz; every documented
command executed from a clean copy; packaging and release notes; nothing pushed anywhere.

**Negative-evidence requirement throughout:** each milestone includes a test that *fails*
correctly — a wrong hit detected, a missed target detected, a tampered replay rejected.

---

## 11. Open decisions blocking approval

Recorded in `docs/design/OPEN_QUESTIONS.md`. What each answer changes: interaction types and
group semantics (Q1) → policy shape and arbitration tests; authoring model (Q2) → schema,
grid compiler, validator bands; success criteria (Q3) → requirement evaluator and whether
trajectories are v1-critical; actor arrangements (Q4) → multi-actor arbitration, per-actor
views, whether any transport exists; release surface (Q5) → player scope and what may be
claimed about hardware; content and license (Q6) → content packages, LICENSE files,
third-party notices.

Independent of the answers, and safe to build either way: the determinism model, tick
contract, canonical serialization, snapshot/replay, session service, clocks, CLI/MCP wrapper
shape, package layout, and CI.
