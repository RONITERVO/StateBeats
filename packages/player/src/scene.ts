import * as THREE from 'three';
import type { Observation } from '@statebeats/sdk';
import type { Vec3 } from '@statebeats/core';
import { ThemeLayer } from './themes.js';
import { createAppearance, applyPresence } from './appearances.js';
import { createPathGuide } from './target-guide.js';
import type { TargetGuide } from './target-guide.js';
import type { TargetAppearance } from './appearances.js';
const cyan = 0x72f4df,
  coral = 0xff9b79,
  gold = 0xf7d181;
export class OrbitScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.03, 1500);
  readonly renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  readonly targets = new THREE.Group();
  readonly hands = [
    new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 12, 8),
      new THREE.MeshBasicMaterial({ color: cyan }),
    ),
    new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 12, 8),
      new THREE.MeshBasicMaterial({ color: coral }),
    ),
  ];
  readonly aim = new THREE.Group();
  readonly theme = new ThemeLayer(this.scene);
  private reference = new THREE.Group();
  private labelMaterials = new Map<string, THREE.SpriteMaterial>();
  private label(text: string) {
    let material = this.labelMaterials.get(text);
    if (!material) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#07101ee8';
      context.beginPath();
      context.arc(64, 64, 54, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffffff';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = 'bold 72px sans-serif';
      context.fillText(text, 64, 66);
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      material = new THREE.SpriteMaterial({ map, depthTest: false });
      this.labelMaterials.set(text, material);
    }
    // Share the texture, but not opacity: simultaneous notes may have different lifecycles.
    const sprite = new THREE.Sprite(material.clone());
    sprite.name = 'requirement';
    sprite.scale.set(0.15, 0.15, 1);
    sprite.position.y = 0.24;
    sprite.renderOrder = 5;
    return sprite;
  }
  private objects = new Map<string, THREE.Group>();
  private guides = new Map<THREE.Group, TargetGuide>();
  private appearances = new Map<THREE.Group, TargetAppearance>();
  private ambient = new THREE.Group();
  private resize = () => {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  };
  private torus = new THREE.TorusGeometry(0.16, 0.012, 6, 36);
  private sphere = new THREE.IcosahedronGeometry(0.13, 1);
  private ringMaterial = new THREE.MeshBasicMaterial({
    color: cyan,
    transparent: true,
    opacity: 0.7,
  });
  constructor(container: HTMLElement) {
    this.scene.add(this.reference);
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.setClearColor(0x080d17);
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local-floor');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.append(this.renderer.domElement);
    this.scene.fog = new THREE.FogExp2(0x080d17, 0.043);
    this.scene.add(new THREE.HemisphereLight(0xb7e7ef, 0x102030, 2));
    const light = new THREE.PointLight(0x73e8d7, 18, 12);
    light.position.set(0, 3, -1);
    this.scene.add(light);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 80),
      new THREE.MeshBasicMaterial({ color: 0x0a1320 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.012;
    this.reference.add(floor);
    const grid = new THREE.GridHelper(50, 50, 0x25424f, 0x132538);
    grid.material.transparent = true;
    grid.material.opacity = 0.6;
    this.reference.add(grid);
    for (const radius of [0.7, 1.4, 3, 5, 8]) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.004, 4, 128),
        new THREE.MeshBasicMaterial({ color: 0x345767, transparent: true, opacity: 0.35 }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.002;
      this.reference.add(ring);
    }
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 12,
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.012, 0.045, 0.08),
          new THREE.MeshBasicMaterial({
            color: i % 3 === 0 ? cyan : 0x3e6470,
            transparent: true,
            opacity: 0.5,
          }),
        );
      mesh.position.set(Math.sin(a) * 1.45, 0.025, -Math.cos(a) * 1.45);
      mesh.rotation.y = -a;
      this.reference.add(mesh);
    }
    const pos: number[] = [];
    for (let i = 0; i < 350; i++) {
      const x = Math.sin(i * 127.1) * 43758.5453,
        y = Math.sin(i * 311.7) * 15731.743,
        z = Math.sin(i * 74.7) * 7892.143;
      pos.push(
        (((x % 1) + 1) % 1) * 45 - 22.5,
        (((y % 1) + 1) % 1) * 18 + 2,
        (((z % 1) + 1) % 1) * 45 - 22.5,
      );
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.reference.add(
      new THREE.Points(
        starGeometry,
        new THREE.PointsMaterial({ color: 0x85b1ca, size: 0.025, transparent: true, opacity: 0.5 }),
      ),
    );
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.3 + i * 0.22, 0.008, 6, 100),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? coral : cyan,
          transparent: true,
          opacity: 0.12 + i * 0.025,
        }),
      );
      ring.rotation.set(i * 0.12, i * 0.28, 0);
      this.ambient.add(ring);
    }
    this.ambient.position.set(0.5, 1.6, -1.5);
    this.scene.add(this.ambient);
    this.scene.add(this.targets, ...this.hands);
    this.hands.forEach((h) => (h.visible = false));
    const aimRing = new THREE.Mesh(
      new THREE.RingGeometry(0.009, 0.012, 24),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      }),
    );
    this.aim.add(aimRing);
    this.aim.visible = false;
    this.scene.add(this.aim);
    this.camera.position.set(0, 1.6, 3.4);
    this.camera.lookAt(0.25, 1.45, -1.5);
    addEventListener('resize', this.resize);
  }
  setPlaying(value: boolean) {
    this.theme.root.visible = value && !this.reference.visible;
    this.ambient.visible = !value;
    this.targets.visible = value;
    this.hands.forEach((h) => (h.visible = value));
  }
  clear() {
    this.theme.clear();
    this.reference.visible = true;
    this.scene.fog = new THREE.FogExp2(0x080d17, 0.043);
    for (const object of this.objects.values()) this.disposeTarget(object);
    this.objects.clear();
  }
  private disposeTarget(object: THREE.Group) {
    const guide = this.guides.get(object);
    if (guide) {
      object.remove(guide.object);
      guide.dispose();
      this.guides.delete(object);
    }
    const appearance = this.appearances.get(object);
    if (appearance) {
      object.remove(appearance.object);
      appearance.dispose();
      this.appearances.delete(object);
    }
    this.targets.remove(object);
    object.traverse((child) => {
      if (child instanceof THREE.Sprite) child.material.dispose();
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        if (child instanceof THREE.InstancedMesh) child.dispose();
        if (child.geometry !== this.torus && child.geometry !== this.sphere)
          child.geometry.dispose();
        if (child.material instanceof THREE.Material && child.material !== this.ringMaterial)
          child.material.dispose();
      }
    });
  }
  update(view: Observation, hideTargets = false) {
    this.theme.update(view);
    this.reference.visible = !view.scene;
    this.scene.fog = view.scene ? null : (this.scene.fog ?? new THREE.FogExp2(0x080d17, 0.043));
    const entities = [...view.entities, ...(view.resolvedEntities ?? [])];
    const ids = new Set(entities.map((e) => e.id));
    for (const [id, obj] of this.objects) {
      if (!ids.has(id)) {
        this.disposeTarget(obj);
        this.objects.delete(id);
      }
    }
    this.targets.visible = !hideTargets;
    for (const entity of entities) {
      let group = this.objects.get(entity.id);
      const semantic = entity.slots[0]?.semantic,
        color =
          entity.kind === 'hazard'
            ? 0xff5262
            : entity.slots.length > 1
              ? gold
              : semantic === 'left'
                ? cyan
                : semantic === 'right'
                  ? coral
                  : 0xddeaff;
      if (!group) {
        group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.4,
          roughness: 0.3,
          metalness: 0.3,
          transparent: true,
          opacity: entity.kind === 'hazard' ? 0.23 : 0.72,
        });
        let geometry: THREE.BufferGeometry;
        if (entity.shape.kind === 'box') {
          geometry = new THREE.BoxGeometry(
            ...(entity.shape.half.map((v) => v * 2) as [number, number, number]),
          );
        } else if (entity.shape.kind === 'capsule') {
          const length = new THREE.Vector3(...entity.shape.a).distanceTo(
            new THREE.Vector3(...entity.shape.b),
          );
          geometry = new THREE.CapsuleGeometry(entity.shape.radius, length, 4, 8);
        } else geometry = new THREE.IcosahedronGeometry(entity.shape.radius, 1);
        const body = new THREE.Mesh(geometry, mat);
        body.name = 'body';
        if (entity.shape.kind === 'box' && entity.shape.rotation)
          body.quaternion.fromArray(entity.shape.rotation);
        if (entity.shape.kind === 'capsule') {
          const a = new THREE.Vector3(...entity.shape.a),
            b = new THREE.Vector3(...entity.shape.b);
          body.position.copy(a).add(b).multiplyScalar(0.5);
          body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
        }
        group.add(body);
        const ring = new THREE.Mesh(
          this.torus,
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }),
        );
        ring.name = 'timing';
        group.add(ring);
        const core = new THREE.Mesh(
          this.sphere,
          new THREE.MeshBasicMaterial({ color, transparent: true }),
        );
        core.scale.setScalar(0.3);
        core.name = 'core';
        group.add(core);
        group.add(
          this.label(
            entity.kind === 'hazard'
              ? '!'
              : entity.kind === 'hold'
                ? 'H'
                : entity.slots.length > 1
                  ? '2'
                  : semantic === 'left'
                    ? 'L'
                    : semantic === 'right'
                      ? 'R'
                      : '•',
          ),
        );
        const appearance = createAppearance(entity, color);
        if (appearance) {
          this.appearances.set(group, appearance);
          group.add(appearance.object);
        }
        const guide =
          appearance?.guide ??
          (entity.presentation?.guide === 'none' ? undefined : createPathGuide(color));
        if (guide) {
          // Even a suppressed custom guide belongs to the scene for eventual cleanup.
          this.guides.set(group, guide);
          if (entity.presentation?.guide !== 'none') group.add(guide.object);
        }
        this.targets.add(group);
        this.objects.set(entity.id, group);
      }
      group.position.fromArray(entity.position);
      group.quaternion.fromArray(entity.orientation);
      if (entity.presentation?.guide !== 'none')
        this.guides.get(group)?.update(entity, view, this.theme.preferences);
      const cue = entity.presentation;
      const visibility = cue?.visibility ?? 1;
      const resolved = cue?.phase === 'resolved';
      group.visible = visibility > 0;
      const requirement = group.getObjectByName('requirement') as THREE.Sprite;
      requirement.visible = !resolved;
      requirement.material.opacity = visibility;
      const remain = (entity.hitTick - view.tick) / view.tickRate;
      const timing = group.getObjectByName('timing') as THREE.Mesh;
      timing.visible = !resolved;
      (timing.material as THREE.MeshBasicMaterial).opacity = 0.8 * visibility;
      timing.scale.setScalar(1 + Math.max(0, Math.min(2, remain)) * 2);
      timing.quaternion.copy(
        this.renderer.xr.isPresenting
          ? this.renderer.xr.getCamera().quaternion
          : this.camera.quaternion,
      );
      timing.quaternion.premultiply(group.quaternion.clone().invert());
      const core = group.getObjectByName('core')!;
      core.visible = !resolved;
      ((core as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = visibility;
      core.scale.setScalar(
        entity.kind === 'hold'
          ? 0.3 + (0.5 * entity.hold) / entity.holdTicks
          : 0.25 + Math.max(0, 1 - Math.abs(remain) * 3) * 0.3,
      );
      const body = group.getObjectByName('body') as THREE.Mesh;
      const material = body.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = remain > 0 ? 0.3 : 0.8;
      material.opacity = this.theme.preferences.highContrast
        ? entity.kind === 'hazard'
          ? 0.55
          : 1
        : entity.appearance === 'statebeats/bird'
          ? 0.12
          : entity.kind === 'hazard'
            ? 0.23
            : 0.72;
      material.opacity *= visibility;
      const appearance = this.appearances.get(group);
      if (appearance) {
        const update = () => appearance.update?.(entity, view, this.theme.preferences);
        if (appearance.handlesPresence) update();
        else applyPresence(appearance.object, visibility, update);
      }
    }
  }
  idle(seconds: number) {
    this.ambient.rotation.y = seconds * 0.035;
    this.ambient.rotation.z = Math.sin(seconds * 0.12) * 0.15;
  }
  render() {
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.theme.dispose();
    removeEventListener('resize', this.resize);
    this.renderer.setAnimationLoop(null);
    this.clear();
    this.torus.dispose();
    this.sphere.dispose();
    this.ringMaterial.dispose();
    this.labelMaterials.forEach((material) => {
      material.map?.dispose();
      material.dispose();
    });
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Points ||
        object instanceof THREE.LineSegments
      ) {
        geometries.add(object.geometry);
        for (const m of Array.isArray(object.material) ? object.material : [object.material])
          materials.add(m);
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    this.renderer.dispose();
  }
}
export function sceneVector(v: THREE.Vector3): Vec3 {
  return [v.x, v.y, v.z];
}
