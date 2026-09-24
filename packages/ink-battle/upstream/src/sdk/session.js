import { createState } from '../core/state.js';
import { RULES_VERSION, TICK_RATE } from '../core/constants.js';
import { applyCommand, commandError } from '../core/commands.js';
import { step } from '../core/engine.js';
import { chooseAction } from '../core/opponent.js';
import { TABLETOP_RULES_VERSION } from '../core/battlefield.js';

function boundedInteger(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${label}`);
}
function cleanCommand(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error('Invalid command');
  const fields = { unit: ['index', 'z'], guide: ['id', 'x', 'z'], turret: ['index'], upgrade: ['stat'], sell: ['slot'], slot: [], evolve: [], special: [] };
  if (!Object.hasOwn(fields, c.type)) throw new Error('Unknown command type');
  if (Object.keys(c).some(k => k !== 'type' && !fields[c.type].includes(k))) throw new Error('Unknown command field');
  return structuredClone(c);
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function digest(value) {
  let hash = 2166136261;
  for (const char of canonical(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Local trusted host. Call client(team) to bind player commands; time remains host-owned. */
export class Session {
  #state;
  #options;
  #log = [];
  #receipts = new Map();
  constructor(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Invalid options');
    if (Object.keys(options).some(k => !['seed', 'difficulty', 'startAge', 'opponent', 'battlefield'].includes(k))) throw new Error('Unknown option');
    this.#state = createState(options);
    this.#options = { seed: this.#state.seed, difficulty: this.#state.difficulty, startAge: this.#state.player.age, opponent: this.#state.opponent.enabled };
    if (this.#state.battlefield) this.#options.battlefield = this.#state.battlefield;
  }
  observe() { const observation = structuredClone(this.#state); observation.events = []; return observation; }
  get tick() { return this.#state.tick; }
  get running() { return this.#state.running; }
  get paused() { return this.#state.paused; }
  get winner() { return this.#state.winner; }
  legal(team, command) { return !commandError(this.#state, team, cleanCommand(command)); }
  decide(team = 1, style = 'adaptive') {
    if (![1, -1].includes(team) || !['adaptive', 'mixed', 'melee', 'ranged', 'heavy', 'turtle', 'passive'].includes(style)) throw new Error('Invalid policy');
    return chooseAction(this.#state, team, style);
  }
  command(team, command, requestId) {
    const c = cleanCommand(command);
    return this.#once(requestId, { team, command: c }, () => {
      const result = applyCommand(this.#state, team, c);
      if (result.ok) this.#record('command', { team, command: c });
      return result;
    });
  }
  client(team) {
    if (team !== 1 && team !== -1) throw new Error('Invalid team');
    return Object.freeze({ observe: () => this.observe(), command: (c, id) => this.command(team, c, id), legal: c => this.legal(team, c) });
  }
  advance(ticks, { events = true } = {}) {
    boundedInteger(ticks, 0, 36000, 'tick count');
    const output = events ? this.#state.events.splice(0) : [];
    this.#state.events.length = 0;
    for (let i = 0; i < ticks; i++) {
      if (!step(this.#state)) break;
      if (events) output.push(...this.#state.events);
      this.#state.events.length = 0;
    }
    return { tick: this.tick, events: output, running: this.running };
  }
  advanceOnce(requestId, ticks) { return this.#once(requestId, { advance: ticks }, () => this.advance(ticks)); }
  pause(paused) {
    if (typeof paused !== 'boolean') throw new Error('Invalid pause');
    this.#state.paused = paused; this.#record('pause', { paused });
  }
  agreements(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['noSpecials', 'noTurrets', 'meleeOnly'].includes(k) || typeof value[k] !== 'boolean')) throw new Error('Invalid agreements');
    Object.assign(this.#state.agreements, value); this.#record('agreements', { value: structuredClone(value) });
  }
  truce(seconds) {
    boundedInteger(seconds, 0, 300, 'truce');
    this.#state.restraintUntil = seconds ? Math.max(this.#state.restraintUntil, this.tick + seconds * TICK_RATE) : 0;
    this.#record('truce', { seconds });
  }
  emotion(word) {
    if (typeof word !== 'string' || !word.trim() || word.length > 80) throw new Error('Invalid emotion');
    this.#state.opponent.emotion = word.trim(); this.#record('emotion', { word: word.trim() });
  }
  #record(type, data) { this.#log.push({ tick: this.tick, type, ...data }); }
  #once(id, input, operation) {
    if (id === undefined) return operation();
    if (typeof id !== 'string' || !id || id.length > 128) throw new Error('Invalid request id');
    const fingerprint = canonical(input), old = this.#receipts.get(id);
    if (old) { if (old.fingerprint !== fingerprint) throw new Error('Request id conflict'); return structuredClone(old.result); }
    if (this.#receipts.size >= 10000) throw new Error('Request receipt limit reached; start a new session');
    const result = operation(); this.#receipts.set(id, { fingerprint, result: structuredClone(result) });
    return result;
  }
  digest() { return digest(this.observe()); }
  replay() { return { version: this.#state.version, options: structuredClone(this.#options), ticks: this.tick, entries: structuredClone(this.#log), digest: this.digest() }; }
  checkpoint() { return { replay: this.replay(), receipts: structuredClone([...this.#receipts]) }; }
  static restore(checkpoint) {
    if (!checkpoint || !Array.isArray(checkpoint.receipts) || checkpoint.receipts.length > 10000) throw new Error('Invalid checkpoint');
    const session = Session.fromReplay(checkpoint.replay);
    // Checkpoints are trusted local host continuation, not network credentials.
    session.#receipts = new Map(structuredClone(checkpoint.receipts));
    return session;
  }
  static fromReplay(replay) {
    if (!replay || ![RULES_VERSION, TABLETOP_RULES_VERSION].includes(replay.version) || !Array.isArray(replay.entries) || replay.entries.length > 250000) throw new Error('Unsupported replay');
    boundedInteger(replay.ticks, 0, 5184000, 'replay duration');
    const session = new Session(replay.options);
    if (session.#state.version !== replay.version) throw new Error('Replay battlefield mismatch');
    const advanceTo = tick => {
      boundedInteger(tick, session.tick, replay.ticks, 'entry tick');
      while (session.tick < tick) {
        const before = session.tick;
        session.advance(Math.min(36000, tick - before), { events: false });
        if (session.tick === before) throw new Error('Replay advances a paused or ended match');
      }
    };
    for (const entry of replay.entries) {
      advanceTo(entry.tick);
      switch (entry.type) {
        case 'command': if (!session.command(entry.team, entry.command).ok) throw new Error('Illegal replay command'); break;
        case 'pause': session.pause(entry.paused); break;
        case 'agreements': session.agreements(entry.value); break;
        case 'truce': session.truce(entry.seconds); break;
        case 'emotion': session.emotion(entry.word); break;
        default: throw new Error('Unknown replay entry');
      }
    }
    advanceTo(replay.ticks);
    if (session.digest() !== replay.digest) throw new Error('Replay digest mismatch');
    return session;
  }
}
