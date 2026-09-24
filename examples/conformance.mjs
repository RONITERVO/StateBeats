import {Session,standardActor,scriptedCommands,digest} from '@statebeats/sdk';
import {sampleMaps} from '@statebeats/content';
import {sweepOverlap,quaternion} from '@statebeats/core';
export async function conformance(recorded){
  const results=[], recordings=[];
  for(const [index,map] of sampleMaps.entries()){
    const source = recorded?.[index];
    const session=source
      ? await Session.fromCompiled(source.compiled, source.map, source.initialActors)
      : await Session.create(map,[standardActor(),standardActor('partner')]);
    const commands=scriptedCommands(session.program),admin=session.client({role:'admin'});
    for(let i=0;i<commands.length;i+=1024)admin.submit(`fixture-${i}`,commands.slice(i,i+1024));
    const firstHold=session.program.entities.find(e=>e.kind==='hold');
    const ticks=[...new Set([180,...(firstHold?[firstHold.hitTick+30,firstHold.hitTick+firstHold.holdTicks+8]:[])])].sort((a,b)=>a-b);
    const frames=[];
    for(const tick of ticks){
      session.advance(Math.max(0,tick-session.tick));
      const observed=admin.observe();
      frames.push({tick:observed.tick,scene:observed.scene??null,music:observed.music??null,
        destinations:observed.entities.map(e=>e.targetPosition),
        presentation:observed.entities.map(e=>e.presentation),
        releases:observed.resolvedEntities.map(e=>e.presentation)});
    }
    const perceptionHash=await digest(frames);
    const restored=await Session.restore(admin.checkpoint());
    session.advance(session.program.durationTicks);
    restored.advance(session.program.durationTicks);
    const replay=await admin.replay();
    recordings.push(replay);
    if(await digest(restored.snapshot())!==replay.finalStateHash)throw new Error('Continuation differs');
    results.push({mapId:map.id,perceptionHash,verification:await Session.verifyReplay(source ?? replay),scores:session.snapshot().scores});
    session.close();restored.close();
  }
  return {results,recordings,geometry:[
    sweepOverlap([-2,0,0],[2,0,0],0.07,{kind:'sphere',radius:0.2}),
    sweepOverlap([1.09,1.09,-2],[1.09,1.09,2],0.1,{kind:'box',half:[1,1,1]}),
    sweepOverlap([-2,0.4,0],[2,0.4,0],0.1,{kind:'capsule',a:[0,-1,0],b:[0,1,0],radius:0.15}),
    sweepOverlap([-2,0,0],[2,0,0],0.1,{kind:'box',half:[0.1,0.2,1],rotation:quaternion([0,1,0,2])}),
  ]};
}
