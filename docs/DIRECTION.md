# StateBeats: musical movement as an open platform

The long-term product is an excellent rhythm experience that communities can reshape without replacing its simulation. A reference player must be enjoyable enough to play for its own sake; its public contracts must be good enough that another developer can build a completely different player on the same maps, rules and replay evidence.

The strongest opportunity is expressive choreography plus unusually good authoring and debugging. A mapper should be able to see why an event exists, change a phrase, inspect both hands and the player's facing direction, replay a difficult passage, and export a reproducible result. An agent should have the same capabilities through the SDK and tools. Visual spectacle should follow those decisions and reinforce their readability.

The local Synth Riders study examined 25 underlying charts, not the proprietary runtime spin transformation. Useful principles were repeated gestures, returning rhythms with changed geometry, independent held and tapping hands, authored light cues, song offsets, and difficulty changes beyond event count. StateBeats uses original phrases and procedural content; no commercial charts or audio are included.

## Implemented foundation

- One deterministic interaction kernel, explicit time, replay/checkpoint contracts and common human/bot/agent commands.
- Offline PCM features and persisted music timelines; author-supplied BPM and beat offset.
- Replaceable musical selector, phrase composer and facing planner. Saved generator identity/settings and a separate explanation report.
- Original paired pulses, arcs, mirrored variations, simultaneous hand notes, crossovers and rail counterpoint.
- Forward, bounded and full-turn phrase plans with a speed budget and recovery intervals. Approach, stationary and mixed placement.
- Player-height/reach parameters, per-hand conflict/speed checks, deterministic omission of invalid candidates, and explicit diagnostics. These are geometric checks, not medical or room-safety certification.
- A graphical hold-path preview derived from the same positions used by simulation, plus SDK observations for alternative senses.
- Player controls for rebuilding an imported song without decoding it again, and CLI/MCP composition and inspection operations.

## Next quality gates, in order

1. **Prove the physical loop on Quest 3.** Measure actual contact/hold behavior, tracking loss, audio alignment, pause/resume, visibility during turns, and sustained frame time. Test short/tall and seated/standing profiles. Add guided reach/height calibration based on measured controller poses. Fix awkward transitions before adding more intensity. Preserve profile and assistance information with play results so unlike runs are not ranked as equivalent.
2. **Make music structure editable and inspectable.** Add a phrase timeline editor with waveforms, explicit beat/downbeat anchors, tempo changes, swing and optional imported section markers. Store analysis confidence. Let people correct a first beat and tap a tempo; provide automatic beat/section estimators as replaceable authoring adapters. A tempo estimate is a suggestion, never an unreviewed timing authority. The current quiet/steady/lift labels are energy estimates, not verse/chorus transcription.
3. **Build a richer original movement vocabulary.** Add designer-authored phrases, asymmetric call-and-response, joined-hand shapes, dynamic rest, floor/overhead profiles, and controlled obstacle-plus-hit passages. Preserve musical identities when deriving easier difficulties. Expand constraints to shoulder-relative reach, acceleration, hand-path intersections, body/head clearance, occlusion, readable warning time, and fatigue over a session. Keep the ability to author intentional exceptions with an explicit diagnostic rather than silently deforming a map.
4. **Make spatial direction a first-class authoring track.** Author facing and turn cues independently from emitter motion. Preview the player's view throughout a turn, including rear and overhead approaches. Keep contact geometry, source position, travel duration and facing independent. Full spherical content belongs in the engine; overhead choreography requires its own comfort and readability evidence. Add authored scene cues alongside continuous music features so a moving sun or black hole can emphasize selected musical moments.
5. **Make iteration fast for developers.** Build a phrase inspector with scrub/loop/slow motion, trajectory overlays, event reasons, conflict visualizations and deterministic regression captures. Publish stable adapter examples and a conformance kit. Add explicit generator migrations and recipe version resolution: playback of a saved map must not depend on having its original generator installed. Extensions remain trusted code registered by a host; JSON cannot execute plugins.
6. **Ship an ecosystem after the contracts and player are proven.** Establish import/export compatibility, creator asset/theme packages, provenance, deterministic score categories and a local content library. Add community discovery and online competition only with a clear trust model and evidence that they do not compromise offline play. Keep local use independent of accounts, subscriptions, cloud inference and a proprietary renderer.

## What “better” must mean

The comparison must be demonstrated by play, not inferred from architecture or generated note counts. Use a varied set of original or appropriately licensed songs and repeatable settings. Ask players about musical connection, movement flow, readability, comfort and desire to replay. Record whether they can distinguish song phrases through motion, how often turns surprise them, and where they lose notes through visibility rather than timing. Compare like intensity and assistance levels; keep expert mapper feedback alongside beginner feedback.

For the software, require replay agreement across supported runtimes, no unresolved generation constraints in the reference profiles, bounded memory and authoring inputs, and installed-package examples that work without the repository. For Quest, record frame-time percentiles, input age, simulation time, sustained-session stability and audio drift on the real device. Desktop benchmark numbers are not Quest evidence. Treat a 72 Hz presentation target as a 13.9 ms total frame budget to measure against, not a performance result.

A strong release has three kinds of evidence: deterministic correctness, real musical/physical playability, and a third-party developer successfully replacing an adapter. The current implementation advances the first and supplies tools for the other two. It does not yet establish that StateBeats feels better than Synth Riders.
