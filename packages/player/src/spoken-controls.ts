export interface SpokenAction {
  id: string;
  label: string;
  run(): void;
}
/** One action list for DOM, keyboard and controller navigation. No ray aiming required. */
export class SpokenMenu {
  private items: SpokenAction[] = [];
  private current = 0;
  constructor(private announce: (text: string) => void) {}
  set(items: SpokenAction[]) {
    const old = this.items[this.current]?.id;
    this.items = items;
    this.current = Math.max(
      0,
      items.findIndex((item) => item.id === old),
    );
  }
  get focused() {
    return this.items[this.current];
  }
  move(direction: number) {
    if (!this.items.length) return;
    this.current = (this.current + direction + this.items.length) % this.items.length;
    this.read();
  }
  read() {
    if (this.focused)
      this.announce(`${this.current + 1} of ${this.items.length}. ${this.focused.label}`);
  }
  activate() {
    this.focused?.run();
  }
}
export class Narrator {
  enabled = false;
  muted = false;
  private last = '';
  constructor(private status: HTMLElement) {}
  get available() {
    return (
      typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'
    );
  }
  speak(text: string) {
    this.status.textContent = text;
    this.last = text;
    if (!this.enabled || this.muted || !this.available) return;
    try {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.lang = 'en';
      // Prefer on-device voices. Speech availability remains a browser capability.
      const local = speechSynthesis
        .getVoices()
        .find((v) => v.localService && /^en\b/i.test(v.lang));
      if (local) utterance.voice = local;
      speechSynthesis.speak(utterance);
    } catch {
      /* DOM status remains available. */
    }
  }
  repeat() {
    if (this.last) this.speak(this.last);
  }
  stop() {
    try {
      if (this.available) speechSynthesis.cancel();
    } catch {
      /* Optional browser capability. */
    }
  }
}
export const AUDIO_LESSON =
  'Face forward with a controller in each hand. Your left hand has a lower tone; your right hand a higher tone. A pulsing tone marks an upcoming target. Move toward it. Your hand tone settles into harmony when aligned. Alignment does not mean a hit: wait for the timing cue. For holds, follow the sound and keep the harmony. Short gentle vibrations confirm hold contact; a longer buzz means contact was lost. Grip pauses. In the spoken menu, left trigger goes back, right trigger goes forward, and either grip activates the spoken choice. The tutorial has no turns or obstacles.';
