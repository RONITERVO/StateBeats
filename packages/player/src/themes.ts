import * as THREE from 'three';
import type { Observation, SceneFrame } from '@statebeats/sdk';
import { eventHorizonTheme } from './event-horizon-theme.js';
import { inkBattleTheme } from './ink-battle-theme.js';

export interface ThemePreferences {
  reducedMotion: boolean;
  highContrast: boolean;
}
export interface ThemeAdapter {
  /** An adapter may render its semantic scene objects itself, including calibration landmarks. */
  handlesObjects?: boolean;
  update(view: Observation, preferences: ThemePreferences): void;
  dispose(): void;
}
export type ThemeFactory = (root: THREE.Group) => ThemeAdapter;

/** Trusted host registration only. Map JSON selects an ID; it cannot import or execute code. */
export const themeRegistry = new Map<string, ThemeFactory>();
export function registerTheme(id: string, factory: ThemeFactory): () => void {
  if (themeRegistry.has(id)) throw new Error(`Theme already registered: ${id}`);
  themeRegistry.set(id, factory);
  return () => {
    if (themeRegistry.get(id) === factory) themeRegistry.delete(id);
  };
}
function disposeGroup(root: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Points ||
      object instanceof THREE.Line
    ) {
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material])
        materials.add(material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  root.clear();
}

