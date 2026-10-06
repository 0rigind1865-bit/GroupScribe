// 產生「群記」開場動畫影片（1920×1080、60fps、9 秒、含配樂與音效：scripts/intro-audio.mjs）
// 故事：滿畫面亂抖的對話框（噪音）→ 暗處樹枝上一隻貓頭鷹（原本的 logo），金眼左看右看 → 亮起來、變身張翅成俯衝版（甲）、
//      起飛一路滑翔、越來越快撲向那個重要的訊息 → 金色爪子一把扣住 → 一圈波紋把噪音清空
//      → 放開訊息，訊息往右飛、越飛越大，變成「群記」標題；貓頭鷹收翅變回原本的 logo、退到左邊（眼睛的光熄掉）→ 英文名與標語、眨眼
// 貓頭鷹本身的動作（張翅、變身、伸爪抓）直接用 scripts/mark-dive-open.mjs 的 owlLayer，兩支影片的動作永遠一致
// 用法：node scripts/intro-video.mjs → public/brand/intro.mp4（加 --still 3.2 只輸出那一秒的靜態圖；--audio 只重做配樂；--wav 檔名 只輸出配樂試聽）
// 流程：每一格算好位置寫成 SVG → sharp 轉 PNG → macOS 內建 AVFoundation（swift）壓成 H.264 MP4，不用裝 ffmpeg
import sharp from 'sharp';
import { writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { owlLayer, bubbleSvg, eyesAt, BUBBLE_C, TIMES } from './mark-dive-open.mjs';
import { renderIntroAudio, writeWav } from './intro-audio.mjs';

const W = 1920, H = 1080, FPS = 60;
export const DUR = 9;
const OUT = 'public/brand/intro.mp4';
const BG = '#0b4a38', IVORY = '#f6f4ee', GOLD = '#d4b26a', MINT = '#e3ece5', NOISE_C = '#5b927d';

const clamp = (x) => Math.min(1, Math.max(0, x));
const prog = (t, start, dur) => clamp((t - start) / dur);
const outCubic = (x) => 1 - (1 - x) ** 3;
const outBack = (x) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2; // 稍微衝過頭再彈回
const inOutCubic = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const inOutSine = (x) => (1 - Math.cos(Math.PI * x)) / 2;
const lerp = (a, b, k) => a + (b - a) * k;
const bump = (t, at, width) => Math.exp(-(((t - at) / width) ** 2));
// 兩個顏色混合（k=0 是 a、k=1 是 b）；用來讓貓頭鷹「由暗變亮」但身體不透明，背景噪音不會透過來
const mix = (a, b, k) => '#' + [1, 3, 5].map((i) => Math.round(lerp(parseInt(a.slice(i, i + 2), 16), parseInt(b.slice(i, i + 2), 16), k)).toString(16).padStart(2, '0')).join('');

// 關鍵影格 [[秒, 值], …]：中間用平滑曲線（Catmull-Rom）串起來，速度連續
const keys = (k) => (t) => {
  const n = k.length - 1;
  if (t <= k[0][0]) return k[0][1];
  if (t >= k[n][0]) return k[n][1];
  let i = 0;
  while (t > k[i + 1][0]) i++;
  const slope = (a, b) => (k[b][1] - k[a][1]) / (k[b][0] - k[a][0]);
  const h = k[i + 1][0] - k[i][0], x = (t - k[i][0]) / h;
  const m0 = i > 0 ? slope(i - 1, i + 1) * h : 0, m1 = i + 1 < n ? slope(i, i + 2) * h : 0;
  return (2 * x ** 3 - 3 * x ** 2 + 1) * k[i][1] + (x ** 3 - 2 * x ** 2 + x) * m0 + (-2 * x ** 3 + 3 * x ** 2) * k[i + 1][1] + (x ** 3 - x ** 2) * m1;
};
const bez = (P, k) => [0, 1].map((a) => (1 - k) ** 3 * P[0][a] + 3 * (1 - k) ** 2 * k * P[1][a] + 3 * (1 - k) * k * k * P[2][a] + k ** 3 * P[3][a]);
// 俯衝的速度：一路加速，最後 22% 急煞、剛好停在訊息上（速度連續，不是硬撞停）
const stoop = (x, k = 0.78) => (x <= k ? (x * x) / k : k + (2 / (1 - k)) * (x - k - (x * x - k * k) / 2));

// ── 時間軸（秒）：停在樹枝上、眼睛左右看 → TRANS 變身張翅 → FLY0 起飛、一路滑翔俯衝 → GRAB 爪子扣住訊息
//    → REL 放開訊息、訊息往右飛、越飛越大 → ARRIVE 訊息變成標題；同時 BACK 收翅變回原本的 logo、退到左邊
const TRANS = 2.0, FLY0 = 2.2, GRAB = 4.4, HIT = GRAB + 0.15, REL = 5.1, BACK = 5.3, BACK_D = 1.2, ARRIVE = 6.3, LOCK = 1.6;
const T0 = TIMES.CAM[0], T1 = TIMES.RAISE[0] + TIMES.RAISE[1]; // 貓頭鷹動畫裡：變身開始、張翅完成
// 舞台時間 → 貓頭鷹（mark-dive-open）的身體時間：變身照原速；飛行中停在張翅完成的樣子；最後倒著播回原本的 logo
const owlT = (t) => (t < BACK ? Math.min(T1, T0 + Math.max(0, t - TRANS)) : T1 - (T1 - T0) * inOutCubic(prog(t, BACK, BACK_D)));
// 爪子（各自控制）：俯衝最後伸爪 → GRAB 扣住 → 往上拉 → REL 微微張開放掉訊息 → 收回
const ext = (t) => (t < REL + 0.1 ? inOutCubic(prog(t, GRAB - 0.45, 0.45)) : 1 - inOutCubic(prog(t, REL + 0.1, 0.5)));
const close = (t) => outBack(prog(t, GRAB, 0.22)) * (1 - 0.6 * inOutCubic(prog(t, REL - 0.05, 0.15)));
const pullK = (t) => outBack(prog(t, GRAB + 0.1, 0.45));
const BLINKS = [1.25, 7.6]; // 眨眼：停在樹枝上時一次、結尾一次
// 給配樂用的時間點（音效對準畫面）；LOOKS＝眼睛往左、往右看的時刻與方向
export const INTRO_TIMES = { TRANS, FLY0, GRAB, HIT, REL, BACK, BACK_D, ARRIVE, LOCK, BLINKS, LOOKS: [[0.6, -0.3], [1.35, 0.3]] };
const f1 = (n) => +n.toFixed(2);
const look = (t) => 2.8 * keys([[0.3, 0], [0.7, -1], [1.15, -1], [1.45, 1], [1.85, 1], [2.1, 0]])(t); // 停在樹枝上時眼睛左看、右看

// 貓頭鷹在舞台上的位置、大小、傾斜（512 畫布 → 舞台：translate(P) rotate(傾斜) scale(S) translate(-256 -256)）
const START = { x: 400, y: 230, s: 0.78 }, POSE_G = { x: 960, y: 430, s: 2.0 }, END = { x: 540, y: 538, s: 1.75 };
const FLIGHT = [[START.x, START.y], [760, 150], [1290, 280], [POSE_G.x, POSE_G.y]]; // 從樹枝起飛：先往右上滑、再繞下來撲向訊息
const TILT = keys([[2.2, 0], [2.9, 6], [3.6, 2], [4.0, -5], [4.4, 0]]); // 轉彎時身體傾斜，扣住那刻擺正
const pose = (t) => {
  let x, y, s;
  if (t < FLY0) { [x, y] = FLIGHT[0]; s = START.s; }
  else { const d = stoop(prog(t, FLY0, GRAB - FLY0)); [x, y] = bez(FLIGHT, d); s = lerp(START.s, POSE_G.s, d ** 2.2); } // 起飛慢、越滑越快、最後急煞扣住；越來越大（朝鏡頭撲過來）
  const a = inOutCubic(prog(t, BACK, BACK_D)); // 收翅變回原本 logo 的同時退到左邊
  return { x: lerp(x, END.x, a), y: lerp(y, END.y, a), s: lerp(s, END.s, a), r: TILT(t) * (1 - a) };
};
const toStage = ({ x, y, s, r = 0 }, [px, py]) => { const c = Math.cos((r * Math.PI) / 180), n = Math.sin((r * Math.PI) / 180), X = s * (px - 256), Y = s * (py - 256); return [x + X * c - Y * n, y + X * n + Y * c]; };
// 訊息（訊號）：一開始就在噪音裡，位置剛好是爪子在 GRAB 那刻扣下去的地方（之後改由貓頭鷹自己畫，位置對齊不會跳）
const SIGNAL = toStage(POSE_G, [BUBBLE_C[0], BUBBLE_C[1] + TIMES.REACH]);
if (Math.abs(TILT(GRAB)) > 1e-9 || Math.abs(stoop(1) - 1) > 1e-9 || REL >= BACK) throw new Error('扣住／放開那刻姿勢對不齊');
// 放開後的訊息：從爪子下面往右飛到標題的位置、越飛越大，到了就變成標題
const RELEASE = toStage(POSE_G, BUBBLE_C), TITLE_C = [1232, 520], BIG = 9.4;
const bubbleFly = (t) => {
  const f = inOutCubic(prog(t, REL, ARRIVE - REL)), path = [RELEASE, [RELEASE[0] + 160, RELEASE[1] - 260], [TITLE_C[0] - 140, TITLE_C[1] + 120], TITLE_C];
  const [cx, cy] = bez(path, f), m = lerp(POSE_G.s, BIG, f ** 1.4);
  return { tf: (x, y) => [cx + m * (x - BUBBLE_C[0]), cy + m * (y - BUBBLE_C[1])], m };
};

// ── 樹枝（跟 logo 同一套語言：直邊、圓角、幾片葉子）：貓頭鷹一開始停在上面，起飛時樹枝被蹬得晃一下
const bar = ([x0, y0], [x1, y1], w0, w1) => { const L = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
  return `M${x0 + (nx * w0) / 2} ${y0 + (ny * w0) / 2}L${x1 + (nx * w1) / 2} ${y1 + (ny * w1) / 2}L${x1 - (nx * w1) / 2} ${y1 - (ny * w1) / 2}L${x0 - (nx * w0) / 2} ${y0 - (ny * w0) / 2}Z`; };
const leaf = ([x0, y0], [x1, y1], w) => { const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, L = Math.hypot(x1 - x0, y1 - y0), nx = (-(y1 - y0) / L) * w, ny = ((x1 - x0) / L) * w;
  return `M${x0} ${y0}Q${mx + nx} ${my + ny} ${x1} ${y1}Q${mx - nx} ${my - ny} ${x0} ${y0}Z`; };
const BRANCH = [bar([150, 372], [720, 350], 20, 9), bar([585, 356], [672, 300], 9, 4), leaf([672, 300], [712, 268], 13), leaf([255, 366], [214, 322], 12), leaf([470, 361], [500, 318], 11)];
const BRANCH_C = [440, 350];

// 噪音：固定亂數種子，每次產生的畫面都一樣
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const NOISE = Array.from({ length: 170 }, () => ({
  x: 40 + rand() * 1840, y: 40 + rand() * 1000, w: 26 + rand() * 90, a: 0.25 + rand() * 0.35, p: rand() * 6.28, q: rand() * 6.28,
})).filter((n) => Math.hypot(n.x - SIGNAL[0], n.y - SIGNAL[1]) > 110);

function frame(t) {
  // ── 噪音對話框：亂抖、閃爍；抓住那刻從訊息擴散一圈波紋，波紋掃過的地方全部清空
  const wave = 2300 * outCubic(prog(t, HIT, 1.1));
  const noise = NOISE.map((n) => {
    const d = Math.hypot(n.x - SIGNAL[0], n.y - SIGNAL[1]);
    const a = n.a * (0.6 + 0.4 * Math.sin(t * 7 + n.p * 3)) * clamp(t / 0.8) * (t < HIT ? 1 : clamp((d - wave) / 60));
    if (a <= 0.01) return '';
    return `<rect x="${n.x + 4 * Math.sin(t * 11 + n.p)}" y="${n.y + 3 * Math.sin(t * 15 + n.q)}" width="${n.w}" height="16" rx="8" fill="${NOISE_C}" opacity="${a}"/>`;
  }).join('');
  const waveRing = t > HIT ? `<circle cx="${SIGNAL[0]}" cy="${SIGNAL[1]}" r="${wave}" fill="none" stroke="${GOLD}" stroke-width="2" opacity="${0.5 * (1 - prog(t, HIT, 1.1))}"/>` : '';

  // ── 訊息＋瞄準圈：貓頭鷹盯上它之後瞄準圈慢慢縮小，扣住那刻鎖死、交給貓頭鷹
  const [sx, sy] = SIGNAL, held = t >= GRAB, flying = t >= REL;
  const lock = clamp((t - LOCK) / 0.4) * (1 - prog(t, GRAB - 0.15, 0.2));
  const r = lerp(150, 62, inOutSine(prog(t, 1.6, GRAB - 1.8)));
  const ticks = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([a, b]) => `<line x1="${sx + a * r}" y1="${sy + b * r}" x2="${sx + a * (r + 16)}" y2="${sy + b * (r + 16)}"/>`).join('');
  const lockRing = `<g stroke="${GOLD}" stroke-width="2" fill="none" opacity="${lock * 0.8}"><circle cx="${sx}" cy="${sy}" r="${r}"/>${ticks}</g>`;
  const sigGlow = (0.2 + 0.4 * prog(t, 1.6, 2.2)) * clamp(t / 0.8) * (held ? 0 : 1);
  const signal = held ? '' : `<rect x="${sx - 70}" y="${sy - 40}" width="140" height="80" rx="30" fill="${GOLD}" opacity="${sigGlow}" filter="url(#blur)"/>`
    + `<g opacity="${clamp(t / 0.8)}">${bubbleSvg((x, y) => toStage(POSE_G, [x, y + TIMES.REACH]), POSE_G.s)}</g>`;
  // 放開後往右飛、變大，到了標題的位置就淡掉、換成標題
  const fly = flying ? (() => { const { tf, m } = bubbleFly(t), o = 1 - inOutCubic(prog(t, ARRIVE - 0.1, 0.4)); return o > 0.01 ? `<g opacity="${o}">${bubbleSvg(tf, m, IVORY, POSE_G.s)}</g>` : ''; })() : '';

  // ── 樹枝：一開始暗暗的跟著亮起來；起飛時被蹬得晃一下；波紋掃過就跟噪音一起消失
  const lit = lerp(0.08, 1, inOutSine(prog(t, 1.0, 0.8)));
  const bd = Math.hypot(BRANCH_C[0] - SIGNAL[0], BRANCH_C[1] - SIGNAL[1]), bOp = t < HIT ? 1 : clamp((bd - wave) / 60);
  const kick = 4 * Math.sin(Math.PI * prog(t, FLY0, 0.5)) * (1 - prog(t, FLY0, 0.5));
  const branch = bOp > 0.01 ? `<g fill="${mix(BG, IVORY, 0.1 + 0.45 * lit)}" opacity="${bOp}" transform="rotate(${kick} 150 372)">${BRANCH.map((d) => `<path d="${d}"/>`).join('')}</g>` : '';

  // ── 貓頭鷹：暗處只看得到金色眼睛（眼睛外圈發光、左右看），慢慢亮起來後變身張翅、起飛滑翔撲向訊息、伸爪扣住；
  //    放開訊息後收翅變回原本的 logo（眼睛再亮一下）
  const P = pose(t), L = look(t);
  // 眼睛的光（跟上一版一樣）：一直亮著，暗處最亮、變身張翅時亮一下、扣住訊息時閃一下、之後像呼吸一樣；眨眼時光也一起暗；
  //   收翅變回原本的 logo 時光慢慢熄掉，結尾只眨一次眼、不發光
  const blink = BLINKS.reduce((k, b) => k * (1 - 0.92 * Math.sin(Math.PI * prog(t, b, 0.2))), 1);
  const dark = 1 - inOutSine(prog(t, 1.0, 1.4));
  const glow = clamp(0.35 + 0.65 * dark + 0.5 * bump(t, TRANS + 0.6, 0.15) + 0.1 * Math.sin(t * 2.4) * prog(t, GRAB, 0.6)
    + 0.7 * bump(t, GRAB + 0.1, 0.18)) * blink * (1 - inOutCubic(prog(t, BACK, BACK_D))); // 收翅變回原本的 logo 時光慢慢熄掉，結尾不發光
  const E = eyesAt(owlT(t), L);
  const glows = glow < 0.01 ? '' : E.pts.map((e) => { const [gx, gy] = toStage(P, e); return `<circle cx="${f1(gx)}" cy="${f1(gy)}" r="${f1((32 + 24 * dark) * 0.994 * E.k * P.s)}" fill="${GOLD}" opacity="${f1(glow)}" filter="url(#blur)"/>`; }).join('');
  const bubble = held && !flying ? { s: 1, dy: TIMES.REACH * (1 - pullK(t)) } : { s: 0, dy: 0 };
  const owl = `<g transform="translate(${P.x} ${P.y}) rotate(${P.r}) scale(${P.s}) translate(-256 -256)">${owlLayer(owlT(t), {
    ivory: mix(BG, IVORY, lit), lift: false, ext: ext(t), close: close(t), pull: pullK(t), tuck: ext(t), bubble, look: L, blink,
  })}</g>`;

  // ── 右邊的分隔線與文字：訊息飛到之後變成「群記」，接著出現英文名與標語
  const line = 208 * outCubic(prog(t, ARRIVE, 0.6));
  const rise = (start, dur = 0.7) => { const k = outCubic(prog(t, start, dur)); return `opacity="${k}" transform="translate(0 ${30 * (1 - k)})"`; };
  const tk = inOutCubic(prog(t, ARRIVE - 0.15, 0.45)), ts = lerp(0.88, 1, tk);
  const title = `<g opacity="${tk}" transform="translate(${TITLE_C[0]} ${TITLE_C[1]}) scale(${ts}) translate(${-TITLE_C[0]} ${-TITLE_C[1]})">${['群', '記'].map((c, i) =>
    `<text x="${979 + i * 250}" y="532" font-family="Songti TC" font-weight="bold" font-size="250" fill="${IVORY}">${c}</text>`).join('')}</g>`;
  const g = outCubic(prog(t, ARRIVE + 0.3, 0.9));
  const latin = `<text x="984" y="638" font-family="PingFang TC" font-weight="500" font-size="38" letter-spacing="${lerp(36, 14, g)}" fill="${MINT}" opacity="${g * 0.9}">GROUPSCRIBE</text>`;
  const tagline = [...'群裡講過的，都記得。'].map((c, i) =>
    `<text x="${981 + i * 62}" y="745" font-family="PingFang TC" font-weight="500" font-size="58" fill="${MINT}" ${rise(ARRIVE + 0.5 + i * 0.06, 0.5)}>${c}</text>`).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
  <filter id="blur" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="14"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="${BG}"/>
${noise}${waveRing}${lockRing}${signal}${branch}
${glows}${owl}
<line x1="864" x2="864" y1="${540 - line}" y2="${540 + line}" stroke="${IVORY}" stroke-opacity="0.25" stroke-width="2"/>
${title}${latin}${tagline}${fly}
</svg>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
// 只輸出一張靜態圖檢查構圖：node scripts/intro-video.mjs --still 4.5 [輸出檔名]
const stillAt = process.argv.indexOf('--still');
if (stillAt > 0) {
  const t = Number(process.argv[stillAt + 1] ?? 5), out = process.argv[stillAt + 2] ?? `intro-still-${Math.round(t * 100)}.png`;
  await sharp(Buffer.from(frame(t))).png().toFile(out);
  console.log(out);
  process.exit(0);
}

// --wav 檔名：只輸出配樂 WAV（試聽用）
const wavAt = process.argv.indexOf('--wav');
if (wavAt > 0) { const out = process.argv[wavAt + 1] ?? 'intro-audio.wav'; writeWav(out, renderIntroAudio(INTRO_TIMES, DUR)); console.log(out); process.exit(0); }

const dir = mkdtempSync(join(tmpdir(), 'intro-'));
const VIDEO = join(dir, 'video.mp4');
// --audio：只重做配樂、換掉現有 intro.mp4 的聲音（畫面不重畫）
const audioOnly = process.argv.includes('--audio');
if (audioOnly) copyFileSync(OUT, VIDEO);
const N = Math.round(DUR * FPS);
for (let i = 0; !audioOnly && i < N; i += 8) {
  await Promise.all(Array.from({ length: Math.min(8, N - i) }, (_, k) =>
    sharp(Buffer.from(frame((i + k) / FPS))).png().toFile(join(dir, `f${String(i + k).padStart(4, '0')}.png`))));
  process.stdout.write(`\r畫格 ${Math.min(i + 8, N)}/${N}`);
}

writeFileSync(join(dir, 'encode.swift'), `
import AVFoundation
let a = CommandLine.arguments, dir = a[1], fps = Int32(a[3])!, n = Int(a[4])!, W = ${W}, H = ${H}
let url = URL(fileURLWithPath: a[2]); try? FileManager.default.removeItem(at: url)
let w = try! AVAssetWriter(outputURL: url, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 12_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel],
  AVVideoColorPropertiesKey: [AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2, AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2, AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2]])
let ad = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H])
w.add(input); w.startWriting(); w.startSession(atSourceTime: .zero)
for i in 0..<n {
  let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: String(format: "%@/f%04d.png", dir, i)) as CFURL, nil)!
  let img = CGImageSourceCreateImageAtIndex(src, 0, nil)!
  var pb: CVPixelBuffer?; CVPixelBufferPoolCreatePixelBuffer(nil, ad.pixelBufferPool!, &pb)
  CVPixelBufferLockBaseAddress(pb!, [])
  let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb!), width: W, height: H, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pb!), space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: W, height: H))
  CVPixelBufferUnlockBaseAddress(pb!, [])
  while !input.isReadyForMoreMediaData { usleep(1000) }
  ad.append(pb!, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0); w.finishWriting { done.signal() }; done.wait()
if w.status != .completed { print(w.error!); exit(1) }
`);
if (!audioOnly) { console.log('\n壓縮成 MP4…'); execFileSync('swift', [join(dir, 'encode.swift'), dir, VIDEO, String(FPS), String(N)], { stdio: 'inherit' }); }

// 配樂：合成 WAV → macOS 內建 afconvert 轉成 AAC → 跟畫面合在一起（畫面不重新壓縮）
console.log('配樂…');
writeWav(join(dir, 'audio.wav'), renderIntroAudio(INTRO_TIMES, DUR));
execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '192000', join(dir, 'audio.wav'), join(dir, 'audio.m4a')]);
writeFileSync(join(dir, 'mux.swift'), `
import AVFoundation
let a = CommandLine.arguments
let v = AVURLAsset(url: URL(fileURLWithPath: a[1])), au = AVURLAsset(url: URL(fileURLWithPath: a[2])), out = URL(fileURLWithPath: a[3])
let done = DispatchSemaphore(value: 0)
Task {
  do {
    let comp = AVMutableComposition(), dur = try await v.load(.duration)
    let vt = try await v.loadTracks(withMediaType: .video)[0], at = try await au.loadTracks(withMediaType: .audio)[0]
    try comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!.insertTimeRange(CMTimeRange(start: .zero, duration: dur), of: vt, at: .zero)
    let adur = try await au.load(.duration)
    try comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!.insertTimeRange(CMTimeRange(start: .zero, duration: CMTimeMinimum(dur, adur)), of: at, at: .zero)
    try? FileManager.default.removeItem(at: out)
    let ex = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetPassthrough)!
    ex.outputURL = out; ex.outputFileType = .mp4
    await ex.export()
    if ex.status != .completed { print(ex.error!); exit(1) }
  } catch { print(error); exit(1) }
  done.signal()
}
done.wait()
`);
execFileSync('swift', [join(dir, 'mux.swift'), VIDEO, join(dir, 'audio.m4a'), OUT], { stdio: 'inherit' });
rmSync(dir, { recursive: true });
console.log(`完成：${OUT}`);
}
