# Public player and contributor publishing

StateBeats is a static browser application. GitHub Pages can deliver the same build to desktop
browsers and standalone Quest Browser over HTTPS. Simulation, imported music analysis and play
run on the visitor's device. No game server, account or model subscription is needed.

The project URL is `https://ronitervo.github.io/StateBeats/`. The publishing workflow in
`.github/workflows/pages.yml` runs on a push to `main`, including merged pull requests. It builds
and checks the source, tests the production player under `/StateBeats/`, and deploys only after
those checks pass. The workflow cannot publish a feature branch. The URL becomes playable
after the first successful deployment; enabling Pages alone does not publish the player.

For a fork, enable **Settings → Pages → Build and deployment → Source: GitHub Actions**.
The maintainer's first merge containing this workflow starts publication. Later merged changes
replace the public build. `workflow_dispatch` supports a deliberate redeploy from `main`.
The deployment job uses the `github-pages` environment and GitHub's Pages/OIDC permissions.
There are no third-party hosting credentials.

## What contributors publish

Submit a pull request with an original or appropriately licensed map, theme, input/perception
adapter or other improvement. Playable library maps are registered in
`packages/content/src/index.ts`; author their source in the content package and run
`npm run content:export` to update the JSON distribution. Add relevant tests and describe the
intended difficulty, movement and play-space assumptions. After review and merge, the Pages
workflow makes the new library/content/code available to everyone.

External developers can also host compatible maps independently. The player already accepts
local JSON maps and matching audio. A visitor's imported files remain on their device; importing
does not submit them to the public gallery. Pages has no writable application database. A future
in-browser submission, moderation, discovery or multiplayer service would be an additional adapter.
Trusted executable extensions are reviewed source contributions, not code loaded from map JSON.

## Local production check

With Node 24, run `npm ci`, `npm run build`, then `npm run test:pages`. The test serves the compiled
assets under the project subpath, exercises simulation and authoring workers, exports/verifies a
recording with a personal room scale, and opens the guide and text player. CI runs this check on
pull requests as well as before deployment. It does not emulate physical Quest controls.

Official references: [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
and [Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
