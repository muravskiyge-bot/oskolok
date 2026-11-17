import { createScene } from './scene.js';
import { strike, chime, rumble } from './audio.js';

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
gsap.registerPlugin(ScrollTrigger);

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobileMQ = window.matchMedia('(max-width: 760px)');
const root = document.documentElement;

// История всегда начинается с космоса, а не с места, где читатель ушёл в прошлый раз
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (!location.hash) window.scrollTo(0, 0);

/* ---------- Плавная прокрутка ---------- */
let lenis = null;
if (!reduce && window.Lenis) {
  lenis = new window.Lenis({ lerp: 0.09 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* ---------- Сюжет Осколка: ключевые кадры по прокрутке ----------
   x, y — смещение от центра экрана в долях (my — по вертикали на телефоне),
   m1 — камень → алмаз, m2 — алмаз → бриллиант. Каждый кадр дополняет предыдущий. */
const FRAMES = [
  ['#space', 0.28, {
    x: 0.42, y: 0, my: 0.5, s: 0.85, m1: 0, m2: 0,
    color: '#3b3733', rough: 1, metal: 0, irid: 0, env: 0.12, coat: 0,
    emis: '#ff3a0a', emisI: 0, key: '#a9bcff', keyI: 1.3,
    stars: 1, ring: 0, spark: 0, spin: 0.2, rain: 0,
    page: '#070914', ui: '#e6e4ef',
  }],
  ['#space', 0.85, { x: 0.12, y: -0.3, emisI: 0.55, stars: 0.4, page: '#160b10' }],
  // в недрах камень остаётся камнем, пока человек не надавит (или не пролистает дальше)
  ['#nedra', 0.32, {
    x: -0.42, y: 0, s: 1, emisI: 0, env: 0.25,
    key: '#ffb98a', keyI: 1.1, stars: 0, spin: 0.25,
    page: '#2e2018', ui: '#efe2cf',
  }],
  ['#nedra', 0.62, {}],
  ['#court', 0.5, {
    x: 0.42, m1: 1, coat: 0.4, color: '#b8a27a', rough: 0.22, metal: 0.85, irid: 0.4, env: 1,
    key: '#ffcf70', keyI: 1.2, page: '#3a0a13', ui: '#e6c77a',
  }],
  ['#nobles', 0.5, {
    x: -0.42, ring: 1, color: '#aeb9be', rough: 0.2, metal: 0.85, irid: 0.45, env: 1.1,
    key: '#fff7ea', keyI: 1, page: '#eeede8', ui: '#173d2f',
  }],
  ['#modern', 0.5, {
    x: 0.42, ring: 0, color: '#b5ab98', rough: 0.16, metal: 0.9, irid: 0.55, env: 1.1,
    key: '#f2d6a0', keyI: 1, page: '#e7d8b6', ui: '#3d2e22',
  }],
  ['.deco-stage', 0.17, {
    x: 0, y: 0, my: 0, s: 1.05, m2: 0,
    color: '#ffffff', rough: 0.16, metal: 0.6, irid: 0.5, env: 1.2,
    key: '#ffe3a3', keyI: 1.4, spin: 0.35, page: '#000000', ui: '#d6b25e',
  }],
  // огранку делает не прокрутка, а удары кувалды (play.cut), здесь только свет и масштаб
  ['.deco-stage', 0.6, { spark: 1, s: 1.2, spin: 0.5 }],
  ['.deco-stage', 0.83, {}],
  ['#deco .era__inner', 0.5, { x: 0.42, my: 0.5, s: 1 }],
  ['#today', 0.06, {
    x: 0.42, color: '#dfe6ea', key: '#ffffff', keyI: 1, env: 1.3, spark: 0.6, spin: 0.3,
    page: '#ffffff', ui: '#161616',
  }],
  ['#today', 0.3, {}],
  ['#today', 0.55, { x: 0.55, y: 0.55, my: 0.62, s: 0.5 }],
  // в самом низу камень уходит, а сверху сыплются бриллианты
  ['.tryon', 0.85, {}],
  ['.contact', 0.15, { y: 1.8, my: 1.8, rain: 1 }],
];

const COLOR_KEYS = ['color', 'emis', 'key', 'page', 'ui'];
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

const states = [];
FRAMES.reduce((prev, [, , patch]) => {
  const st = { ...prev, ...patch };
  states.push(st);
  return st;
}, {});
const parsed = states.map((st) => {
  const out = { ...st };
  for (const k of COLOR_KEYS) out[k] = hexToRgb(st[k]);
  return out;
});

let anchors = [];
function measure() {
  anchors = FRAMES.map(([sel, at]) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    return r.top + window.scrollY + r.height * at;
  });
}

const cur = { ...parsed[0], color: [...parsed[0].color] };
function stateAt(y) {
  let i = 0;
  while (i < anchors.length - 1 && y > anchors[i + 1]) i++;
  const a = parsed[i];
  const b = parsed[Math.min(i + 1, parsed.length - 1)];
  let t = 0;
  if (i < anchors.length - 1 && y > anchors[i]) {
    t = (y - anchors[i]) / (anchors[i + 1] - anchors[i]);
    t = t * t * (3 - 2 * t);
  }
  for (const k in a) {
    if (COLOR_KEYS.includes(k)) cur[k] = a[k].map((c, j) => c + (b[k][j] - c) * t);
    else cur[k] = a[k] + (b[k] - a[k]) * t;
  }
  return cur;
}

const toCss = (c) => `rgb(${c.map((x) => Math.round(x * 255)).join(' ')})`;

/* ---------- 3D ---------- */
const canvas = document.getElementById('stage');
let scene = null;
try {
  scene = createScene(canvas, { reducedMotion: reduce });
} catch (e) {
  scene = null;
}
if (!scene) canvas.style.display = 'none';

function onResize() {
  measure();
  if (scene) scene.resize(mobileMQ.matches);
}
window.addEventListener('resize', onResize);
onResize();
document.fonts.ready.then(() => { measure(); ScrollTrigger.refresh(); });
ScrollTrigger.addEventListener('refresh', measure);

/* ---------- Состояние интерактива ---------- */
const play = {
  press: 0,        // 0..1, насколько продавили камень в недрах
  holding: false,
  sparkBoost: 0,   // вспышка искр, когда водят светом
  cut: 0,          // 0..1, огранка: растёт только от ударов кувалды
};
// как выглядит сырой алмаз, когда его продавили вручную
const RAW = { m1: 1, coat: 0.4, rough: 0.3, metal: 0.8, irid: 0.3, env: 0.9, color: hexToRgb('#7d8a90') };
// и как выглядит готовый бриллиант
const BRIL = { rough: 0.03, metal: 1, irid: 1, env: 1.6, color: hexToRgb('#eef2f5') };
const EMBER = hexToRgb('#ff5a14');
const I_NOBLES = FRAMES.findIndex(([sel]) => sel === '#nobles');
const I_MODERN = FRAMES.findIndex(([sel]) => sel === '#modern');

const progress = document.querySelector('.progress');
gsap.ticker.add((time) => {
  const y = window.scrollY + window.innerHeight / 2;
  const st = stateAt(y);
  root.style.setProperty('--page', toCss(st.page));
  root.style.setProperty('--ui', toCss(st.ui));
  const max = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
  if (!scene) return;

  // давление действует с момента, как камень ушёл под землю
  const below = Math.min(1, Math.max(0, (y - anchors[1]) / (anchors[2] - anchors[1])));
  const p = play.press * below;
  if (p > 0) {
    const w = p * (1 - st.m1);
    for (const k of ['coat', 'rough', 'metal', 'irid', 'env']) st[k] += (RAW[k] - st[k]) * w;
    st.color = st.color.map((c, j) => c + (RAW.color[j] - c) * w);
    st.m1 = Math.max(st.m1, p);
  }
  if (play.holding) {
    st.emis = EMBER;
    st.emisI = Math.max(st.emisI, 0.15 + play.press * 0.5);
  }
  // огранка видна с мастерской и дальше; выше по истории камень ещё не тронут
  const workshop = Math.min(1, Math.max(0, (y - anchors[I_NOBLES]) / (anchors[I_MODERN] - anchors[I_NOBLES])));
  const c = play.cut * workshop;
  if (c > 0) {
    for (const k of ['rough', 'metal', 'irid', 'env']) st[k] += (BRIL[k] - st[k]) * c;
    st.color = st.color.map((v, j) => v + (BRIL.color[j] - v) * c);
    st.m1 = 1;
    st.m2 = c;
  }
  play.sparkBoost *= 0.95;
  st.spark = st.spark * c * (0.45 + play.sparkBoost);

  const mobile = mobileMQ.matches;
  scene.apply(mobile ? { ...st, x: 0, y: st.my } : st);
  scene.tick(gsap.ticker.deltaRatio() / 60, time);
});

/* ---------- Навигация ---------- */
const navLinks = [...document.querySelectorAll('.era-nav a')];
navLinks.forEach((a) => {
  a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.6 });
    else target.scrollIntoView();
  });
});
document.querySelectorAll('.era').forEach((sec) => {
  ScrollTrigger.create({
    trigger: sec,
    start: 'top center',
    end: 'bottom center',
    onToggle: ({ isActive }) => {
      if (!isActive) return;
      navLinks.forEach((a) => a.setAttribute('aria-current', String(a.getAttribute('href') === `#${sec.id}`)));
    },
  });
});

