import { AUDIO_TUTORIAL_ID } from '@statebeats/content';
import type { MapDefinition } from '@statebeats/sdk';
import { RhythmAudio, DEFAULT_AUDIO_MIX } from './audio.js';
import type { HandBeaconMode } from './hand-audio.js';
import { Narrator, SpokenMenu, AUDIO_LESSON } from './spoken-controls.js';
import { el, button } from './dom.js';
interface AccessibilityHost {
  audio: RhythmAudio;
  immersive(): boolean;
  canPause(): boolean;
  canResume(): boolean;
  selection(): MapDefinition;
  maps(): MapDefinition[];
  selectMap(id: string): void;
  start(): void;
  resume(): void;
  pause(): void;
  home(): void;
  headHeight(): number;
  roomScale(): number;
  setHeight(value: number): void;
  setRoomScale(value: number): void;
  savePreferences(): void;
  prepareAudio(): Promise<void>;
  showVRMenu(): void;
  redraw(): void;
  exitVR(): void;
}
/** Owns spoken choices, narration and setup. Requests playback actions through its host. */
export function createAccessibility(host: AccessibilityHost) {
  const audio = host.audio;
  const narrator = new Narrator(el('spoken-status'));
  const spoken = new SpokenMenu((text) => {
    el('spoken-choice').textContent = text;
    announce(text);
  });
  function announce(text: string) {
    narrator.muted = !audio.enabled;
    narrator.speak(text);
  }
  function closeAudioDialogs() {
    for (const id of ['audio-setup', 'spoken-menu']) el<HTMLDialogElement>(id).close();
  }
  function measureHeight() {
    if (!host.immersive()) {
      announce(
        'Enter immersive VR, stand upright, then choose measure height. You can also enter height in Settings.',
      );
      return;
    }
    const height = host.headHeight();
    if (!Number.isFinite(height) || height < 1 || height > 2.3) {
      announce('Headset floor height is unavailable. Enter your height in Settings.');
      return;
    }
    host.setHeight(Math.round(height * 100) / 100);
    host.savePreferences();
    announce(
      `Headset eye height is ${Math.round(height * 100)} centimetres. This sets target height on your next start. Face forward when starting to set the centre.`,
    );
  }
  function refreshSpokenMenu() {
    spoken.set([
      {
        id: 'play',
        label: host.canResume() ? 'Resume sequence' : `Play ${host.selection().title}`,
        run: () => {
          if (host.canResume()) host.resume();
          else host.start();
        },
      },
      {
        id: 'restart',
        label: 'Face forward, recenter and restart selected sequence',
        run: () => host.start(),
      },
      { id: 'height', label: 'Measure headset eye height for target height', run: measureHeight },
      {
        id: 'scale-down',
        label: `Smaller reach. Room scale ${host.roomScale().toFixed(2)}`,
        run: () => adjustReach(-0.1),
      },
      {
        id: 'scale-up',
        label: `Larger reach. Room scale ${host.roomScale().toFixed(2)}`,
        run: () => adjustReach(0.1),
      },
      { id: 'learn', label: 'Explain sounds and controls', run: () => announce(AUDIO_LESSON) },
      ...host.maps().map((map) => ({
        id: map.id,
        label: `Select ${map.title}`,
        run: () => {
          host.selectMap(map.id);
          refreshSpokenMenu();
          announce(
            `${map.title} selected. ${map.id === AUDIO_TUTORIAL_ID ? 'Sparse targets, no turns or hazards.' : 'This map was not designed or tested for nonvisual play.'} Choose Play to start.`,
          );
        },
      })),
      { id: 'home', label: 'Return to library', run: host.home },
      {
        id: 'exit',
        label: 'Exit immersive VR',
        run: () => {
          host.exitVR();
        },
      },
    ]);
  }
  function adjustReach(delta: number) {
    host.setRoomScale(
      Math.round(Math.max(0.5, Math.min(1.75, host.roomScale() + delta)) * 100) / 100,
    );
    host.savePreferences();
    refreshSpokenMenu();
    host.redraw();
    announce(`Room scale ${host.roomScale().toFixed(2)}. Applies on your next start.`);
  }
  function showSpokenMenu() {
    closeAudioDialogs();
    refreshSpokenMenu();
    if (host.immersive()) {
      host.showVRMenu();
    } else {
      el<HTMLDialogElement>('spoken-menu').showModal();
      el('spoken-choice').focus();
    }
    spoken.read();
  }
  function openSpokenMenu() {
    if (host.canPause()) {
      host.pause();
      if (audio.nonvisualEnabled) return;
    }
    showSpokenMenu();
  }
  function moveSpoken(direction: number) {
    spoken.move(direction);
    host.redraw();
  }

  button('audio-setup-open', () => {
    if (host.canPause()) host.pause();
    closeAudioDialogs();
    el<HTMLDialogElement>('audio-setup').showModal();
    el('audio-enable').focus();
    el('speech-support').textContent = narrator.available
      ? 'Browser speech is available. Voice support in immersive VR varies. Blind-player and headset listening tests are still needed.'
      : 'This browser has no speech synthesis. Use a screen reader for the HTML controls; spoken controls inside VR require browser speech.';
  });
  button('audio-enable', () => {
    audio.enabled = audio.cuesEnabled = audio.nonvisualEnabled = narrator.enabled = true;
    if (audio.mix.guidance === 0) {
      audio.setMix({ guidance: DEFAULT_AUDIO_MIX.guidance });
      const percent = Math.round(audio.mix.guidance * 100);
      el<HTMLInputElement>('guidance-volume').value = String(percent);
      el('guidance-volume-value').textContent = percent + '%';
    }
    for (const id of ['nonvisual-enabled', 'narration-enabled', 'cues-enabled'])
      el<HTMLInputElement>(id).checked = true;
    el('sound').textContent = 'Sound on';
    void host.prepareAudio();
    host.savePreferences();
    announce(
      'Audio-led guidance enabled. Choose Explain sounds and controls before playing. Press Alt M for the spoken menu. In VR, grip opens the menu.',
    );
  });
  button('audio-learn', () => announce(AUDIO_LESSON));
  button('audio-tutorial', () => {
    host.selectMap(AUDIO_TUTORIAL_ID);
    announce(
      'Finding the pulse selected. Choose Done, then Play; or enter immersive VR. Face forward when starting.',
    );
  });
  button('audio-measure', measureHeight);
  button('audio-enter-vr', () => {
    if (el<HTMLButtonElement>('enter-vr').disabled)
      announce('Immersive VR is unavailable. Open this page in your headset browser.');
    else el('enter-vr').click();
  });
  button('audio-setup-close', () => {
    closeAudioDialogs();
    narrator.stop();
  });
  button('spoken-previous', () => moveSpoken(-1));
  button('spoken-next', () => moveSpoken(1));
  button('spoken-activate', () => spoken.activate());
  button('spoken-repeat', () => spoken.read());
  button('spoken-close', () => {
    closeAudioDialogs();
    narrator.stop();
  });
  el('spoken-menu').addEventListener('keydown', (event) => {
    const e = event as KeyboardEvent;
    if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(e.code)) {
      e.preventDefault();
      moveSpoken(['ArrowLeft', 'ArrowUp'].includes(e.code) ? -1 : 1);
    } else if (e.code === 'Enter' && e.target === el('spoken-choice')) {
      e.preventDefault();
      spoken.activate();
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      spoken.read();
    }
  });
  for (const id of ['audio-setup', 'spoken-menu'])
    el(id).addEventListener('cancel', () => narrator.stop());
  el<HTMLInputElement>('nonvisual-enabled').onchange = () => {
    audio.nonvisualEnabled = el<HTMLInputElement>('nonvisual-enabled').checked;
    audio.rebase();
  };
  el<HTMLInputElement>('narration-enabled').onchange = () => {
    narrator.enabled = el<HTMLInputElement>('narration-enabled').checked;
    if (!narrator.enabled) narrator.stop();
    else announce('Spoken controls enabled. Alt M opens the menu.');
  };
  el<HTMLSelectElement>('hand-beacons').onchange = () => {
    audio.handBeacons = el<HTMLSelectElement>('hand-beacons').value as HandBeaconMode;
    audio.rebase();
  };

  return {
    narrator,
    spoken,
    announce,
    closeAudioDialogs,
    refreshSpokenMenu,
    showSpokenMenu,
    openSpokenMenu,
    moveSpoken,
  };
}
