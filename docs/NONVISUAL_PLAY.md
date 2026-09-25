# Audio-led play and shared hand guidance

StateBeats now has an opt-in reference experience for audible hands, contact alignment,
spoken controls and hold feedback. **Finding the pulse** is a one-minute, nine-target
introduction with a procedural musical pulse, generous contact volumes, left/right/either-hand
targets, a two-hand contact and two slow moving holds. It needs no imported assets.

This is an implemented, automatically tested foundation for nonvisual play. It has **not** been
validated with blind players or on a physical Quest. Hearing a spatial source does not by itself
establish reliable elevation, distance, front/back discrimination or reaction time for a listener.
The dense Master and Ink-Battle maps are not claimed to be playable blind by switching a setting.

## Try it

1. Open **Audio-led setup**, enable guidance, and read the sound/controller guide.
2. Select **Finding the pulse**, then enter VR or close setup and play. The direct selection is
   `?map=finding-the-pulse`. Visuals remain available; hiding targets is a separate setting.
3. In VR, grip pauses and opens spoken choices. Left trigger moves backward, right trigger
   forward, and either grip activates the choice. No pointing at a panel is required.
4. Spoken choices include playing, restarting/recentering, measuring headset eye height,
   decreasing/increasing horizontal reach, choosing maps and exiting VR. Face forward when
   starting. Measured height sets the target-height reference, not a measurement of total body
   height; height and room scale apply on the next start. Manual values remain in Settings.
5. On desktop, **Alt+M** opens the menu; arrows navigate, Enter on the focused choice activates,
   and R repeats. Ordinary Tab/Enter controls also work. Music, guidance and world-effect
   levels are independent. Browser narration can be disabled when using a screen reader.

Browser speech uses the browser's speech service, preferring a local English voice when available.
There is no required model, account or paid service. Voice availability and speech inside immersive
VR depend on the browser. Without speech synthesis the HTML announcements and text player remain
available; immersive spoken navigation then needs a different speech adapter. Enable narration
before entering VR. Master sound mute also stops browser narration.

For manual play, open `text.html?map=finding-the-pulse`. The same map runs without WebGL or a clock.
Choose a hand at the beat, then **Follow this hold (assisted)** for moving holds. That explicit
action submits ordinary hand poses along the compiled path and advances intervening ticks; it
does not award hits directly. Other targets and hazards still run. Follow supports the built-in
contact policy, requires claimed player slots, and advances at most 10,000 ticks per action.

## Portable SDK contract

The reference player's [module ownership and playback states](PLAYER_ARCHITECTURE.md) describe
how browser controls compose these contracts without shared transport flags.

```js
import { describeHandGuidance } from '@statebeats/sdk';
const frame = describeHandGuidance(client.observe(), {
  actorId: 'player',
  lookaheadSeconds: 3,
});
// frame.hands: id, semantic, tracked, active, world position, optional target
// target: id, label, slot, action, world position, secondsUntil, phase,
//         gapMetres, aligned, holdProgress
// frame.unsupported: visible mechanics needing a different guidance adapter
```

The CLI and MCP expose the identical read-only projection as `perception.hands`. The SDK has
no browser, sound, speech, vibration or wall-clock dependency. Repeated reads leave the session
unchanged. The text player's JSON includes this projection alongside its normal observation.
`version: 1` identifies the projection. No new map fields, scoring changes or recording format
changes are required. Optional observation fields `policyId` and `participants` identify the
interaction policy and the actual slot/actor/effector bindings held by the engine.

The projection supports left/right effectors on the selected actor and assigns at most one
target to each free, tracked, active hand. It prioritizes active holds, then upcoming hit times.
Explicit slots reserve hands within a target; simultaneous explicit notes reserve hands before
either-hand assignment. Free either-hand choices use stable effector-ID ordering, so moving a
hand does not cause a beacon to jump between hands. Once contact is claimed, engine participant
bindings govern guidance, including any-hand holds and partial two-hand contacts.

Hidden, waiting, resolved and expired targets do not attract hands. Preparation points to the
contact destination. Once the contact window opens, guidance follows the actual moving target,
including active arcs. Calibration, room scale, stage rotation and shape rotation are already
represented in the observation; adapters must not apply them twice.

`gapMetres` measures hand-sphere distance to the target's sphere, capsule or rotated box,
including the actual effector radius. Zero means endpoint overlap. `aligned` has that same
geometric meaning; it is **not** an awarded hit or a prediction of scoring. Preparation can be
aligned before contact is allowed. Swept strikes, slot combinations, link deadlines, arbitration
and hold completion still belong to the engine. Direction/speed-constrained strikes, custom
policies and explicitly multi-actor requirements are reported as unsupported rather than
advertised as a correct hit. Hazards remain in the existing avoidance-cue stream.

An adapter for more limbs, cooperative guidance, bespoke policies or dense mapping can replace
the assignment/sound layer while retaining observations, commands, ticks and scoring. Do not
silently relax collision shapes or auto-hit notes to make audio guidance appear successful.

## Reference audio and haptics

The hand adapter uses at most four continuous HRTF voices: two hands and their assigned targets.
Left is lower pitched and right higher. A hand tone becomes harmonically aligned with its target
as the geometric gap closes; the target tone pulses during preparation and becomes steady when
eligible. Existing short timing and outcome cues remain separate. The beacon can be active only
with an assigned target, always on for tracked active hands, or off with target tones retained.

The head drives the listener pose. Sources use the same world positions as the shared frame.
Smoothing avoids abrupt audio-parameter changes; the oscillator runs on the audio clock, while
assignment, preparation pulses and path positions come from simulation ticks. Continuous hand
guidance reduces music to 65% and world effects to 32% of the user's chosen levels while active.
Master mute, guidance mute/zero gain, pause, reset, completion and tracking loss release voices.
Continuous guidance follows current position; output offset applies to scheduled timing cues.

Hit vibrations use actual event slot identities, so a left-hand hit no longer vibrates both hands.
In guidance mode, gentle pulses every 150 simulation milliseconds indicate endpoint contact
during a hold; a longer pulse indicates contact loss. These pulses describe contact, while the
normal hit pulse indicates completed scoring. Missing haptic hardware degrades silently.
Pausing cancels requested pulses. XR guidance mode pauses after 250 ms of missing hand/head
tracking, and when the immersive session becomes obscured; it never resumes without the player.

## Validation and next steps

Automated coverage checks geometry against actual engine hits, readiness/expiry, real hold
participants, simultaneous-hand assignment, deterministic reads, CLI/MCP parity, a complete
calibrated tutorial replay, hand-specific hit/hold feedback, keyboard setup and assisted text
completion. Real offline Web Audio checks cover panning, head rotation, voice budgets, independent
mute, missing tracking, pause and resume in Chromium and Firefox. HRTF level differences vary by
browser and frequency; these are signal checks, not listening or usability results.

The next validation is a physical Quest session followed by blind-player feedback: speech in VR,
controller bindings, spatial clarity at different elevations, hand/target distinction, timing,
hold feedback, and comfortable personal height/reach. Use that evidence to revise the sound
vocabulary and tutorial before labeling any experience blind-accessible. Developers should author
and test an appropriate density and movement envelope for each sensory experience using the same
map contract, rather than assuming every visual chart translates automatically.
