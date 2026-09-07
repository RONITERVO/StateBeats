import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {Session,MapBuilder,standardActor,canonical} from '@statebeats/sdk';
const builder=new MapBuilder({version:1,id:'built-by-code',title:'One exact left-hand beat',durationBeats:4,
  tempo:[{beat:0,bpm:120}],notes:[]});
builder.add({id:'left-note',preset:'left',beat:2,position:[0,1.4,-0.8],earlyMs:0,lateMs:0});
const {map,warnings}=builder.compile();assert.equal(warnings.length,0);
const session=await Session.create(map,[standardActor()]);
const admin=session.client({role:'admin'}),player=session.client({role:'player',actorId:'player'});
player.submit('script',[
  {id:'prepare',tick:1,type:'pose',actorId:'player',effectorId:'left',position:[0,1.4,0]},
  {id:'touch',tick:120,type:'pose',actorId:'player',effectorId:'left',position:[0,1.4,-0.8]},
]);
admin.advanceOnce('first',60);const checkpoint=admin.checkpoint();
const restored=await Session.restore(checkpoint);
admin.advanceOnce('finish',180);restored.client({role:'admin'}).advanceOnce('finish',180);
assert.equal(canonical(session.snapshot()),canonical(restored.snapshot()));
assert.equal(session.snapshot().scores[0].hits,1);assert.equal(session.snapshot().scores[0].points,100);
const replay=await admin.replay();assert.equal((await Session.verifyReplay(replay)).verified,true);
const wrong=await Session.create(map,[standardActor()]);
wrong.client({role:'player',actorId:'player'}).submit('wrong-hand',[
  {id:'wrong',tick:120,type:'pose',actorId:'player',effectorId:'right',position:[0,1.4,-0.8]},
]);
wrong.advance(240);assert.equal(wrong.snapshot().scores[0].hits,0);assert.equal(wrong.snapshot().scores[0].misses,1);
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/headless-replay.json',JSON.stringify(replay,null,2));
await writeFile('artifacts/built-map.json',JSON.stringify(map,null,2));
console.log(JSON.stringify({correct:session.snapshot().scores[0],wrong:wrong.snapshot().scores[0],replay:'verified',checkpoint:'identical'},null,2));
session.close();restored.close();wrong.close();
