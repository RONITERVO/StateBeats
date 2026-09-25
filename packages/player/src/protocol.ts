import type { Command, DomainEvent, Vec3, Quat } from '@statebeats/core';
import type { ClockStatus, Observation, Replay, MapDefinition } from '@statebeats/sdk';
export interface HandSample {
  id: string;
  position: Vec3;
  orientation: Quat;
  tracked: boolean;
  active: boolean;
}
export type ToWorker =
  | {
      type: 'load';
      loadId: number;
      mapId: string;
      map?: MapDefinition;
      autoplay: boolean;
      stage?: { position: Vec3; orientation: Quat };
    }
  | { type: 'start' }
  | { type: 'frame-ack'; generation: number }
  | { type: 'pause' }
  | { type: 'speed'; value: number }
  | { type: 'poses'; samples: HandSample[]; sentAt: number }
  | { type: 'export'; requestId: number }
  | { type: 'commands'; commands: Command[]; requestId: string };
export type FromWorker =
  | {
      type: 'frame';
      view: Observation;
      events: DomainEvent[];
      overflow: boolean;
      clock: ClockStatus;
      metrics: { pumpMs: number; maxPumpMs: number; inputAgeMs: number };
      generation: number;
      loadId: number;
    }
  | { type: 'ready'; view: Observation; generation: number; loadId: number }
  | { type: 'replay'; replay: Replay; requestId: number }
  | { type: 'error'; message: string; loadId: number };
