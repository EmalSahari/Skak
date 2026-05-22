// Lightweight synthesized sound effects via the Web Audio API — no asset files.
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function blip(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.06) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
  osc.connect(g).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duration);
}

export const sounds = {
  move: () => blip(440, 0.08, 'triangle'),
  capture: () => blip(220, 0.12, 'square', 0.05),
  check: () => {
    blip(660, 0.1, 'sawtooth', 0.05);
    setTimeout(() => blip(880, 0.12, 'sawtooth', 0.05), 90);
  },
  end: () => {
    blip(520, 0.15, 'sine');
    setTimeout(() => blip(390, 0.25, 'sine'), 140);
  },
};
