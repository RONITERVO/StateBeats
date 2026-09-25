import './style.css';
import * as THREE from 'three';
import { createXRControls } from './xr-controls.js';
import { sampleMaps, EVENT_HORIZON_ID, AUDIO_TUTORIAL_ID } from '@statebeats/content';
import { INK_BATTLE_ID } from '@statebeats/ink-battle';
import {
  beatToTick,
  beatValue,
  describeObservation,
  describeHandGuidance,
  fitMapToPlayer,
} from '@statebeats/sdk';
import type { Observation, Replay, MapDefinition } from '@statebeats/sdk';
import type { Vec3, Quat } from '@statebeats/core';
import type { FromWorker, ToWorker, HandSample } from './protocol.js';
import { OrbitScene, sceneVector } from './scene.js';
import { RhythmAudio } from './audio.js';
import { readPreferences, storePreferences } from './preferences.js';
import { createDesktopControls } from './desktop-controls.js';
import { bundledSong, bundledSoundtracks } from './soundtracks.js';
import { handGuidanceText } from './hand-audio.js';
import { HapticPlanner } from './haptics.js';
import { createAccessibility } from './accessibility.js';

import { el, button } from './dom.js';
import { createAuthoring } from './authoring.js';
import { Playback } from './playback.js';
import { TrackingGuard } from './xr-tracking.js';
const playback = new Playback();
const orbit = new OrbitScene(el('stage')),
  audio = new RhythmAudio(),
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const send = (message: ToWorker) => worker.postMessage(message);
let personalHeight = 1.65,
  roomScale = 1;
let activeHeight = 1.65;
let audioMap: MapDefinition | undefined;
let connectedSong: string | undefined;
let captions = true;
let selected = 'tutorial';
let view: Observation | undefined;
let swap = false,
  hideTargets = false,
  showPerf = false,
  frameTimes: number[] = [],
  lastFrame = 0,
  speed = 1;
let lastFeedback = 0,
  generation = 0,
  lastClockPhase = '',
  exportSequence = 0;
const pendingExports = new Map<number, (replay: Replay) => void>();
const worldCamera = new THREE.Vector3(),
  worldQuaternion = new THREE.Quaternion(),
  forward = new THREE.Vector3();

