# Turns as musical movement

StateBeats authors short turning gestures, sustained sweeps, responses and settled cadences
without stopping incoming notes. A turn is a data track with a musical reason, independent
of the renderer, simulation clock, actor and music analyzer.

`planTurns(cues, options, planner?)` returns `{ cues, track, decisions, settings, summary }`.
The returned cues and settings can be edited and replanned, including previously settled cues.
The reference policy is `musicalTurns` (`statebeats/musical-turns-v1`). A trusted host can replace
it with a `TurnPlanner`. Adapters receive copies; returned decisions must satisfy the same
interval, travel, range, speed and acceleration constraints.

```js
import { planTurns, createFacingSampler, facePoint } from '@statebeats/sdk';

const plan = planTurns([
  { id: 'call', beat: 8, endBeat: 11.5, gesture: 'sweep', direction: 'right',
    reason: 'Lead melody sweeps across the body' },
  { id: 'carry', beat: 12, endBeat: 15.5, gesture: 'continue',
    reason: 'Repeated lead sustains the movement' },
  { id: 'answer', beat: 16, endBeat: 19.5, gesture: 'answer',
    reason: 'Answering phrase reverses the gesture' },
  { id: 'cadence', beat: 20, endBeat: 23.5, gesture: 'settle',
    reason: 'Hold the landing through the cadence' },
], { bpm: 150, degrees: 45, maxSpeed: 70, maxAcceleration: 180 });

const headingAt = createFacingSampler(plan.track);
const contact = facePoint([-0.4, 1.3, -0.5], headingAt(10));
console.log(contact, plan.decisions, plan.summary);
```

Run `node examples/turns.mjs` after building for an original phrase and the full Event Horizon
report. CLI JSON-lines and MCP expose the same pure operations:

```json
{"op":"turns.plan","args":{"cues":[{"id":"call","beat":8,"endBeat":11.5,"gesture":"sweep","direction":"right","reason":"Lead phrase"}],"options":{"bpm":150}}}
```

`turns.inspect` accepts `{ track, bpm }` and returns analytic peak speed/acceleration, total
angular travel, longest same-direction travel, reversal count and final unwrapped heading.
Both operations are read-only calculations available without a session; they advance no time
and store no map. `music.compose` generates and stores complete maps with musical turning.

## Cue and track contracts

- `beat` and `endBeat` are absolute map beats. Intervals must be positive, ordered and
  non-overlapping, with unique IDs. Touching intervals are allowed. At most 8,192 cues/events.
- `sweep` honors an explicit left/right `direction`. Without one, the reference policy turns
  against accumulated signed travel; at balance, the seed breaks the tie.
- `continue` carries the previous direction. `answer` reverses it. An explicit `direction`
  overrides these choices. `settle` holds facing and creates a zero-angle decision.
- `strength` is 0–1 (default 1); zero settles, positive values scale size from 40–100%.
  Optional `degrees` specifies an authored size up to the global `degrees` ceiling.
- `mode` is `forward`, `bounded` or `full`. Bounded mode stays within `range` degrees of
  forward; full mode keeps yaw unwrapped across complete revolutions.
- `maxSpeed` is degrees/second, `maxAcceleration` is degrees/second².
  `maxDirectionalTravel` limits successive same-direction travel. Settling does not erase it.
  The reference policy reduces excessive requests while preserving timing/direction, recording
  that choice. A prescribed sweep is never silently flipped to fit a budget.
- The report includes every cue, including settled and budget-limited decisions. The track
  includes actual turns, each with its angle, interval, curve and reason.

Version 1 uses quintic smootherstep with zero endpoint speed and acceleration. Its analytic
derivative maxima enforce peak limits, rather than checking average speed. Longer cues carry
one sustained sweep; separate cues create distinct gestures. The sampler validates and snapshots
once, then uses logarithmic lookup. Facing stays at the reached heading between events and
outside the track. There is no wall clock.

The planner and inspector currently take **one constant BPM**. Their physical rate limits do
not certify a different tempo map or changed playback speed. At speed factor `s`, angular speed
scales by `s` and acceleration by `s²`. Variable-tempo planning needs a tempo-aware adapter and
equivalent rate validation; one representative BPM is insufficient.

## Baking, persistence and compatibility

Optional `map.turns` stores the validated authoring track. **Notes and baked paths remain the
playback authority.** Adding a track does not automatically rotate notes or the player. This
prevents double transformation and keeps the core unchanged.

Use `facePoint(localPosition, headingAt(contactBeat))` for contacts and rail waypoints.
`faceShape` rotates a fixed box's existing orientation or capsule endpoints consistently.
Direction requirements use the same facing. Floor height is preserved. Continuously rotating
elongated collision shapes during a hold is outside the core's fixed-shape contract; sampling
positions alone does not implement that.

The generator and Event Horizon bake facing during authoring. Emission times stay unchanged;
source positions preview upcoming contact directions. Decoration can have independent paths.
Held paths are sampled into ordinary waypoints and contact follows their compiled linear
segments. The analytic curve is an authoring reference, not a second runtime motion system.
Replays, imports and manual ticks need no planner implementation to play a saved map.

The compiler checks track structure and map duration. It does not assert that arbitrary imported
geometry matches its explanatory track. Creators must keep them aligned when editing by hand.
Existing maps without tracks retain their geometry.

## Music generation and tuning

`generateChoreography(music, { turnStyle: 'musical', ... })` composes/selects notes in local
facing once. It examines actual per-hand horizontal movement in four-beat windows, including
rail waypoints. Coherent sweeps give directional cues; balanced movement can return toward
forward; sparse windows settle. Cue endpoints follow the final selected movement in each
window. This is a geometric heuristic using supplied BPM and stored music features, not
instrument transcription or a claim to understand a song's arrangement.

Facing is baked into contacts, paths, fixed shapes and directions, followed by the usual
hand-reservation, reach and speed checks. Later omissions appear in the report; turn decisions
describe the selected draft before those checks. Read both when refining a map. An authored
score can provide more intentional cues, as Event Horizon does.

`GenerationAdapters.turns` replaces this policy. The older `facing` adapter remains for `rests`
and `continuous`; the wrong adapter for a style is rejected. New recipes identify
`statebeats/choreography-v2`. Saved v1 recipes remain playable and their legacy controls can be
restored/rebuilt; regeneration records the new version.

Normal, Hard and Master quick setups use musical turning; Beginner stays forward. Turn size,
peak speed, acceleration and same-direction travel are independent of reach and hand speed.
Lower acceleration can make a turn smaller without shifting its landing. No mandatory
note-spawning timeout is added. Quest playtesting still decides whether a phrase reads well,
fits the player and feels musical.