class LandscapeTheme implements ThemeAdapter {
  private sky: THREE.ShaderMaterial;
  private water?: THREE.ShaderMaterial;
  private clouds = new THREE.Group();
  private stars: THREE.PointsMaterial;
  constructor(
    private root: THREE.Group,
    private space: boolean,
  ) {
    this.sky = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { energy: { value: 0 }, space: { value: space ? 1 : 0 } },
      vertexShader:
        'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `varying vec3 direction; uniform float energy; uniform float space;
        void main(){float h=clamp(normalize(direction).y,0.0,1.0);
        vec3 horizon=mix(vec3(.59,.38,.43),vec3(.025,.032,.10),space);
        vec3 zenith=mix(vec3(.035,.09,.19),vec3(.005,.008,.03),space);
        vec3 color=mix(horizon,zenith,pow(h,.4));
        color+=vec3(.025,.016,.012)*energy;
        gl_FragColor=vec4(color,1.0);}`,
    });
    root.add(new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), this.sky));
    const points: number[] = [];
    for (let i = 0; i < 650; i++) {
      const azimuth = i * 2.399963229728653,
        y = 0.02 + (((i * 37) % 649) / 649) * 0.98,
        radius = Math.sqrt(1 - y * y);
      points.push(Math.sin(azimuth) * radius * 400, y * 400, Math.cos(azimuth) * radius * 400);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    this.stars = new THREE.PointsMaterial({
      color: 0xcadfff,
      size: space ? 1.15 : 0.7,
      transparent: true,
      opacity: space ? 0.8 : 0.5,
      fog: false,
      depthWrite: false,
    });
    root.add(new THREE.Points(geometry, this.stars));
    if (!space) {
      for (let layer = 0; layer < 3; layer++) {
        const positions: number[] = [],
          radius = 100 - layer * 17;
        const height = (a: number) =>
          5 +
          8 * Math.abs(Math.sin(a * 3 + layer)) +
          9 * Math.abs(Math.sin(a * 7.5 + layer * 1.2)) +
          3 * Math.sin(a * 17);
        for (let i = 0; i < 160; i++) {
          const a = (i / 160) * Math.PI * 2,
            b = ((i + 1) / 160) * Math.PI * 2;
          const x1 = Math.sin(a) * radius,
            z1 = Math.cos(a) * radius,
            x2 = Math.sin(b) * radius,
            z2 = Math.cos(b) * radius;
          positions.push(
            x1,
            -3,
            z1,
            x1,
            height(a) - layer * 2,
            z1,
            x2,
            height(b) - layer * 2,
            z2,
            x1,
            -3,
            z1,
            x2,
            height(b) - layer * 2,
            z2,
            x2,
            -3,
            z2,
          );
        }
        const ridge = new THREE.BufferGeometry();
        ridge.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        root.add(
          new THREE.Mesh(
            ridge,
            new THREE.MeshBasicMaterial({
              color: [0x7c7189, 0x4b586f, 0x2c4054][layer],
              side: THREE.DoubleSide,
              fog: false,
            }),
          ),
        );
      }
      this.water = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: {
          time: { value: 0 },
          bass: { value: 0 },
          air: { value: 0 },
          sun: { value: new THREE.Vector2(0, -1) },
        },
        vertexShader:
          'varying vec2 waterPosition; void main(){waterPosition=vec2(position.x,-position.y);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: `varying vec2 waterPosition; uniform float time; uniform float bass; uniform float air; uniform vec2 sun;
          void main(){vec2 p=waterPosition; float d=length(p);
          float waves=sin(p.y*.65-time*1.4+sin(p.x*.7))*.5+.5;
          float shimmer=sin(p.x*3.0+p.y*7.0-time)*sin(p.y*2.0-time*.7);
          float reflection=pow(max(0.0,dot(normalize(p+vec2(.001)),sun)),38.0);
          reflection*=smoothstep(1.0,12.0,d)*(.025+.32*pow(waves,3.0)+.035*shimmer);
          vec3 color=mix(vec3(.028,.07,.115),vec3(.09,.19,.24),clamp(d/90.0,0.0,1.0));
          color+=vec3(.96,.57,.26)*reflection;
          color+=vec3(.04,.09,.12)*waves*(.5+bass*.3)*smoothstep(.7,4.0,d);
          color+=max(0.0,shimmer-.9)*air*.2;
          gl_FragColor=vec4(color,1.0);}`,
      });
      const water = new THREE.Mesh(new THREE.PlaneGeometry(300, 300, 32, 32), this.water);
      water.rotation.x = -Math.PI / 2;
      water.position.y = -0.025;
      // Keep the reference camera away from a whole row of coplanar w=0 vertices.
      water.position.z = 1.875;
      root.add(water);
      const cloudGeometry = new THREE.SphereGeometry(1, 12, 6);
      const cloudMaterial = new THREE.MeshBasicMaterial({
        color: 0xd5b7bd,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        fog: false,
      });
      for (let i = 0; i < 16; i++) {
        const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
        const a = (i / 16) * Math.PI * 2;
        cloud.position.set(Math.sin(a) * 55, 17 + (i % 4) * 2, Math.cos(a) * 55);
        cloud.scale.set(8 + (i % 3) * 2, 0.6, 2.5);
        cloud.rotation.y = -a;
        this.clouds.add(cloud);
      }
      root.add(this.clouds);
    }
    const platform = new THREE.Mesh(
      new THREE.CircleGeometry(0.65, 64),
      new THREE.MeshBasicMaterial({ color: space ? 0x141b34 : 0x1f3540 }),
    );
    platform.rotation.x = -Math.PI / 2;
    platform.position.y = -0.009;
    root.add(platform);
    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(0.66, 0.006, 4, 96),
      new THREE.MeshBasicMaterial({ color: 0xb6dad6, transparent: true, opacity: 0.45 }),
    );
    edge.rotation.x = -Math.PI / 2;
    root.add(edge);
  }
  update(view: Observation, preferences: ThemePreferences) {
    const features = view.music,
      time = preferences.reducedMotion ? 0 : view.tick / view.tickRate;
    this.sky.uniforms.energy.value = preferences.highContrast ? 0 : (features?.energy ?? 0);
    this.clouds.rotation.y = time * 0.003;
    this.stars.opacity = this.space ? 0.75 : 0.28 + (features?.air ?? 0) * 0.25;
    if (this.water) {
      this.water.uniforms.time.value = time;
      this.water.uniforms.bass.value = preferences.reducedMotion ? 0 : (features?.bass ?? 0);
      this.water.uniforms.air.value = preferences.reducedMotion ? 0 : (features?.air ?? 0);
      const sun = view.scene?.objects[0];
      if (sun)
        (this.water.uniforms.sun.value as THREE.Vector2)
          .set(sun.position[0], sun.position[2])
          .normalize();
    }
  }
  dispose() {
    disposeGroup(this.root);
  }
}
registerTheme('statebeats/landscape', (root) => new LandscapeTheme(root, false));
registerTheme('statebeats/space', (root) => new LandscapeTheme(root, true));
registerTheme('statebeats/event-horizon', eventHorizonTheme);
registerTheme('ink-battle/sketchbook-v1', inkBattleTheme);

interface SceneObjectView {
  group: THREE.Group;
  trail: THREE.Line;
  appearance: string;
}
/** Generic named-object layer plus swappable environment adapter. It reads copied observations only. */
export class ThemeLayer {
  readonly root = new THREE.Group();
  private environment = new THREE.Group();
  private objects = new Map<string, SceneObjectView>();
  private adapter?: ThemeAdapter;
  private theme = '';
  preferences: ThemePreferences = { reducedMotion: false, highContrast: false };
  constructor(scene: THREE.Scene) {
    this.root.add(this.environment);
    scene.add(this.root);
  }
  update(view: Observation) {
    const frame = view.scene;
    this.root.visible = !!frame;
    if (!frame) {
      if (this.theme) this.clear();
      return;
    }
    if (frame.theme !== this.theme) {
      this.clear();
      this.theme = frame.theme;
      const factory = themeRegistry.get(frame.theme);
      if (factory) this.adapter = factory(this.environment);
    }
    this.adapter?.update(view, this.preferences);
    const ids = new Set(frame.objects.map((object) => object.id));
    for (const [id, object] of this.objects)
      if (!ids.has(id)) {
        this.remove(object);
        this.objects.delete(id);
      }
    if (!this.adapter?.handlesObjects) for (const object of frame.objects) this.object(object);
  }
  private object(frame: SceneFrame['objects'][number]) {
    let object = this.objects.get(frame.id);
    if (object && object.appearance !== frame.appearance) {
      this.remove(object);
      object = undefined;
    }
    if (!object) {
      const group = new THREE.Group(),
        color = frame.color ?? '#ffd58a';
      const dark = frame.appearance === 'statebeats/black-hole';
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(1.15, 24, 16),
        new THREE.MeshBasicMaterial({ color: dark ? 0x060811 : color, fog: false }),
      );
      group.add(body);
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(1.35 + i * 0.19, 0.035 - i * 0.008, 6, 64),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.5 - i * 0.12,
            fog: false,
            depthWrite: false,
          }),
        );
        ring.rotation.x = dark ? 1.25 : 0.1 + i * 0.1;
        ring.rotation.y = i * 0.2;
        group.add(ring);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
      const colors: number[] = [],
        tint = new THREE.Color(color);
      for (let i = 0; i < 64; i++)
        colors.push(tint.r * (0.08 + i / 64), tint.g * (0.08 + i / 64), tint.b * (0.08 + i / 64));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const trail = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.7,
          fog: false,
          depthWrite: false,
        }),
      );
      trail.frustumCulled = false;
      this.root.add(group, trail);
      object = { group, trail, appearance: frame.appearance };
      this.objects.set(frame.id, object);
    }
    object.group.position.fromArray(frame.position);
    object.group.scale.setScalar(this.preferences.reducedMotion ? 1 : frame.scale);
    object.group.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        child.material instanceof THREE.MeshBasicMaterial &&
        child.material.transparent
      )
        child.material.opacity = Math.min(
          0.7,
          this.preferences.reducedMotion ? 0.4 : 0.2 + frame.brightness * 0.15,
        );
    });
    const attribute = object.trail.geometry.getAttribute('position') as THREE.BufferAttribute;
    frame.trail.slice(0, 64).forEach((point, i) => attribute.setXYZ(i, ...point));
    attribute.needsUpdate = true;
    object.trail.geometry.setDrawRange(0, Math.min(64, frame.trail.length));
    object.trail.visible = !this.preferences.reducedMotion;
  }
  private remove(object: SceneObjectView) {
    this.root.remove(object.group, object.trail);
    disposeGroup(object.group);
    object.trail.geometry.dispose();
    (object.trail.material as THREE.Material).dispose();
  }
  clear() {
    this.adapter?.dispose();
    this.adapter = undefined;
    for (const object of this.objects.values()) this.remove(object);
    this.objects.clear();
    this.theme = '';
  }
  dispose() {
    this.clear();
    this.root.removeFromParent();
  }
}
