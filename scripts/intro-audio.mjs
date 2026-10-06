// 「群記」開場動畫的音樂＋音效：全部用程式合成（不用任何現成音樂，沒有版權問題），時間點跟影片的時間軸一起算
// 聲音設計：
//   背景（只在起飛前）：暗暗的小調和弦鋪底＋一片模糊的嘈雜（群組裡的雜訊）＋零星的小提示音
//   飛行時：張翅那刻起，背景（含殘響）0.2 秒內收掉，只剩樹枝「啪」、張翅和滑翔的風聲，直到扣住
//   貓頭鷹：眼睛左右看、眨眼是很輕的「喀」；風聲只在飛行時，收翅沒有聲音
//   瞄準：鎖定時一聲輕輕往上的「叮」；扣住：低沉的重擊 → 波紋柔和的「嗡」往兩邊散開 → 波紋掃完才完全無聲，直到訊號音開始
//   安靜之後只剩特效、沒有背景也沒有風聲：訊息往右飛、放大時四聲柔和的「叮」訊號；抵達變成標題：一聲清亮的鈴＋四個鈴音往上
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
  const N = Math.round(dur * SR), bus = () => [0, 0, 0, 0].map(() => new Float32Array(N)); // [左, 右, 送殘響左, 送殘響右]
  const MAIN = bus(), FX = bus(), [L, R, revL, revR] = MAIN; // FX＝特效（飛行時、安靜之後唯一聽得到的）
  const idx = (t) => Math.round(t * SR);
  // 放一段聲音：fn(秒, 第幾格) 回傳單聲道值；pan －1 左～＋1 右（可以是函式）；send 送進殘響多少；fx＝特效
  const put = (start, len, fn, { gain = 1, pan = 0, send = 0, fx = false } = {}) => {
    const [dL, dR, sL, sR] = fx ? FX : MAIN, i0 = Math.max(0, idx(start)), i1 = Math.min(N, idx(start + len));
    for (let i = i0; i < i1; i++) {
      const tt = (i - idx(start)) / SR, v = fn(tt, i) * gain, p = typeof pan === 'function' ? pan(tt) : pan;
      const gl = Math.cos(((p + 1) * Math.PI) / 4), gr = Math.sin(((p + 1) * Math.PI) / 4);
      dL[i] += v * gl; dR[i] += v * gr;
      if (send) { sL[i] += v * gl * send; sR[i] += v * gr * send; }
    }
  };
  const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d)); // 起音 a 秒、之後以 d 秒衰減
  const smooth = (x) => x * x * (3 - 2 * x);
  const hz = (n) => 440 * 2 ** ((n - 69) / 12); // MIDI 音高 → 頻率
  // 完全無聲的那段：S0 波紋掃完（約 0.5 秒掃過整個畫面）→ S1 訊息往右飛的訊號音開始
  const S0 = T.HIT + 0.5, S1 = T.REL + 0.45;

  // ── 音樂：D 小調（加 9 音）和弦鋪底，暗暗的，盯著；張翅時被收掉（每個音三條稍微走音的鋸齒波，經過低通濾波＝溫暖的合成器墊音）
  [38, 50, 53, 57, 64].forEach((n, k) => {
    const lp = biquad('lp'), ph = [0, 0, 0], det = [-0.006, 0, 0.0065], f = hz(n), pan = (k / 2 - 1) * 0.55;
    put(0, T.FLY0, (t) => {
      if (t % (32 / SR) < 1 / SR) lp.set(450 + 250 * smooth(t / T.FLY0), 0.8);
      let s = 0;
      for (let j = 0; j < 3; j++) { ph[j] = (ph[j] + (f * (1 + det[j])) / SR) % 1; s += 2 * ph[j] - 1; }
      return lp.run(s / 3) * Math.min(1, t / 1.6);
    }, { gain: 0.55 * 0.055, pan, send: 0.35 });
  });
  // ── 噪音：一片模糊的嘈雜＋零星的小提示音；起飛就沒了（張翅時被收掉）
  const rnd = makeRand(11);
  { const bp = biquad('bp'), bp2 = biquad('bp'); let ph = 0;
    put(0, T.FLY0, (t) => {
      ph += (2 * Math.PI * 0.7) / SR;
      if (t % (32 / SR) < 1 / SR) { bp.set(650 + 250 * Math.sin(ph * 1.7), 1.2); bp2.set(1500 + 400 * Math.sin(ph * 0.9 + 1), 2); }
      const n = rnd() * 2 - 1, w = 0.6 + 0.4 * Math.sin(t * 9 + Math.sin(t * 2.3) * 3);
      return (bp.run(n) * 0.8 + bp2.run(n) * 0.4) * w * Math.min(1, t / 0.8);
    }, { gain: 0.3, send: 0.2 }); }
  for (let i = 0; i < 22; i++) { // 零星的提示音（像別人的訊息一直跳出來）
    const st = 0.15 + rnd() * (T.TRANS - 0.2), f = 900 + rnd() * 1600, p = rnd() * 1.6 - 0.8;
    put(st, 0.12, (t) => Math.sin(2 * Math.PI * f * t) * env(t, 0.003, 0.03), { gain: 0.035 + 0.03 * rnd(), pan: p, send: 0.3 });
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
    put(T.FLY0, 0.4, (t) => Math.sin(2 * Math.PI * (95 - 40 * t) * t) * env(t, 0.003, 0.07) * 0.8 + hp.run(r2() * 2 - 1) * env(t, 0.001, 0.025) * (1 + 0.6 * Math.sin(t * 900)), { gain: 0.32, pan: -0.55, send: 0.2, fx: true }); }

  // ── 風聲（安靜的飛行）：一段帶通雜訊，中心頻率往上滑；sw＝[開始, 長度, 起點頻率, 終點頻率, 音量, 左右]（都算特效）
  const whoosh = (st, len, f0, f1, g, pan, q = 1.1) => { const bp = biquad('bp'), r2 = makeRand(idx(st) + 3);
    put(st, len, (t) => { if (t % (32 / SR) < 1 / SR) bp.set(f0 * (f1 / f0) ** smooth(t / len), q); return bp.run(r2() * 2 - 1) * Math.sin(Math.PI * Math.min(1, t / len)) ** 1.5; }, { gain: g, pan, send: 0.3, fx: true }); };
  whoosh(T.TRANS, 1.3, 350, 1600, 0.22, (t) => -0.5 + 0.3 * t);          // 張翅
  whoosh(T.FLY0 + 0.2, T.GRAB - T.FLY0 - 0.15, 300, 2400, 0.17, (t) => -0.4 + 0.45 * Math.min(1, t / 2), 0.8); // 滑翔，越飛越快（輕輕的，不吵）

  // ── 扣住：低沉的重擊（往下掉的低音）＋短短的撞擊聲＋爪子的金屬亮音
  { const r2 = makeRand(9); let ph = 0;
    put(T.GRAB, 1.6, (t) => { ph += (2 * Math.PI * (40 + 55 * Math.exp(-t * 9))) / SR; return Math.sin(ph) * env(t, 0.004, 0.45); }, { gain: 0.3, send: 0.15 });
    put(T.GRAB, 0.05, (t) => (r2() * 2 - 1) * env(t, 0.0005, 0.008), { gain: 0.22 });
    [[2150, 0.55], [3410, 0.4], [5230, 0.3], [6870, 0.2]].forEach(([f, a], k) =>
      put(T.GRAB + 0.01, 0.6, (t) => Math.sin(2 * Math.PI * f * t) * env(t, 0.002, 0.1 - 0.015 * k) * a, { gain: 0.07, pan: k % 2 ? 0.2 : -0.2, send: 0.25 })); } // 短短的就好，別一路響進無聲

  // ── 波紋：一聲柔和的「嗡」（F、C、A 三個音疊在一起的純音，軟軟地起音、微微往下沉），
  //    左右兩半從中間往兩邊散開＝跟著波紋往外擴；不加閃光音（太碎、太搶），比重擊小聲，在 S0 前自然收完
  [-1, 1].forEach((side) => { let ph = 0;
    put(T.HIT, S0 - T.HIT + 0.1, (t) => {
      ph += (2 * Math.PI * hz(65) * (1 + 0.03 * Math.exp(-t * 10) + 0.004 * side)) / SR; // 左右差一點點音高＝比較寬、比較柔
      return (Math.sin(ph) + 0.5 * Math.sin(1.5 * ph) + 0.15 * Math.sin(2.5 * ph)) * env(t, 0.025, 0.16);
    }, { gain: 0.04, pan: (t) => side * 0.7 * smooth(Math.min(1, t / 0.4)), send: 0.45, fx: true }); });

  // ── 訊息往右飛、越飛越大：四聲柔和的「叮」訊號（像雷達一下一下送出去），間隔慢慢變短、慢慢變大聲、位置跟著訊息往右；
  //    都是同一個音 C6，接到標題那聲 F 的鈴＝聽起來是「送到了」；收翅沒有聲音（風聲只在飛行時）
  { const len = T.ARRIVE - T.REL, f = hz(84);
    for (let t = S1 - T.REL; t < len - 0.18;) {
      const k = smooth(t / len);
      put(T.REL + t, 0.6, (tt) => (Math.sin(2 * Math.PI * f * tt) + 0.12 * Math.sin(4 * Math.PI * f * tt)) * env(tt, 0.006, 0.12), { gain: 0.035 + 0.035 * k, pan: 0.8 * k, send: 0.5, fx: true });
      t += 0.2 - 0.07 * k;
    } }

  // ── 抵達、變成標題：一聲清亮的鈴（敲擊金屬的泛音）＋四個音的琶音
  const bell = (at, n, g, p = 0) => [[1, 1], [2.0, 0.5], [2.76, 0.32], [5.4, 0.16], [8.93, 0.08]].forEach(([r, a]) =>
    put(at, 3.2, (t) => Math.sin(2 * Math.PI * hz(n) * r * t) * env(t, 0.002, 1.1 / r ** 0.5) * a, { gain: g, pan: p, send: 0.55, fx: true }));
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
  const wl = reverb(revL, 0), wr = reverb(revR, 23), fwl = reverb(FX[2], 0), fwr = reverb(FX[3], 23);
  // 波紋掃完後完全無聲：全部切掉，直到訊息往右飛的訊號音開始才回來（只回來特效）
  const hush = (t) => (t < S0 ? 1 : t < S0 + 0.1 ? 1 - (t - S0) / 0.1 : t < S1 ? 0 : Math.min(1, (t - S1) / 0.12));
  // 背景（含殘響）只在起飛前、扣住那一下聽得到：張翅那刻起 0.2 秒內收掉；安靜之後就不再回來
  const quiet = (t) => (t < T.TRANS ? 1 : t < T.FLY0 ? 1 - (t - T.TRANS) / (T.FLY0 - T.TRANS) : t >= T.GRAB && t < S1 ? 1 : 0);
  // ── 混音：加回殘響、輕輕壓縮（tanh）、整體音量拉到最大聲處約 −1 dB、頭尾淡入淡出
  let peak = 0;
  for (let i = 0; i < N; i++) {
    const q = quiet(i / SR);
    L[i] = Math.tanh(((L[i] + wl[i]) * q + FX[0][i] + fwl[i]) * 1.4); R[i] = Math.tanh(((R[i] + wr[i]) * q + FX[1][i] + fwr[i]) * 1.4);
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const g = 0.89 / peak;
  for (let i = 0; i < N; i++) { const t = i / SR, f = Math.min(1, t / 0.05, (dur - t) / 0.6) * hush(t); L[i] *= g * f; R[i] *= g * f; }
  return { L, R, SR };
};

// 寫成 16 位元立體聲 WAV
export const writeWav = (file, { L, R, SR: sr }) => {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4); }
  writeFileSync(file, buf);
};
