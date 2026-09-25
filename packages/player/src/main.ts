import './style.css';
import * as THREE from 'three';
import { controllerSamples } from './xr-input.js';
import type { TrackedController } from './xr-input.js';
import { sampleMaps, sampleMap, EVENT_HORIZON_ID } from '@statebeats/content';
import { INK_BATTLE_ID } from '@statebeats/ink-battle';
import {
  beatToTick,
  beatValue,
  compile,
  describeObservation,
  fitMapToPlayer,
  musicGenerationSchema,
  CHOREOGRAPHY_VERSION,
  TURN_PLANNER_VERSION,
} from '@statebeats/sdk';
import type {
  Observation,
  Replay,
  MapDefinition,
  ChoreographyReport,
  MusicGenerationOptions,
  MusicTimeline,
} from '@statebeats/sdk';
import type { Vec3, Quat } from '@statebeats/core';
import type { FromWorker, ToWorker, HandSample } from './protocol.js';
import { OrbitScene, sceneVector } from './scene.js';
import { RhythmAudio } from './audio.js';
import { readPreferences, storePreferences } from './preferences.js';
import { assistedTargetPoint } from './desktop-input.js';
import { bundledSong, bundledSoundtracks } from './soundtracks.js';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string, fn: () => void) => el(id).addEventListener('click', fn);
const orbit = new OrbitScene(el('stage')),
  audio = new RhythmAudio(),
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const send = (message: ToWorker) => worker.postMessage(message);
let importedMap: MapDefinition | undefined;
let generationReport: ChoreographyReport | undefined;
let generationBaseline: MusicGenerationOptions = {};
let rebuildSupported = false;
let personalHeight = 1.65,
  roomScale = 1;
let activeHeight = 1.65;
let importedSong: { buffer: AudioBuffer; sha256: string } | undefined;
let analysisWorker: Worker | undefined;
let audioMap: MapDefinition | undefined;
let preparingStart = false;
let startSequence = 0;
let connectedSong: string | undefined;
const maps = () => (importedMap ? [...sampleMaps, importedMap] : sampleMaps);
const mapFor = (id: string) => (importedMap?.id === id ? importedMap : sampleMap(id));
let captions = true;
let selected = 'tutorial',
  activeMap = '',
  playing = false,
  running = false,
  autoplay = false,
  view: Observation | undefined,
  loadStarting = false;
let startOnReady = false;
let desktopYaw = 0,
  swap = false,
  hideTargets = false,
  showPerf = false,
  frameTimes: number[] = [],
  lastFrame = 0,
  speed = 1;
let targetMouse = new THREE.Vector2(0, 0),
  desktopHeld = [false, false],
  handTargets = [new THREE.Vector3(-0.3, 1.1, -0.2), new THREE.Vector3(0.3, 1.1, -0.2)];
let lastFeedback = 0,
  generation = 0,
  lastPhase = '',
  exportSequence = 0;
const pendingExports = new Map<number, (replay: Replay) => void>();
const raycaster = new THREE.Raycaster(),
  worldCamera = new THREE.Vector3(),
  worldQuaternion = new THREE.Quaternion(),
  forward = new THREE.Vector3();
const xrSources: (XRInputSource | undefined)[] = [];
const controllerLines: THREE.Line[] = [];

