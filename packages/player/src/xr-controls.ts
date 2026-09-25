import * as THREE from 'three';
import type { Quat } from '@statebeats/core';
import { OrbitScene, sceneVector } from './scene.js';
import { controllerSamples } from './xr-input.js';
import type { TrackedController } from './xr-input.js';
import { el, button } from './dom.js';
interface XRHost {
  orbit: OrbitScene;
  canPause(): boolean;
  hasSession(): boolean;
  canResume(): boolean;
  pause(stalled?: boolean): void;
  resume(): void;
  home(): void;
  spokenEnabled(): boolean;
  activateSpoken(): void;
  openSpokenMenu(): void;
  moveSpoken(direction: number): void;
  readSpokenMenu(): void;
  closeDialogs(): void;
  menuVisible(): boolean;
  showMenu(): void;
  hideMenu(): void;
  placeMenu(): void;
  pointMenu(ray: THREE.Raycaster): void;
  prepareAudio(): Promise<void>;
  notify(message: string): void;
}
/** Owns WebXR device/session events, controller samples and actuator calls. */
export function createXRControls(host: XRHost) {
  const orbit = host.orbit,
    raycaster = new THREE.Raycaster();
  const xrSources: (XRInputSource | undefined)[] = [];
  const controllerLines: THREE.Line[] = [];
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
      if (host.spokenEnabled()) {
        if (host.menuVisible()) host.activateSpoken();
        else host.openSpokenMenu();
        return;
      }
      if (host.menuVisible() && host.canResume()) host.resume();
      else if (host.hasSession()) host.pause();
      else {
        host.showMenu();
        host.placeMenu();
      }
    });
    controller.addEventListener('selectstart', () => {
      if (!host.menuVisible()) return;
      if (host.spokenEnabled()) {
        const hand = xrSources[i]?.handedness;
        if (hand === 'left' || hand === 'right') host.moveSpoken(hand === 'left' ? -1 : 1);
        return;
      }
      const matrix = new THREE.Matrix4().extractRotation(controller.matrixWorld);
      raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      raycaster.ray.direction.set(0, 0, -1).applyMatrix4(matrix);
      host.pointMenu(raycaster);
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
        void host.prepareAudio();
        const session = await navigator.xr!.requestSession('immersive-vr', {
          optionalFeatures: ['local-floor', 'bounded-floor'],
        });
        orbit.camera.position.set(0, 0, 0);
        orbit.camera.rotation.set(0, 0, 0);
        await orbit.renderer.xr.setSession(session);
        host.closeDialogs();
        document.body.classList.add('xr');
        if (host.hasSession()) host.pause();
        host.showMenu();
        if (host.spokenEnabled()) {
          host.readSpokenMenu();
        }
        setTimeout(() => {
          if (orbit.renderer.xr.isPresenting) host.placeMenu();
        }, 300);
        session.addEventListener('visibilitychange', () => {
          if (session.visibilityState !== 'visible' && host.canPause()) host.pause(true);
        });
        session.addEventListener('end', () => {
          document.body.classList.remove('xr');
          host.hideMenu();

          host.home();
        });
      } catch (error) {
        host.notify(String(error));
      }
    })();
  });

  return {
    sampleHands() {
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
      return controllerSamples(tracked);
    },
    showRays(visible: boolean) {
      for (const line of controllerLines) line.visible = visible;
    },
    pulse(hand: 'left' | 'right', intensity: number, duration: number) {
      const actuator = xrSources.find((source) => source?.handedness === hand)?.gamepad
        ?.hapticActuators?.[0];
      void actuator?.pulse(intensity, duration).catch(() => {});
    },
    stopHaptics() {
      for (const source of xrSources)
        void source?.gamepad?.hapticActuators?.[0]?.pulse(0, 0).catch(() => {});
    },
  };
}