function notify(message: string) {
  el('error').textContent = message;
  el('error').hidden = false;
  setTimeout(() => (el('error').hidden = true), 8000);
}
function selectMap(id: string) {
  selected = id;
  authoring.selectionChanged(id);
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
    `${map.id === AUDIO_TUTORIAL_ID ? 'AUDIO-LED TUTORIAL · GENTLE PULSE' : map.id === INK_BATTLE_ID ? 'INK-BATTLE · SIX AGES · ORIGINAL SOUNDTRACK' : map.id === EVENT_HORIZON_ID ? 'MASTER · ORIGINAL SOUNDTRACK' : index === 0 ? 'TUTORIAL' : index === 2 ? 'COOPERATIVE' : index >= 4 ? 'LIVING SCENE' : '360° SEQUENCE'} · ${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
  card.onclick = () => selectMap(map.id);
  el('maps').append(card);
}
const authoring = createAuthoring({
  selected: () => selected,
  pause: () => {
    if (playback.canPause) pause();
  },
  notify,
  decodeSong: (bytes) => audio.decodeSong(bytes),
  installed: (map) => {
    addMapCard(map, 6);
    el('maps').lastElementChild!.setAttribute('data-imported', 'true');
    selectMap(map.id);
  },
});
const maps = authoring.maps,
  mapFor = authoring.mapFor;
const haptics = new HapticPlanner();
function stopHaptics() {
  haptics.reset();
  xr.stopHaptics();
}

const {
  narrator,
  spoken,
  announce,
  closeAudioDialogs,
  refreshSpokenMenu,
  showSpokenMenu,
  openSpokenMenu,
  moveSpoken,
} = createAccessibility({
  audio,
  immersive: () => orbit.renderer.xr.isPresenting,
  canPause: () => playback.canPause,
  canResume: () => playback.resumable && selected === playback.mapId,
  selection: () => mapFor(selected),
  maps,
  selectMap,
  start: () => {
    void start(false);
  },
  resume,
  pause,
  home,
  headHeight: () => headPose().position.y,
  roomScale: () => roomScale,
  setHeight: (value) => {
    personalHeight = value;
    el<HTMLInputElement>('player-height').value = String(value);
  },
  setRoomScale: (value) => {
    roomScale = value;
    el<HTMLInputElement>('room-scale').value = String(value);
  },
  savePreferences,
  prepareAudio,
  showVRMenu: () => {
    menu.visible = true;
    placeMenu();
  },
  redraw: drawMenu,
  exitVR: () => {
    void orbit.renderer.xr.getSession()?.end();
  },
});
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
      : playback.playing
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
  if (audio.nonvisualEnabled) {
    row(spoken.focused?.label ?? 'Open spoken choices', 230, () => spoken.activate(), true);
    row('Previous choice · left trigger', 360, () => moveSpoken(-1));
    row('Next choice · right trigger', 470, () => moveSpoken(1));
    row('Choose · either grip', 580, () => spoken.activate());
    row('Repeat spoken choice', 690, () => spoken.read());
    c.fillStyle = '#9cafc5';
    c.font = '23px Segoe UI';
    c.fillText('No pointing required. Grip pauses during play.', 56, 920);
    menuTexture.needsUpdate = true;
    return;
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
    playback.resumable && selected === playback.mapId
      ? 'Resume sequence'
      : 'Play selected sequence',
    536,
    () => {
      if (playback.resumable && selected === playback.mapId) resume();
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
      narrator.muted = !audio.enabled;
      if (!audio.enabled) narrator.stop();
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
  if (playback.state.phase === 'loading' && playback.state.stage === 'audio') return;
  const mapId = selected;
  if (playback.canPause) pause();
  closeAudioDialogs();
  narrator.stop();
  stopHaptics();
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
  if (map.music?.source && authoring.song?.sha256 === map.music.source.sha256)
    audio.setSong(authoring.song!.buffer, map.music.frames[0]?.tick ?? 0);
  else if (map.music?.source && !bundledSoundtracks.has(map.music.source.sha256))
    notify(
      `Choose the matching audio file (${map.music.source.name}) to hear its soundtrack. The saved chart and cues can play now.`,
    );
  const request = playback.begin(mapId, bot);
  el<HTMLButtonElement>('play').disabled = true;
  el<HTMLButtonElement>('watch').disabled = true;
  el('engine-status').textContent = bundledSoundtracks.has(map.music?.source?.sha256 ?? '')
    ? 'Loading original soundtrack…'
    : 'Preparing sequence…';
  await prepareAudio();
  if (!playback.audioReady(request)) return;
  lastClockPhase = 'loading';
  view = undefined;
  desktop.reset();
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
  send({ type: 'load', loadId: request, mapId, map, autoplay: bot, stage: stagePose() });
  if (playback.state.phase === 'loading' && playback.state.intent === 'pause') pause();
}
function pause(stalled = false) {
  if (!playback.playing && !playback.loading) return;
  playback.pause();
  send({ type: 'pause' });
  audio.stop();
  stopHaptics();
  el('pause-title').textContent = stalled ? 'Let’s resync.' : 'Paused.';
  el('pause-description').textContent = stalled
    ? 'Tracking or timing was interrupted. Resume when you are ready; the soundtrack will restart from this simulation tick.'
    : 'The sequence and its soundtrack are paused together.';
  el<HTMLButtonElement>('resume').disabled = !playback.resumable;
  if (audio.nonvisualEnabled) {
    if (!orbit.renderer.xr.isPresenting) el('pause-panel').hidden = false;
    showSpokenMenu();
    announce(
      `${stalled ? 'Tracking or timing interrupted.' : 'Paused.'} ${spoken.focused?.label}. Left trigger previous, right trigger next, either grip chooses.`,
    );
  } else if (orbit.renderer.xr.isPresenting) {
    menu.visible = true;
    placeMenu();
  } else el('pause-panel').hidden = false;
}
function resume() {
  if (!playback.resumable) return;
  closeAudioDialogs();
  narrator.stop();
  stopHaptics();
  playback.resume();
  void prepareAudio();
  audio.rebase();
  el('pause-panel').hidden = true;
  menu.visible = false;
  if (playback.running) send({ type: 'start' });
}
function home() {
  closeAudioDialogs();
  narrator.stop();
  stopHaptics();
  playback.home();
  el<HTMLButtonElement>('play').disabled = false;
  el<HTMLButtonElement>('watch').disabled = false;
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
    if (audio.nonvisualEnabled) {
      refreshSpokenMenu();
      spoken.read();
    }
    placeMenu();
  } else {
    orbit.camera.position.set(0, 1.6, 3.4);
    orbit.camera.lookAt(0.25, 1.45, -1.5);
  }
}
function showResults() {
  audio.stop();
  stopHaptics();
  const s = view?.scores.find((s) => s.actorId === 'player');
  if (!s) return;
  el('result-stats').innerHTML =
    `<div><strong>${s.points.toLocaleString()}</strong><small>POINTS</small></div><div><strong>${s.bestCombo}</strong><small>BEST COMBO</small></div><div><strong>${s.hits}</strong><small>HITS</small></div>`;
  el('result-detail').textContent =
    `${s.misses} missed · ${s.hazards} hazard contacts. ${playback.autoplay ? 'Played by the scripted actor through the same SDK.' : 'Every result came from the simulation engine.'}`;
  if (!orbit.renderer.xr.isPresenting) el('results').hidden = false;
  if (audio.nonvisualEnabled) {
    showSpokenMenu();
    announce(
      `Sequence complete. ${s.points} points, ${s.hits} hits, ${s.misses} missed. ${spoken.focused?.label}.`,
    );
  } else if (orbit.renderer.xr.isPresenting) {
    menu.visible = true;
    placeMenu();
  } else el('results').hidden = false;
}
function showFailure(loadId: number, message: string) {
  if (loadId !== playback.request) return;
  const initial = loadId === 0 && playback.request === 0;
  if (!playback.fail(loadId) && !initial) return;
  audio.stop();
  stopHaptics();
  el<HTMLButtonElement>('play').disabled = false;
  el<HTMLButtonElement>('watch').disabled = false;
  if (playback.playing) pause(true);
  el('pause-title').textContent = 'Could not continue.';
  el('pause-description').textContent = `${message} Restart the sequence or return to the library.`;
  notify(message);
  announce(`${message} Restart the sequence or return to the library.`);
}
worker.onmessage = (event: MessageEvent<FromWorker>) => {
  const message = event.data;
  if (message.type === 'error') {
    showFailure(message.loadId, message.message);
    return;
  }
  if (message.type === 'replay') {
    pendingExports.get(message.requestId)?.(message.replay);
    pendingExports.delete(message.requestId);
    return;
  }
  if (message.type === 'ready') {
    const initial = message.loadId === 0 && playback.request === 0;
    if (!initial && !playback.workerReady(message.loadId)) return;
    generation = message.generation;
    view = message.view;
    el('engine-status').textContent = 'Engine ready · 120 Hz';
    el<HTMLButtonElement>('play').disabled = false;
    el<HTMLButtonElement>('watch').disabled = false;
    if (!initial) {
      orbit.update(message.view, hideTargets);
      // Resource completion is tied to this load, so Home/restart can invalidate it.
      void orbit.renderer
        .compileAsync(orbit.scene, orbit.camera)
        .then(() => {
          if (!playback.sceneReady(message.loadId)) return;
          orbit.render();
          send({ type: 'speed', value: speed });
          if (playback.running) send({ type: 'start' });
        })
        .catch((error) => {
          showFailure(message.loadId, 'The stage could not be prepared: ' + String(error));
        });
    }
    return;
  }
  send({ type: 'frame-ack', generation: message.generation });
  if (
    message.loadId !== playback.request ||
    message.generation !== generation ||
    playback.loading ||
    playback.state.phase === 'error' ||
    !playback.playing
  )
    return;
  if (message.overflow)
    notify(
      'Presentation caught up from the current engine state. Older cue events are in the replay.',
    );
  view = message.view;
  if (playback.playing) {
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
    el('captions').hidden = !captions || !playback.running;
    const s = view.scores.find((s) => s.actorId === 'player');
    el('score').textContent = (s?.points ?? 0).toLocaleString();
    el('combo').textContent = String(s?.combo ?? 0);
    el('progress').style.width = `${Math.min(100, (view.tick / view.durationTicks) * 100)}%`;
    const live = playback.running && message.clock.phase === 'running';
    const hands = audio.nonvisualEnabled ? describeHandGuidance(view) : undefined;
    audio.update(view, message.events, live, hands);
    el('hand-guidance-status').textContent = hands
      ? hands.hands.map(handGuidanceText).join('. ') +
        (hands.unsupported.length ? '. Some mechanics need a custom guidance adapter.' : '')
      : '';
    for (const cue of haptics.update(
      hands,
      message.events,
      view.tickRate,
      live && !playback.autoplay,
    )) {
      xr.pulse(cue.hand, cue.intensity, cue.milliseconds);
    }
    for (const e of message.events) {
      if (e.type === 'interaction.hit') {
        const data = e.data as Record<string, unknown>;
        el('judgement').textContent = String(data.grade).toUpperCase();
        el('judgement').style.color = '#72f4df';
        lastFeedback = performance.now();
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
    if (message.clock.phase === 'stalled' && lastClockPhase !== 'stalled') pause(true);
    if (message.clock.phase === 'paused' && playback.running && lastClockPhase === 'running')
      pause(true);
    if (view.finished && playback.finish(message.loadId)) showResults();
    lastClockPhase = message.clock.phase;
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
    if (playback.autoplay) {
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
button('play', () => void start(false));
button('watch', () => void start(true));
button('pause', () => pause());
button('resume', resume);
button('restart', () => void start(playback.autoplay));
button('again', () => void start(playback.autoplay));
button('home', home);
button('results-home', home);
button('sound', () => {
  audio.enabled = !audio.enabled;
  narrator.muted = !audio.enabled;
  if (!audio.enabled) narrator.stop();
  audio.rebase();
  void prepareAudio();
  savePreferences();
  el('sound').textContent = audio.enabled ? 'Sound on' : 'Sound off';
  drawMenu();
});
button('help', () => {
  if (playback.canPause) pause();
  closeAudioDialogs();
  el('help-panel').hidden = false;
});
button('close-help', () => (el('help-panel').hidden = true));
button('settings', () => {
  if (playback.canPause) pause();
  closeAudioDialogs();
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
button('export-replay', () => {
  const id = ++exportSequence;
  pendingExports.set(id, (replay) => {
    const blob = new Blob([JSON.stringify(replay, null, 2)], { type: 'application/json' }),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = `statebeats-${replay.map.id}-replay.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  send({ type: 'export', requestId: id });
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playback.canPause) pause();
});
const desktop = createDesktopControls({
  orbit,
  playback,
  view: () => view,
  swap: () => swap,
  height: () => activeHeight,
  prepareAudio,
  pause,
  resume,
  openSpokenMenu,
});
const xr = createXRControls({
  orbit,
  canPause: () => playback.canPause,
  hasSession: () => playback.playing || playback.loading,
  canResume: () => playback.resumable,
  pause,
  resume,
  home,
  spokenEnabled: () => audio.nonvisualEnabled,
  activateSpoken: () => spoken.activate(),
  openSpokenMenu,
  moveSpoken,
  readSpokenMenu: () => {
    refreshSpokenMenu();
    spoken.read();
  },
  closeDialogs: closeAudioDialogs,
  menuVisible: () => menu.visible,
  showMenu: () => {
    menu.visible = true;
  },
  hideMenu: () => {
    menu.visible = false;
  },
  placeMenu,
  pointMenu: (ray) => {
    const hit = ray.intersectObject(menu)[0];
    if (!hit?.uv) return;
    const x = hit.uv.x * 1024,
      y = (1 - hit.uv.y) * 1024;
    menuRects.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)?.action();
  },
  prepareAudio,
  notify,
});
let lastCue = '';
const tracking = new TrackingGuard();
orbit.renderer.setAnimationLoop((time, frame) => {
  const dt = lastFrame ? Math.min(0.05, (time - lastFrame) / 1000) : 0.016;
  if (lastFrame) {
    frameTimes.push(time - lastFrame);
    if (frameTimes.length > 90) frameTimes.shift();
  }
  lastFrame = time;
  orbit.idle(time / 1000);
  desktop.updateCamera(dt);
  const head = headPose();
  audio.pose(sceneVector(head.position), sceneVector(head.forward));
  if (playback.playing && playback.running && !playback.autoplay) {
    const samples: HandSample[] = [];
    if (orbit.renderer.xr.isPresenting) {
      samples.push(...xr.sampleHands());
      if (audio.nonvisualEnabled) {
        const space = orbit.renderer.xr.getReferenceSpace();
        const trackedHead = !!(frame && space && frame.getViewerPose(space));
        if (tracking.interrupted(time, trackedHead, samples)) {
          pause(true);
          tracking.reset();
        }
      }
    } else {
      samples.push(...desktop.sampleHands(dt));
    }
    samples.push({
      id: 'head',
      position: sceneVector(head.position),
      orientation: head.quaternion.toArray() as Quat,
      tracked: true,
      active: true,
    });
    if (playback.running)
      send({ type: 'poses', samples, sentAt: performance.timeOrigin + performance.now() });
  } else tracking.reset();
  if (view && playback.playing) {
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
    el('direction-cue').hidden = !cue || !playback.running;
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
    cueMesh.visible = orbit.renderer.xr.isPresenting && playback.running && !!cue;
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
  xr.showRays(menu.visible);
  orbit.render();
});
function savePreferences() {
  storePreferences({
    sound: audio.enabled,
    music: audio.musicEnabled,
    cues: audio.cuesEnabled,
    effects: audio.effectsEnabled,
    nonvisual: audio.nonvisualEnabled,
    narration: narrator.enabled,
    handBeacons: audio.handBeacons,
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
audio.nonvisualEnabled = preferences.nonvisual;
narrator.enabled = preferences.narration;
audio.handBeacons = preferences.handBeacons;
el<HTMLSelectElement>('hand-beacons').value = preferences.handBeacons;
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
  'nonvisual-enabled': preferences.nonvisual,
  'narration-enabled': preferences.narration,
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
const requestedMap = new URLSearchParams(location.search).get('map');
selectMap(sampleMaps.some((map) => map.id === requestedMap) ? requestedMap! : 'tutorial');
el<HTMLButtonElement>('play').disabled = true;
el<HTMLButtonElement>('watch').disabled = true;
send({ type: 'load', loadId: 0, mapId: 'tutorial', autoplay: false });
addEventListener('pagehide', () => {
  narrator.stop();
  stopHaptics();
  authoring.dispose();
  worker.terminate();
  void audio.dispose();
  orbit.dispose();
});