function notify(message: string) {
  el('error').textContent = message;
  el('error').hidden = false;
  setTimeout(() => (el('error').hidden = true), 8000);
}
function selectMap(id: string) {
  selected = id;
  el<HTMLButtonElement>('save-generation-report').disabled =
    !generationReport || importedMap?.id !== id;
  for (const card of el('maps').children) {
    card.classList.toggle('selected', (card as HTMLElement).dataset.map === id);
    card.setAttribute('aria-pressed', String((card as HTMLElement).dataset.map === id));
  }
  el('selected-description').textContent = mapFor(id).description;
  drawMenu();
}
const symbols = ['◎', '✳', '∞', '⌘', '☀', '✧', '♫'];
function addMapCard(map: MapDefinition, index: number) {
  const card = document.createElement('button');
  card.className = 'map-card';
  card.dataset.map = map.id;
  if (map.id === EVENT_HORIZON_ID || map.id === INK_BATTLE_ID) card.classList.add('featured-map');
  card.setAttribute('aria-label', map.title);
  card.setAttribute('aria-pressed', String(index === 0));
  const seconds = beatToTick(map.durationBeats, map) / map.tickRate;
  card.innerHTML =
    '<span class="map-art"></span><span><span class="map-title"></span><span class="map-meta"></span></span><span class="map-arrow">↗</span>';
  card.querySelector('.map-art')!.textContent = symbols[index] ?? '♫';
  card.querySelector('.map-title')!.textContent = map.title;
  card.querySelector('.map-meta')!.textContent =
    `${map.id === INK_BATTLE_ID ? 'INK-BATTLE · SIX AGES · ORIGINAL SOUNDTRACK' : map.id === EVENT_HORIZON_ID ? 'MASTER · ORIGINAL SOUNDTRACK' : index === 0 ? 'TUTORIAL' : index === 2 ? 'COOPERATIVE' : index >= 4 ? 'LIVING SCENE' : '360° SEQUENCE'} · ${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
  card.onclick = () => selectMap(map.id);
  el('maps').append(card);
}
sampleMaps.forEach(addMapCard);
const featuredCard = el('maps').querySelector(`[data-map="${EVENT_HORIZON_ID}"]`);
if (featuredCard) el('maps').insertBefore(featuredCard, el('maps').children[1]);
const inkCard = el('maps').querySelector(`[data-map="${INK_BATTLE_ID}"]`);
if (inkCard) el('maps').insertBefore(inkCard, el('maps').children[1]);

const menuCanvas = document.createElement('canvas');
menuCanvas.width = 1024;
menuCanvas.height = 1024;
const menuTexture = new THREE.CanvasTexture(menuCanvas);
menuTexture.colorSpace = THREE.SRGBColorSpace;
const menu = new THREE.Mesh(
  new THREE.PlaneGeometry(1.1, 1.1),
  new THREE.MeshBasicMaterial({ map: menuTexture, transparent: false, side: THREE.DoubleSide }),
);
menu.visible = false;
orbit.scene.add(menu);
const menuRects: { x: number; y: number; w: number; h: number; action: () => void }[] = [];
const cueCanvas = document.createElement('canvas');
cueCanvas.width = 1024;
cueCanvas.height = 128;
const cueTexture = new THREE.CanvasTexture(cueCanvas);
cueTexture.colorSpace = THREE.SRGBColorSpace;
const cueMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 0.125),
  new THREE.MeshBasicMaterial({ map: cueTexture, transparent: true, depthTest: false }),
);
cueMesh.renderOrder = 10;
cueMesh.visible = false;
orbit.scene.add(cueMesh);
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 1024;
hudCanvas.height = 160;
const hudTexture = new THREE.CanvasTexture(hudCanvas);
hudTexture.colorSpace = THREE.SRGBColorSpace;
const hudMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(1.1, 0.172),
  new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true, depthTest: false }),
);
hudMesh.renderOrder = 10;
hudMesh.visible = false;
orbit.scene.add(hudMesh);
function drawMenu() {
  const c = menuCanvas.getContext('2d')!;
  menuRects.length = 0;
  c.fillStyle = '#101b2e';
  c.fillRect(0, 0, 1024, 1024);
  c.strokeStyle = '#284957';
  c.lineWidth = 4;
  c.strokeRect(2, 2, 1020, 1020);
  c.fillStyle = '#72f4df';
  c.font = 'bold 46px Segoe UI';
  c.fillText('StateBeats', 56, 70);
  c.fillStyle = '#9cafc5';
  c.font = '24px Segoe UI';
  const score = view?.scores.find((s) => s.actorId === 'player');
  c.fillText(
    view?.finished
      ? `Complete · ${score?.points ?? 0} points · ${score?.hits ?? 0} hits`
      : playing
        ? 'Paused · your timeline is held'
        : 'Choose a sequence. Reach on the beat.',
    56,
    112,
  );
  function row(
    text: string,
    y: number,
    action: () => void,
    active = false,
    x = 48,
    w = 928,
    h = 74,
  ) {
    c.fillStyle = active ? '#284f50' : '#192b42';
    c.fillRect(x, y, w, h);
    c.fillStyle = active ? '#baffef' : '#e2ecf9';
    c.font = '28px Segoe UI';
    c.fillText(text, x + 24, y + h / 2 + 10);
    menuRects.push({ x, y, w, h, action });
  }
  const rows = maps(),
    rowHeight = Math.min(74, 364 / rows.length);
  rows.forEach((m, i) =>
    row(
      m.title,
      148 + i * rowHeight,
      () => selectMap(m.id),
      m.id === selected,
      48,
      928,
      rowHeight - 5,
    ),
  );
  row(
    playing && !view?.finished && selected === activeMap
      ? 'Resume sequence'
      : 'Play selected sequence',
    536,
    () => {
      if (playing && !view?.finished && selected === activeMap) resume();
      else void start(false);
    },
    true,
  );
  row('Restart selected', 632, () => void start(false));
  row(
    audio.enabled ? 'Sound: on' : 'Sound: off',
    728,
    () => {
      audio.enabled = !audio.enabled;
      audio.rebase();
      void prepareAudio();
      el('sound').textContent = audio.enabled ? 'Sound on' : 'Sound off';
      savePreferences();
      drawMenu();
    },
    false,
    48,
    444,
  );
  row('Recenter & restart', 728, () => void start(false), false, 512, 464);
  row('Exit immersive VR', 824, () => void orbit.renderer.xr.getSession()?.end());
  c.fillStyle = '#8298b1';
  c.font = '23px Segoe UI';
  c.fillText('Point + trigger to choose · grip opens this menu', 56, 965);
  menuTexture.needsUpdate = true;
}
function headPose() {
  const camera = orbit.renderer.xr.isPresenting ? orbit.renderer.xr.getCamera() : orbit.camera;
  camera.getWorldPosition(worldCamera);
  camera.getWorldQuaternion(worldQuaternion);
  forward.set(0, 0, -1).applyQuaternion(worldQuaternion);
  return {
    position: worldCamera.clone(),
    quaternion: worldQuaternion.clone(),
    forward: forward.clone(),
  };
}
function placeMenu() {
  const head = headPose();
  menu.position.copy(head.position).add(head.forward.multiplyScalar(1.55));
  menu.position.y = head.position.y - 0.13;
  const yaw = Math.atan2(-head.forward.x, -head.forward.z);
  menu.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  drawMenu();
}
function stagePose(): { position: Vec3; orientation: Quat } {
  if (!orbit.renderer.xr.isPresenting) return { position: [0, 0, 0], orientation: [0, 0, 0, 1] };
  const head = headPose(),
    yaw = Math.atan2(-head.forward.x, -head.forward.z);
  return {
    position: [head.position.x, 0, head.position.z],
    orientation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
  };
}

async function prepareAudio() {
  if (!audio.enabled) return;
  try {
    await audio.unlock();
    const map = audioMap,
      hash = map?.music?.source?.sha256;
    if (map && hash && hash !== connectedSong && bundledSoundtracks.has(hash)) {
      const song = await bundledSong(hash, (bytes) => audio.decodeSong(bytes));
      if (song && audioMap === map) {
        audio.setSong(song.buffer, map.music?.frames[0]?.tick ?? 0, {
          volume: song.asset.musicVolume,
        });
        connectedSong = hash;
      }
    }
  } catch {
    notify(
      'Audio could not load. Visual and text controls remain available; restart to retry the soundtrack.',
    );
  }
}
async function start(bot: boolean) {
  if (preparingStart) return;
  const request = ++startSequence;
  const mapId = selected;
  if (running) pause();
  audio.reset();
  let map: MapDefinition;
  try {
    map = fitMapToPlayer(mapFor(mapId), { height: personalHeight, roomScale });
  } catch (error) {
    notify(`This map could not use the selected height/scale: ${String(error)}`);
    return;
  }
  activeHeight = personalHeight;
  audio.setScore(map);
  audioMap = map;
  connectedSong = undefined;
  if (map.music?.source && importedSong?.sha256 === map.music.source.sha256)
    audio.setSong(importedSong.buffer, map.music.frames[0]?.tick ?? 0);
  else if (map.music?.source && !bundledSoundtracks.has(map.music.source.sha256))
    notify(
      `Choose the matching audio file (${map.music.source.name}) to hear its soundtrack. The saved chart and cues can play now.`,
    );
  preparingStart = true;
  el<HTMLButtonElement>('play').disabled = true;
  el<HTMLButtonElement>('watch').disabled = true;
  el('engine-status').textContent = bundledSoundtracks.has(map.music?.source?.sha256 ?? '')
    ? 'Loading original soundtrack…'
    : 'Preparing sequence…';
  await prepareAudio();
  if (request !== startSequence) return;
  preparingStart = false;
  autoplay = bot;
  playing = true;
  running = false;
  loadStarting = true;
  startOnReady = true;
  activeMap = mapId;
  lastPhase = 'loading';
  view = undefined;
  desktopYaw = 0;
  desktopPitch = 0;
  el('lobby').hidden = true;
  el('pause-panel').hidden = true;
  el('results').hidden = true;
  el('hud').hidden = false;
  el('help-panel').hidden = true;
  el('settings-panel').hidden = true;
  document.body.classList.add('playing');
  el('map-label').textContent = map.title;
  el('mode-label').textContent = bot
    ? 'SCRIPTED ACTOR'
    : orbit.renderer.xr.isPresenting
      ? 'STANDALONE VR'
      : 'DESKTOP SESSION';
  orbit.clear();
  orbit.setPlaying(true);
  menu.visible = false;
  hudMesh.visible = orbit.renderer.xr.isPresenting;
  if (!orbit.renderer.xr.isPresenting) {
    orbit.camera.position.set(0, 1.65, 0);
    orbit.camera.rotation.set(0, 0, 0);
  }
  desktopHeld = [false, false];
  handTargets = [new THREE.Vector3(-0.3, 1.1, -0.2), new THREE.Vector3(0.3, 1.1, -0.2)];
  send({ type: 'load', mapId, map, autoplay: bot, stage: stagePose() });
}
function pause(stalled = false) {
  if (!playing) return;
  startOnReady = false;
  running = false;
  send({ type: 'pause' });
  audio.stop();
  el('pause-title').textContent = stalled ? 'Let’s resync.' : 'Paused.';
  el('pause-description').textContent = stalled
    ? 'Tracking or timing was interrupted. Resume when you are ready; the soundtrack will restart from this simulation tick.'
    : 'The sequence and its soundtrack are paused together.';
  if (orbit.renderer.xr.isPresenting) {
    menu.visible = true;
    placeMenu();
  } else el('pause-panel').hidden = false;
}
function resume() {
  if (!playing) return;
  startOnReady = true;
  void prepareAudio();
  audio.rebase();
  el('pause-panel').hidden = true;
  menu.visible = false;
  running = !loadStarting;
  if (running) send({ type: 'start' });
}
function home() {
  startSequence++;
  startOnReady = false;
  loadStarting = false;
  preparingStart = false;
  el<HTMLButtonElement>('play').disabled = false;
  el<HTMLButtonElement>('watch').disabled = false;
  running = false;
  playing = false;
  send({ type: 'pause' });
  audio.reset();
  audioMap = undefined;
  connectedSong = undefined;
  orbit.clear();
  orbit.setPlaying(false);
  el('hud').hidden = true;
  el('lobby').hidden = false;
  el('results').hidden = true;
  el('pause-panel').hidden = true;
  el('direction-cue').hidden = true;
  document.body.classList.remove('playing');
  hudMesh.visible = false;
  cueMesh.visible = false;
  if (orbit.renderer.xr.isPresenting) {
    menu.visible = true;
    placeMenu();
  } else {
    orbit.camera.position.set(0, 1.6, 3.4);
    orbit.camera.lookAt(0.25, 1.45, -1.5);
  }
}
function showResults() {
  running = false;
  audio.stop();
  const s = view?.scores.find((s) => s.actorId === 'player');
  if (!s) return;
  el('result-stats').innerHTML =
    `<div><strong>${s.points.toLocaleString()}</strong><small>POINTS</small></div><div><strong>${s.bestCombo}</strong><small>BEST COMBO</small></div><div><strong>${s.hits}</strong><small>HITS</small></div>`;
  el('result-detail').textContent =
    `${s.misses} missed · ${s.hazards} hazard contacts. ${autoplay ? 'Played by the scripted actor through the same SDK.' : 'Every result came from the simulation engine.'}`;
  if (orbit.renderer.xr.isPresenting) {
    menu.visible = true;
    placeMenu();
  } else el('results').hidden = false;
}
worker.onmessage = (event: MessageEvent<FromWorker>) => {
  const message = event.data;
  if (message.type === 'error') {
    notify(message.message);
    running = false;
    audio.stop();
    return;
  }
  if (message.type === 'replay') {
    pendingExports.get(message.requestId)?.(message.replay);
    pendingExports.delete(message.requestId);
    return;
  }
  if (message.type === 'ready') {
    generation = message.generation;
    view = message.view;
    el('engine-status').textContent = 'Engine ready · 120 Hz';
    el<HTMLButtonElement>('play').disabled = false;
    el<HTMLButtonElement>('watch').disabled = false;
    if (loadStarting) {
      const request = startSequence,
        readyGeneration = generation;
      orbit.update(message.view, hideTargets);
      // Compile/upload a newly selected theme before real-time simulation begins.
      // A slow first GPU frame must not consume the song's opening or its timing budget.
      void orbit.renderer
        .compileAsync(orbit.scene, orbit.camera)
        .then(() => {
          if (
            request !== startSequence ||
            readyGeneration !== generation ||
            !loadStarting ||
            !playing
          )
            return;
          orbit.render();
          loadStarting = false;
          send({ type: 'speed', value: speed });
          running = startOnReady;
          if (running) send({ type: 'start' });
        })
        .catch((error) => {
          if (request !== startSequence || readyGeneration !== generation) return;
          loadStarting = false;
          pause();
          notify(`The stage could not be prepared: ${String(error)}`);
        });
    }
    return;
  }
  send({ type: 'frame-ack', generation: message.generation });
  if (message.generation !== generation || loadStarting) return;
  if (message.overflow)
    notify(
      'Presentation caught up from the current engine state. Older cue events are in the replay.',
    );
  view = message.view;
  if (playing) {
    orbit.update(view, hideTargets);
    const head = headPose();
    const description = describeObservation(view, {
      position: sceneVector(head.position),
      orientation: head.quaternion.toArray() as Quat,
      maxTargets: 3,
    });
    el('captions').textContent = captions
      ? description.targets
          .map(
            (target) =>
              `${target.action === 'avoid' ? 'AVOID' : target.requirement === 'any effector' ? 'EITHER HAND' : target.requirement.toUpperCase()} · ${target.clockPosition} o'clock ${target.height} · ${target.secondsUntil > 0 ? target.secondsUntil.toFixed(1) + 's' : 'NOW'}${target.holdSeconds ? ' · HOLD' : ''}`,
          )
          .join('     |     ')
      : '';
    el('captions').hidden = !captions || !running;
    const s = view.scores.find((s) => s.actorId === 'player');
    el('score').textContent = (s?.points ?? 0).toLocaleString();
    el('combo').textContent = String(s?.combo ?? 0);
    el('progress').style.width = `${Math.min(100, (view.tick / view.durationTicks) * 100)}%`;
    audio.update(view, message.events, running && message.clock.phase === 'running');
    for (const e of message.events) {
      if (e.type === 'interaction.hit') {
        const data = e.data as Record<string, unknown>;
        el('judgement').textContent = String(data.grade).toUpperCase();
        el('judgement').style.color = '#72f4df';
        lastFeedback = performance.now();
        haptic(e.actorId);
      } else if (e.type === 'interaction.missed') {
        el('judgement').textContent = 'MISSED';
        el('judgement').style.color = '#9caabe';
        lastFeedback = performance.now();
      } else if (e.type === 'hazard.penalty') {
        el('judgement').textContent = 'AVOID';
        el('judgement').style.color = '#ff6478';
        lastFeedback = performance.now();
      }
    }
    if (message.clock.phase === 'stalled' && lastPhase !== 'stalled') pause(true);
    if (message.clock.phase === 'paused' && running && lastPhase === 'running') pause(true);
    if (view.finished && lastPhase !== 'ended') showResults();
    lastPhase = message.clock.phase;
    const c = hudCanvas.getContext('2d')!;
    c.clearRect(0, 0, 1024, 160);
    c.fillStyle = '#08111de0';
    c.fillRect(0, 0, 1024, 160);
    c.font = '26px Segoe UI';
    c.fillStyle = '#a6b8cd';
    c.fillText(view.title, 30, 45);
    c.font = '42px Segoe UI';
    c.fillStyle = '#72f4df';
    c.fillText(`${s?.points ?? 0} points`, 30, 105);
    c.fillStyle = '#edf4ff';
    c.fillText(`${s?.combo ?? 0} combo`, 630, 105);
    c.fillStyle = '#72f4df';
    c.fillRect(0, 153, (1024 * view.tick) / view.durationTicks, 4);
    hudTexture.needsUpdate = true;
    if (autoplay) {
      const actor = view.actors.find((a) => a.id === 'player');
      for (let i = 0; i < 2; i++) {
        const hand = actor?.effectors.find((e) => e.id === (i ? 'right' : 'left'));
        if (hand) orbit.hands[i].position.fromArray(hand.pose.position);
      }
    }
  }
  if (showPerf) {
    const frameMs = frameTimes.reduce((s, x) => s + x, 0) / Math.max(1, frameTimes.length);
    el('perf').textContent =
      `render ${(1000 / frameMs).toFixed(0)} fps · ${frameMs.toFixed(1)} ms\npump ${message.metrics.pumpMs.toFixed(2)} ms · max ${message.metrics.maxPumpMs.toFixed(2)} ms\ninput age ${message.metrics.inputAgeMs.toFixed(1)} ms · tick ${view.tick}\n${view.entities.length} live entities · ${orbit.renderer.info.render.calls} draw calls`;
  }
};
function haptic(actorId?: string) {
  if (actorId !== 'player') return;
  for (const source of xrSources) {
    const h = source?.gamepad?.hapticActuators?.[0];
    if (h) void h.pulse(0.2, 35).catch(() => {});
  }
}