/* ---------- Лавровый венок 1825 ---------- */
(function buildWreath() {
  const svg = document.querySelector('.wreath');
  const NS = 'http://www.w3.org/2000/svg';
  const cx = 100, cy = 100, R = 80;
  for (const side of [-1, 1]) {
    const stem = document.createElementNS(NS, 'path');
    const a0 = Math.PI / 2 + side * 0.3, a1 = Math.PI / 2 + side * 2.5;
    const p = (a) => `${cx + Math.cos(a) * R} ${cy + Math.sin(a) * R}`;
    stem.setAttribute('d', `M${p(a0)} A${R} ${R} 0 0 ${side > 0 ? 1 : 0} ${p(a1)}`);
    svg.appendChild(stem);
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + side * (0.38 + i * 0.22);
      const tangent = ((a + side * Math.PI / 2) * 180) / Math.PI;
      for (const off of [-1, 1]) {
        const leaf = document.createElementNS(NS, 'ellipse');
        const rr = R + off * 7;
        leaf.setAttribute('cx', cx + Math.cos(a) * rr);
        leaf.setAttribute('cy', cy + Math.sin(a) * rr);
        leaf.setAttribute('rx', 9 - i * 0.35);
        leaf.setAttribute('ry', 3.4);
        leaf.setAttribute('transform', `rotate(${tangent + off * side * 30} ${cx + Math.cos(a) * rr} ${cy + Math.sin(a) * rr})`);
        svg.appendChild(leaf);
      }
    }
  }
})();

