# Approved direction and required architecture corrections

I approve the overall backend-first architecture with the corrections and product decisions below. This message supersedes conflicting provisional decisions. Update the architecture, open questions, and progress log, then begin implementation; do not return for another general architecture approval. Resolve routine technical decisions yourself. A specific contradiction you cannot resolve deserves a focused question; ordinary implementation choices do not require another approval.

Continue in `D:\Projects\3dRythm`, using Claude Opus 5 at max effort without Ultracode. Codex launched this session with `--model claude-opus-5 --effort max`; no thinking-setting action is needed from me. Do not recommend an unverified `--thinking` option. Prepare the repository for release without publishing or pushing it.

## Product decisions

- **Standalone Meta Quest 3 is the primary human release target.** I also have a PC and Link, but playing must not require them. Use an immersive WebXR reference player in Quest Browser as the initial delivery path, verifying the current official browser APIs. The keyboard/mouse client is a useful fallback, developer tool, and automated test surface; it must not determine the interaction model or displace standalone VR work. Keep hardware-specific dependencies outside the kernel. Do not add an APK/store publishing project for this release.
- **Both moving/approaching and stationary spatial targets are first-class.** Include meaningful playable examples of each using the same authoritative collision and interaction code. Moving targets must not be a token visual effect or a single special case.
- **Regular 360-degree turning is part of the intended gameplay.** Include an introductory calibration/tutorial and a proper turning showcase with readable advance cues for targets outside the current field of view. The tutorial may introduce turning gradually. Preserve full spherical representation and make content reach, height, radius, and turn rate authorable rather than universal constants.
- Keep the existing `StateBeats` working name and directory. Naming does not justify delaying the engine.
- Use **MIT for first-party code** and **CC0-1.0 for first-party original sample maps and procedural content**. Permit commercial and closed-source reuse. Preserve actual third-party licenses/notices and record asset provenance; procedural generation is not a general proof of zero licensing risk.
- Include solo, local cooperative and competitive actors, bots/LLM callers, and an environment director. Online multiplayer, accounts, services, marketplace, and a graphical map editor remain outside this release. Do not describe command logs alone as a finished networking solution.
- Include left, right, either, combined, shared, avoidance, and hold interactions. Use forgiving, configurable group timing; start with a 100 ms grace interval in the normal reference profile and tune it through play. Keep exact simultaneous and sustained predicates representable as separate configurations. Timing windows, speed thresholds, grading, group bonus rules, hazard penalties, and reach defaults belong to named gameplay/content profiles, not fixed kernel assumptions.

## Correct the mathematical foundation before building on it

The proposed claim that general swept contact times are exact rationals is incorrect. For example, a point moving along `p(t) = (-3 + 6t, 1, 0)` entering a sphere of radius 2 centered at the origin contacts at `(3 - sqrt(3)) / 6`. Squared-distance overlap predicates do not make that contact time rational. Cross-multiplying arbitrary floating-point products does not turn their ordering into exact arithmetic either.

Replace that argument with an implemented, tested numerical contract. Prefer the smallest correct approach for the supported geometry: a deterministic collision predicate, a documented contact-time representation or bounded approximation when needed, and a stable final tie-break. You may use tick-level arbitration for genuinely tied claims instead of inventing exact sub-tick arithmetic. Do not label closest-approach time as first contact. Define boundary tolerances and near-tangent behavior explicitly; test initial overlap, zero relative velocity, fast crossings, and nearly tied claims against independently derived expected results.

Recheck the blanket `Math.sqrt` statement against the actual ECMAScript edition being cited and the supported runtimes. The current specification's sqrt algorithm returns the rounded Number representation of the mathematical square root; it does not use the same wording as sin/cos. This does not by itself establish compliance of every older engine. Cite the edition precisely and choose a tested implementation rather than constructing a broad custom math library from a faulty premise.

The release contract should promise identical canonical results for identical versioned executable rules, compiled content, initial state, seed, and accepted command timeline on an explicitly tested runtime matrix. Cross-runtime matching is a release target to verify, not an accomplished fact. Remove “verified in CI” until those runs actually exist, and remove the universal guarantee covering every conforming engine. Distinguish numerical repeatability from mathematical exactness.

Custom polynomial trig, custom square-root implementations, and hand-written SHA-256 are not requirements. Compiled content may carry canonical stored geometry and a hash; distinguish reproducible authoring/compilation from replaying the identical compiled artifact. Put artifact hashing at an appropriate SDK/build boundary using a reputable implementation. Keep I/O and host APIs out of transitions without turning zero dependencies into an excuse to reinvent cryptography. If core imports a separately distributed math package, declare that dependency correctly or bundle it; an empty dependencies field alone proves nothing.

## Make state and replay genuinely complete

