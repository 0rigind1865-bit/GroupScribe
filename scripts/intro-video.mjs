// 產生「群記」開場動畫影片（1920×1080、60fps、6.5 秒、無聲）
// 用法：node scripts/intro-video.mjs → public/brand/intro.mp4
// 流程：每一格算好位置寫成 SVG → sharp 轉 PNG → macOS 內建 AVFoundation（swift）壓成 H.264 MP4，不用裝 ffmpeg
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const W = 1920, H = 1080, FPS = 60, DUR = 6.5;
const OUT = 'public/brand/intro.mp4';
const IVORY = '#f6f4ee', GOLD = '#d4b26a', MINT = '#e3ece5';

// 形狀直接從定稿 mark.svg 抓，logo 改了重跑一次影片就跟著改
const mark = readFileSync('public/brand/mark.svg', 'utf8');
const [ivoryPart, goldPart] = mark.split('<g fill="#d4b26a">');
const pieces = [...ivoryPart.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
const beak = goldPart.match(/<path d="([^"]+)"/)[1];
const EYES = [[-45.5, 186], [45.5, 186]];
const OWL_CY = 252.5; // 貓頭鷹在 mark.svg 座標裡的中心 y

// ponytail: 用所有座標點平均當重心，形狀很規則所以夠準
const centroid = (d) => {
  const n = d.match(/-?\d+(\.\d+)?/g).map(Number);
  let x = 0, y = 0;
  for (let i = 0; i < n.length; i += 2) { x += n[i]; y += n[i + 1]; }
  return [x / (n.length / 2), y / (n.length / 2)];
};

const clamp = (x) => Math.min(1, Math.max(0, x));
const prog = (t, start, dur) => clamp((t - start) / dur);
const outCubic = (x) => 1 - (1 - x) ** 3;
const outBack = (x) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2; // 稍微衝過頭再彈回
const inOutCubic = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const lerp = (a, b, k) => a + (b - a) * k;

// 拼裝順序：額頭 → 臉兩側 → 上翅 → 身體 → 下翅
const PIECE_START = [0.3, 0.45, 0.45, 0.6, 0.6, 0.75, 0.9, 0.9];
const BLINKS = [2.15, 5.3];

function frame(t) {
  // 整隻貓頭鷹：先在正中間，2.55 秒起滑到左邊、縮小，讓出位置給字
  const move = inOutCubic(prog(t, 2.55, 0.9));
  const ox = lerp(960, 540, move), scale = lerp(2.0, 1.78, move);

  const ivory = pieces.map((d, i) => {
    const [cx, cy] = centroid(d);
    const e = outBack(prog(t, PIECE_START[i], 0.75));
    const o = outCubic(prog(t, PIECE_START[i], 0.4));
    const len = Math.hypot(cx, cy - OWL_CY) || 1;
    const off = 170 * (1 - e); // 從外圍沿著「中心→這塊」的方向飛回來
    const tx = cx + (cx / len) * off, ty = cy + ((cy - OWL_CY) / len) * off;
    const rot = (cx === 0 ? 0 : Math.sign(cx) * 20) * (1 - e);
    const sc = 0.7 + 0.3 * e;
    return `<path d="${d}" opacity="${o}" transform="translate(${tx} ${ty}) rotate(${rot}) scale(${sc}) translate(${-cx} ${-cy})"/>`;
  }).join('');

  // 眼睛：睜開（上下撐開）＋兩次眨眼
  const open = outBack(prog(t, 1.45, 0.35));
  const blink = BLINKS.reduce((k, b) => k * (1 - 0.92 * Math.sin(Math.PI * prog(t, b, 0.2))), 1);
  const eyes = EYES.map(([ex, ey]) =>
    `<circle cx="${ex}" cy="${ey}" r="18" opacity="${clamp(open * 3)}" transform="translate(${ex} ${ey}) scale(${0.6 + 0.4 * open} ${Math.max(0, open) * blink}) translate(${-ex} ${-ey})"/>`).join('');
  const glow = 0.6 * Math.exp(-(((t - 1.7) / 0.3) ** 2));
  const glows = EYES.map(([ex, ey]) => `<circle cx="${ex}" cy="${ey}" r="30" fill="${GOLD}" opacity="${glow}" filter="url(#blur)"/>`).join('');
  const b = outBack(prog(t, 1.65, 0.4));
  const beakEl = `<path d="${beak}" opacity="${outCubic(prog(t, 1.65, 0.25))}" transform="translate(0 ${-20 * (1 - b)})"/>`;

  // 開頭的金色光點擴散成光圈
  const s = prog(t, 0, 0.8);
  const spark = `<circle cx="960" cy="540" r="${6 + 420 * outCubic(s)}" fill="none" stroke="${GOLD}" stroke-width="${3 * (1 - s)}" opacity="${0.7 * (1 - s)}"/>
    <circle cx="960" cy="540" r="7" fill="${GOLD}" opacity="${clamp(t / 0.15) * (1 - prog(t, 0.25, 0.3))}"/>`;

  // 右邊的分隔線與文字
  const line = 208 * outCubic(prog(t, 2.95, 0.6));
  const rise = (start, dur = 0.7) => { const k = outCubic(prog(t, start, dur)); return `opacity="${k}" transform="translate(0 ${30 * (1 - k)})"`; };
  const title = ['群', '記'].map((c, i) =>
    `<text x="${979 + i * 250}" y="532" font-family="Songti TC" font-weight="bold" font-size="250" fill="${IVORY}" ${rise(3.1 + i * 0.15)}>${c}</text>`).join('');
  const g = outCubic(prog(t, 3.55, 0.9));
  const latin = `<text x="984" y="638" font-family="PingFang TC" font-weight="500" font-size="38" letter-spacing="${lerp(36, 14, g)}" fill="${MINT}" opacity="${g * 0.9}">GROUPSCRIBE</text>`;
  const tagline = [...'群裡講過的，都記得。'].map((c, i) =>
    `<text x="${981 + i * 62}" y="745" font-family="PingFang TC" font-weight="500" font-size="58" fill="${MINT}" ${rise(3.85 + i * 0.06, 0.5)}>${c}</text>`).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
  <radialGradient id="bg" cx="50%" cy="50%" r="75%"><stop offset="0" stop-color="#0e5541"/><stop offset="1" stop-color="#083c2e"/></radialGradient>
  <filter id="blur" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="14"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
${spark}
<g transform="translate(${ox} 540) scale(${scale}) translate(0 ${-OWL_CY})">
  ${glows}<g fill="${IVORY}">${ivory}</g><g fill="${GOLD}">${eyes}${beakEl}</g>
</g>
<line x1="864" x2="864" y1="${540 - line}" y2="${540 + line}" stroke="${IVORY}" stroke-opacity="0.25" stroke-width="2"/>
${title}${latin}${tagline}
</svg>`;
}

// 只輸出一張靜態圖檢查構圖：node scripts/intro-video.mjs --still 4.5
const stillAt = process.argv.indexOf('--still');
if (stillAt > 0) {
  const t = Number(process.argv[stillAt + 1] ?? 5);
  await sharp(Buffer.from(frame(t))).png().toFile(`intro-still-${t}.png`);
  console.log(`intro-still-${t}.png`);
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