button('play', () => void start(false));
button('watch', () => void start(true));
button('pause', () => pause());
button('resume', resume);
button('restart', () => void start(autoplay));
button('again', () => void start(autoplay));
button('home', home);
button('results-home', home);
button('sound', () => {
  audio.enabled = !audio.enabled;
  audio.rebase();
  void prepareAudio();
  savePreferences();
  el('sound').textContent = audio.enabled ? 'Sound on' : 'Sound off';
  drawMenu();
});
button('help', () => {
  if (running) pause();
  el('help-panel').hidden = false;
});
button('close-help', () => (el('help-panel').hidden = true));
button('settings', () => {
  if (running) pause();
  el('settings-panel').hidden = false;
});
button('close-settings', () => (el('settings-panel').hidden = true));
el<HTMLSelectElement>('speed').onchange = () => {
  speed = Number(el<HTMLSelectElement>('speed').value);
  audio.speed = speed;
  audio.rebase();
  send({ type: 'speed', value: speed });
};
el<HTMLInputElement>('audio-offset').oninput = () => {
  audio.offsetMs = Number(el<HTMLInputElement>('audio-offset').value);
  el('offset-value').textContent = `${audio.offsetMs} ms`;
  audio.rebase();
};
el<HTMLInputElement>('swap-hands').onchange = () =>
  (swap = el<HTMLInputElement>('swap-hands').checked);
