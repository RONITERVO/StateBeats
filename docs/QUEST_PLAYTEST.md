# Quest 3: standalone setup and later playtest

The engine and renderer run in Quest Browser. Link is not needed. Real Quest hardware has not
yet been tested; the owner plans to do this later.

## Open the player

For a public release, serve the contents of `packages/player/dist` on any static **HTTPS** host.
Open that HTTPS URL in Quest Browser. The host only delivers files; gameplay has no server API.
No hosting account, paid service or specific platform is built into the project.

For private USB testing on Windows, with Developer Mode and USB debugging already available:

1. Build on the PC: `npm ci`, `npm run build`, then `npm run play`.
2. Connect the Quest by USB and allow the headset's debugging prompt.
3. Run `adb devices` and confirm the headset is listed as `device`.
4. Run `adb reverse tcp:4173 tcp:4173`.
5. In Quest Browser open `http://localhost:4173`, then choose **Enter immersive VR**.

The USB path serves static files from the PC for development. It is not Link or PC simulation.
For independent distribution, use HTTPS hosting instead. Ordinary HTTP on a LAN IP is not a
secure WebXR context. Do not disable browser security or install untrusted certificates.
After testing, remove the optional forwarding with `adb reverse --remove tcp:4173`.

## First run

Face a comfortable starting direction with enough room to reach around you. Point either
controller at a menu item and pull the trigger. Select **First orbit**, then Play. Touch cyan
notes with the left hand, coral with the right, gold with both. Hold contact for sustained notes.
Avoid red volumes with hands and head. Notes use anchored and approaching positions.
Turn toward the visual arrow and spatial cue before reaching for a rear note.

Grip opens the in-headset menu. You can resume, choose any map, restart, toggle audio,
recenter-and-restart or exit VR. Recenter creates a fresh stage origin; existing targets never
follow head motion. The duet includes a partner bot for the second actor.

## Record these checks when ready

| Check | What to report |
|---|---|
| Entry and menu | Browser version, headset OS, controllers detected, trigger/grip menus work |
| Tutorial | Left/right, paired touch, hold and hazard are reachable and understandable |
| Turning | Rear cues make sense; complete a full turn without the stage drifting |
| Recovery | Pause/resume, restart and recenter work; tracking loss does not create a false hit |
| Sound | Pulse aligns with contact; rear double cue and hand timbres can be distinguished |
| Sun journey | Follow the traveling sun and trail through a full turn; reach stars and holds; duck beneath birds |
| Imported music | Choose a local song before entering VR, set its BPM, generate a map and check pause/resume alignment |
| Choreography | Play Phrases in orbit; verify both rail hands, paired notes, crossovers and recovery time before turns |
| Personal reach | Generate at your standing headset height and a comfortable reach; verify high/low and side extremes without leaning unexpectedly |
| Song timing | Correct the song beat offset before device latency; compare a repeated musical accent near the beginning and end |
| Generation controls | Try forward/bounded/full turning and approach/stationary/mixed arrival; verify that warnings appear early enough |
| Expert flow | Select Master, then test continuous turning with incoming notes, opposed high/low pairs and crossovers; adjust speed/range separately |
| Event Horizon | Start the bundled Master map without importing anything; check lead synchronization, both turn directions, high/low chords, paired rails and the duck/lean passages; compare 1.0 and 1.20 room scale |
| Height and room scale | Set 1.65 m and 1.20× as the owner's starting profile; restart and confirm that wider reaches and recorded dimensions match expectations |
| Perception settings | Try muted captions/glyphs, music without cues, cues without music, contrast and reduced motion |
| Text alternative | Outside immersive VR, open text.html and complete the arena using explicit steps |
| Performance | Enable counters before entering; report FPS, pump time, input age and visible stalls |
| Sustained use | Play showcase repeatedly for 10 minutes; report heat, hitching or degradation |
| Standalone | Test the HTTPS build with Link disconnected and no PC simulation running |

The counters measure frame/pump/input age, not motion-to-photon latency. True device latency and
memory profiling require browser/device tools. Audio-only human usability is a separate check;
automated tests establish that sound renders, not that its cues are sufficient for every player.

A useful reply is: “Quest Browser __ / OS __; tutorial __; turning __; controls __; audio __;
FPS __; pump max __; input age __; 10-minute test __; anything confusing __.”