/* ---------- Визитка: примерить эпоху ---------- */
(function tryOn() {
  const card = document.querySelector('.card');
  const name = card.querySelector('.card__name');
  const era = card.querySelector('.card__era');
  const input = document.getElementById('biz');
  const buttons = [...document.querySelectorAll('.tryon__eras button')];
  input.addEventListener('input', () => {
    name.textContent = input.value.trim() || 'Ваша компания';
  });
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
      card.dataset.style = btn.dataset.style;
      era.textContent = btn.textContent;
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = buttons.indexOf(btn) + (e.key === 'ArrowRight' ? 1 : -1);
      const next = buttons[(i + buttons.length) % buttons.length];
      next.focus();
      next.click();
    });
  });
})();

/* ---------- Камень в руках: крутить мышкой, стучать кликом ---------- */
const INTERACTIVE = 'a, button, input, label';
let grab = null;
let mouse = null; // последняя позиция мыши: подсветку камня проверяем каждый кадр, он двигается при прокрутке
document.addEventListener('mouseleave', () => { mouse = null; });
gsap.ticker.add(() => {
  if (!scene) return;
  const over = !!grab || (!!mouse && mouse.free && scene.hits(mouse.x, mouse.y));
  scene.setHover(over);
  document.body.classList.toggle('is-over-gem', over);
});
window.addEventListener('pointerdown', (e) => {
  if (!scene || e.button > 0 || e.target.closest(INTERACTIVE)) return;
  if (!scene.hits(e.clientX, e.clientY)) return;
  grab = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), mouse: e.pointerType === 'mouse' };
  if (grab.mouse) {
    scene.setDragging(true);
    document.body.classList.add('is-grabbing');
  }
});
window.addEventListener('pointermove', (e) => {
  if (scene) {
    // свет следует за курсором, а быстрое движение рассыпает искры
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    scene.lightAt(nx, ny);
    play.sparkBoost = Math.min(1.6, play.sparkBoost + Math.hypot(e.movementX || 0, e.movementY || 0) * 0.004);
    mouse = e.pointerType === 'mouse' ? { x: e.clientX, y: e.clientY, free: !e.target.closest(INTERACTIVE) } : null;
  }
  if (grab && grab.mouse) {
    scene.drag(e.clientX - grab.x, e.clientY - grab.y);
    grab.x = e.clientX;
    grab.y = e.clientY;
  }
});
window.addEventListener('pointerup', (e) => {
  if (!grab) return;
  const moved = Math.hypot(e.clientX - grab.sx, e.clientY - grab.sy);
  if (moved < 6 && performance.now() - grab.t < 400) {
    scene.hit(0.55);
    strike(0.55);
  }
  scene.setDragging(false);
  document.body.classList.remove('is-grabbing');
  grab = null;
});