el<HTMLInputElement>('audio-only').onchange = () =>
  (hideTargets = el<HTMLInputElement>('audio-only').checked);
el<HTMLInputElement>('performance').onchange = () => {
  showPerf = el<HTMLInputElement>('performance').checked;
  el('perf').hidden = !showPerf;
};
el<HTMLInputElement>('captions-enabled').onchange = () => {
  captions = el<HTMLInputElement>('captions-enabled').checked;
};
el<HTMLInputElement>('reduced-motion').checked = matchMedia(
  '(prefers-reduced-motion: reduce)',
).matches;
orbit.theme.preferences.reducedMotion = el<HTMLInputElement>('reduced-motion').checked;
el<HTMLInputElement>('reduced-motion').onchange = () => {
  orbit.theme.preferences.reducedMotion = el<HTMLInputElement>('reduced-motion').checked;
};
el<HTMLInputElement>('high-contrast').onchange = () => {
  orbit.theme.preferences.highContrast = el<HTMLInputElement>('high-contrast').checked;
  document.body.classList.toggle('high-contrast', orbit.theme.preferences.highContrast);
};
el<HTMLInputElement>('music-enabled').onchange = () => {
  audio.musicEnabled = el<HTMLInputElement>('music-enabled').checked;
  audio.rebase();
};
el<HTMLInputElement>('cues-enabled').onchange = () => {
  audio.cuesEnabled = el<HTMLInputElement>('cues-enabled').checked;
  audio.rebase();
};
el<HTMLInputElement>('effects-enabled').onchange = () => {
  audio.effectsEnabled = el<HTMLInputElement>('effects-enabled').checked;
  audio.rebase();
};
for (const channel of ['music', 'guidance', 'effects'] as const) {
  el<HTMLInputElement>(`${channel}-volume`).oninput = () => {
    const value = Number(el<HTMLInputElement>(`${channel}-volume`).value);
    audio.setMix({ [channel]: value / 100 });
    el(`${channel}-volume-value`).textContent = `${value}%`;
  };
}

