import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

// Детерминированный random: камень всегда одной и той же формы
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Круглая огранка: площадка, коронка, рундист, павильон, калетта (пропорции Толковского)
function brilliantGeometry() {
  const pts = [];
  const lift = 0.25; // поднимаем, чтобы центр вращения был в середине камня
  const add = (r, y, a) => pts.push(new THREE.Vector3(Math.cos(a) * r, y + lift, Math.sin(a) * r));
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    add(0.57, 0.32, a);                // площадка
    add(0.82, 0.17, a + Math.PI / 8);  // грани коронки
    add(0.5, -0.47, a + Math.PI / 8);  // грани павильона
  }
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8;
    add(1, 0.015, a);                  // рундист
    add(1, -0.015, a);
  }
  pts.push(new THREE.Vector3(0, -0.86 + lift, 0)); // калетта
  return new ConvexGeometry(pts);
}

function facePlanes(geo) {
  const p = geo.attributes.position;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const planes = [];
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    let d = n.dot(a);
    if (d < 0) { n.negate(); d = -d; }
    planes.push(n.x, n.y, n.z, d);
  }
  return planes;
}

// Расстояние от центра до поверхности выпуклого многогранника по направлению u
function hullRadius(x, y, z, planes) {
  let t = Infinity;
  for (let i = 0; i < planes.length; i += 4) {
    const nu = planes[i] * x + planes[i + 1] * y + planes[i + 2] * z;
    if (nu > 1e-6) t = Math.min(t, planes[i + 3] / nu);
  }
  return t;
}

const SPARK_VERT = `
  attribute float seed;
  uniform float uTime, uOpacity, uPx;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float t = fract(uTime * 0.3 + seed * 7.0);
    float a = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.06, 0.2, t));
    vA = a * uOpacity;
    gl_PointSize = uPx * (14.0 + 30.0 * fract(seed * 13.0)) * a;
  }`;
const SPARK_FRAG = `
  varying float vA;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float cross = max(0.0, 1.0 - abs(p.x) * 18.0) * max(0.0, 1.0 - abs(p.y) * 2.0)
                + max(0.0, 1.0 - abs(p.y) * 18.0) * max(0.0, 1.0 - abs(p.x) * 2.0);
    float core = smoothstep(0.18, 0.0, length(p));
    float a = clamp(cross + core, 0.0, 1.0) * vA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(1.0, 0.98, 0.94, a);
  }`;