/* ---------- Недра: пять нажатий до алмаза ---------- */
(function pressure() {
  const btn = document.querySelector('.press');
  const section = document.getElementById('nedra');
  const gauge = document.querySelector('.gauge');
  const PRESSES = 5;
  let count = 0;
  const shake = { v: 0 };

  btn.addEventListener('click', () => {
    if (count >= PRESSES) return;
    count++;
    const last = count === PRESSES;
    // каждое нажатие: толчок, гул, жар и шаг к алмазу
    gsap.to(play, { press: count / PRESSES, duration: 0.45, ease: 'power2.out' });
    play.holding = true;
    gsap.delayedCall(0.5, () => { play.holding = false; });
    gsap.fromTo(shake, { v: 0.4 + count * 0.12 }, { v: 0, duration: 0.5, ease: 'power2.out', onUpdate: () => scene && scene.setShake(shake.v) });
    rumble(0.4 + count * 0.12);
    gsap.delayedCall(0.35, () => rumble(0));
    strike(0.35 + count * 0.08);
    if (scene) scene.hit(last ? 0.9 : 0.25);
    btn.classList.remove('is-pressed');
    void btn.offsetWidth;
    btn.classList.add('is-pressed');
    if (last) {
      chime();
      btn.textContent = 'Алмаз готов';
      btn.disabled = true;
    } else {
      btn.textContent = `Ещё ${PRESSES - count}`;
    }
  });

  gsap.ticker.add(() => {
    section.style.setProperty('--press', play.press.toFixed(3));
    gauge.style.setProperty('--p', play.press.toFixed(3));
  });
})();

/* ---------- 1762: лупа находит наш камень в короне ---------- */
(function crown() {
  const field = document.querySelector('.crown-field');
  const lens = field.querySelector('.lens');
  const status = document.querySelector('.crown-status');
  const btn = document.querySelector('.crown-find');
  const COUNT = mobileMQ.matches ? 45 : 80;
  // наш камень держим подальше от краёв, чтобы лупа на нём не обрезалась
  const oursIndex = Math.floor(Math.random() * COUNT);
  let ours = null;
  for (let i = 0; i < COUNT; i++) {
    const g = document.createElement('span');
    g.className = 'cg';
    const edge = i === oursIndex ? 18 : 4;
    g.style.left = `${edge + Math.random() * (100 - edge * 2)}%`;
    g.style.top = `${edge + 4 + Math.random() * (92 - edge * 2)}%`;
    g.style.setProperty('--s', `${10 + Math.random() * 10}px`);
    if (i === oursIndex) { g.classList.add('is-ours'); ours = g; }
    field.insertBefore(g, lens);
  }

  const at = (x, y) => {
    gsap.set(lens, { x, y });
    field.style.setProperty('--mx', `${x}px`);
    field.style.setProperty('--my', `${y}px`);
  };

  btn.addEventListener('click', () => {
    btn.disabled = true;
    status.textContent = 'Ищу…';
    const w = field.clientWidth, h = field.clientHeight;
    const target = { x: ours.offsetLeft, y: ours.offsetTop };
    const pos = { x: w * 0.15, y: h * 0.5 };
    // лупа осматривает корону по нескольким точкам и останавливается на нашем
    const stops = [
      { x: w * 0.4, y: h * 0.25 },
      { x: w * 0.75, y: h * 0.7 },
      { x: w * 0.55, y: h * 0.45 },
      target,
    ];
    field.classList.add('is-searching');
    at(pos.x, pos.y);
    const tl = gsap.timeline({ onUpdate: () => at(pos.x, pos.y) });
    tl.to(lens, { opacity: 1, scale: 1, duration: 0.25 }, 0);
    stops.forEach((p, i) => tl.to(pos, { x: p.x, y: p.y, duration: i === stops.length - 1 ? 0.8 : 0.6, ease: 'power2.inOut' }));
    tl.to(lens, { scale: 1.25, duration: 0.25, ease: 'back.out(3)' })
      .call(() => {
        field.classList.add('is-found');
        ours.classList.add('is-found');
        status.textContent = 'Вот он. Так же выделю и ваш бизнес';
        btn.textContent = 'Найден';
        chime();
      })
      .to(lens, { opacity: 0, duration: 0.4 }, '+=0.4');
  });
})();

