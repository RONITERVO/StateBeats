# StateBeats 0.2.0 release candidate

StateBeats is a common spatial rhythm backend for people, scripted actors and agent tools.
The pure tick-based engine, SDK, native compiler/builder, checkpoints, deterministic replay,
CLI and MCP now support data-only scene paths, moving emitters, stored music features and
shared semantic cues. Released stars follow compiled motion independently of their source.

The reference player includes six maps, standalone WebXR/desktop controls and original
sound. Chasing the sun implements a traveling sun and trail, approaching stars, paired
touches, stationary holds, passing bird hazards and music-reactive terrain/water. A sky full
of stars demonstrates a space theme. Local audio import generates a portable chart and
synchronizes the soundtrack with pause/resume. Trusted appearance adapters can add a
ground creature without changing the engine or scene class.

Independent sound/music/cue controls, redundant glyphs and captions, contrast, reduced motion
and remembered preferences support different ways to perceive play. A separate keyboard/text
player uses explicit ticks and ordinary pose commands without WebGL or audio. Human
accessibility usability remains to be tested; automated checks do not establish it.

Local verification passed 59 backend tests and 13 browser tests. The same compiled recordings
matched Node, Chromium, Firefox and WebKit. Fresh npm-tarball installs and source-archive setup
passed on Windows. See ACCEPTANCE.md for exact scope and measured desktop costs.

Standalone Quest 3 support is implemented and awaits the owner's later physical playtest.
The GitHub CI matrix is prepared but has not run remotely. No hardware-verification claim is made.

`artifacts/release/0.2.0` contains six npm tarballs, a source archive, a static player archive
and SHA256SUMS.txt. Install all six package tarballs together until the namespace is published.
Use Node 24 and the locked source setup, or serve the built player on HTTPS for Quest Browser.
The static archive also contains a small localhost server and the text player.

Package names are `@statebeats/*`, the CLI is `statebeats`, and MCP configuration uses
`STATEBEATS_*`. Package version 0.2.0 is distinct from kernel recording version 0.1.0:
existing gameplay semantics remain compatible. New scene/music recordings also protect their
presentation metadata. See SDK.md for migration details.

Code is MIT; original bundled maps and generated sound are CC0. Third-party dependency
notices are included. Imported songs are not bundled.
Source is maintained at https://github.com/RONITERVO/StateBeats. npm packages and a hosted
player are not published; GitHub Actions reports remote verification separately.