export function createScene(canvas, { reducedMotion = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
  camera.position.set(0, 0, 6);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const ambient = new THREE.AmbientLight(0xffffff, 0.25);
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(3, 4, 5);
  const rim = new THREE.DirectionalLight(0x8fb0ff, 0.9);
  rim.position.set(-4, 2, -2);
  scene.add(ambient, key, rim);

  // --- Три формы Осколка как радиусы по одним и тем же направлениям ---
  const brilGeo = brilliantGeometry();
  const planes = facePlanes(brilGeo);
  const morphGeo = new THREE.IcosahedronGeometry(1, 28);
  const pos = morphGeo.attributes.position;
  const n = pos.count;
  const dir = new Float32Array(n * 3);
  const rRock = new Float32Array(n), rOct = new Float32Array(n), rBril = new Float32Array(n);

  const rand = mulberry32(1762);
  const waves = Array.from({ length: 16 }, (_, k) => {
    const v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    return { v: v.multiplyScalar(1.4 + k * 1.1), p: rand() * Math.PI * 2, a: 0.2 / (1 + k * 0.7) };
  });
  // кратеры: неглубокие вмятины с валиком по краю
  const craters = Array.from({ length: 9 }, () => ({
    c: new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize(),
    size: 0.18 + rand() * 0.22,
    depth: 0.05 + rand() * 0.07,
  }));

  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    dir[i * 3] = v.x; dir[i * 3 + 1] = v.y; dir[i * 3 + 2] = v.z;
    let r = 0.92;
    for (const w of waves) r += w.a * Math.sin(w.v.dot(v) + w.p);
    for (const cr of craters) {
      const d = Math.acos(THREE.MathUtils.clamp(cr.c.dot(v), -1, 1)) / cr.size;
      if (d < 1.4) r -= cr.depth * (Math.exp(-d * d * 3) - 0.35 * Math.exp(-(d - 1.1) * (d - 1.1) * 12));
    }
    rRock[i] = r;
    rOct[i] = 1.18 / (Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z));
    rBril[i] = hullRadius(v.x, v.y, v.z, planes);
  }

  const gemMat = new THREE.MeshPhysicalMaterial({
    color: 0x77716b,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
    clearcoat: 0.4,
    iridescence: 0,
    iridescenceIOR: 1.8,
    emissive: 0x000000,
  });

  const morphMesh = new THREE.Mesh(morphGeo, gemMat);
  const brilMesh = new THREE.Mesh(brilGeo, gemMat);
  brilMesh.visible = false;
  // пока камень стоит в форме алмаза, показываем чистый октаэдр без «ступенек» на рёбрах
  const octMesh = new THREE.Mesh(new THREE.OctahedronGeometry(1.18), gemMat);
  octMesh.visible = false;

  // искры на гранях бриллианта
  const SPARKS = 26;
  const sparkPos = new Float32Array(SPARKS * 3), sparkSeed = new Float32Array(SPARKS);
  for (let i = 0; i < SPARKS; i++) {
    v.set(rand() * 2 - 1, rand() * 1.4 - 0.4, rand() * 2 - 1).normalize();
    const r = hullRadius(v.x, v.y, v.z, planes) * 1.01;
    sparkPos.set([v.x * r, v.y * r, v.z * r], i * 3);
    sparkSeed[i] = rand();
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('seed', new THREE.BufferAttribute(sparkSeed, 1));
  const sparkMat = new THREE.ShaderMaterial({
    vertexShader: SPARK_VERT,
    fragmentShader: SPARK_FRAG,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uPx: { value: renderer.getPixelRatio() } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);

  // золотая оправа перстня (эпоха дворян). Это «резинка»: при сужении она
  // не проходит сквозь камень, а обтягивает его грани. Вращается вместе с камнем.
  const RING_Y = -0.42, RING_R = 0.78, RING_TUBE = 0.07;
  const SECTION = 1.18 - Math.abs(RING_Y); // сечение октаэдра на высоте кольца — квадрат
  class BandCurve extends THREE.Curve {
    constructor(r) { super(); this.r = r; }
    getPoint(t, out = new THREE.Vector3()) {
      const a = t * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const face = SECTION / (Math.abs(c) + Math.abs(s)) + RING_TUBE * 0.9;
      // мягкий максимум: на углах резинка плавно переходит в прижатую к грани
      const k = 0.06;
      const R = (this.r + face + Math.sqrt((this.r - face) ** 2 + k * k)) / 2;
      return out.set(c * R, RING_Y, s * R);
    }
  }
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xd4a640, metalness: 1, roughness: 0.28, transparent: true, opacity: 0 });
  const ring = new THREE.Mesh(new THREE.TubeGeometry(new BandCurve(RING_R), 192, RING_TUBE, 14, true), ringMat);
  function setBand(size) {
    ring.geometry.dispose();
    ring.geometry = new THREE.TubeGeometry(new BandCurve(RING_R * size), 192, RING_TUBE, 14, true);
  }

  const gem = new THREE.Group();
  gem.add(morphMesh, octMesh, brilMesh, sparks, ring);

  const tilt = new THREE.Group();
  tilt.rotation.x = 0.42;
  tilt.add(gem);
  const userRot = new THREE.Group(); // вращение мышкой и отдача от ударов
  userRot.add(tilt);
  const hero = new THREE.Group();
  hero.add(userRot);
  scene.add(hero);

  // звёзды космоса
  const STARS = 1600;
  const starPos = new Float32Array(STARS * 3);
  for (let i = 0; i < STARS; i++) {
    v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize().multiplyScalar(25 + rand() * 40);
    starPos.set([v.x, v.y, v.z], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, sizeAttenuation: true, transparent: true, opacity: 1, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // дождь из камней внизу сайта: несколько огранок, разные оттенки и размеры
  const emeraldGeo = new ConvexGeometry([
    ...[[0.5, 0.3], [0.3, 0.5]].flatMap(([a, b]) => [[a, b], [-a, b], [a, -b], [-a, -b]]).map(([x, z]) => new THREE.Vector3(x * 0.8, 0.28, z * 0.55)),
    ...[[1, 0.55], [0.75, 0.8]].flatMap(([a, b]) => [[a, b], [-a, b], [a, -b], [-a, -b]]).map(([x, z]) => new THREE.Vector3(x, 0, z * 0.85)),
    new THREE.Vector3(0.45, -0.5, 0), new THREE.Vector3(-0.45, -0.5, 0),
  ]);
  const princessGeo = new ConvexGeometry([
    ...[[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([x, z]) => new THREE.Vector3(x * 0.72, 0, z * 0.72)),
    ...[[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([x, z]) => new THREE.Vector3(x * 0.45, 0.26, z * 0.45)),
    new THREE.Vector3(0, -0.75, 0),
  ]);
  const RAIN_SHAPES = [brilGeo, new THREE.OctahedronGeometry(0.9), emeraldGeo, princessGeo];
  const RAIN_TINTS = ['#ffffff', '#dff0ff', '#ffe1ec', '#fff1c9', '#e2fff2', '#e9e1ff', '#cfe7ff'];
  const RAIN_PER_SHAPE = window.matchMedia('(max-width: 760px)').matches ? 7 : 14;
  const rainMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 1, roughness: 0.06, flatShading: true,
    iridescence: 1, iridescenceIOR: 1.8, envMapIntensity: 1.5,
  });
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const rain = RAIN_SHAPES.map((geo) => {
    const mesh = new THREE.InstancedMesh(geo, rainMat, RAIN_PER_SHAPE);
    mesh.frustumCulled = false;
    mesh.visible = false;
    const items = Array.from({ length: RAIN_PER_SHAPE }, (_, i) => {
      tint.set(RAIN_TINTS[Math.floor(rand() * RAIN_TINTS.length)]);
      mesh.setColorAt(i, tint);
      return {
        z: -1 - rand() * 6,
        x: rand() * 2 - 1,       // доля ширины экрана на своей глубине
        y: rand() * 2 - 1,       // доля высоты
        vy: 0.14 + rand() * 0.24,
        s: 0.12 + rand() * 0.28,
        rot: new THREE.Euler(rand() * 6, rand() * 6, rand() * 6),
        spin: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(2.4),
      };
    });
    scene.add(mesh);
    return { mesh, items };
  });
  let rainLevel = 0;
  function updateRain(dt) {
    const show = rainLevel > 0.01;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    for (const { mesh, items } of rain) {
      mesh.visible = show;
      if (!show) continue;
      items.forEach((it, i) => {
        it.y -= it.vy * dt;
        if (it.y < -1.25) { it.y = 1.25; it.x = rand() * 2 - 1; }
        it.rot.x += it.spin.x * dt; it.rot.y += it.spin.y * dt; it.rot.z += it.spin.z * dt;
        const halfH = tanH * (camera.position.z - it.z);
        dummy.position.set(it.x * halfH * camera.aspect, it.y * halfH, it.z);
        dummy.rotation.copy(it.rot);
        dummy.scale.setScalar(it.s * rainLevel);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // осколки, которые отлетают от ударов
  const shardGeo = new THREE.TetrahedronGeometry(1);
  const shards = [];
  function burst(power) {
    const mat = new THREE.MeshStandardMaterial({ flatShading: true, metalness: gemMat.metalness, roughness: Math.max(gemMat.roughness, 0.25) });
    mat.color.copy(gemMat.color);
    const k = hero.scale.x;
    const count = Math.round(10 + 14 * power);
    mat.userData.left = count;
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(shardGeo, mat);
      const d = new THREE.Vector3(rand() * 2 - 1, rand() * 1.2 - 0.1, rand() * 2 - 1).normalize();
      m.position.copy(hero.position).addScaledVector(d, 0.75 * k);
      m.scale.setScalar((0.03 + rand() * 0.07) * k * (0.7 + power * 0.5));
      m.rotation.set(rand() * 6, rand() * 6, rand() * 6);
      const speed = (1.2 + rand() * 2.6) * power;
      m.userData = { v: d.multiplyScalar(speed).add(new THREE.Vector3(0, 1.4 * power, 0)), spin: (rand() - 0.5) * 14, life: 1.4 + rand() * 0.6, age: 0, base: m.scale.x };
      scene.add(m);
      shards.push(m);
    }
  }

  let flash = 0, joltA = 0, joltV = 0, shake = 0;
  let hover = false, hoverT = 0; // подсветка камня под курсором
  let dragging = false;
  const rotVel = new THREE.Vector2();
  const lightTarget = new THREE.Vector3(3, 4, 5);

  let lastM1 = -1, lastM2 = -1;
  function setMorph(m1, m2) {
    if (Math.abs(m1 - lastM1) < 1e-4 && Math.abs(m2 - lastM2) < 1e-4) return;
    lastM1 = m1; lastM2 = m2;
    const done = m2 > 0.995;
    const raw = m1 > 0.995 && m2 < 0.005;
    morphMesh.visible = !done && !raw;
    octMesh.visible = raw;
    brilMesh.visible = done;
    if (done || raw) return;
    const arr = pos.array;
    for (let i = 0; i < n; i++) {
      const r = (rRock[i] * (1 - m1) + rOct[i] * m1) * (1 - m2) + rBril[i] * m2;
      arr[i * 3] = dir[i * 3] * r;
      arr[i * 3 + 1] = dir[i * 3 + 1] * r;
      arr[i * 3 + 2] = dir[i * 3 + 2] * r;
    }
    pos.needsUpdate = true;
    morphGeo.computeBoundingSphere();
  }

  let spin = 0.2;
  let mobile = false;

  function apply(st) {
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const halfW = halfH * camera.aspect;
    const fit = mobile ? 0.6 : 0.82 * THREE.MathUtils.clamp(camera.aspect / 1.7, 0.72, 1);
    hero.position.set(st.x * halfW, st.y * halfH, 0);
    hero.scale.setScalar(st.s * fit * (1 + hoverT * 0.06));

    setMorph(st.m1, st.m2);
    gemMat.color.setRGB(st.color[0], st.color[1], st.color[2], THREE.SRGBColorSpace);
    gemMat.roughness = st.rough;
    gemMat.metalness = st.metal;
    gemMat.iridescence = st.irid;
    gemMat.envMapIntensity = st.env;
    gemMat.clearcoat = st.coat;
    gemMat.emissive.setRGB(st.emis[0], st.emis[1], st.emis[2], THREE.SRGBColorSpace);
    gemMat.emissiveIntensity = st.emisI;
    const glow = Math.max(flash, hoverT * 0.07);
    if (glow > 0.01 && glow > st.emisI) {
      gemMat.emissive.setRGB(1, 0.94, 0.82);
      gemMat.emissiveIntensity = glow;
    }

    key.color.setRGB(st.key[0], st.key[1], st.key[2], THREE.SRGBColorSpace);
    key.intensity = st.keyI + hoverT * 0.4;
    rim.intensity = 0.9 + hoverT * 4; // наведение обводит камень светом по контуру

    starMat.opacity = st.stars;
    stars.visible = st.stars > 0.01;
    ringMat.opacity = st.ring;
    ring.visible = st.ring > 0.01;
    sparkMat.uniforms.uOpacity.value = st.spark;
    rainLevel = st.rain;
    sparks.visible = st.spark > 0.01;
    spin = st.spin;
  }

  function resize(isMobile) {
    mobile = isMobile;
    // размер самого холста, без полосы прокрутки, иначе картинка сплющивается
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function tick(dt, time) {
    dt = Math.min(dt, 0.05);
    if (!reducedMotion) {
      gem.rotation.y += spin * dt;
      stars.rotation.y += dt * 0.006;
    }
    // инерция после вращения мышкой, наклон плавно возвращается
    if (!dragging) {
      userRot.rotation.y += rotVel.x;
      userRot.rotation.x += rotVel.y;
      rotVel.multiplyScalar(0.94);
      userRot.rotation.x *= 0.97;
    }
    // отдача от удара: затухающая пружина
    joltV += (-joltA * 140 - joltV * 9) * dt;
    joltA += joltV * dt;
    userRot.rotation.z = joltA;
    flash = Math.max(0, flash - dt * 3.5);
    hoverT += ((hover ? 1 : 0) - hoverT) * Math.min(1, dt * 10);

    key.position.lerp(lightTarget, 0.08);
    camera.position.x = (Math.random() - 0.5) * shake * 0.06;
    camera.position.y = (Math.random() - 0.5) * shake * 0.06;

    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i], u = s.userData;
      u.age += dt;
      u.v.y -= 7 * dt;
      s.position.addScaledVector(u.v, dt);
      s.rotation.x += u.spin * dt;
      s.rotation.z += u.spin * 0.7 * dt;
      s.scale.setScalar(u.base * Math.max(0, 1 - Math.max(0, u.age - u.life * 0.6) / (u.life * 0.4)));
      if (u.age > u.life) {
        scene.remove(s);
        shards.splice(i, 1);
        if (--s.material.userData.left === 0) s.material.dispose();
      }
    }

    updateRain(reducedMotion ? 0 : dt);
    sparkMat.uniforms.uTime.value = time;
    renderer.render(scene, camera);
  }

  // где камень на экране, в CSS-пикселях
  const tmp = new THREE.Vector3();
  function screen() {
    tmp.copy(hero.position).project(camera);
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    return {
      x: (tmp.x * 0.5 + 0.5) * canvas.clientWidth,
      y: (-tmp.y * 0.5 + 0.5) * canvas.clientHeight,
      r: (hero.scale.x / halfH) * (canvas.clientHeight / 2),
    };
  }

  return {
    apply, resize, tick, screen,
    hits(x, y) {
      const s = screen();
      return Math.hypot(x - s.x, y - s.y) < s.r * 0.95;
    },
    hit(power = 1) {
      burst(power);
      flash = 0.9 * power;
      joltV += 5 * power;
    },
    drag(dx, dy) {
      userRot.rotation.y += dx * 0.01;
      userRot.rotation.x += dy * 0.01;
      rotVel.set(dx * 0.01, dy * 0.01);
    },
    setDragging(v) { dragging = v; },
    setHover(v) { hover = v; },
    setShake(v) { shake = v; },
    // свет смещается за курсором, но всегда остаётся сбоку, чтобы не съедать рельеф
    lightAt(nx, ny) { lightTarget.set(3 + nx * 3.5, 4 - ny * 3, 4); },
    setRing(color, size) {
      if (color) ringMat.color.set(color);
      if (size) setBand(size);
    },
  };
}