/* ---------- 1825: оправа по мерке ---------- */
(function fit() {
  const metals = [...document.querySelectorAll('.metal')];
  const size = document.querySelector('.size input');
  metals.forEach((m) => m.addEventListener('click', () => {
    metals.forEach((b) => b.setAttribute('aria-checked', String(b === m)));
    if (scene) scene.setRing(m.dataset.color);
  }));
  size.addEventListener('input', () => scene && scene.setRing(null, Number(size.value)));
})();

/* ---------- 1900: кувалда мастера ---------- */
(function forge() {
  const btn = document.querySelector('.forge');
  const hint = document.querySelector('.forge-hint');
  const steps = [...document.querySelectorAll('.steps li')];
  const vine = document.querySelector('.vine path');
  const hammer = document.querySelector('.hammer');
  let done = 0;
  let swing = null;

  const impact = () => {
    if (scene) scene.hit(1);
    strike(1);
    gsap.fromTo(canvas, { x: -6, y: 3 }, { x: 0, y: 0, duration: 0.4, ease: 'elastic.out(1, 0.3)' });
    if (done < steps.length) {
      steps[done].classList.add('is-done');
      done++;
      vine.style.strokeDashoffset = String(1 - done / steps.length);
      // каждый удар снимает с камня часть, после пятого он бриллиант
      const cut = Math.max(play.cut, done / steps.length);
      gsap.to(play, { cut, duration: 0.5, ease: 'power3.out' });
    }
    if (done === steps.length) {
      btn.textContent = 'Сайт готов. Ещё раз?';
      hint.textContent = 'дальше огранка, листайте';
      chime();
    } else {
      btn.textContent = `Удар ${done + 1} из ${steps.length}`;
    }
  };

  btn.addEventListener('click', () => {
    if (done === steps.length) {
      done = 0;
      steps.forEach((s) => s.classList.remove('is-done'));
      vine.style.strokeDashoffset = '1';
      btn.textContent = 'Сделать сайт';
      hint.textContent = 'нажмите';
      return;
    }
    hint.classList.add('is-quiet');
    if (!scene) { impact(); return; }
    // ставим кувалду так, чтобы боёк ударил в верх камня
    const s = scene.screen();
    const size = Math.max(150, s.r * 1.9);
    gsap.set(hammer, { width: size, height: size, left: s.x - size * 0.21, top: s.y - s.r * 0.8 - size * 0.76 });
    if (swing) swing.progress(1).kill();
    swing = gsap.timeline()
      .set(hammer, { opacity: 1, rotate: 60 })
      .to(hammer, { rotate: -2, duration: 0.17, ease: 'power3.in', onComplete: impact })
      .to(hammer, { rotate: 28, duration: 0.35, ease: 'power2.out' })
      .to(hammer, { opacity: 0, duration: 0.25 }, '-=0.15');
  });

  // если мастерскую пролистали, огранить можно прямо в 1919 той же кувалдой
  const decoBtn = document.querySelector('.deco-cut');
  decoBtn.addEventListener('click', () => {
    if (done === steps.length) return;
    btn.click();
  });
  gsap.ticker.add(() => {
    const left = steps.length - Math.round(play.cut * steps.length);
    decoBtn.hidden = left <= 0;
    const label = `Огранить: ещё ${left}`;
    if (decoBtn.textContent !== label) decoBtn.textContent = label;
  });
})();

