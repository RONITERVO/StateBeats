import { it, expect } from 'vitest';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { FileMapStore, FileReplayStore } from '@statebeats/adapters-node';
import { sampleMap } from '@statebeats/content';
import { Session } from '@statebeats/sdk';
it('file stores survive re-opening and never put map IDs in paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'statebeats-stores-'));
  try {
    const maps = new FileMapStore(join(directory, 'maps')),
      map = sampleMap('agent-arena');
    map.id = '../../outside';
    await maps.put(map);
    expect((await new FileMapStore(join(directory, 'maps')).get(map.id))?.title).toBe(map.title);
    expect(await maps.list()).toEqual([{ id: map.id, title: map.title }]);
    expect(await readdir(directory)).toEqual(['maps']);
    const replay = await (await Session.create(map)).exportReplay({ role: 'admin' });
    const replays = new FileReplayStore(join(directory, 'replays'));
    await replays.put('../session', replay);
    expect(await new FileReplayStore(join(directory, 'replays')).get('../session')).toEqual(replay);
  } finally {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep))
      throw new Error('Unexpected test cleanup path');
    await rm(directory, { recursive: true, force: true });
  }
});
