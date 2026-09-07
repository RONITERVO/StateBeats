# StateBeats — Phase 1 Open Questions

**Status:** awaiting owner answers. Each question has a recommendation that becomes the
default if you reply "defaults" or answer only some of them.

---

## Q1 — Interaction types and combined/shared semantics

**Recommended initial rule set (6 types, plus 1 optional 7th):**

| # | Type | Semantics |
|---|---|---|
| 1 | `target.left` | left-bound effector must strike it |
| 2 | `target.right` | right-bound effector must strike it |
| 3 | `target.any` | either effector |
| 4 | `combo.sameActor` | two linked targets, **one actor**, one per effector |
| 5 | `shared.multiActor` | two linked targets, **distinct actors**, cooperative |
| 6 | `hazard.avoid` | a volume no effector or head may enter |
| 7 | `sustain.hold` *(optional)* | remain inside a volume for D ticks, bounded break tolerance |

**Combined/shared timing — recommend the grace interval, not simultaneity, not overlap.**
The first member contact *arms* the group and opens `linkWindowTicks` *(default 6 ticks =
50 ms at 120 Hz)*. The group resolves as `group.completed` when every member is satisfied
inside the window, or `group.broken` when the window elapses or any member expires. On a
break, each satisfied member still keeps its own base hit; only the group bonus is lost.

