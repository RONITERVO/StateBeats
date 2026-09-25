import { sampleMaps, sampleMap } from '@statebeats/content';
import {
  compile,
  musicGenerationSchema,
  CHOREOGRAPHY_VERSION,
  TURN_PLANNER_VERSION,
} from '@statebeats/sdk';
import type {
  MapDefinition,
  ChoreographyReport,
  MusicGenerationOptions,
  MusicTimeline,
} from '@statebeats/sdk';
import { el, button, downloadJson } from './dom.js';
interface AuthoringHost {
  selected(): string;
  pause(): void;
  notify(message: string): void;
  decodeSong(bytes: ArrayBuffer): Promise<AudioBuffer>;
  installed(map: MapDefinition): void;
}
/** Owns local imports, generation recipes and their worker; exposes catalog reads to the player. */
export function createAuthoring(host: AuthoringHost) {
  let importedMap: MapDefinition | undefined;
  let importedSong: { buffer: AudioBuffer; sha256: string } | undefined;
  let generationReport: ChoreographyReport | undefined;
  let generationBaseline: MusicGenerationOptions = {};
  let rebuildSupported = false;
  let analysisWorker: Worker | undefined;
  const mapFor = (id: string) => (importedMap?.id === id ? importedMap : sampleMap(id));
  function installMap(map: MapDefinition, report?: ChoreographyReport) {
    for (const card of el('maps').querySelectorAll('[data-imported]')) card.remove();
    importedMap = map;
    generationReport = report;
    const restored = [CHOREOGRAPHY_VERSION, 'statebeats/choreography-v1'].includes(
      map.generation?.algorithm ?? '',
    )
      ? musicGenerationSchema.strip().safeParse(map.generation!.settings)
      : undefined;
    const recipe = map.generation?.settings as Record<string, unknown> | undefined;
    const supported =
      !map.generation ||
      (restored?.success &&
        recipe?.composer === 'statebeats/dance-phrases-v1' &&
        recipe?.facing ===
          (restored.data.turnStyle === 'musical'
            ? TURN_PLANNER_VERSION
            : 'statebeats/phrase-facing-v1') &&
        recipe?.selector === 'statebeats/phrase-rhythm-v1');
    generationBaseline = restored?.success
      ? restored.data
      : { bpm: Math.max(40, Math.min(240, map.tempo[0].bpm)) };
    restoreSongControls(generationBaseline);
    rebuildSupported =
      !!map.music &&
      !!supported &&
      map.tempo.length === 1 &&
      map.tempo[0].bpm >= 40 &&
      map.tempo[0].bpm <= 240;
    el<HTMLButtonElement>('regenerate-map').disabled = !rebuildSupported;
    el<HTMLButtonElement>('save-generation-report').disabled = !report;
    el('generation-summary').textContent = report
      ? `${report.summary.heads} notes · ${report.summary.rails} held paths · ${report.summary.pairs} paired moments · ${report.summary.hazards} obstacles.${report.turns ? ` ${report.turns.summary.events} musical turns, ${report.turns.summary.reversals} direction changes.` : ''} ${report.omitted.length} candidates omitted for musical selection or movement limits. ${report.issues.length ? `${report.issues.length} hand movement issues need review.` : 'Hand movement checks passed.'} Preview with a bot, then start gently on your headset.`
      : '';
    host.installed(map);
    el('import-status').textContent =
      `${map.title} is ready. ${map.notes.length} interactions. Save the map to keep its generated sequence.${supported && map.tempo.length === 1 ? '' : ' This recipe requires its original generator or tempo editor to rebuild.'}`;
  }
  function restoreSongControls(options: MusicGenerationOptions) {
    const settings = musicGenerationSchema.parse(options);
    const values = {
      'song-bpm': settings.bpm,
      'song-difficulty': settings.difficulty,
      'song-turning': settings.turnMode ?? (settings.turning ? 'full' : 'forward'),
      'song-turn-style': settings.turnStyle,
      'song-range': settings.movementRange,
      'song-turn-degrees': settings.turnDegrees,
      'song-turn-speed': settings.maxTurnSpeed,
      'song-turn-acceleration': settings.maxTurnAcceleration,
      'song-turn-travel': settings.maxDirectionalTravel,
      'song-hand-speed': settings.maxHandSpeed,
      'song-style': settings.style,
      'song-rhythm': settings.rhythm,
      'song-beat-offset': settings.beatOffsetSeconds,
      'song-height': settings.playerHeight,
      'song-reach': settings.reach,
      'song-lead': settings.leadSeconds,
      'song-distance': settings.spawnDistance,
      'song-seed': settings.seed,
    };
    for (const [id, value] of Object.entries(values))
      el<HTMLInputElement>(id).value = String(value);
    for (const [id, value] of Object.entries({
      'song-rails': settings.rails,
      'song-pairs': settings.pairs,
      'song-crossovers': settings.crossovers,
      'song-duck': settings.obstacles === 'duck',
    }))
      el<HTMLInputElement>(id).checked = value;
    el<HTMLSelectElement>('song-preset').value = 'custom';
  }
  el<HTMLSelectElement>('song-preset').onchange = () => {
    const preset = el<HTMLSelectElement>('song-preset').value;
    if (preset === 'custom') return;
    const master = preset === 'master',
      beginner = preset === 'beginner';
    restoreSongControls({
      ...songOptions(),
      difficulty: master ? 'master' : preset === 'hard' ? 'busy' : beginner ? 'gentle' : 'flow',
      turnMode: beginner ? 'forward' : preset === 'normal' ? 'bounded' : 'full',
      turnStyle: beginner ? 'rests' : 'musical',
      movementRange: master || preset === 'hard' ? 'wide' : 'compact',
      turnDegrees: master ? 120 : 30,
      maxTurnSpeed: master ? 60 : 30,
      maxTurnAcceleration: master ? 240 : 120,
      maxDirectionalTravel: master ? 360 : 180,
      maxHandSpeed: master ? 6 : 3,
      rails: !beginner,
      pairs: !beginner,
      crossovers: master || preset === 'hard',
      obstacles: 'none',
      rhythm: master ? 'steady' : 'hybrid',
    });
    el<HTMLSelectElement>('song-preset').value = preset;
  };
  button('save-map', () =>
    downloadJson(mapFor(host.selected()), `statebeats-${host.selected()}.json`),
  );
  button('save-generation-report', () => {
    if (generationReport && importedMap?.id === host.selected())
      downloadJson(generationReport, `statebeats-${importedMap.id}-generation.json`);
  });
  function songOptions(): MusicGenerationOptions {
    const number = (id: string) => Number(el<HTMLInputElement>(id).value);
    return {
      ...generationBaseline,
      bpm: number('song-bpm'),
      difficulty: el<HTMLSelectElement>('song-difficulty')
        .value as MusicGenerationOptions['difficulty'],
      turnMode: el<HTMLSelectElement>('song-turning').value as MusicGenerationOptions['turnMode'],
      turnStyle: el<HTMLSelectElement>('song-turn-style')
        .value as MusicGenerationOptions['turnStyle'],
      movementRange: el<HTMLSelectElement>('song-range')
        .value as MusicGenerationOptions['movementRange'],
      turnDegrees: number('song-turn-degrees'),
      maxTurnSpeed: number('song-turn-speed'),
      maxTurnAcceleration: number('song-turn-acceleration'),
      maxDirectionalTravel: number('song-turn-travel'),
      maxHandSpeed: number('song-hand-speed'),
      style: el<HTMLSelectElement>('song-style').value as MusicGenerationOptions['style'],
      rhythm: el<HTMLSelectElement>('song-rhythm').value as MusicGenerationOptions['rhythm'],
      beatOffsetSeconds: number('song-beat-offset'),
      playerHeight: number('song-height'),
      reach: number('song-reach'),
      leadSeconds: number('song-lead'),
      spawnDistance: number('song-distance'),
      seed: number('song-seed'),
      rails: el<HTMLInputElement>('song-rails').checked,
      pairs: el<HTMLInputElement>('song-pairs').checked,
      crossovers: el<HTMLInputElement>('song-crossovers').checked,
      obstacles: el<HTMLInputElement>('song-duck').checked ? 'duck' : 'none',
    };
  }
  async function composeSong(payload: {
    music?: MusicTimeline;
    samples?: Float32Array;
    sampleRate?: number;
    source?: MusicTimeline['source'];
  }) {
    el('import-status').textContent = 'Composing musical phrases and checking movement…';
    for (const id of ['song-file', 'map-file', 'regenerate-map'])
      el<HTMLInputElement>(id).disabled = true;
    analysisWorker?.terminate();
    const current = new Worker(new URL('./import-worker.ts', import.meta.url), { type: 'module' });
    analysisWorker = current;
    try {
      return await new Promise<{ map: MapDefinition; report: ChoreographyReport }>(
        (resolve, reject) => {
          current.onmessage = (
            event: MessageEvent<{
              map?: MapDefinition;
              report?: ChoreographyReport;
              error?: string;
            }>,
          ) => {
            if (event.data.error || !event.data.map || !event.data.report)
              reject(new Error(event.data.error ?? 'Composition failed'));
            else resolve({ map: event.data.map, report: event.data.report });
          };
          current.onerror = (event) => reject(new Error(event.message));
          current.postMessage(
            { ...payload, options: songOptions() },
            payload.samples ? [payload.samples.buffer] : [],
          );
        },
      );
    } finally {
      current.terminate();
      if (analysisWorker === current) analysisWorker = undefined;
      el<HTMLInputElement>('song-file').disabled = false;
      el<HTMLInputElement>('map-file').disabled = false;
      el<HTMLButtonElement>('regenerate-map').disabled = !rebuildSupported;
    }
  }
  button('regenerate-map', () => {
    void (async () => {
      if (!importedMap?.music) return;
      host.pause();
      try {
        const { map, report } = await composeSong({ music: importedMap.music });
        installMap(map, report);
      } catch (error) {
        el('import-status').textContent = String(error);
      }
    })();
  });
  el<HTMLInputElement>('map-file').onchange = () => {
    void (async () => {
      try {
        const file = el<HTMLInputElement>('map-file').files?.[0];
        if (!file) return;
        host.pause();
        if (file.size > 16_000_000) throw new Error('Map files must be smaller than 16 MB.');
        installMap(compile(JSON.parse(await file.text())).map);
      } catch (error) {
        host.notify(String(error));
      }
    })();
  };
  el<HTMLInputElement>('song-file').onchange = () => {
    void (async () => {
      const input = el<HTMLInputElement>('song-file');
      try {
        const file = input.files?.[0];
        if (!file) return;
        host.pause();
        input.disabled = true;
        if (file.size > 40_000_000) throw new Error('Choose an audio file smaller than 40 MB.');
        el('import-status').textContent = 'Decoding your song locally…';
        const bytes = await file.arrayBuffer();
        const hash = await crypto.subtle.digest('SHA-256', bytes);
        const sha256 = Array.from(new Uint8Array(hash), (value) =>
          value.toString(16).padStart(2, '0'),
        ).join('');
        const buffer = await host.decodeSong(bytes);
        if (buffer.duration > 600)
          throw new Error(
            'The reference player accepts songs up to ten minutes. The SDK can handle longer feature timelines.',
          );
        const preparedSong = { buffer, sha256 };
        if (importedMap?.music?.source?.sha256 === sha256) {
          importedSong = preparedSong;
          el('import-status').textContent = `Matching soundtrack loaded for ${importedMap.title}.`;
          return;
        }
        const samples = new Float32Array(buffer.length);
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          const data = buffer.getChannelData(channel);
          for (let i = 0; i < data.length; i++) samples[i] += data[i] / buffer.numberOfChannels;
        }
        for (let i = 0; i < samples.length; i++) samples[i] = Math.max(-1, Math.min(1, samples[i]));
        const { map, report } = await composeSong({
          samples,
          sampleRate: buffer.sampleRate,
          source: { name: file.name, sha256, durationSeconds: buffer.duration },
        });
        importedSong = preparedSong;
        installMap(map, report);
      } catch (error) {
        host.notify(String(error));
        el('import-status').textContent = 'Song import did not complete.';
      } finally {
        input.disabled = false;
        analysisWorker?.terminate();
        analysisWorker = undefined;
      }
    })();
  };

  el<HTMLSelectElement>('song-preset').dispatchEvent(new Event('change'));
  return {
    maps: () => (importedMap ? [...sampleMaps, importedMap] : sampleMaps),
    mapFor,
    get song() {
      return importedSong;
    },
    selectionChanged(id: string) {
      el<HTMLButtonElement>('save-generation-report').disabled =
        !generationReport || importedMap?.id !== id;
    },
    dispose() {
      analysisWorker?.terminate();
    },
  };
}
