# Contributing

Use Node 24 LTS, `npm ci`, then `npm run check`. The engine is the shared source of truth:
new player mechanics must have a deterministic command/state/event interpretation. Put host APIs
in adapters. Keep maps as data and register trusted policy implementations explicitly.

For new behavior, add a small independent expected-outcome fixture, a negative case and a replay
continuation case. Use `npm run test:e2e` for browser-facing changes. Describe which hardware and
runtime you actually used; do not turn unavailable tests into passing claims. No new test is needed
for a routine wording or style edit.

Run `npm run format` before submitting. Version behavior-changing policies, schema migrations
and replay-breaking engine changes. Include a changelog entry for public behavior. Source maps and
declarations are built from TypeScript; edit `src`, not `dist`.

Submit an issue or pull request in [StateBeats](https://github.com/RONITERVO/StateBeats). Explain the problem, expected
behavior, evidence and compatibility impact. Contributions use the repository's MIT code license;
new original sample content must be clearly marked CC0 or carry its actual distributable license.

To release: run check, browser tests, benchmark, local packaging and clean-source installation.
Review `docs/ACCEPTANCE.md` and the Quest checklist. Configure a repository/namespace and publish
only after the maintainer chooses to do so. CI verifies but does not publish automatically.