/* ---------- Типографика эпох ---------- */
function split(el) {
  const text = el.textContent.trim();
  el.setAttribute('aria-label', text);
  el.textContent = '';
  const chars = [];
  text.split(' ').forEach((word, wi, arr) => {
    const w = document.createElement('span');
    w.className = 'w';
    w.setAttribute('aria-hidden', 'true');
    for (const ch of word) {
      const c = document.createElement('span');
      c.className = 'c';
      c.textContent = ch;
      w.appendChild(c);
      chars.push(c);
    }
    el.appendChild(w);
    if (wi < arr.length - 1) el.appendChild(document.createTextNode(' '));
  });
  return chars;
}

if (!reduce) {
  const scrub = (trigger, start = 'top 85%', end = 'top 35%') => ({ trigger, start, end, scrub: true });

  // Космос: буквы загораются, как звёзды. Единственная анимация при загрузке
  const h1 = document.querySelector('[data-fx="twinkle"]');
  const stars = split(h1);
  gsap.timeline({ delay: 0.2 })
    .from(stars, { opacity: 0, scale: () => gsap.utils.random(0.2, 1.8), duration: 1.1, ease: 'power2.out', stagger: { each: 0.05, from: 'random' } })
    .from('.era--space .byline, .era--space .lore, .scroll-hint', { opacity: 0, y: 14, duration: 0.8, stagger: 0.12 }, '-=0.5');

  // Недра: буквы сплющиваются под давлением
  const press = split(document.querySelector('[data-fx="press"]'));
  gsap.fromTo(press, { yPercent: -110, scaleY: 1.9, opacity: 0 }, {
    yPercent: 0, scaleY: 1, opacity: 1, ease: 'none', stagger: 0.06,
    scrollTrigger: scrub('#nedra h2', 'top 95%', 'top 55%'),
  });
  document.querySelectorAll('.strata path').forEach((p) => {
    gsap.to(p, { y: -Number(p.dataset.depth) * 70, ease: 'none', scrollTrigger: { trigger: '#nedra', start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  // 1762: позолота течёт по буквам
  gsap.fromTo('.gild', { backgroundPosition: '0% 50%', clipPath: 'inset(0 100% 0 0)' }, {
    backgroundPosition: '100% 50%', clipPath: 'inset(0 0% 0 0)', ease: 'none',
    scrollTrigger: scrub('.gild', 'top 85%', 'top 30%'),
  });
  gsap.from('.corner', { scale: 0, opacity: 0, ease: 'none', stagger: 0.1, scrollTrigger: scrub('.cartouche', 'top 85%', 'top 45%') });

  // 1825: слова сходятся к центру, линии расходятся от него
  gsap.fromTo('.spread__text', { letterSpacing: '0.5em', opacity: 0 }, {
    letterSpacing: '0em', opacity: 1, ease: 'none', scrollTrigger: scrub('.spread'),
  });
  gsap.fromTo('.spread .rule', { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: scrub('.spread', 'top 70%', 'top 30%') });
  gsap.from('.wreath ellipse', { scale: 0, transformOrigin: '50% 50%', ease: 'none', stagger: 0.02, scrollTrigger: scrub('.wreath', 'top 90%', 'top 45%') });

  // 1900: буквы плывут волной, линии рисуются сами
  const wave = split(document.querySelector('[data-fx="wave"]'));
  gsap.fromTo(wave,
    { y: (i) => Math.sin(i * 0.8) * 40, rotate: (i) => Math.sin(i * 0.8) * 10, opacity: 0 },
    { y: 0, rotate: 0, opacity: 1, ease: 'none', stagger: 0.04, scrollTrigger: scrub('#modern h2') });
  gsap.fromTo('.whiplash path', { strokeDashoffset: 1 }, {
    strokeDashoffset: 0, ease: 'none', stagger: 0.15,
    scrollTrigger: { trigger: '#modern', start: 'top 70%', end: 'bottom 60%', scrub: true },
  });

  // 1919: главная фраза проявляется вместе с огранкой камня
  gsap.timeline({ scrollTrigger: { trigger: '.deco-stage', start: 'top top', end: 'bottom bottom', scrub: true } })
    .fromTo('.sunburst', { opacity: 0, scale: 0.6, rotate: -25 }, { opacity: 1, scale: 1, rotate: 0, duration: 0.6, ease: 'none' }, 0)
    .fromTo('.deco-line--a', { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.25, ease: 'none' }, 0.02)
    .fromTo('.deco-year', { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'none' }, 0.1)
    .fromTo('.deco-line--b', { clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0%)', duration: 0.25, ease: 'none' }, 0.45)
    .to({}, { duration: 0.3 });
}

measure();
