// Все звуки синтезируются на лету и играют только в ответ на действие человека
let ctx = null;
function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(ac, { type = 'sine', freq, to, gain, attack = 0.002, decay, when = 0 }) {
  const t = ac.currentTime + when;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + decay);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + decay + 0.05);
}

function noise(ac, { gain, decay, cutoff }) {
  const len = Math.floor(ac.sampleRate * decay);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = cutoff;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(ac.destination);
  src.start();
}

// Удар молота по камню: глухой толчок, треск и металлический отзвук
export function strike(power = 1) {
  const ac = audio();
  if (!ac) return;
  tone(ac, { freq: 150, to: 45, gain: 0.7 * power, decay: 0.22 });
  noise(ac, { gain: 0.5 * power, decay: 0.12, cutoff: 1800 });
  [1240, 1873, 2611, 3460].forEach((f, i) => {
    tone(ac, { freq: f * (0.97 + Math.random() * 0.06), gain: 0.09 * power / (i + 1), decay: 0.5 + i * 0.15 });
  });
}

// Эхо зала: импульс из затухающего шума, чтобы финальный удар звучал протяжно
let hall = null;
function reverb(ac) {
  if (hall) return hall;
  const len = Math.floor(ac.sampleRate * 3.2);
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.5;
  }
  hall = ac.createConvolver();
  hall.buffer = ir;
  const wet = ac.createGain();
  wet.gain.value = 0.55;
  hall.connect(wet).connect(ac.destination);
  return hall;
}

function bell(ac, out, { freq, gain, decay, when = 0 }) {
  const t = ac.currentTime + when;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g);
  g.connect(ac.destination);
  g.connect(out);
  o.start(t);
  o.stop(t + decay + 0.05);
}

// Последний удар: грохот, треск и долгий звон огранённого камня
export function finalStrike() {
  const ac = audio();
  if (!ac) return;
  const hallIn = reverb(ac);
  tone(ac, { freq: 95, to: 28, gain: 0.95, decay: 1.3 });
  tone(ac, { freq: 60, to: 22, gain: 0.6, decay: 1.6, when: 0.02 });
  noise(ac, { gain: 0.8, decay: 0.35, cutoff: 900 });
  // колокол: негармоничные обертоны дают «звенящий» металл
  [1, 2.76, 5.4, 8.93, 13.34].forEach((r, i) => {
    bell(ac, hallIn, { freq: 520 * r, gain: 0.16 / (i + 1), decay: 3.6 - i * 0.5 });
  });
  // хрустальная россыпь следом
  [2093, 2637, 3136, 3951, 4699].forEach((f, i) => {
    bell(ac, hallIn, { freq: f, gain: 0.05, decay: 1.8, when: 0.35 + i * 0.09 });
  });
}

// Короткий звон: камень готов
export function chime() {
  const ac = audio();
  if (!ac) return;
  [1568, 2093, 2637, 3136].forEach((f, i) => tone(ac, { freq: f, gain: 0.08, decay: 0.9, when: i * 0.07 }));
}

// Низкий гул давления, громкость задаётся снаружи
let rumbleOsc = null, rumbleGain = null;
export function rumble(level) {
  const ac = level > 0 ? audio() : ctx;
  if (!ac) return;
  if (!rumbleOsc && level > 0) {
    rumbleOsc = ac.createOscillator();
    rumbleOsc.type = 'sawtooth';
    rumbleOsc.frequency.value = 42;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    rumbleGain = ac.createGain();
    rumbleGain.gain.value = 0;
    rumbleOsc.connect(lp).connect(rumbleGain).connect(ac.destination);
    rumbleOsc.start();
  }
  if (rumbleGain) {
    rumbleGain.gain.setTargetAtTime(level * 0.35, ac.currentTime, 0.05);
    rumbleOsc.frequency.setTargetAtTime(42 + level * 30, ac.currentTime, 0.1);
  }
}
