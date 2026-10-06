// 產生「群記」開場動畫影片（1920×1080、60fps、8.5 秒、無聲）
// 故事：滿畫面亂抖的對話框（噪音）→ 暗處一雙金眼一直盯著 → 原本的 logo 亮起來，鏡頭往後退、升高往下拍，
//      同時張開翅膀變成俯衝版（甲）→ 往前撲向那個重要的訊息 → 金色爪子一把扣住 → 一圈波紋把噪音清空
//      → 貓頭鷹帶著訊息退到左邊，帶出標題與標語
// 貓頭鷹本身的動作（張翅、變身、伸爪抓）直接用 scripts/mark-dive-open.mjs 的 owlLayer，兩支影片的動作永遠一致
// 用法：node scripts/intro-video.mjs → public/brand/intro.mp4（加 --still 3.2 只輸出那一秒的靜態圖）
// 流程：每一格算好位置寫成 SVG → sharp 轉 PNG → macOS 內建 AVFoundation（swift）壓成 H.264 MP4，不用裝 ffmpeg
import sharp from 'sharp';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { owlLayer, bubbleSvg, BUBBLE_C, TIMES, EYES_AT_START } from './mark-dive-open.mjs';

const W = 1920, H = 1080, FPS = 60, DUR = 8.5;
const OUT = 'public/brand/intro.mp4';
const BG = '#0b4a38', IVORY = '#f6f4ee', GOLD = '#d4b26a', MINT = '#e3ece5', NOISE_C = '#5b927d';

const clamp = (x) => Math.min(1, Math.max(0, x));
const prog = (t, start, dur) => clamp((t - start) / dur);
const outCubic = (x) => 1 - (1 - x) ** 3;
const inOutCubic = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const inOutSine = (x) => (1 - Math.cos(Math.PI * x)) / 2;
const lerp = (a, b, k) => a + (b - a) * k;
const bump = (t, at, width) => Math.exp(-(((t - at) / width) ** 2));
// 兩個顏色混合（k=0 是 a、k=1 是 b）；用來讓貓頭鷹「由暗變亮」但身體不透明，背景噪音不會透過來
const mix = (a, b, k) => '#' + [1, 3, 5].map((i) => Math.round(lerp(parseInt(a.slice(i, i + 2), 16), parseInt(b.slice(i, i + 2), 16), k)).toString(16).padStart(2, '0')).join('');

// ── 時間軸（秒）：暗處盯著 → OPEN 開始變身張翅 → SWOOP 往前撲 → GRAB 爪子扣住訊息 → AWAY 退到左邊
const OPEN = 2.0, SWOOP = 3.3, GRAB = 4.2, AWAY = 4.6;
// 舞台時間 → 貓頭鷹動畫（mark-dive-open）的時間：變身張翅照原速；往前撲的時候把「伸爪」那段加快，讓爪子剛好在 GRAB 扣下去
const owlT = (t) => {
  const c0 = TIMES.CAM[0], done = TIMES.RAISE[0] + TIMES.RAISE[1], close = TIMES.CLOSE[0];
  if (t < OPEN) return c0;
  if (t < SWOOP) return Math.min(done, c0 + (t - OPEN));
  if (t < GRAB) return lerp(done, close, (t - SWOOP) / (GRAB - SWOOP));
  return close + (t - GRAB);
};
// 貓頭鷹在舞台上的位置與大小（512 畫布 → 舞台：translate(P) scale(S) translate(-256 -256)）
const POSE_A = { x: 960, y: 395, s: 1.3 }, POSE_G = { x: 960, y: 430, s: 2.0 }, POSE_END = { x: 540, y: 500, s: 1.35 };
const pose = (t) => {
  const g = inOutCubic(prog(t, SWOOP, GRAB - SWOOP)), a = inOutCubic(prog(t, AWAY, 0.9));
  const p = { x: lerp(POSE_A.x, POSE_G.x, g), y: lerp(POSE_A.y, POSE_G.y, g) + 3 * Math.sin(t * 2.2) * (1 - g), s: lerp(POSE_A.s, POSE_G.s, g) };
  return { x: lerp(p.x, POSE_END.x, a), y: lerp(p.y, POSE_END.y, a), s: lerp(p.s, POSE_END.s, a) };
};
const toStage = ({ x, y, s }, [px, py]) => [x + s * (px - 256), y + s * (py - 256)];
// 訊息（訊號）：一開始就在噪音裡，位置剛好是爪子在 GRAB 那刻扣下去的地方（之後改由貓頭鷹自己畫，位置對齊不會跳）
const SIGNAL = toStage(POSE_G, [BUBBLE_C[0], BUBBLE_C[1] + TIMES.REACH]);

// 噪音：固定亂數種子，每次產生的畫面都一樣
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const NOISE = Array.from({ length: 170 }, () => ({
  x: 40 + rand() * 1840, y: 40 + rand() * 1000, w: 26 + rand() * 90, a: 0.25 + rand() * 0.35, p: rand() * 6.28, q: rand() * 6.28,
})).filter((n) => Math.hypot(n.x - SIGNAL[0], n.y - SIGNAL[1]) > 110);

