# StateBeats — Progress Log

**Historical Phase 1 log.** The approval wait and provisional choices below are superseded.
Current implementation status is in [STATEBEATS_PLAN.md](STATEBEATS_PLAN.md), the current
contract in [ARCHITECTURE.md](ARCHITECTURE.md), and verified evidence in [ACCEPTANCE.md](ACCEPTANCE.md).

Append-only record of decisions, commands run, actual results, remaining work, and
acceptance status. Written so work can resume after context compaction.

---

## Phase 1 — Design (in progress, blocked on approval)

**2026-09-07**

### Done

- Read `BUILD_BRIEF.md` in full (144 lines) and treated it as the task specification.
- Inspected `D:\Projects\3dRythm`: contained only `BUILD_BRIEF.md`. No `.git`, no prior code,
  no `CLAUDE.md` or `.claude/` at project, parent (`D:\Projects`), or user (`~/.claude`)
  scope. Nothing to preserve.
- Verified local toolchain: node v25.4.0 (x64/win32), npm 11.7.0, git 2.49.0.windows.1,
  python 3.14.2, gh 2.96.0, Chrome + Edge present, Firefox absent, pnpm/yarn/bun/deno absent,
  32 logical CPUs.
- Confirmed registry reachability and latest versions of candidate dependencies:
  `@modelcontextprotocol/sdk` 1.30.0, `typescript` 7.0.2 (5.9.3 on 5.x), `vitest` 5.0.0
  (4.1.11 on V4), `zod` 4.5.4, `fast-check` 4.9.0, `three` 0.185.1, `vite` 8.2.2,
  `@playwright/test` 1.63.0, `commander` 15.0.0. **Nothing installed.**
- Ran a float-semantics probe on Node v25.4.0 to ground the determinism model. Results:
  `Number(String(0.1+0.2)) === 0.1+0.2` is true (shortest round-trip is exact);
  `Math.sin(1)` = `0x0.d76aa47848677` (implementation-approximated per ECMA-262, therefore
  banned in the kernel); `Math.imul` exact. This is the evidence behind the
  "`+ - * /` and comparisons only" kernel rule.
- Wrote `docs/design/ARCHITECTURE_PROVISIONAL.md` — full provisional architecture.
- Wrote `docs/design/OPEN_QUESTIONS.md` — the six Phase 1 questions with recommendations
  and tradeoffs.

### Decisions taken (provisional, subject to approval)

| Decision | Value | Rationale |
|---|---|---|
| Language / layout | TypeScript ESM, npm workspaces monorepo, Node >= 22 | one kernel must run in Node *and* the browser (WebXR is in scope); MCP SDK is TS-first; npm is the only package manager present |
| Determinism model | kernel runtime restricted to `+ - * /`, comparisons, integer ops | these are exactly specified by ECMA-262 with no FMA contraction; transcendentals are implementation-approximated |
| Trig | polynomial implementations in mathkit, used at **compile time only**; results stored in the compiled sequence and content-hashed | keeps `Math.*` approximations out of every authoritative path |
| Square roots | banned in kernel; squared comparisons and rational TOI ordering instead | `Math.sqrt` is implementation-approximated per spec |
| PRNG | pcg32, integer-only, state inside `WorldState` | exact and serializable |
| Canonical form | sorted-key JSON, `String(x)` numbers, `-0` normalized, non-finite rejected | shortest-round-trip is exactly specified and verified above |
| Hashing | pure-TS SHA-256 in mathkit | kernel must not import `node:crypto`, and it must work in the browser |
| Tick rate | 120 Hz default, part of `rulesHash` | ±1 tick = 8.33 ms; changing it changes replay semantics |
| Toolchain pins | `typescript@5.9.3`, `vitest@4.1.11` rather than the newest majors | TS 7 (Go-native) and Vitest 5 are both fresh; not a risk worth absorbing on a build-from-clean-checkout deliverable |
| Networking | out of scope, and **no `Transport` interface shipped** | an unused adapter is the speculative framework the brief warns against; compatibility documented instead |

### Blocked on

Owner answers to Q1–Q6 in `docs/design/OPEN_QUESTIONS.md`, then explicit architecture
approval. Answers alone are not approval.

### Not started

M1–M5 implementation. No packages scaffolded, no dependencies installed, no implementation
code written — per the brief's approval boundary.

### Acceptance status

Nothing accepted yet. Phase 1 deliverable is the two design documents above.

## Implementation takeover — 2026-09-07

The owner approved the direction and asked Codex to implement the complete project.
The earlier Phase 1 approval block is historical and no longer applies. Current
contracts are in `ARCHITECTURE.md`; the provisional document contains superseded claims.

Implemented six TypeScript packages: dependency-free pure core, SDK, original content,
CLI, real stdio MCP server, and standalone WebXR/desktop reference player with a worker.
Supported policies include interaction filtering/state, scoring and arbitration.
The player has four sequences, controller menus, procedural spatial audio and bot playback.
Compiler uses exact rational musical time and stores quantized authoring coordinates.
Replays/checkpoints now embed compiled programs and resolve versioned trusted policy IDs.

Evidence so far: 34 automated tests passed (geometry/property tests, engine mechanics,
snapshot/retry/replay, clock jitter/stalls, actual CLI and MCP client round trips).
Node 24.20.0 Windows typecheck and production browser build passed before the latest
compiled-artifact changes; these changes are being retested. Browser UI completed the
agent arena with 8 hits, 800 points and no runtime errors.

Still in progress: fuller conformance/extension tests, browser matrix, benchmarks,
packaging, clean-copy checks, licenses/notices, community documentation and release artifacts.
Quest 3 hardware is not connected. Owner will test later; no device verification claimed.

## Local release verification — 2026-09-07

Completed seven workspace packages (six public), 47 passing backend tests and seven passing
browser tests. Tests cover real CLI/MCP processes, compiled replay, checkpoint retries, actor and
policy extensions, file stores, geometry, stage transforms, director reservations, overflow and
synthetic XR boundary behavior. Browser mouse play and bot play complete a real sequence.
Chromium/Firefox/WebKit match Node's conformance digests. Real offline audio renders in Chromium
and Firefox; Windows WebKit lacks that API and is explicitly outside this audio result.

Production build, lint, types and tests passed. All six package tarballs installed in a clean
OS-temp directory and ran the packaged demo successfully. A separate source-archive extraction
passed npm ci, check, demo, headless example and CLI script/generate/validate/verify commands.
Benchmark and raw smoke results are in artifacts. Source/player archives and SHA256SUMS are
in artifacts/release. Documentation and licenses/notices are complete. No external publication.

Quest hardware validation remains owner-deferred. docs/QUEST_PLAYTEST.md provides setup and
short reporting prompts. docs/ACCEPTANCE.md distinguishes measured results from unverified work.
