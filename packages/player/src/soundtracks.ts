import { eventHorizonSoundtrack } from '@statebeats/content';
import horizonUrl from '@statebeats/content/audio/event-horizon.mp3?url';
import { inkSoundtrack } from '@statebeats/ink-battle';
import inkUrl from '@statebeats/ink-battle/audio/between-the-lines.mp3?url';

/** Host-owned asset registry. Untrusted map JSON cannot ask the player to fetch arbitrary URLs. */
export const bundledSoundtracks = new Map<
  string,
  {
    name: string;
    file: string;
    sha256: string;
    durationSeconds: number;
    license: string;
    musicVolume: number;
    cueVolume: number;
    url: string;
  }
>([
  [eventHorizonSoundtrack.sha256, { ...eventHorizonSoundtrack, url: horizonUrl }],
  [inkSoundtrack.sha256, { ...inkSoundtrack, url: inkUrl }],
]);
const decoded = new Map<string, Promise<AudioBuffer>>();
export async function bundledSong(
  hash: string,
  decode: (bytes: ArrayBuffer) => Promise<AudioBuffer>,
) {
  const asset = bundledSoundtracks.get(hash);
  if (!asset) return;
  let pending = decoded.get(hash);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(asset.url);
      if (!response.ok) throw new Error(`Soundtrack download failed (${response.status}).`);
      const bytes = await response.arrayBuffer();
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
        (byte) => byte.toString(16).padStart(2, '0'),
      ).join('');
      if (digest !== hash) throw new Error('The bundled soundtrack failed its integrity check.');
      return decode(bytes);
    })();
    decoded.set(hash, pending);
    pending.catch(() => decoded.delete(hash));
  }
  return { buffer: await pending, asset };
}
