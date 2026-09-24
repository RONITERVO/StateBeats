# CLI and MCP

Musical authoring adds `music.compose` with `{ music, options }`, returning `{ map, report }`
and storing the generated map. It requires an admin capability and supports request-ID retries.
`choreography.inspect` accepts `{ map, options }` or `{ mapId, options }`, returns authored
hand-path diagnostics, and never advances time. `music.generate` returns just the map.
See [the choreography contract](CHOREOGRAPHY.md) for settings and adapter interfaces.

Build once with `npm ci` and `npm run build:lib`. Run `node examples/headless.mjs` for the full
asserted builder → pose → step → checkpoint → replay flow including a wrong-hand negative case.

## CLI

```sh
node packages/cli/dist/index.js demo
node packages/cli/dist/index.js maps
node packages/cli/dist/index.js generate 42 generated.json
node packages/cli/dist/index.js validate generated.json
node packages/cli/dist/index.js run examples/agent-loop.json artifacts/agent-results.json
node packages/cli/dist/index.js verify artifacts/headless-replay.json
node packages/cli/dist/index.js serve
```

`serve` keeps sessions alive and accepts one JSON request per stdin line; each stdout line is
`{"result":...}` or `{"error":{"code":...,"message":...,"details":...}}`. `run` executes an array in order.
Ordinary command failures exit 1, an unknown CLI command exits 2, and a persistent serve request
failure returns an error without terminating other sessions. MCP stdout is reserved for its protocol.

## MCP connection

Configure a stdio MCP client with your installed Node executable and an absolute server path:

```json
{
  "mcpServers": {
    "statebeats": {
      "command": "node",
      "args": ["D:/Projects/3dRythm/packages/mcp/dist/index.js"],
      "env": { "STATEBEATS_ROLE": "admin" }
    }
  }
}
```

Use your checkout path on another machine. The server uses the official MCP SDK and exposes one
typed `rhythm` dispatcher tool and the `rhythm://maps` JSON resource. There is no model dependency.
The request envelope is `{op,sessionId?,requestId?,args?}`; schema/protocol content version is 1 and
the kernel recording version is 0.1.0; packages and server are 0.2.0. The actual MCP handshake
negotiates its supported protocol version.

For a player agent, bind `STATEBEATS_ROLE=player`, `STATEBEATS_ACTOR=player`,
`STATEBEATS_MAP=agent-arena`, and optionally `STATEBEATS_ALLOW_ADVANCE=1`. A restricted connection gets
session `default` created by its host. It cannot promote itself to admin, edit scores or inspect raw
checkpoints. Director and observer roles work the same way. These environment variables are a
trusted local launch configuration, not network authentication.

## Operations shared by SDK service, CLI and MCP

| Operation | Arguments / result |
|---|---|
| `session.create` | `map` or `mapId`, optional `actors`; returns session ID and observation (admin) |
| `session.list`, `session.close` | List host sessions; close is idempotent (admin) |
| `session.reset` | Optional new `map`; archives replay and starts a new segment (admin) |
| `map.list`, `map.validate` | List map names; validate `map` with semantic diagnostics |
| `map.import`, `map.export` | Store `map`; return `map`/`mapId` source JSON (admin) |
| `map.generate` | `seed`, `count`, `style`, `turning`; returns/stores reproducible map (admin) |
| `music.generate` | Stored `music` timeline and `options:{bpm,difficulty,turning,seed}`; returns/stores an authored scene map (admin) |
| `map.edit` | `mapId`/`map`, and `note`, `remove` ID, `scene`, or `music`; null removes scene/music (admin) |
| `map.fit` | `mapId`/`map` and `options: { height, roomScale }`; stores the same baked personal layout used by the player (admin, retryable) |
| `map.compile` | `mapId`/`map`; returns `{compiled,scene?,warnings}` with gameplay content hash (admin) |
| `actor.register` | `tick`, `actor:{id,effectors}`; queues actor addition (admin) |
| `command.submit` | `commands` array; validated atomically under caller capability |
| `pose.trajectory` | `actorId`, `effectorId`, `startTick`, `endTick`, `from`, `to`; at most 1,001 poses |
| `clock.advance` | `ticks`; returns from/to tick, event cursor and ended flag (delegated time/admin) |
| `perception.describe` | Optional listener `position`, `orientation`, `maxTargets`; human-readable semantic cues without advancing time |
| `observe` | Current role-filtered observation, does not advance |
| `events.since` | `since` cursor, optional `limit` 1–4,096; returns events, overflow and next cursor |
| `snapshot.save` | Complete checkpoint including future input/retries (admin) |
| `snapshot.restore` | `checkpoint`; validates reconstruction before replacing session (admin) |
| `replay.export` | Stores/returns replay with compiled artifact and digests (admin) |
| `replay.verify` | `replay`; executes it and checks state/event digests (admin) |
| `diagnostics.inspect` | Clock mode, tick and adapter diagnostics (admin) |

Command, registration, trajectory and advancement require `requestId`. Use a unique request ID for
each intentional mutation and reuse it unchanged only on retry. Administrative lifecycle/map
operations also support process-lifetime retry IDs; without one they execute on each call. Read
operations need none. Session command/clock retry records survive checkpoint restoration.

IDs match `[A-Za-z0-9_./:-]` and are 1–100 characters. Commands include their own unique `id`,
explicit target `tick` and discriminated `type`; see the exported JSON Schema for exact fields.
Do not put role/authentication assertions inside command args: capability is bound by the host.

An agent loop is: create/bind → observe → submit future poses → explicitly advance → read events
and observation → decide. Waiting for an API response consumes no simulation time. An agent can
instead bind a director to author environmental events or a player on a contested/cooperative actor.

Important error codes: `VALIDATION`, `MAP_INVALID`, `MAP_CAPACITY`, `VERSION`, `POLICY_MISMATCH`,
`PROGRAM_MISMATCH`, `LATE_COMMAND`, `DUPLICATE_COMMAND`, `RETRY_CONFLICT`, `FORBIDDEN`,
`BATCH_SIZE`, `TICK_LIMIT`, `CLOCK_OWNERSHIP`, `SESSION_LIMIT`, `CLOSED`, `NOT_FOUND`,
`CHECKPOINT_INVALID`, `REPLAY_DIVERGED`. Errors include structured details where useful.

Tool payloads are not a transport for executable plugins. Only an application host can register
trusted policy implementations through the SDK. Applications needing remote play, authentication,
rollback, model calls or distributed storage can layer those above this contract; v1 supplies no
online networking protocol, accounts, telemetry or model service.
