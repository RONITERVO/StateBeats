import { mkdir, readFile, writeFile, rename, readdir, stat, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { compile, EngineError, Session } from '@statebeats/sdk';
import type { MapStore, ReplayStore, MapDefinition, Replay } from '@statebeats/sdk';
class JsonDirectory {
  readonly directory: string;
  constructor(directory: string) {
    this.directory = resolve(directory);
  }
  path(id: string) {
    return join(this.directory, createHash('sha256').update(id).digest('hex') + '.json');
  }
  async read(id: string): Promise<unknown | undefined> {
    try {
      if ((await stat(this.path(id))).size > 64_000_000)
        throw new EngineError('SIZE_LIMIT', 'Stored file is too large');
      return JSON.parse(await readFile(this.path(id), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
  async write(id: string, value: unknown) {
    await mkdir(this.directory, { recursive: true });
    const destination = this.path(id),
      temporary = destination + '.' + randomUUID() + '.tmp';
    try {
      await writeFile(temporary, JSON.stringify(value), { flag: 'wx' });
      await rename(temporary, destination);
    } finally {
      await unlink(temporary).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }
}
/** Opaque hashed filenames keep untrusted map IDs out of filesystem paths. Host owns the directory. */
export class FileMapStore implements MapStore {
  private storage: JsonDirectory;
  constructor(directory: string) {
    this.storage = new JsonDirectory(directory);
  }
  async get(id: string) {
    const value = await this.storage.read(id);
    return value === undefined ? undefined : compile(value).map;
  }
  async put(map: MapDefinition) {
    const validated = compile(map).map;
    await this.storage.write(validated.id, validated);
  }
  async list() {
    await mkdir(this.storage.directory, { recursive: true });
    const result: { id: string; title: string }[] = [];
    for (const name of (await readdir(this.storage.directory)).sort()) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const path = join(this.storage.directory, name);
      if ((await stat(path)).size > 16_000_000)
        throw new EngineError('SIZE_LIMIT', 'Stored map is too large');
      const map = compile(JSON.parse(await readFile(path, 'utf8'))).map;
      result.push({ id: map.id, title: map.title });
    }
    return result;
  }
}
export class FileReplayStore implements ReplayStore {
  private storage: JsonDirectory;
  constructor(directory: string) {
    this.storage = new JsonDirectory(directory);
  }
  async get(id: string) {
    const replay = (await this.storage.read(id)) as Replay | undefined;
    if (replay) await Session.verifyReplay(replay);
    return replay;
  }
  async put(id: string, replay: Replay) {
    await Session.verifyReplay(replay);
    await this.storage.write(id, replay);
  }
}
