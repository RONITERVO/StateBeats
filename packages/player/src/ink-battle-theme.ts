import * as THREE from 'three';
import { inkEncounters, sampleInkBattle, inkChapterAt, inkChapters } from '@statebeats/ink-battle';
import {
  InkBatch,
  BookPaper,
  bookPaths,
  landscapePaths,
  pencilMesh,
  CHAPTERS,
  baseModel,
  unitModel,
  projectileModel,
  specialModel,
  cannonModel,
  dockPosition,
  TEAM_COLORS,
  unitMotion,
  REST,
  chapterPalette,
} from '@statebeats/ink-battle/visuals';
import type { Observation } from '@statebeats/sdk';
import type { ThemeFactory } from './themes.js';
import { registerAppearance } from './appearances.js';

type Point = [number, number, number];
const encounters = inkEncounters();
const encounterById = new Map(encounters.map((e) => [e.id, e]));
const vector = () => new THREE.Vector3();
/** Scene landmarks are already fitted and recentered by the SDK, just like the scored notes. */
export function inkBasis(view: Observation) {
  const points = [0, 1, 2, 3].map(
    (i) => view.scene?.objects.find((o) => o.id === `ink-basis-${i}`)?.position,
  );
  if (points.some((p) => !p)) return new THREE.Matrix4();
  const origin = vector().fromArray(points[0]!);
  return new THREE.Matrix4()
    .makeBasis(
      ...(points.slice(1).map((p) => vector().fromArray(p!).sub(origin)) as [
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3,
      ]),
    )
    .setPosition(origin);
}
function disposeBatch(batch: InkBatch) {
  // Upstream owns geometry/materials; Three also requires instanced attributes to be released.
  Object.values(batch.meshes).forEach((mesh) => mesh.dispose());
  batch.dispose();
}
function disposeMesh(mesh: THREE.Mesh) {
  mesh.removeFromParent();
  mesh.geometry.dispose();
  for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
    material.dispose();
}

