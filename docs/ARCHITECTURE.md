# Architecture and implementation contract

Status: StateBeats 0.3.0 adds musical choreography and authoring adapters to the locally verified 0.2.0 foundation; Quest hardware checks remain pending. See [acceptance evidence](ACCEPTANCE.md). This supersedes the provisional architecture; [owner direction](design/OWNER_DIRECTION.md) supplies the original product decisions, extended by the StateBeats scene/music/access request. The user asked Codex to take over implementation on 2026-09-07; the earlier Claude model instruction no longer applies.

The pure `transition(state, commands, program)` computes exactly the next integer tick. The immutable program contains compiled entity definitions, rules and versioned trusted policies. All authoritative continuation state is explicit. Core has no host API or third-party imports. TypeScript compiles the same implementation for Node and the browser.

SDK owns versioned validation, content compilation, caller-bound capabilities, command scheduling, full session checkpoints, replay and adapter lifecycles. CLI and MCP call the same service operations. The player runs the SDK in a worker and renders copied observations. No graphical path owns scoring or geometry. Standalone Quest Browser runs simulation locally; the build is static assets.

Coordinates are metres, +Y up, -Z forward, right-handed, quaternion xyzw. Spherical authoring compiles to canonical Cartesian positions. Entity orientations are fixed during each sequence; translating sphere, box, oriented-box and capsule targets use relative motion against spherical effectors. Rotating elongated effector sweeps are not supported and cannot be configured as if they were. Geometry uses IEEE binary64 with deliberate squared-distance predicates and documented boundary epsilon. Arbitration is by tick, then stable actor/effector order; no rational first-contact claim. Cross-engine canonical matching must be demonstrated on the tested matrix before claimed.

At each tick: validate/coalesce commands; apply authoritative actor/director updates; spawn; evaluate target positions at both interval endpoints; detect contacts; evaluate pure policies and requirement slots; arbitrate and consume claims; update holds/groups/hazards; expire; score; end conditions; finalize ordered events. Reacquired poses use zero-length hand movement; target movement remains physical. Every allowed timing offset has a grade.

Kernel snapshots contain world state and program identity. Session checkpoints additionally contain pending commands, accepted timeline, bounded retry bookkeeping and the exact content/rule configuration. Role capability belongs to the caller handle, not request data. Retried mutations return their original result without a new domain event. Changing executable rules/tick rate starts a new replay segment. Reset is a new segment.

Manual advancement alone moves manual time. Realtime scheduling retains elapsed backlog; large stalls explicitly pause and rebase audio on resume, never discard authoritative ticks. UI/audio events and adapter diagnostics do not enter the deterministic gameplay digest. Same-thread SDK adapters are trusted and bounded; only worker isolation can prevent a rendering callback from blocking the simulation worker.

Built-ins are presets over an extensible, versioned requirement/policy API: left/right/either strikes, multi-effector and multi-actor contacts, avoidance and sustained holds. Grouping and ownership are independent. Content is JSON data, never source code. Unknown policy IDs fail compilation unless a trusted policy is registered.

M1: core, moving contact, snapshot/replay. M2: interactions, geometry, content/compiler. M3: SDK/services, clocks, adapters, CLI/MCP. M4: Quest-first player/audio and examples. M5: packaging, cross-runtime and device evidence, measured performance and release documentation. Acceptance is tracked in docs/ACCEPTANCE.md. Nothing is published without a user request.

Scene objects, music features and perception descriptions live in the SDK. Emission paths are
baked into ordinary compiled entities before a session starts. Scene tracks and bounded trails
are sampled from explicit ticks; output bindings never resize collision shapes or award hits.
Imported PCM analysis runs in an authoring worker. Its versioned feature timeline and the
resulting chart are saved as JSON, so manual agents and replays need no audio device.
Gameplay and presentation have separate integrity hashes. Kernel recording version 0.1.0
remains compatible while the public package version advances to 0.3.0.

Choreography is an SDK authoring pipeline with replaceable musical selection, phrase composition
and facing plans. Its output is a validated ordinary map plus a separate explanation report.
Generation recipes identify their version and trusted adapters; saved geometry is sufficient
for playback. Runtime simulation never calls a generator. Contact-path previews come from
the same compiled motion as collision. See CHOREOGRAPHY.md for contracts and DIRECTION.md
for the product quality gates.

The reference client offers environment and appearance factories alongside generic geometry,
labels, timing and audio guidance. Text play is a separate DOM entry that imports the SDK
without Three.js or WebGL. It deliberately assists timing by submitting legal pose commands
at chosen ticks; it is identified as manual practice rather than an unassisted timed score.
The complete extension and access contract is in SCENES_MUSIC_ACCESS.md.