function frame(t) {
  // ── 噪音對話框：亂抖、閃爍；抓住那刻從訊息擴散一圈波紋，波紋掃過的地方全部清空
  const HIT = GRAB + 0.15, wave = 2300 * outCubic(prog(t, HIT, 1.1));
  const noise = NOISE.map((n) => {
    const d = Math.hypot(n.x - SIGNAL[0], n.y - SIGNAL[1]);
    const a = n.a * (0.6 + 0.4 * Math.sin(t * 7 + n.p * 3)) * clamp(t / 0.8) * (t < HIT ? 1 : clamp((d - wave) / 60));
    if (a <= 0.01) return '';
    return `<rect x="${n.x + 4 * Math.sin(t * 11 + n.p)}" y="${n.y + 3 * Math.sin(t * 15 + n.q)}" width="${n.w}" height="16" rx="8" fill="${NOISE_C}" opacity="${a}"/>`;
  }).join('');
  const waveRing = t > HIT ? `<circle cx="${SIGNAL[0]}" cy="${SIGNAL[1]}" r="${wave}" fill="none" stroke="${GOLD}" stroke-width="2" opacity="${0.5 * (1 - prog(t, HIT, 1.1))}"/>` : '';

  // ── 訊息＋瞄準圈：貓頭鷹盯上它之後瞄準圈慢慢縮小，扣住那刻鎖死、交給貓頭鷹
  const [sx, sy] = SIGNAL, held = t >= GRAB;
  const lock = clamp((t - 1.6) / 0.4) * (1 - prog(t, GRAB - 0.15, 0.2));
  const r = lerp(150, 62, inOutSine(prog(t, 1.6, GRAB - 1.8)));
  const ticks = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([a, b]) => `<line x1="${sx + a * r}" y1="${sy + b * r}" x2="${sx + a * (r + 16)}" y2="${sy + b * (r + 16)}"/>`).join('');
  const lockRing = `<g stroke="${GOLD}" stroke-width="2" fill="none" opacity="${lock * 0.8}"><circle cx="${sx}" cy="${sy}" r="${r}"/>${ticks}</g>`;
  const sigGlow = (0.2 + 0.4 * prog(t, 1.6, 2.2)) * clamp(t / 0.8) * (held ? 0 : 1);
  const signal = held ? '' : `<rect x="${sx - 70}" y="${sy - 40}" width="140" height="80" rx="30" fill="${GOLD}" opacity="${sigGlow}" filter="url(#blur)"/>`
    + `<g opacity="${clamp(t / 0.8)}">${bubbleSvg((x, y) => toStage(POSE_G, [x, y + TIMES.REACH]), POSE_G.s)}</g>`;

  // ── 貓頭鷹：暗處只看得到金色眼睛（眼睛外圈發光），慢慢亮起來後變身、張翅、往前撲、伸爪扣住訊息
  const P = pose(t), lit = lerp(0.08, 1, inOutSine(prog(t, 1.0, 1.0)));
  const glowK = (1 - inOutSine(prog(t, 1.2, 1.0))) * (0.75 + 0.25 * Math.sin(t * 3));
  const glows = glowK > 0.01 ? EYES_AT_START.map((e) => { const [gx, gy] = toStage(P, e); return `<circle cx="${gx}" cy="${gy}" r="${34 * P.s}" fill="${GOLD}" opacity="${glowK}" filter="url(#blur)"/>`; }).join('') : '';
  const owl = `<g transform="translate(${P.x} ${P.y}) scale(${P.s}) translate(-256 -256)">${owlLayer(owlT(t), { ivory: mix(BG, IVORY, lit), bubbleFrom: TIMES.CLOSE[0], lift: false })}</g>`;

  // ── 右邊的分隔線與文字
  const line = 208 * outCubic(prog(t, 4.8, 0.6));
  const rise = (start, dur = 0.7) => { const k = outCubic(prog(t, start, dur)); return `opacity="${k}" transform="translate(0 ${30 * (1 - k)})"`; };
  const title = ['群', '記'].map((c, i) =>
    `<text x="${979 + i * 250}" y="532" font-family="Songti TC" font-weight="bold" font-size="250" fill="${IVORY}" ${rise(4.95 + i * 0.15)}>${c}</text>`).join('');
  const g = outCubic(prog(t, 5.4, 0.9));
  const latin = `<text x="984" y="638" font-family="PingFang TC" font-weight="500" font-size="38" letter-spacing="${lerp(36, 14, g)}" fill="${MINT}" opacity="${g * 0.9}">GROUPSCRIBE</text>`;
  const tagline = [...'群裡講過的，都記得。'].map((c, i) =>
    `<text x="${981 + i * 62}" y="745" font-family="PingFang TC" font-weight="500" font-size="58" fill="${MINT}" ${rise(5.7 + i * 0.06, 0.5)}>${c}</text>`).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
  <filter id="blur" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="14"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="${BG}"/>
${noise}${waveRing}${lockRing}${signal}
${glows}${owl}
<line x1="864" x2="864" y1="${540 - line}" y2="${540 + line}" stroke="${IVORY}" stroke-opacity="0.25" stroke-width="2"/>
${title}${latin}${tagline}
</svg>`;
}

// 只輸出一張靜態圖檢查構圖：node scripts/intro-video.mjs --still 4.5 [輸出檔名]
const stillAt = process.argv.indexOf('--still');
if (stillAt > 0) {
  const t = Number(process.argv[stillAt + 1] ?? 5), out = process.argv[stillAt + 2] ?? `intro-still-${Math.round(t * 100)}.png`;
  await sharp(Buffer.from(frame(t))).png().toFile(out);
  console.log(out);
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), 'intro-'));
const N = Math.round(DUR * FPS);
for (let i = 0; i < N; i += 8) {
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
console.log('\n壓縮成 MP4…');
execFileSync('swift', [join(dir, 'encode.swift'), dir, OUT, String(FPS), String(N)], { stdio: 'inherit' });
rmSync(dir, { recursive: true });
console.log(`完成：${OUT}`);