export const inkBattleTheme: ThemeFactory = (root) => {
  const world = new THREE.Group(),
    book = new THREE.Group();
  world.name = 'ink-battle-world';
  world.matrixAutoUpdate = false;
  book.scale.setScalar(10);
  book.position.z = -1.4;
  world.add(book);
  root.add(world);
  const paper = new BookPaper();
  paper.setAge(0);
  book.add(paper);
  const outlines = pencilMesh(bookPaths());
  book.add(outlines);
  let landscape = pencilMesh(landscapePaths(0, true));
  book.add(landscape);
  const background = new THREE.Mesh(
    new THREE.SphereGeometry(500, 16, 8),
    new THREE.MeshBasicMaterial({ color: 0xe6dcc4, side: THREE.BackSide, depthWrite: false }),
  );
  root.add(background);
  const desk = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 180),
    new THREE.MeshBasicMaterial({ color: 0x8b7963 }),
  );
  desk.rotation.x = -Math.PI / 2;
  desk.position.y = -1.12;
  world.add(desk);
  const clearance = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1, 64),
    new THREE.MeshBasicMaterial({
      color: 0x9a7d42,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  );
  clearance.rotation.x = -Math.PI / 2;
  clearance.position.y = 0.035;
  world.add(clearance);
  const army = new InkBatch(book, { capacity: 1800 });
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 384;
  const context = canvas.getContext('2d')!,
    texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const titleMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const signs = [-1, 1].map((sign) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), titleMaterial);
    mesh.position.set(0, 3.5, sign * 7.2);
    mesh.rotation.y = sign === 1 ? Math.PI : 0;
    world.add(mesh);
    return mesh;
  });
  let age = -1;
  return {
    handlesObjects: true,
    update(view, preferences) {
      world.matrix.copy(inkBasis(view));
      const beat = (view.tick / view.tickRate) * 2,
        frame = sampleInkBattle(beat);
      if (frame.age !== age) {
        age = frame.age;
        paper.setAge(age);
        disposeMesh(landscape);
        landscape = pencilMesh(landscapePaths(age, true));
        book.add(landscape);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#514538';
        context.textAlign = 'center';
        context.font = '44px Georgia';
        context.fillText('INK BATTLE  ×  STATEBEATS', 768, 68);
        context.font = 'bold 66px Georgia';
        context.fillText(CHAPTERS[age].title, 768, 156);
        context.font = '32px Georgia';
        context.fillText('BETWEEN THE LINES  ·  YOU BELONG TO NEITHER ARMY', 768, 227);
        context.font = '30px sans-serif';
        context.fillText(
          'Marked heads: touch  ·  Marked shots: block  ·  “2”: both hands',
          768,
          297,
        );
        texture.needsUpdate = true;
        (background.material as THREE.MeshBasicMaterial).color
          .set(chapterPalette(age).paper)
          .lerp(new THREE.Color('#b9aea0'), 0.25);
      }
      // Follow only this excerpt's actual recorded state. Rhythm targets use their own scored paths.
      const diverted = new Set(
        encounters
          .filter(
            (e) =>
              e.age === age && e.kind === 'melee' && beat >= e.spawnBeat && beat <= e.beat + 0.7,
          )
          .map((e) => e.sourceUnit),
      );
      army.begin();
      for (const [index, team] of [1, -1].entries()) {
        baseModel(army, age, -team * 1.06, team);
        frame.sides[index].turrets.forEach((turret, slot) => {
          if (!turret) return;
          const pad = dockPosition(slot, team)!;
          army.model(
            pad.x,
            pad.y,
            pad.z,
            0.83 * turret[2],
            team,
            -(turret[1] - (team === 1 ? 0 : Math.PI)),
          );
          cannonModel(army, age, turret[0], TEAM_COLORS[team], false, REST, false);
        });
      }
      for (const u of frame.units) {
        // Include the model's extent: a siege hull must not cover the contact space
        // merely because its centre is outside the player's clearance circle.
        const clearance = u[2] === 2 ? 3.7 : 1.9;
        if (diverted.has(u[0]) || Math.hypot(u[3], u[5]) < clearance) continue;
        unitModel(army, age, u[2], {
          x: u[3] / 10,
          z: u[5] / 10 + 0.14,
          scale: Math.min(1.8, u[7]) * Math.max(0.02, u[8]),
          team: u[1],
          yaw: -(u[6] - (u[1] === 1 ? 0 : Math.PI)),
          time: preferences.reducedMotion ? 0 : frame.seconds + u[0],
          walking: !preferences.reducedMotion && !!u[12],
          motion: preferences.reducedMotion
            ? REST
            : unitMotion({
                attackCooldown: u[9],
                attackSpeed: u[10],
                isAttacking: !!u[11],
                drawProgress: u[8],
              }),
          detailed: false,
        });
      }
      for (const shot of frame.shots) {
        if (Math.hypot(shot[3], shot[5]) < 1.8) continue;
        army.model(shot[3] / 10, Math.max(0.025, shot[4] / 10), shot[5] / 10 + 0.14, 1, shot[1]);
        projectileModel(army, shot[2], shot[1], age);
      }
      if (!preferences.reducedMotion)
        for (const special of frame.specials) {
          army.model(special[1] / 10, 0, special[3] / 10 + 0.14, 1, special[0]);
          specialModel(army, age, frame.seconds, special[0], true);
        }
      army.end();
      world.userData.inkBattle = {
        age,
        triangles: army.triangles,
        overflow: army.overflow,
        units: frame.units.length,
        sourceTick: frame.tick,
      };
      const chapterTime = inkChapterAt(beat).seconds;
      titleMaterial.opacity = preferences.highContrast ? 1 : chapterTime < 3 ? 0.95 : 0.5;
      clearance.visible = !preferences.highContrast;
    },
    dispose() {
      disposeBatch(army);
      paper.dispose();
      disposeMesh(outlines);
      disposeMesh(landscape);
      disposeMesh(background);
      disposeMesh(desk);
      disposeMesh(clearance);
      signs.forEach((sign) => {
        sign.geometry.dispose();
        sign.removeFromParent();
      });
      texture.dispose();
      titleMaterial.dispose();
      world.removeFromParent();
    },
  };
};