The kernel currently receives a WorldState containing only a compiled-sequence hash/cursor, yet must spawn and move entities from compiled entries. Make the immutable executable program an explicit input containing the compiled sequence, rules, and versioned policy bindings, or place equivalent data explicitly in state. A hidden registry lookup inside transition would violate the pure contract. Separate serializable policy IDs/configuration from executable trusted policy code; a hash of configuration alone cannot identify changed policy behavior.

Inventory every value that affects future results: group progress, hold continuity, hazard occupancy, cooldowns, previous poses, tracking state, actor registration order, calibration transforms, sequence state, random-generator state, and consumed entities. Define where each lives and how it is restored.

Distinguish a **kernel snapshot** from a **resumable session checkpoint**. A session checkpoint also needs accepted future commands, replay position, duplicate/request bookkeeping, pending content boundaries, and any other service state needed for equivalent continuation. A core snapshot that omits a queued future hit must not be described as a full session restore. Keep storage/network handles out of both.

Give commands an unambiguous target tick and record their accepted/applied tick. Reject commands targeting committed ticks by default; do not vaguely accept late commands without defining rescheduling and replay behavior. Define multiple pose updates for one effector in a tick. SDK retries with the same request ID and payload must return the original result without adding a new authoritative event or changing the replay digest; ID reuse with a different payload must fail. Put retry diagnostics outside the gameplay event stream. Specify retention limits for idempotency.

Distinguish atomic submission/validation from later per-command domain rejection at execution. Record actor registration/binding, director actions, resets, calibration and content changes whenever they affect replayed outcomes. Never hide these as unrecorded SDK mutations.

For this release, freeze tick rate and executable rules for a running replay segment. Changing them starts an explicit new session/segment. Mid-session rules migration is unnecessary complexity. Director content actions still work through a small versioned command set; omit dynamic tempo changes until their effect on scheduling, active entities, audio and replay is defined and tested.

## Keep time, audio, and adapters coherent

The documented scheduler drops excess elapsed time after eight ticks while music can keep advancing. A diagnostic message does not repair that drift. Define a single simulation-to-audio timeline mapping: retain and process bounded backlog, or enter an explicit pause/resynchronization state that also reschedules audio. Never let audio advance past authoritative gameplay unnoticed. Test a substantial stall, backgrounding, pause/resume, speed changes, and switching between manual and real-time operation. Preserve intermediate authoritative ticks.

Tempo changes require piecewise integration of each segment's beat duration, including the cumulative time at its start. `beat * 60 * rate / bpm` is only the constant-tempo case unless beat is explicitly segment-relative. Define meter separately, exact rational input representation where claimed, rounding and overflow bounds, offsets, and event order at coincident boundaries.

Synchronous `onTick` and `onEvents` callbacks can block the same JavaScript thread. Try/catch, an async function, a queue, or an async mutex cannot preempt a CPU-blocking callback. Implement a real scheduling boundary for the reference player's simulation where needed, such as a worker with immutable messages, and document the trust/latency contract for same-thread SDK adapters. Keep gameplay events/checkpoints authoritative and presentation/adapter diagnostics separate. Overflow recovery must resynchronize observations rather than silently lose a required score update. Do not promise that arbitrary in-process plugins are sandboxed.

Only one clock mode owns advancement. Manual stepping during real-time ownership must have an explicit handover or rejection policy. External LLM/network input is asynchronously queued and never awaited inside a tick; a synchronous poll is appropriate only for bounded local sources.

## Make geometry and extensions match the product

Continuous collision must account for both the target's motion and the effector's motion over the same interval. Sweeping a hand only against the target's final position misses a moving target crossing a stationary hand. Define supported geometry/motion combinations, including whether shape orientation changes within a tick. Center sweeps do not cover a long controller-attached shape rotating around a stationary pivot. Implement the supported cases correctly and reject unsupported combinations rather than claiming universal no-tunneling.

Specify normalized-quaternion validation, sign equivalence, normalization/interpolation rules, head/body hazard sensors, and tracking reacquisition. Normalize harmless negative zero at the input boundary instead of rejecting ordinary controller output for its sign bit. Keep stage calibration, view rotation and physical head motion distinct; recalibration cannot accidentally sweep a controller across the map or drag existing world-anchored targets.

The seven interactions are **built-in presets**, not a closed extension ceiling. Separate contact predicate, required effector/actor bindings, temporal requirement, group membership, claim ownership and scoring. Support one volume requiring multiple effectors/actors as well as linked separate volumes. Cooperative all-required participation and competitive first-claim ownership are different semantics; flipping one contested flag on a distinct-actors-required group is insufficient. Define partial success and bonus behavior without double scoring or reusing consumed claims.

Provide a small public registration contract for trusted versioned interaction policies, namespaced configuration/event data, and schema validation. No dynamic execution of map contents and no generic plugin marketplace. Demonstrate an external example interaction that adds behavior through the public SDK without modifying the kernel, alongside the actor and perception substitution examples. Restrict competing actors by caller-bound capabilities in the SDK; a player cannot simply request a debug ViewSpec or invoke director/admin tools to bypass observation filtering.

