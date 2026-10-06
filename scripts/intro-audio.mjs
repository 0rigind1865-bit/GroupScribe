// 「群記」開場動畫的音樂＋音效：全部用程式合成（不用任何現成音樂，沒有版權問題），時間點跟影片的時間軸一起算
// 聲音設計：
//   音樂：暗暗的小調和弦鋪底 → 起飛後和弦往上走、濾波慢慢打開、加一個像心跳的低音，緊張感往上推 → 扣住訊息時重擊
//        → 明亮的大調和弦 → 訊息變成標題時一聲鈴、四個音的琶音，慢慢收掉
//   噪音：一片模糊的嘈雜（群組裡的雜訊）＋零星的小提示音，波紋掃過時一口氣清空、變安靜
//   貓頭鷹：眼睛左右看、眨眼是很輕的「喀」；起飛時樹枝「啪」一下；張翅、滑翔、收翅只有很輕的風聲（貓頭鷹飛行是安靜的）
//   瞄準：鎖定時一聲輕輕往上的「叮」；扣住：低沉的重擊＋爪子的金屬亮音；波紋：一聲「嗡」加上往外散的閃光音
//   訊息往右飛：「咻」一聲從中間往右；抵達變成標題：一聲清亮的鈴
// 用法：被 scripts/intro-video.mjs 呼叫（renderIntroAudio）；只想試聽聲音：node scripts/intro-video.mjs --wav 試聽.wav
import { writeFileSync } from 'node:fs';

const SR = 48000;

// 固定亂數種子：每次產生的聲音都一樣
const makeRand = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// 二階濾波器（RBJ 公式）：可以每一格換截止頻率
const biquad = (type) => {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  const set = (f, q = 0.7) => {
    const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR, c = Math.cos(w), a = Math.sin(w) / (2 * q), n = 1 + a;
    if (type === 'lp') { b0 = (1 - c) / 2 / n; b1 = (1 - c) / n; b2 = b0; }
    else if (type === 'hp') { b0 = (1 + c) / 2 / n; b1 = -(1 + c) / n; b2 = b0; }
    else { b0 = a / n; b1 = 0; b2 = -a / n; } // 帶通
    a1 = (-2 * c) / n; a2 = (1 - a) / n;
  };
  set(1000);
  return { set, run: (x) => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; } };
};

