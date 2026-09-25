import * as THREE from 'three';
import type { Vec3 } from '@statebeats/core';
import type { Observation } from '@statebeats/sdk';
import type { Playback } from './playback.js';
import type { HandSample } from './protocol.js';
import { OrbitScene, sceneVector } from './scene.js';
import { assistedTargetPoint } from './desktop-input.js';
interface DesktopHost {
  orbit: OrbitScene;
  playback: Pick<
    Playback,
    'playing' | 'running' | 'canPause' | 'resumable' | 'autoplay' | 'acceptsInput'
  >;
  view(): Observation | undefined;
  swap(): boolean;
  height(): number;
  prepareAudio(): Promise<void>;
  pause(): void;
  resume(): void;
  openSpokenMenu(): void;
}
/** Owns pointer/keyboard gestures and spectator camera; submits no scoring shortcuts. */
export function createDesktopControls(host: DesktopHost) {
  const { orbit, playback } = host;
  let desktopYaw = 0;
  const targetMouse = new THREE.Vector2(0, 0),
    raycaster = new THREE.Raycaster();
  let desktopHeld = [false, false],
    handTargets = [new THREE.Vector3(-0.3, 1.1, -0.2), new THREE.Vector3(0.3, 1.1, -0.2)];
  orbit.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  let activeDesktopHand = 0;
  let desktopPitch = 0;
  // A held gesture begun during preparation must still be held when playback starts.
  const acceptsDesktopInput = () => playback.acceptsInput;
  orbit.renderer.domElement.addEventListener('pointermove', (e) => {
    targetMouse.set((e.clientX / innerWidth) * 2 - 1, (-e.clientY / innerHeight) * 2 + 1);
    if (acceptsDesktopInput() && desktopHeld[activeDesktopHand])
      handTargets[activeDesktopHand].copy(desktopAim(activeDesktopHand));
  });
  orbit.renderer.domElement.addEventListener('pointerdown', (e) => {
    if (!acceptsDesktopInput()) return;
    void host.prepareAudio();
    if (e.button !== 0 && e.button !== 2) return;
    const hand = (e.button === 0 ? 0 : 1) ^ (host.swap() ? 1 : 0);
    desktopHeld[hand] = true;
    activeDesktopHand = hand;
    const target = desktopAim(hand);
    handTargets[hand].copy(target);
    orbit.hands[hand].position.copy(target);
  });
  window.addEventListener('pointerup', (e) => {
    if (e.button !== 0 && e.button !== 2) return;
    desktopHeld[(e.button === 0 ? 0 : 1) ^ (host.swap() ? 1 : 0)] = false;
  });
  const keys = new Set<string>();
  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.code === 'KeyM') {
      e.preventDefault();
      host.openSpokenMenu();
      return;
    }
    if ((e.target as HTMLElement).closest('dialog[open]')) return;
    if ((e.target as HTMLElement).matches('input,select')) return;
    keys.add(e.code);
    if (playback.playing && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) e.preventDefault();
    if (e.code === 'Escape') {
      if (playback.canPause) host.pause();
      else if (playback.resumable) host.resume();
    }
    if (e.code === 'Space' && !e.repeat && playback.playing) {
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
    const view = host.view();
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

  return {
    reset() {
      desktopYaw = 0;
      desktopPitch = 0;
      desktopHeld = [false, false];
      keys.clear();
      handTargets = [new THREE.Vector3(-0.3, 1.1, -0.2), new THREE.Vector3(0.3, 1.1, -0.2)];
    },
    updateCamera(dt: number) {
      const view = host.view();
      if (playback.playing && !orbit.renderer.xr.isPresenting) {
        if (playback.autoplay && view) {
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
        if (playback.autoplay) {
          // Spectator framing shows both hands and the stage; it never alters actor poses.
          orbit.camera.position.set(
            Math.sin(desktopYaw) * 0.85,
            host.height() + 0.12,
            Math.cos(desktopYaw) * 0.85,
          );
        } else orbit.camera.position.y = keys.has('KeyC') ? host.height() * 0.61 : host.height();
        orbit.aim.visible = playback.running && !playback.autoplay;
        orbit.aim.position.copy(desktopAim());
        orbit.aim.quaternion.copy(orbit.camera.quaternion);
      } else orbit.aim.visible = false;
    },
    sampleHands(dt: number) {
      const samples: HandSample[] = [];
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
      return samples;
    },
  };
}