*Tradeoff:* same-tick simultaneity is not humanly achievable at 120 Hz and would feel
broken. Sustained overlap is a genuinely different mechanic — that is type 7, not type 4/5.
The grace interval costs one piece of extra state (the group's arm tick) and is fully
deterministic and testable.

**Shared targets — recommend cooperative by default, contested available.** Type 5 carries
`distinctActors: true`. A `contested` flag in the rules config flips it to first-claim-wins,
resolved by the §5.4 arbitration ladder — which must exist anyway for "several actors claim
one target in one tick", so contested costs almost nothing and gets tested for free.

**On the optional 7th type:** hazards already force continuous per-tick evaluation, so
`sustain.hold` is cheap on the same machinery and it proves the requirement abstraction
handles a *continuous positive*, not just instant strikes. Cost is roughly one more day of
test surface. Say drop it and hazards still carry the continuity argument.

---

## Q2 — Spatial authoring model

**Recommendation: continuous canonical coordinates as the single runtime truth, with an
optional angular authoring grid that compiles into continuous geometry.**

- Canonical: right-handed, +Y up, −Z forward, metres — matching WebXR/glTF/three.js.
- Authoring in **stage space** (player-relative, calibrated: head projected to floor,
  yaw-only forward). Entities convert to **world space once at spawn** and stay put, so
  physically turning or leaning does not drag targets. `anchor: "stage"` opts back in.
- Full **360° azimuth**. Full spherical elevation is *representable*, but the validator warns
  outside a comfort band of elevation `[-40°, +60°]`, radius `0.5–2.5 m` — full-sphere
  content is unplayable seated, so this is a content policy, not a physics limit.
- Optional grid: `{ shell (radius), ring (elevation), sector (azimuth of N) }`, compiled to
  exact Cartesian at compile time by our own polynomial trig.

*Tradeoff:* a grid-only model would make authoring and quantization trivially clean but
permanently caps expressiveness and makes trajectories awkward. Continuous-only is maximally
expressive but tedious to author by hand and easy to make musically sloppy. The hybrid costs
one compiler stage and one validator, and keeps the runtime free of trig — which is exactly
what the determinism model needs.

---

## Q3 — What makes an interaction succeed

**Recommendation: timed swept contact with an optional direction cone, graded by tick
distance. Targets are spatially anchored, not flying at the player.**

Base requirement, all of which must hold:

1. the effector's swept capsule (`prevPose → pose`) intersects the target's hit volume;
2. inside the timing window `[hitTick − preTicks, hitTick + postTicks]`
   *(defaults 24 / 18 ticks = 200 ms / 150 ms)*;
3. contact direction inside `requiredDirection` if specified (`any` allowed), above a minimum
   contact speed *(default 1.2 m/s)*.

Grading by `|contactTick − hitTick|`: Perfect ≤ 4, Great ≤ 10, Good ≤ 18 ticks *(defaults)*.

The loop: **telegraph → window → strike → resolve.** A target spawns `leadTicks` *(default
96 = 800 ms)* before its window with a visual and audible ramp, the window opens, the player
strikes, it resolves on that tick.

*Tradeoff:* anchored targets keep v1 about *where* and *when*, removing approach-speed and
perspective calibration, and they make the agent story crisp — a bot computes "be at P at
tick T." Approaching targets are more visually familiar (Beat Saber) but add a whole
calibration dimension. Trajectories are still fully supported by the compiled-motion system,
and I would ship **one** showcase lane with an approaching target to prove trajectories and
swept collision together, while the tutorial and default loop stay anchored.

---

## Q4 — Actor arrangements for first release

**Recommendation: solo + local deterministic multi-actor (cooperative *and* competitive) +
an environment-director role. No networking in v1, and no `Transport` interface either.**

- Multi-actor is local: 2+ actors in one session, each with its own command source, per-actor
  observation views so a competitor cannot see hidden state, and the arbitration ladder for
  contested claims.
- The director is a role, not a back door: an authorized, validated, rate-limited,
  replay-recorded command set that cannot set score or force hits.
- **Networking deferral, explicitly:** no transport, no sync, no rollback, no lobby, no
  accounts, no server. I recommend *not even shipping the interface* — an unused adapter is
  the speculative plugin framework the brief warns against. Instead the README documents why
  the command-log-plus-integer-tick design is already lockstep-compatible, and what a future
  implementer would add.

*Tradeoff:* multi-actor doubles the interesting test surface (arbitration, per-actor views,
group semantics across actors). But it is where the engine's claims get proven, most of that
machinery is required by the brief anyway, and retrofitting a single-actor kernel to
multi-actor later is a rewrite. Local multi-actor is cheap now and expensive later.

---

## Q5 — Minimum human-playable surface, and your hardware

**Recommendation: a desktop Chromium/Edge reference player with keyboard + mouse dual-effector
control, plus a WebXR adapter validated with synthetic poses until real hardware is confirmed.**

Proposed desktop control scheme — designed so one mouse can drive two hands, and so every
approved type is actually playable:

- Mouse moves a shared **reticle** in stage-spherical space.
- **Left mouse = right-effector strike** at the reticle; **right mouse = left-effector
  strike**. A strike animates that effector from its parked pose to the reticle over
  `strikeTicks` *(default 8 = 67 ms)* and back — a real swept capsule with real velocity, so
  the kernel path is identical to a VR controller's.
- **Strike direction = recent reticle motion direction**, so flicking the mouse upward is an
  upward strike. That is how the direction cone gets satisfied.
- **Holding** a button parks that effector where it struck — which is exactly what
  `combo.sameActor` needs: park left on target A, flick right onto target B inside the grace
  window.
- `Q` / `E` (or edge-push) rotate stage yaw for full 360° coverage; middle-click recalibrates.
- Keyboard-only fallback binds sectors to keys for accessibility.

*Tradeoff:* mouse-driven strikes will never feel like real controllers, and the constants
above are a first guess I expect to tune against real play. The alternative — gamepad
dual-stick — maps to two hands more naturally but assumes hardware and is worse at precise
spatial aiming. I will validate and tune the mouse scheme by actually playing the sample map.

**Direct question: do you have a headset, controllers, and browser available for real-device
validation?** If yes, which (Quest 2/3/Pro over Link or standalone browser, Index, WMR,
Pico, other)? If no, the WebXR path ships validated *only* against synthetic controller poses
and the WebXR emulator, and the README will say precisely that — never "hardware-verified."

---

## Q6 — Demonstration content and license

**Content recommendation:** original **procedural audio** synthesized in Web Audio, with a
headless event model so the audio perception adapter works without a browser. Zero licensing
risk, and it lets the tempo map do real work.

Shipped maps:

| Map | Purpose |
|---|---|
| `tutorial` | ~60 s, teaches each approved type in isolation, wide windows |
| `showcase` | ~2–3 min, every approved type, one moving target, ≥2 tempo changes, ≥1 meter change |
| `duet` | 2-actor cooperative, exercises shared targets |
| `agent-arena` | small, generous windows, designed for bot/LLM play |
| `conformance/*` | tiny fixed fixtures used by tests, not for humans |

**License recommendation: MIT for code, CC0-1.0 for the generated audio and map content.**
MIT is the shortest permissive license and the JS/game-ecosystem default, so it maximizes
community reuse. CC0 on content means a community developer can ship a derivative map pack
with no attribution bookkeeping.

*Tradeoff:* Apache-2.0 would add an explicit patent grant and a NOTICE requirement — more
protective for contributors, slightly more friction for casual reuse. CC-BY-4.0 on content
would require attribution, which some people prefer for creative assets. **Not assumed
approved — tell me which you want.** Third-party notices will be generated from the actual
dependency tree either way.
