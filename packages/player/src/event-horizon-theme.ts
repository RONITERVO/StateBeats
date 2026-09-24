import * as THREE from 'three';
import type { ThemeAdapter } from './themes.js';

/** A replaceable, observation-only stage. No game timing, input or scoring lives here. */
export function eventHorizonTheme(root: THREE.Group): ThemeAdapter {
  const sky = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { time: { value: 0 }, energy: { value: 0 }, contrast: { value: 0 } },
    vertexShader:
      'varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec3 p; uniform float time; uniform float energy; uniform float contrast;
      void main(){ vec3 d=normalize(p); float a=atan(d.x,d.z); float h=d.y;
        vec3 color=mix(vec3(.014,.023,.067),vec3(.002,.003,.013),clamp(h*.8+.2,0.,1.));
        float cloud=sin(a*3.+h*7.+sin(a*5.-time*.013)*.7);
        float band=exp(-pow((h-.27-.11*cloud)/.13,2.));
        float fine=.55+.45*sin(a*18.+h*24.+sin(a*11.)+time*.025);
        vec3 tint=mix(vec3(.07,.27,.28),vec3(.28,.055,.38),.5+.5*sin(a*2.+h*3.));
        float wisps=.7+.3*sin(a*31.+h*13.+sin(a*7.+h*19.)*2.);
        color+=tint*band*(.55+fine*.45)*wisps*(1.+energy*.22)*(1.-contrast*.9);
        float horizon=exp(-abs(h)*28.);
        color+=vec3(.025,.13,.17)*horizon*(1.-contrast*.8);
        gl_FragColor=vec4(color,1.); }`,
  });
  root.add(new THREE.Mesh(new THREE.SphereGeometry(550, 40, 20), sky));
  const starPositions: number[] = [],
    starColors: number[] = [];
  for (let i = 0; i < 1400; i++) {
    const a = i * 2.399963229728653,
      y = -0.12 + (((i * 73) % 1399) / 1399) * 1.12;
    const r = Math.sqrt(1 - y * y) * 360;
    starPositions.push(Math.cos(a) * r, y * 360, Math.sin(a) * r);
    const color = new THREE.Color(i % 5 ? '#b7cfff' : '#ffdaa8');
    starColors.push(color.r, color.g, color.b);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
  const stars = new THREE.PointsMaterial({
    size: 0.62,
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  root.add(new THREE.Points(starGeometry, stars));
  const planets: THREE.Group[] = [];
  for (let i = 0; i < 2; i++) {
    const planet = new THREE.Group();
    const material = new THREE.ShaderMaterial({
      uniforms: { tint: { value: new THREE.Color(i ? '#7164b5' : '#3c8f9c') } },
      vertexShader:
        'varying vec3 n; varying vec3 v; varying vec3 p; void main(){p=position;n=normalMatrix*normal;vec4 mv=modelViewMatrix*vec4(position,1.);v=-mv.xyz;gl_Position=projectionMatrix*mv;}',
      fragmentShader: `varying vec3 n; varying vec3 v; varying vec3 p; uniform vec3 tint;
        void main(){vec3 normal=normalize(n);float light=max(0.,dot(normal,normalize(vec3(-.6,.5,.7))));
        float bands=.82+.18*sin(p.y*1.8+sin(p.x*.9));
        float rim=pow(1.-abs(dot(normal,normalize(v))),3.);
        gl_FragColor=vec4(tint*(.035+light*.5)*bands+vec3(.2,.48,.65)*rim*.7,1.);}`,
    });
    planet.add(new THREE.Mesh(new THREE.SphereGeometry(i ? 8 : 11, 40, 24), material));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(i ? 10 : 14, i ? 15 : 21, 100),
      new THREE.MeshBasicMaterial({
        color: i ? '#8c70ad' : '#85b8c7',
        transparent: true,
        opacity: 0.17,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.set(1.15, 0.3, -0.4);
    planet.add(ring);
    planet.position.set(i ? -115 : 84, i ? 23 : 28, i ? 45 : -35);
    planets.push(planet);
    root.add(planet);
  }
  const floor = new THREE.ShaderMaterial({
    uniforms: { bass: { value: 0 }, contrast: { value: 0 } },
    vertexShader:
      'varying vec2 p; void main(){p=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec2 p; uniform float bass; uniform float contrast;
      void main(){ float r=length(p); float a=atan(p.x,p.y);
        float ring=1.-smoothstep(.012,.035,abs(fract(r*.25)-.5));
        float spoke=pow(abs(cos(a*32.)),100.);
        float fade=exp(-r*.018)*smoothstep(2.,5.,r);
        vec3 color=vec3(.005,.01,.023)+vec3(.025,.095,.12)*(ring+spoke*.3)*fade*(.6+bass*.4)*(1.-contrast*.7);
        gl_FragColor=vec4(color,1.); }`,
  });
  const plane = new THREE.Mesh(new THREE.CircleGeometry(150, 96), floor);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -0.04;
  root.add(plane);
  const pillars = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.1, 0.19, 1, 5),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45 }),
    64,
  );
  const dummy = new THREE.Object3D();
  pillars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pillars.frustumCulled = false;
  for (let i = 0; i < 64; i++)
    pillars.setColorAt(
      i,
      new THREE.Color().setHSL(0.48 + 0.32 * (0.5 + Math.sin(i * 0.3) * 0.5), 0.8, 0.58),
    );
  root.add(pillars);
  const orbitMaterial = new THREE.MeshBasicMaterial({
    color: '#8d91ed',
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(80 + i * 5, 0.025, 4, 160), orbitMaterial);
    ring.rotation.set(Math.PI * 0.42 + i * 0.03, i * 0.08, 0.4);
    ring.position.y = 16;
    root.add(ring);
  }
  const platform = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 0.96, 80),
    new THREE.MeshBasicMaterial({
      color: '#91bdce',
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
    }),
  );
  platform.rotation.x = -Math.PI / 2;
  platform.position.y = -0.015;
  root.add(platform);
  return {
    update(view, preferences) {
      const music = view.music;
      sky.uniforms.time.value = preferences.reducedMotion ? 0 : view.tick / view.tickRate;
      sky.uniforms.energy.value = preferences.reducedMotion ? 0 : (music?.energy ?? 0);
      sky.uniforms.contrast.value = floor.uniforms.contrast.value = preferences.highContrast
        ? 1
        : 0;
      floor.uniforms.bass.value = preferences.reducedMotion ? 0 : (music?.bass ?? 0);
      stars.opacity = preferences.highContrast ? 0.23 : 0.72;
      planets.forEach((planet) => (planet.visible = !preferences.highContrast));
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        const band = i % 3 === 0 ? music?.bass : i % 3 === 1 ? music?.mid : music?.air;
        const height =
          1 + (preferences.reducedMotion ? 0.3 : (band ?? 0)) * (4 + 3 * Math.sin(i * 0.8) ** 2);
        dummy.position.set(Math.sin(a) * 27, height / 2 - 0.2, -Math.cos(a) * 27);
        dummy.scale.set(1, height, 1);
        dummy.updateMatrix();
        pillars.setMatrixAt(i, dummy.matrix);
      }
      pillars.instanceMatrix.needsUpdate = true;
      (pillars.material as THREE.MeshBasicMaterial).opacity = preferences.highContrast
        ? 0.12
        : 0.45;
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>();
      root.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            materials.add(material);
        }
      });
      pillars.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      root.clear();
    },
  };
}