export const renderIntroAudio = (T, dur) => {
  const N = Math.round(dur * SR), L = new Float32Array(N), R = new Float32Array(N), revL = new Float32Array(N), revR = new Float32Array(N);
  const idx = (t) => Math.round(t * SR);
  // 放一段聲音：fn(秒, 第幾格) 回傳單聲道值；pan －1 左～＋1 右（可以是函式）；send 送進殘響多少
  const put = (start, len, fn, { gain = 1, pan = 0, send = 0 } = {}) => {
    const i0 = Math.max(0, idx(start)), i1 = Math.min(N, idx(start + len));
    for (let i = i0; i < i1; i++) {
      const tt = (i - idx(start)) / SR, v = fn(tt, i) * gain, p = typeof pan === 'function' ? pan(tt) : pan;
      const gl = Math.cos(((p + 1) * Math.PI) / 4), gr = Math.sin(((p + 1) * Math.PI) / 4);
      L[i] += v * gl; R[i] += v * gr;
      if (send) { revL[i] += v * gl * send; revR[i] += v * gr * send; }
    }
  };
  const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d)); // 起音 a 秒、之後以 d 秒衰減
  const smooth = (x) => x * x * (3 - 2 * x);
  const fadeIO = (t, len, fi, fo) => Math.min(1, t / fi, Math.max(0, (len - t) / fo));
  const hz = (n) => 440 * 2 ** ((n - 69) / 12); // MIDI 音高 → 頻率

  // ── 音樂：和弦鋪底（每個音三條稍微走音的鋸齒波，經過低通濾波＝溫暖的合成器墊音）
  const CHORDS = [ // [開始秒, 長度, MIDI 音, 濾波起點, 濾波終點, 音量]
    [0, 2.4, [38, 50, 53, 57, 64], 450, 700, 0.55],                  // D 小調（加 9 音）：暗暗的，盯著
    [2.2, 1.2, [34, 46, 50, 53, 57], 700, 1400, 0.6],               // 降 B 大七：起飛
    [3.35, 1.1, [36, 48, 53, 55, 60], 1400, 2600, 0.68],            // C 掛四：越飛越快，往上推
    [T.GRAB, 1.9, [41, 53, 57, 60, 67], 2600, 1800, 0.72],          // F 大調（加 9 音）：扣住，一下子亮起來
    [T.ARRIVE - 0.2, dur - T.ARRIVE + 0.2, [41, 53, 57, 60, 64, 69], 1800, 900, 0.62], // F 大七：標題，慢慢收掉
  ];
  CHORDS.forEach(([st, len, notes, f0, f1, vol], ci) => {
    notes.forEach((n, k) => {
      const lp = biquad('lp'), ph = [0, 0, 0], det = [-0.006, 0, 0.0065], f = hz(n), pan = ((k / (notes.length - 1)) * 2 - 1) * 0.55;
      const last = ci === CHORDS.length - 1;
      put(st, len + 0.6, (t) => {
        if (t % (1 / SR * 32) < 1 / SR) lp.set(f0 + (f1 - f0) * smooth(Math.min(1, t / len)), 0.8);
        let s = 0;
        for (let j = 0; j < 3; j++) { ph[j] = (ph[j] + (f * (1 + det[j])) / SR) % 1; s += 2 * ph[j] - 1; }
        const a = Math.min(1, t / (ci === 0 ? 1.6 : 0.35)), r = t > len ? Math.max(0, 1 - (t - len) / 0.6) : 1, tail = last ? Math.max(0, Math.min(1, (len - t) / 2.2)) : 1;
        return lp.run(s / 3) * a * r * tail;
      }, { gain: (vol * 0.055) / Math.sqrt(notes.length / 5), pan, send: 0.35 });
    });
  });
  // 像心跳的低音：起飛後越來越快、越來越大聲，扣住那刻停
  for (let t = T.FLY0; t < T.GRAB - 0.1;) {
    const k = (t - T.FLY0) / (T.GRAB - T.FLY0), f = hz(33);
    put(t, 0.35, (tt) => Math.sin(2 * Math.PI * f * tt * (1 - 0.15 * tt)) * env(tt, 0.008, 0.1), { gain: 0.05 + 0.07 * k, send: 0.1 });
    t += lerp(0.6, 0.22, k);
  }

  // ── 噪音：一片模糊的嘈雜＋零星的小提示音；波紋掃過時一口氣清空
  const rnd = makeRand(11), cut = (t) => (t < T.HIT ? 1 : Math.max(0, 1 - (t - T.HIT) / 0.35));
  { const bp = biquad('bp'), bp2 = biquad('bp'); let ph = 0;
    put(0, T.HIT + 0.4, (t) => {
      ph += (2 * Math.PI * 0.7) / SR;
      if (t % (32 / SR) < 1 / SR) { bp.set(650 + 250 * Math.sin(ph * 1.7), 1.2); bp2.set(1500 + 400 * Math.sin(ph * 0.9 + 1), 2); }
      const n = rnd() * 2 - 1, w = 0.6 + 0.4 * Math.sin(t * 9 + Math.sin(t * 2.3) * 3);
      return (bp.run(n) * 0.8 + bp2.run(n) * 0.4) * w * Math.min(1, t / 0.8) * cut(t);
    }, { gain: 0.3, send: 0.2 }); }
  for (let i = 0; i < 46; i++) { // 零星的提示音（像別人的訊息一直跳出來）
    const st = 0.15 + rnd() * (T.HIT - 0.3), f = 900 + rnd() * 1600, p = rnd() * 1.6 - 0.8;
    put(st, 0.12, (t) => Math.sin(2 * Math.PI * f * t) * env(t, 0.003, 0.03) * cut(st + t), { gain: 0.035 + 0.03 * rnd(), pan: p, send: 0.3 });
  }

  // ── 貓頭鷹：眼睛左右看、眨眼（很輕的「喀」）
  const tick = (at, f, g, p = 0) => { const hp = biquad('hp'); hp.set(1500); const r2 = makeRand(idx(at));
    put(at, 0.08, (t) => (Math.sin(2 * Math.PI * f * t) * env(t, 0.001, 0.012) + hp.run(r2() * 2 - 1) * env(t, 0.0005, 0.004)), { gain: g, pan: p, send: 0.25 }); };
  T.LOOKS.forEach(([at, p]) => tick(at, 2400, 0.05, p));
  T.BLINKS.forEach((at) => { tick(at, 1100, 0.07); tick(at + 0.16, 1300, 0.05); });

  // ── 鎖定：一聲輕輕往上的「叮」
  put(T.LOCK, 0.9, (t) => Math.sin(2 * Math.PI * (880 + 340 * Math.min(1, t / 0.12)) * t) * env(t, 0.005, 0.25), { gain: 0.08, pan: 0.25, send: 0.5 });

  // ── 起飛：樹枝「啪」一下（低低的悶響＋短短的木頭裂響）
  { const hp = biquad('hp'); hp.set(2500); const r2 = makeRand(5);
    put(T.FLY0, 0.4, (t) => Math.sin(2 * Math.PI * (95 - 40 * t) * t) * env(t, 0.003, 0.07) * 0.8 + hp.run(r2() * 2 - 1) * env(t, 0.001, 0.025) * (1 + 0.6 * Math.sin(t * 900)), { gain: 0.32, pan: -0.55, send: 0.2 }); }

  // ── 風聲（安靜的飛行）：一段帶通雜訊，中心頻率往上滑；sw＝[開始, 長度, 起點頻率, 終點頻率, 音量, 左右]
  const whoosh = (st, len, f0, f1, g, pan, q = 1.1) => { const bp = biquad('bp'), r2 = makeRand(idx(st) + 3);
    put(st, len, (t) => { if (t % (32 / SR) < 1 / SR) bp.set(f0 * (f1 / f0) ** smooth(t / len), q); return bp.run(r2() * 2 - 1) * Math.sin(Math.PI * Math.min(1, t / len)) ** 1.5; }, { gain: g, pan, send: 0.3 }); };
  whoosh(T.TRANS, 1.3, 350, 1600, 0.22, (t) => -0.5 + 0.3 * t);          // 張翅
  whoosh(T.FLY0 + 0.2, T.GRAB - T.FLY0 - 0.15, 300, 2400, 0.3, (t) => -0.4 + 0.45 * Math.min(1, t / 2), 0.8); // 滑翔，越飛越快
  // 往上推的上升音（扣住前一刻剎住，留一點點空白讓重擊更有力）
  { let ph = 0; put(T.FLY0 + 0.8, T.GRAB - T.FLY0 - 0.85, (t, i) => { const k = t / (T.GRAB - T.FLY0 - 0.85); ph += (2 * Math.PI * (180 * 2 ** (2 * k))) / SR; return Math.sin(ph) * k ** 2 * (1 - smooth(Math.max(0, (k - 0.97) / 0.03))); }, { gain: 0.06, send: 0.4 }); }

  // ── 扣住：低沉的重擊（往下掉的低音）＋短短的撞擊聲＋爪子的金屬亮音
  { const r2 = makeRand(9); let ph = 0;
    put(T.GRAB, 1.6, (t) => { ph += (2 * Math.PI * (40 + 55 * Math.exp(-t * 9))) / SR; return Math.sin(ph) * env(t, 0.004, 0.45); }, { gain: 0.3, send: 0.15 });
    put(T.GRAB, 0.05, (t) => (r2() * 2 - 1) * env(t, 0.0005, 0.008), { gain: 0.22 });
    [[2150, 0.55], [3410, 0.4], [5230, 0.3], [6870, 0.2]].forEach(([f, a], k) =>
      put(T.GRAB + 0.01, 1.2, (t) => Math.sin(2 * Math.PI * f * t) * env(t, 0.002, 0.22 - 0.03 * k) * a, { gain: 0.07, pan: k % 2 ? 0.2 : -0.2, send: 0.5 })); }

  // ── 波紋：一聲「嗡」往外散（低通雜訊，截止頻率往下）＋往兩邊散開的閃光音
  { const lp = biquad('lp'), r2 = makeRand(21);
    put(T.HIT, 1.4, (t) => { if (t % (32 / SR) < 1 / SR) lp.set(2600 * Math.exp(-t * 2.2) + 120, 0.9); return lp.run(r2() * 2 - 1) * env(t, 0.06, 0.4); }, { gain: 0.35, send: 0.4 });
    for (let k = 0; k < 14; k++) { const st = T.HIT + 0.05 + k * 0.055 + r2() * 0.03, f = 2600 + r2() * 4200, p = (k % 2 ? 1 : -1) * (0.2 + 0.06 * k);
      put(st, 0.6, (t) => Math.sin(2 * Math.PI * f * t) * env(t, 0.002, 0.12), { gain: 0.025, pan: Math.max(-1, Math.min(1, p)), send: 0.6 }); } }

  // ── 放開訊息、往右飛：「咻」從中間往右；同時收翅：一聲往下的輕風聲在左邊
  whoosh(T.REL, T.ARRIVE - T.REL, 600, 3200, 0.26, (t) => Math.min(0.85, 0.1 + 0.75 * (t / (T.ARRIVE - T.REL))));
  whoosh(T.BACK, T.BACK_D, 1400, 380, 0.14, -0.55);

  // ── 抵達、變成標題：一聲清亮的鈴（敲擊金屬的泛音）＋四個音的琶音
  const bell = (at, n, g, p = 0) => [[1, 1], [2.0, 0.5], [2.76, 0.32], [5.4, 0.16], [8.93, 0.08]].forEach(([r, a]) =>
    put(at, 3.2, (t) => Math.sin(2 * Math.PI * hz(n) * r * t) * env(t, 0.002, 1.1 / r ** 0.5) * a, { gain: g, pan: p, send: 0.55 }));
  bell(T.ARRIVE - 0.05, 77, 0.12, 0.35);
  [77, 81, 84, 88].forEach((n, k) => bell(T.ARRIVE + 0.35 + k * 0.16, n, 0.045, 0.1 + 0.12 * k));

  // ── 殘響（四條梳狀濾波＋兩條全通，像房間的回音），加回主聲道
  const reverb = (inp, seed) => {
    const out = new Float32Array(N), combs = [1557, 1617, 1491, 1422].map((d) => ({ b: new Float32Array(Math.round((d + seed) * 1.1)), i: 0, f: 0 }));
    const aps = [556, 441].map((d) => ({ b: new Float32Array(d + seed), i: 0 }));
    for (let n = 0; n < N; n++) {
      let s = 0;
      for (const c of combs) { const y = c.b[c.i]; c.f = y * 0.75 + c.f * 0.25; c.b[c.i] = inp[n] + c.f * 0.82; c.i = (c.i + 1) % c.b.length; s += y; }
      for (const a of aps) { const y = a.b[a.i]; a.b[a.i] = s + y * 0.5; s = y - s * 0.5; a.i = (a.i + 1) % a.b.length; }
      out[n] = s * 0.25;
    }
    return out;
  };
  const wl = reverb(revL, 0), wr = reverb(revR, 23);
  // ── 混音：加回殘響、輕輕壓縮（tanh）、整體音量拉到最大聲處約 −1 dB、頭尾淡入淡出
  let peak = 0;
  for (let i = 0; i < N; i++) { L[i] = Math.tanh((L[i] + wl[i]) * 1.4); R[i] = Math.tanh((R[i] + wr[i]) * 1.4); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  const g = 0.89 / peak;
  for (let i = 0; i < N; i++) { const t = i / SR, f = Math.min(1, t / 0.05, (dur - t) / 0.6); L[i] *= g * f; R[i] *= g * f; }
  return { L, R, SR };
};
const lerp = (a, b, k) => a + (b - a) * k;

// 寫成 16 位元立體聲 WAV
export const writeWav = (file, { L, R, SR: sr }) => {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4); }
  writeFileSync(file, buf);
};