// Each reference appearance has a bounded instance buffer. No asynchronous imports from map JSON.
for (const age of inkChapters.map((c) => c.age))
  for (const team of [1, -1])
    for (const kind of ['melee', 'shot', 'rain', 'heavy'])
      for (const type of ['arc', 'straight', 'laser', 'orb', 'meteor', 'arrow', 'cannonball']) {
        registerAppearance(
          `ink-battle/${kind}/${age}/${team === 1 ? 'teal' : 'red'}/${type}`,
          () => {
            const object = new THREE.Group(),
              art = new THREE.Group();
            object.add(art);
            object.name = `ink-${kind}-art`;
            const batch = new InkBatch(art, { capacity: 128 });
            const outline = batch.outlineBall.bind(batch);
            let head: Point = [0, 0, 0];
            batch.outlineBall = (point, radius, color) => {
              if (
                kind === 'melee' &&
                (age < 5 ? Math.abs(radius - 0.025) < 1e-6 : point[0] === 0.035)
              )
                head = batch.point(point);
              outline(point, radius, color);
            };
            // A gold double outline distinguishes interactive bodies from faction paint.
            const sealMaterial = new THREE.MeshBasicMaterial({
              color: 0xd99922,
              transparent: true,
              depthWrite: false,
              depthTest: false,
            });
            const seal = new THREE.Mesh(
              new THREE.TorusGeometry(kind === 'heavy' ? 0.225 : 0.17, 0.013, 5, 36),
              sealMaterial,
            );
            seal.renderOrder = 5;
            object.add(seal);
            return {
              object,
              guide: false,
              referenceBody: false,
              cueColor: 0x705323,
              update(entity, view, preferences) {
                const beat = (view.tick / view.tickRate) * 2,
                  e = encounterById.get(entity.id);
                const remain = (entity.hitTick - view.tick) / view.tickRate;
                const basis = inkBasis(view),
                  size = vector().setFromMatrixScale(basis);
                batch.begin();
                art.position.set(0, 0, 0);
                art.scale.set(1, 1, 1);
                art.rotation.set(0, 0, 0);
                if (kind === 'melee') {
                  const target = e?.target ?? [0, 1.264, -0.7];
                  const yaw = Math.atan2(target[2], -target[0]) + (team === 1 ? 0 : Math.PI);
                  const motion = preferences.reducedMotion
                    ? REST
                    : {
                        strike: Math.max(0, 1 - Math.abs(remain) * 5),
                        prepare: Math.max(0, 1 - Math.abs(remain - 0.3) * 4),
                        recoil: 0,
                        flash: 0,
                      };
                  unitModel(batch, age, 0, {
                    scale: 8,
                    team,
                    yaw,
                    time: preferences.reducedMotion ? 0 : beat * 0.5,
                    walking: remain > 0.25,
                    motion,
                    detailed: true,
                  });
                  art.position.set(-head[0] * size.x, -head[1] * size.y, -head[2] * size.z);
                  art.scale.copy(size);
                  // The scored contact centre stays exactly on the sampled head/eye throughout the pose.
                  object.userData.contactOffset = head.map(
                    (v, i) => v * [size.x, size.y, size.z][i] + art.position.getComponent(i),
                  );
                } else {
                  batch.model(0, 0, 0, kind === 'heavy' ? 13 : 9, team);
                  projectileModel(batch, type, team, age);
                  if (kind === 'rain' && type === 'meteor') {
                    batch.model(0, 0, 0, 1);
                    batch.line([0, 0.13, 0], [0.04, 0.55, 0.12], 0.005, '#b87935');
                    batch.line([-0.04, 0.13, 0.01], [-0.04, 0.34, 0.08], 0.003, '#8b5736');
                  }
                  if (e) {
                    const next = e.motion.findIndex((k) => k.beat > beat);
                    const i = next < 0 ? e.motion.length - 2 : Math.max(0, next - 1);
                    const a = e.motion[i].position,
                      b = e.motion[i + 1].position;
                    const direction = vector().set(
                      (b[0] - a[0]) * size.x,
                      (b[1] - a[1]) * size.y,
                      (b[2] - a[2]) * size.z,
                    );
                    if (direction.lengthSq() > 1e-8)
                      art.quaternion.setFromUnitVectors(
                        new THREE.Vector3(team, 0, 0),
                        direction.normalize(),
                      );
                  }
                }
                batch.end();
                const actor = view.actors.find((actor) => actor.id === 'player');
                const headEffector = actor?.effectors.find(
                  (effector) => effector.semantic === 'head',
                );
                if (headEffector) {
                  const facing = vector()
                    .fromArray(headEffector.pose.position)
                    .sub(vector().fromArray(entity.position));
                  const inverse = new THREE.Quaternion().fromArray(entity.orientation).invert();
                  facing.applyQuaternion(inverse);
                  if (facing.lengthSq() > 1e-8)
                    seal.quaternion.setFromUnitVectors(
                      new THREE.Vector3(0, 0, 1),
                      facing.normalize(),
                    );
                }
                sealMaterial.color.set(
                  preferences.highContrast ? 0x211a13 : remain > 0.3 ? 0x805217 : 0xd99922,
                );
                const release = entity.presentation?.releaseProgress ?? 0;
                seal.scale.setScalar(1 + release * 2);
                if (entity.presentation?.phase === 'resolved' && !preferences.reducedMotion) {
                  const hit = entity.presentation.outcome === 'hit';
                  art.position.x += team * release * (kind === 'melee' ? 0.6 : 1.8);
                  art.position.y += release * (hit ? 0.35 : -0.5);
                  if (kind === 'melee') art.rotation.z = team * release * 0.5;
                }
                object.userData.overflow = batch.overflow;
              },
              dispose() {
                disposeBatch(batch);
                seal.geometry.dispose();
                sealMaterial.dispose();
              },
            };
          },
        );
      }
