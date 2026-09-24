import assert from 'node:assert/strict';
import { Session as Battle } from '@statebeats/ink-battle/upstream/src/sdk/session.js';
import { inkBattleMap, sampleInkBattle, inkEncounters, battleSource } from '@statebeats/ink-battle';
import { Session, standardActor, scriptedCommands } from '@statebeats/sdk';

// The actual upstream simulation is usable independently, including manual stepping.
const battle = new Battle({ seed: 73190, battlefield: 'tabletop', opponent: false });
battle.advance(120);
for (const team of [1, -1])
  assert.equal(battle.command(team, { type: 'unit', index: 0, z: 0 }).ok, true);
battle.advance(600);
assert.equal(Battle.fromReplay(battle.replay()).digest(), battle.digest());

// The shipped rhythm experience uses reproducible excerpts and ordinary StateBeats poses.
const session = await Session.create(inkBattleMap(), [standardActor()]);
const commands = scriptedCommands(session.program);
for (let i = 0; i < commands.length; i += 1024)
  session.submit({ role: 'admin' }, `ink-${i}`, commands.slice(i, i + 1024));
session.advance(8400);
console.log({
  source: battleSource,
  chapter: sampleInkBattle(session.tick / 60).age,
  encounterExample: inkEncounters().find((e) => e.age === 2 && e.kind === 'heavy'),
});
session.advance(24000);
assert.equal(session.snapshot().scores[0].misses, 0);
assert.equal(
  (await Session.verifyReplay(await session.client({ role: 'admin' }).replay())).verified,
  true,
);
console.log(session.snapshot().scores[0]);
session.close();