## Playability and acceptance corrections

Every accepted timing offset must have a defined outcome. The proposed early window accepts 24 ticks but the lowest grade stops at 18: resolve that gap. Holds and hazards cannot inherit the strike-speed floor. Group grace is independent from the size of each member's hit window, and failed groups must resolve consistently after arbitration.

For VR, make direction and speed come from the actual authoritative movement/gesture model, with well-defined effector-local offsets. Validate moving and anchored targets, combined interactions, sustained interactions, head avoidance, tracking loss, recentering, and 360-degree cues on standalone Quest 3. Complete start, map selection, pause, restart and results flows in the headset using its controllers; essential controls cannot require returning to a desktop keyboard. Resolve standard WebXR input profiles/capabilities at the adapter boundary instead of hardcoding Quest buttons throughout gameplay.

Run the simulation and player on the headset; ordinary static asset hosting is acceptable, but a continuously running PC simulation server, Link connection or paid service must not be a gameplay prerequisite. Prepare a self-hostable static production build and a documented secure-context development setup for headset testing. Ask me to perform short device checks when needed; do not publish publicly or change device/browser security settings to work around setup. Measure standalone CPU/frame cost, memory, input/event latency, and sustained-play behavior on the device when available. A high-end PC benchmark or a desktop emulator cannot establish Quest performance. Preserve the independent 120 Hz simulation contract while choosing a measured rendering cadence/quality level the headset supports.

For the desktop fallback, do not make two separated hand targets depend on moving one cursor between them within 50 ms. Use independent stored aims/effector controls, suitable desktop charts, or another demonstrated playable mapping, and make handedness bindings remappable. Synthesized movements must actually have the direction the kernel evaluates; a reticle flick label cannot convert a radial lunge into an upward strike. Specify activation/return-stroke behavior so animation cannot create unintended second hits. Do not trade away VR semantics to accommodate one mouse.

Audio-only perception must provide usable sound, not merely an event schema saying where a sound would be. Include a learned cue scheme and a real playback path; ordinary left/right panning alone cannot distinguish front from back for 360-degree play. Separate synthetic cue tests from observed human playability and do not claim fully usable audio-only or hardware-verified VR from mocks.

Use a supported Node LTS baseline and compatible pinned tooling. Node 25 is already EOL on the official release page; do not make it the release baseline merely because it is installed. Node 24 LTS is the default recommendation; support Node 22 only if the actual dependency minimums and tests permit it. Use an isolated runtime if necessary, without replacing my system-wide setup. Verify installed package engine requirements and packed public packages, not just workspace imports. TypeScript remains a reasonable choice; a Rust/WASM shared kernel would also be one authoritative implementation, so remove that misleading rationale without starting a language rewrite.

## Execution and reporting

Keep M1–M5, with corrected backend proof first. Begin with a small executable slice that accepts poses, evaluates an interaction including relative target movement, emits authoritative events, and reproduces its result after snapshot/restore and replay. Establish independent geometric expectations and retry/pending-command continuation tests before expanding geometry or player polish. Then complete the agreed adapters, native builder, CLI/MCP, content, VR-first reference player, fallback player, and release work.

Persist concise milestone status and actual check results so I can bring them back for review. Do not pause at every milestone seeking permission already granted. Continue until the agreed scope is complete or a concrete external requirement prevents progress. When a real-device check needs me, provide short actionable instructions and keep independent work moving.

The release must include a working headless demo, real MCP client round trip, reusable extension example, actual human-playable reference, meaningful replay and geometry tests, measured performance, packaged SDK, clean-copy setup, and accurate documentation. Do not lower claims silently or mark a feature complete because its interface exists. Clearly label implemented, locally tested, remotely tested, and still unverified work.

Update the design to reflect these corrections and start implementation now.

## Technical references for the corrections

These references substantiate specific review points; follow their actual licensing terms if using code, not just ideas.

- General moving sphere/box contact includes curved-boundary intersection and relative motion: [David Eberly, Intersection of Moving Sphere and Box](https://www.geometrictools.com/Documentation/IntersectionMovingSphereBox.pdf).
- Current sqrt specification, which should not be conflated with all transcendental Math functions: [ECMAScript Math.sqrt](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math.sqrt).
- Same-thread callback execution is run-to-completion: [MDN, JavaScript execution model](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model#run-to-completion).
- Supported runtime status: [Node.js releases](https://nodejs.org/en/about/previous-releases).
- Standalone browser delivery and development path: [Meta WebXR overview](https://developers.meta.com/horizon/documentation/web/webxr-overview/) and [Meta WebXR first steps](https://developers.meta.com/horizon/documentation/web/webxr-first-steps/).
- Code license terms include retention of copyright and license notice: [MIT License](https://opensource.org/license/mit); first-party content dedication: [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/).
