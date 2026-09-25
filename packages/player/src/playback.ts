interface Run {
  readonly request: number;
  readonly mapId: string;
  readonly autoplay: boolean;
}
export type PlaybackState =
  | { readonly phase: 'library'; readonly request: number }
  | (Run & {
      readonly phase: 'loading';
      readonly stage: 'audio' | 'worker' | 'scene';
      readonly intent: 'play' | 'pause';
    })
  | (Run & { readonly phase: 'running' | 'paused' | 'ended' | 'error' });

/** Application transport state only. Simulation ticks and scoring belong to the worker/SDK. */
export class Playback {
  private value: PlaybackState = { phase: 'library', request: 0 };
  get state(): PlaybackState {
    return { ...this.value };
  }
  get request() {
    return this.value.request;
  }
  get running() {
    return this.value.phase === 'running';
  }
  get canPause() {
    return this.running || (this.value.phase === 'loading' && this.value.intent === 'play');
  }
  get playing() {
    return (
      this.value.phase !== 'library' &&
      !(this.value.phase === 'loading' && this.value.stage === 'audio')
    );
  }
  get loading() {
    return this.value.phase === 'loading';
  }
  get resumable() {
    return this.value.phase === 'paused' || this.value.phase === 'loading';
  }
  get autoplay() {
    return 'autoplay' in this.value && this.value.autoplay;
  }
  get mapId() {
    return 'mapId' in this.value ? this.value.mapId : '';
  }
  get acceptsInput() {
    return (
      this.playing &&
      !this.autoplay &&
      (this.running || (this.value.phase === 'loading' && this.value.intent === 'play'))
    );
  }
  begin(mapId: string, autoplay: boolean) {
    this.value = {
      phase: 'loading',
      stage: 'audio',
      intent: 'play',
      mapId,
      autoplay,
      request: this.request + 1,
    };
    return this.request;
  }
  audioReady(request: number) {
    if (this.value.phase !== 'loading' || request !== this.request || this.value.stage !== 'audio')
      return false;
    this.value = { ...this.value, stage: 'worker' };
    return true;
  }
  workerReady(request: number) {
    if (this.value.phase !== 'loading' || request !== this.request || this.value.stage !== 'worker')
      return false;
    this.value = { ...this.value, stage: 'scene' };
    return true;
  }
  sceneReady(request: number) {
    if (this.value.phase !== 'loading' || request !== this.request || this.value.stage !== 'scene')
      return false;
    const { mapId, autoplay, intent } = this.value;
    this.value = { phase: intent === 'play' ? 'running' : 'paused', request, mapId, autoplay };
    return true;
  }
  pause() {
    if (this.value.phase === 'loading') this.value = { ...this.value, intent: 'pause' };
    else if (this.value.phase === 'running') this.value = { ...this.value, phase: 'paused' };
  }
  resume() {
    if (this.value.phase === 'loading') this.value = { ...this.value, intent: 'play' };
    else if (this.value.phase === 'paused') this.value = { ...this.value, phase: 'running' };
  }
  finish(request: number) {
    if (
      request !== this.request ||
      (this.value.phase !== 'running' && this.value.phase !== 'paused')
    )
      return false;
    this.value = { ...this.value, phase: 'ended' };
    return true;
  }
  fail(request: number) {
    if (
      request !== this.request ||
      this.value.phase === 'library' ||
      this.value.phase === 'ended' ||
      this.value.phase === 'error'
    )
      return false;
    const { mapId, autoplay } = this.value;
    this.value = { request, mapId, autoplay, phase: 'error' };
    return true;
  }
  home() {
    this.value = { phase: 'library', request: this.request + 1 };
  }
}