function downloadJson(data: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
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
  addMapCard(map, 6);
  el('maps').lastElementChild!.setAttribute('data-imported', 'true');
  selectMap(map.id);
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
  for (const [id, value] of Object.entries(values)) el<HTMLInputElement>(id).value = String(value);
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
for (const [id, set, low, high] of [
  [
    'player-height',
    (n: number) => {
      personalHeight = n;
    },
    1,
    2.3,
  ],
  [
    'room-scale',
    (n: number) => {
      roomScale = n;
    },
    0.5,
    1.75,
  ],
] as const)
  el<HTMLInputElement>(id).onchange = () => {
    const input = el<HTMLInputElement>(id),
      value = Number(input.value);
    const valid = Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : low;
    input.value = String(valid);
    set(valid);
  };
button('save-map', () => downloadJson(mapFor(selected), `statebeats-${selected}.json`));
button('save-generation-report', () => {
  if (generationReport && importedMap?.id === selected)
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
          event: MessageEvent<{ map?: MapDefinition; report?: ChoreographyReport; error?: string }>,
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
    if (running) pause();
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
      if (running) pause();
      if (file.size > 16_000_000) throw new Error('Map files must be smaller than 16 MB.');
      installMap(compile(JSON.parse(await file.text())).map);
    } catch (error) {
      notify(String(error));
    }
  })();
};
el<HTMLInputElement>('song-file').onchange = () => {
  void (async () => {
    const input = el<HTMLInputElement>('song-file');
    try {
      const file = input.files?.[0];
      if (!file) return;
      if (running) pause();
      input.disabled = true;
      if (file.size > 40_000_000) throw new Error('Choose an audio file smaller than 40 MB.');
      el('import-status').textContent = 'Decoding your song locally…';
      const bytes = await file.arrayBuffer();
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      const sha256 = Array.from(new Uint8Array(hash), (value) =>
        value.toString(16).padStart(2, '0'),
      ).join('');
      const buffer = await audio.decodeSong(bytes);
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
      notify(String(error));
      el('import-status').textContent = 'Song import did not complete.';
    } finally {
      input.disabled = false;
      analysisWorker?.terminate();
      analysisWorker = undefined;
    }
  })();
};
button('export-replay', () => {
  const id = ++exportSequence;
  pendingExports.set(id, (replay) => {
    const blob = new Blob([JSON.stringify(replay, null, 2)], { type: 'application/json' }),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = `statebeats-${activeMap}-replay.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  send({ type: 'export', requestId: id });
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && running) pause();
});
orbit.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
let activeDesktopHand = 0;
let desktopPitch = 0;
// A held gesture begun during preparation must still be held when playback starts.
const acceptsDesktopInput = () =>
  playing && !autoplay && (running || (loadStarting && startOnReady));
orbit.renderer.domElement.addEventListener('pointermove', (e) => {
  targetMouse.set((e.clientX / innerWidth) * 2 - 1, (-e.clientY / innerHeight) * 2 + 1);
  if (acceptsDesktopInput() && desktopHeld[activeDesktopHand])
    handTargets[activeDesktopHand].copy(desktopAim(activeDesktopHand));
});
orbit.renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!acceptsDesktopInput()) return;
  void prepareAudio();
  if (e.button !== 0 && e.button !== 2) return;
  const hand = (e.button === 0 ? 0 : 1) ^ (swap ? 1 : 0);
  desktopHeld[hand] = true;
  activeDesktopHand = hand;
  const target = desktopAim(hand);
  handTargets[hand].copy(target);
  orbit.hands[hand].position.copy(target);
});
window.addEventListener('pointerup', (e) => {
  if (e.button !== 0 && e.button !== 2) return;
  desktopHeld[(e.button === 0 ? 0 : 1) ^ (swap ? 1 : 0)] = false;
});
const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).matches('input,select')) return;
  keys.add(e.code);
  if (playing && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) e.preventDefault();
  if (e.code === 'Escape') {
    if (running) pause();
    else if (playing && !view?.finished) resume();
  }
  if (e.code === 'Space' && !e.repeat && playing) {
    e.preventDefault();
    desktopHeld = [true, true];
    const target = desktopAim();
    handTargets.forEach((v) => v.copy(target));
    orbit.hands.forEach((h) => h.position.copy(target));
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Space') desktopHeld = [false, false];
});
function desktopAim(hand?: number) {
  raycaster.setFromCamera(targetMouse, orbit.camera);
  let depth = 0.85;
  // Pointer depth assistance is an input adapter, never a hit/scoring shortcut.
  // The last dragged hand follows the pointer; the other keeps its stored position.
  const semantic = hand === undefined ? undefined : hand === 0 ? 'left' : 'right';
  const candidates =
    view?.entities.filter(
      (entity) =>
        entity.kind !== 'hazard' &&
        (!semantic || entity.slots.some((slot) => !slot.semantic || slot.semantic === semantic)),
    ) ?? [];
  candidates.sort(
    (a, b) => Math.max(0, a.hitTick - view!.tick) - Math.max(0, b.hitTick - view!.tick),
  );
  for (const entity of candidates) {
    const point = assistedTargetPoint(raycaster.ray, entity, view!.tick);
    if (point) return point;
  }
  const point = raycaster.ray.origin
    .clone()
    .add(raycaster.ray.direction.clone().multiplyScalar(depth));
  return point;
}

for (let i = 0; i < 2; i++) {
  const controller = orbit.renderer.xr.getController(i),
    grip = orbit.renderer.xr.getControllerGrip(i);
  orbit.scene.add(controller, grip);
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -2),
    ]),
    new THREE.LineBasicMaterial({
      color: i ? 0xff9b79 : 0x72f4df,
      transparent: true,
      opacity: 0.8,
    }),
  );
  controller.add(line);
  controllerLines.push(line);
  const gripSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 12, 8),
    new THREE.MeshBasicMaterial({ color: i ? 0xff9b79 : 0x72f4df }),
  );
  grip.add(gripSphere);
  controller.addEventListener('connected', (event) => {
    xrSources[i] = event.data as XRInputSource;
  });
  controller.addEventListener('disconnected', () => (xrSources[i] = undefined));
  controller.addEventListener('squeezestart', () => {
    if (menu.visible && playing && !view?.finished) resume();
    else if (playing) pause();
    else {
      menu.visible = true;
      placeMenu();
    }
  });
  controller.addEventListener('selectstart', () => {
    if (!menu.visible) return;
    const matrix = new THREE.Matrix4().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(matrix);
    const hit = raycaster.intersectObject(menu)[0];
    if (!hit?.uv) return;
    const x = hit.uv.x * 1024,
      y = (1 - hit.uv.y) * 1024;
    menuRects.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)?.action();
  });
}
const vrButton = el<HTMLButtonElement>('enter-vr');
if (navigator.xr) {
  void navigator.xr
    .isSessionSupported('immersive-vr')
    .then((supported) => {
      vrButton.disabled = !supported;
      vrButton.textContent = supported ? 'Enter immersive VR ↗' : 'Open this page in your Quest';
    })
    .catch(() => {
      vrButton.textContent = 'VR unavailable in this browser';
    });
} else {
  vrButton.textContent = 'Open this page in your Quest';
  el('vr-note').textContent = isSecureContext
    ? 'Immersive WebXR runs in a compatible headset browser.'
    : 'Quest VR requires HTTPS or a trusted localhost connection.';
}
button('enter-vr', () => {
  void (async () => {
    try {
      // Request XR during the gesture; audio availability must not block entry.
      void prepareAudio();
      const session = await navigator.xr!.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor'],
      });
      orbit.camera.position.set(0, 0, 0);
      orbit.camera.rotation.set(0, 0, 0);
      await orbit.renderer.xr.setSession(session);
      document.body.classList.add('xr');
      if (playing) pause();
      menu.visible = true;
      setTimeout(placeMenu, 300);
      session.addEventListener('end', () => {
        document.body.classList.remove('xr');
        menu.visible = false;
        hudMesh.visible = false;
        cueMesh.visible = false;
        home();
      });
    } catch (error) {
      notify(String(error));
    }
  })();
});

let lastCue = '';
orbit.renderer.setAnimationLoop((time) => {
  const dt = lastFrame ? Math.min(0.05, (time - lastFrame) / 1000) : 0.016;
  if (lastFrame) {
    frameTimes.push(time - lastFrame);
    if (frameTimes.length > 90) frameTimes.shift();
  }
  lastFrame = time;
  orbit.idle(time / 1000);
  if (playing && !orbit.renderer.xr.isPresenting) {
    if (autoplay && view) {
      const target = view.entities
        .filter(
          (e) =>
            e.kind !== 'hazard' &&
            e.endTick >= view!.tick &&
            e.presentation?.readiness?.phase !== 'hidden',
        )
        .sort((a, b) => a.hitTick - b.hitTick)[0];
      if (target) {
        const together = view.entities.filter(
          (entity) =>
            entity.kind !== 'hazard' &&
            entity.presentation?.readiness?.phase !== 'hidden' &&
            Math.abs(entity.hitTick - target.hitTick) <= 1,
        );
        const position = together.reduce(
          (sum, entity) => {
            const p = entity.targetPosition ?? entity.position;
            return [
              sum[0] + p[0] / together.length,
              sum[1] + p[1] / together.length,
              sum[2] + p[2] / together.length,
            ];
          },
          [0, 0, 0],
        );
        const yaw = Math.atan2(-position[0], -position[2]);
        const delta = Math.atan2(Math.sin(yaw - desktopYaw), Math.cos(yaw - desktopYaw));
        desktopYaw += delta * Math.min(1, dt * 4);
        desktopPitch += (-0.12 - desktopPitch) * Math.min(1, dt * 3);
      }
    }
    desktopYaw += ((keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0)) * dt * 1.5;
    desktopPitch = THREE.MathUtils.clamp(
      desktopPitch + ((keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0)) * dt,
      -1.2,
      1.2,
    );
    orbit.camera.rotation.set(desktopPitch, desktopYaw, 0, 'YXZ');
    if (autoplay) {
      // Spectator framing shows both hands and the stage; it never alters actor poses.
      orbit.camera.position.set(
        Math.sin(desktopYaw) * 0.85,
        activeHeight + 0.12,
        Math.cos(desktopYaw) * 0.85,
      );
    } else orbit.camera.position.y = keys.has('KeyC') ? activeHeight * 0.61 : activeHeight;
    orbit.aim.visible = running && !autoplay;
    orbit.aim.position.copy(desktopAim());
    orbit.aim.quaternion.copy(orbit.camera.quaternion);
  } else orbit.aim.visible = false;
  const head = headPose();
  audio.pose(sceneVector(head.position), sceneVector(head.forward));
  if (playing && running && !autoplay) {
    const samples: HandSample[] = [];
    if (orbit.renderer.xr.isPresenting) {
      const tracked: TrackedController[] = [];
      for (let i = 0; i < 2; i++) {
        const source = xrSources[i];
        if (!source || source.handedness === 'none') continue;
        const grip = orbit.renderer.xr.getControllerGrip(i),
          position = new THREE.Vector3(),
          q = new THREE.Quaternion();
        grip.getWorldPosition(position);
        grip.getWorldQuaternion(q);
        tracked.push({
          handedness: source.handedness,
          position: sceneVector(position),
          orientation: q.toArray() as Quat,
          tracked: grip.visible,
        });
        const index = source.handedness === 'left' ? 0 : 1;
        orbit.hands[index].position.copy(position);
      }
      samples.push(...controllerSamples(tracked));
    } else {
      for (let i = 0; i < 2; i++) {
        if (!desktopHeld[i]) {
          const park = new THREE.Vector3(i ? 0.3 : -0.3, 1.1, -0.2).applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            desktopYaw,
          );
          orbit.hands[i].position.lerp(park, Math.min(1, dt * 8));
        } else orbit.hands[i].position.copy(handTargets[i]);
        samples.push({
          id: i ? 'right' : 'left',
          position: sceneVector(orbit.hands[i].position),
          orientation: [0, 0, 0, 1],
          tracked: true,
          active: desktopHeld[i],
        });
      }
    }
    samples.push({
      id: 'head',
      position: sceneVector(head.position),
      orientation: head.quaternion.toArray() as Quat,
      tracked: true,
      active: true,
    });
    send({ type: 'poses', samples, sentAt: performance.timeOrigin + performance.now() });
  }
  if (view && playing) {
    const next = view.entities
      .filter((e) => e.endTick >= view!.tick && e.presentation?.readiness?.phase !== 'hidden')
      .sort((a, b) => a.hitTick - b.hitTick)[0];
    let cue = '';
    if (next) {
      const toward = new THREE.Vector3(...((next.targetPosition ?? next.position) as Vec3)).sub(
          head.position,
        ),
        angle = Math.atan2(toward.x, -toward.z) - Math.atan2(head.forward.x, -head.forward.z),
        wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
      if (Math.hypot(toward.x, toward.z) > 0.1 && Math.abs(wrapped) > 0.9)
        cue = `${wrapped > 0 ? 'TURN RIGHT →' : '← TURN LEFT'}  ${Math.round((Math.abs(wrapped) * 180) / Math.PI)}°`;
    }
    if (captions && orbit.renderer.xr.isPresenting) {
      const target = describeObservation(view, {
        position: sceneVector(head.position),
        orientation: head.quaternion.toArray() as Quat,
        maxTargets: 1,
      }).targets[0];
      if (target)
        cue = [
          cue,
          `${target.action === 'avoid' ? 'AVOID / DUCK' : target.requirement.toUpperCase()} · ${target.clockPosition} o'clock · ${target.secondsUntil > 0 ? target.secondsUntil.toFixed(1) + 's' : 'NOW'}`,
        ]
          .filter(Boolean)
          .join('\n');
    }
    el('direction-cue').textContent = cue;
    el('direction-cue').hidden = !cue || !running;
    if (cue !== lastCue) {
      lastCue = cue;
      const c = cueCanvas.getContext('2d')!;
      c.clearRect(0, 0, 1024, 128);
      c.font = 'bold 34px Segoe UI';
      c.fillStyle = '#b9ffee';
      c.textAlign = 'center';
      cue
        .split('\n')
        .slice(0, 2)
        .forEach((line, index) => c.fillText(line, 512, 48 + index * 48));
      cueTexture.needsUpdate = true;
    }
    cueMesh.visible = orbit.renderer.xr.isPresenting && running && !!cue;
    hudMesh.visible = orbit.renderer.xr.isPresenting && !menu.visible;
    for (const [mesh, y] of [
      [hudMesh, 0.48],
      [cueMesh, -0.35],
    ] as const) {
      mesh.position.copy(head.position).add(head.forward.clone().multiplyScalar(1.5));
      mesh.position.y += y;
      mesh.quaternion.copy(head.quaternion);
    }
  }
  el('judgement').style.opacity = performance.now() - lastFeedback < 650 ? '1' : '0';
  controllerLines.forEach((l) => (l.visible = menu.visible));
  orbit.render();
});
function savePreferences() {
  storePreferences({
    sound: audio.enabled,
    music: audio.musicEnabled,
    cues: audio.cuesEnabled,
    effects: audio.effectsEnabled,
    musicVolume: audio.mix.music,
    guidanceVolume: audio.mix.guidance,
    effectsVolume: audio.mix.effects,
    captions,
    reducedMotion: orbit.theme.preferences.reducedMotion,
    highContrast: orbit.theme.preferences.highContrast,
    swapHands: swap,
    audioOnly: hideTargets,
    speed,
    offsetMs: audio.offsetMs,
    playerHeight: personalHeight,
    roomScale,
  });
}
const preferences = readPreferences();
personalHeight = preferences.playerHeight;
roomScale = preferences.roomScale;
el<HTMLInputElement>('player-height').value = String(personalHeight);
el<HTMLInputElement>('room-scale').value = String(roomScale);
audio.enabled = preferences.sound;
audio.musicEnabled = preferences.music;
audio.cuesEnabled = preferences.cues;
audio.effectsEnabled = preferences.effects;
audio.setMix({
  music: preferences.musicVolume,
  guidance: preferences.guidanceVolume,
  effects: preferences.effectsVolume,
});
for (const channel of ['music', 'guidance', 'effects'] as const) {
  const value = Math.round(audio.mix[channel] * 100);
  el<HTMLInputElement>(`${channel}-volume`).value = String(value);
  el(`${channel}-volume-value`).textContent = `${value}%`;
}
audio.offsetMs = preferences.offsetMs;
audio.speed = speed = preferences.speed;
captions = preferences.captions;
swap = preferences.swapHands;
hideTargets = preferences.audioOnly;
orbit.theme.preferences = {
  reducedMotion: preferences.reducedMotion,
  highContrast: preferences.highContrast,
};
for (const [id, checked] of Object.entries({
  'music-enabled': preferences.music,
  'cues-enabled': preferences.cues,
  'effects-enabled': preferences.effects,
  'captions-enabled': captions,
  'reduced-motion': preferences.reducedMotion,
  'high-contrast': preferences.highContrast,
  'swap-hands': swap,
  'audio-only': hideTargets,
}))
  el<HTMLInputElement>(id).checked = checked;
el<HTMLSelectElement>('speed').value = String(speed);
el<HTMLInputElement>('audio-offset').value = String(audio.offsetMs);
el('offset-value').textContent = `${audio.offsetMs} ms`;
el('sound').textContent = audio.enabled ? 'Sound on' : 'Sound off';
document.body.classList.toggle('high-contrast', preferences.highContrast);
document.addEventListener('change', (event) => {
  if ((event.target as HTMLElement).closest('#settings-panel')) savePreferences();
});
el<HTMLSelectElement>('song-preset').dispatchEvent(new Event('change'));
const requestedMap = new URLSearchParams(location.search).get('map');
selectMap(sampleMaps.some((map) => map.id === requestedMap) ? requestedMap! : 'tutorial');
el<HTMLButtonElement>('play').disabled = true;
el<HTMLButtonElement>('watch').disabled = true;
send({ type: 'load', mapId: 'tutorial', autoplay: false });
addEventListener('pagehide', () => {
  analysisWorker?.terminate();
  worker.terminate();
  void audio.dispose();
  orbit.dispose();
});
