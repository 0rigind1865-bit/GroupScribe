// 產生「原本 logo → 俯衝版（甲）」的變形動畫（1080×1080、60fps、無聲）
// 每一片都從原本 logo 的某一片變過去（同一片的輪廓取一樣多的點，邊移動、邊轉、邊變形）：
//   頭：眉毛壓下來、圓眼睛變成銳利的水滴、嘴變短，整顆頭縮小移到兩翼中間
//   原本那片葉片翅膀 → 像折扇一樣展開：上面的短羽毛＋4 根長羽毛一根接一根轉出去
//   原本的下翅 → 下面那片短羽毛；胸口 → 寬短的胸口；最後尾巴從胸口後面張開
// 用法：node scripts/mark-dive-morph.mjs → public/brand/dive-morph.mp4（加 --still 1.4 只輸出那一秒的靜態圖）
import sharp from 'sharp';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDive, flatten, mapPath, P, ORIG_BEAK, BG } from './mark-dive.mjs';

const SIZE = 1080, FPS = 60, DUR = 4.2, N_PTS = 180;
const OUT = 'public/brand/dive-morph.mp4';

const clamp = (x) => Math.min(1, Math.max(0, x));
const prog = (t, start, dur) => clamp((t - start) / dur);
const inOutCubic = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const outBack = (x) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2; // 稍微衝過頭再彈回
const lerp = (a, b, u) => a + (b - a) * u;

// ── 原本 logo 的每一片（換到 512 畫布座標，跟 mark.svg 一樣的位置）
const orig = (d) => mapPath(d, (x, y) => [256 + 0.994 * x, 256 + 0.994 * (y - 252.5)]);
const circle = (cx, cy, r) => `M${Array.from({ length: 48 }, (_, k) => `${cx + r * Math.cos((k / 48) * 2 * Math.PI)} ${cy + r * Math.sin((k / 48) * 2 * Math.PI)}`).join('L')}Z`;
const SRC = {
  brow: orig(P[0]), faceL: orig(P[1]), faceR: orig(P[2]), eyeL: orig(circle(-45.5, 186, 18)), eyeR: orig(circle(45.5, 186, 18)), beak: orig(ORIG_BEAK),
  wingL: orig(P[3]), wingR: orig(P[4]), chest: orig(P[5]), lowL: orig(P[6]), lowR: orig(P[7]),
};

// ── 輪廓取樣：攤平 → 依長度平均取 N 點 → 統一成同一個繞行方向
const resample = (d) => {
  const pts = flatten(d), L = [0];
  for (let i = 1; i <= pts.length; i++) L.push(L[i - 1] + Math.hypot(...[0, 1].map((j) => pts[i % pts.length][j] - pts[i - 1][j])));
  const total = L[pts.length], out = [];
  for (let k = 0, i = 0; k < N_PTS; k++) {
    const s = (k / N_PTS) * total;
    while (L[i + 1] < s) i++;
    const a = pts[i], b = pts[(i + 1) % pts.length], u = (s - L[i]) / (L[i + 1] - L[i] || 1);
    out.push([lerp(a[0], b[0], u), lerp(a[1], b[1], u)]);
  }
  const area = out.reduce((s, p, i) => s + p[0] * out[(i + 1) % N_PTS][1] - out[(i + 1) % N_PTS][0] * p[1], 0);
  return area < 0 ? out.reverse() : out;
};
const centroid = (pts) => [0, 1].map((j) => pts.reduce((s, p) => s + p[j], 0) / pts.length);
// 主軸方向（細長的形狀才用得到）：取指向「外側上方」的那一頭（左邊零件往左上、右邊往右上）
const axis = (pts, side) => {
  const c = centroid(pts); let xx = 0, yy = 0, xy = 0;
  for (const [x, y] of pts) { xx += (x - c[0]) ** 2; yy += (y - c[1]) ** 2; xy += (x - c[0]) * (y - c[1]); }
  const a = 0.5 * Math.atan2(2 * xy, xx - yy), v = [Math.cos(a), Math.sin(a)];
  return v[0] * side - v[1] > 0 ? a : a + Math.PI;
};
const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

// 一對形狀的變形：兩邊都移到自己的中心、轉正，找最對得上的起點；之後每一格「位置、角度、形狀」各自內插
const pair = (srcD, dstD, side = 0) => {
  const S = resample(srcD), T = resample(dstD), cS = centroid(S), cT = centroid(T);
  const aS = side ? axis(S, side) : 0, aT = side ? axis(T, side) : 0;
  const Sl = S.map((p) => rot([p[0] - cS[0], p[1] - cS[1]], -aS)), Tl = T.map((p) => rot([p[0] - cT[0], p[1] - cT[1]], -aT));
  const rms = (A) => Math.sqrt(A.reduce((s, p) => s + p[0] ** 2 + p[1] ** 2, 0) / A.length);
  const kS = 1 / rms(Sl), kT = 1 / rms(Tl);
  let best = 0, bestE = Infinity;
  for (let o = 0; o < N_PTS; o++) {
    let e = 0;
    for (let i = 0; i < N_PTS; i += 3) { const a = Sl[i], b = Tl[(i + o) % N_PTS]; e += (a[0] * kS - b[0] * kT) ** 2 + (a[1] * kS - b[1] * kT) ** 2; }
    if (e < bestE) { bestE = e; best = o; }
  }
  const Ta = Tl.map((_, i) => Tl[(i + best) % N_PTS]);
  let dA = aT - aS; while (dA > Math.PI) dA -= 2 * Math.PI; while (dA < -Math.PI) dA += 2 * Math.PI;
  return (u, m = u) => { // u：位置、角度走到哪；m：形狀變到哪
    const c = [lerp(cS[0], cT[0], u), lerp(cS[1], cT[1], u)], a = aS + dA * u;
    return Sl.map((p, i) => { const q = rot([lerp(p[0], Ta[i][0], m), lerp(p[1], Ta[i][1], m)], a); return [c[0] + q[0], c[1] + q[1]]; });
  };
};

// ── 目標（甲，沒爪子）的每一片，配上它從原本 logo 的哪一片變過來、什麼時候動
const dive = buildDive({ claws: false });
const byId = Object.fromEntries(dive.map((l) => [l.id, l]));
const HEAD_T = [0.55, 0.9];                 // 頭：開始、長度
const tracks = [];
const add = (id, srcD, side, time, ease = inOutCubic, haloFrom) => {
  const l = byId[id];
  tracks.push({ ...l, morph: pair(srcD, l.d, side), time, ease, haloFrom: haloFrom ?? l.halo });
};
// 長羽毛：左邊 long0～3（上→下）、右邊 long4～7，都從原本那片葉片翅膀轉出去，一根接一根
for (let j = 0; j < 4; j++) {
  add(`long${j}`, SRC.wingL, -1, [0.85 + 0.09 * j, 1.05], outBack);
  add(`long${j + 4}`, SRC.wingR, 1, [0.85 + 0.09 * j, 1.05], outBack);
}
// 短羽毛：covert0＝左下（從下翅變）、covert1＝左上（從葉片翅膀變）、covert2／3 是右邊
add('covert0', SRC.lowL, -1, [0.75, 0.95]);
add('covert1', SRC.wingL, -1, [0.8, 0.95]);
add('covert2', SRC.lowR, 1, [0.75, 0.95]);
add('covert3', SRC.wingR, 1, [0.8, 0.95]);
// 尾巴：從胸口尖端後面（縮得很小）長出來
for (let j = 0; j < 5; j++) {
  const l = byId[`tail${j}`], tip = [256, 318];
  add(`tail${j}`, mapPath(l.d, (x, y) => [tip[0] + (x - tip[0]) * 0.2, tip[1] + (y - tip[1]) * 0.2]), 0, [1.55 + 0.04 * Math.abs(j - 2), 0.7], outBack);
}
add('chest', SRC.chest, 0, [0.65, 0.9]);
// 頭：挖縫的底色層＋眼睛、臉、眉毛、嘴；眉毛切眼睛的描邊從 0 慢慢變到定稿的寬度
const headSrc = { mask0: SRC.brow, mask1: SRC.faceL, mask2: SRC.faceR, mask3: SRC.eyeL, mask4: SRC.eyeR, mask5: SRC.beak,
  eye0: SRC.eyeL, eye1: SRC.eyeR, face0: SRC.faceL, face1: SRC.faceR, brow: SRC.brow, beak: SRC.beak };
for (const [id, src] of Object.entries(headSrc)) add(id, src, 0, HEAD_T, inOutCubic, id === 'brow' ? 0 : undefined);
add('mask6', mapPath(byId.mask6.d, (x, y) => [256 + (x - 256) * 0.01, 172 + (y - 270) * 0.01]), 0, HEAD_T); // 臉中間挖縫用的橢圓：一開始縮成一點
// 照定稿的前後順序畫
tracks.sort((a, b) => dive.indexOf(byId[a.id]) - dive.indexOf(byId[b.id]));

const f2 = (n) => +n.toFixed(2);
const frame = (t) => {
  const body = tracks.map((tr) => {
    const raw = prog(t, tr.time[0], tr.time[1]), u = tr.ease(raw), m = inOutCubic(raw);
    const pts = tr.morph(u, m), halo = lerp(tr.haloFrom, tr.halo, inOutCubic(raw));
    return `<path d="M${pts.map((p) => `${f2(p[0])} ${f2(p[1])}`).join('L')}Z" fill="${tr.fill}"${halo > 0.05 ? ` stroke="${BG}" stroke-width="${f2(halo * 2)}" paint-order="stroke" stroke-linejoin="round"` : ''}/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${SIZE}" height="${SIZE}"><rect width="512" height="512" fill="${BG}"/>${body}</svg>`;
};

// 只輸出一張靜態圖檢查：node scripts/mark-dive-morph.mjs --still 1.4
const stillAt = process.argv.indexOf('--still');
if (stillAt > 0) {
  const t = Number(process.argv[stillAt + 1] ?? 1.5), out = process.argv[stillAt + 2] ?? `morph-still-${Math.round(t * 100)}.png`;
  await sharp(Buffer.from(frame(t))).png().toFile(out);
  console.log(out);
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), 'morph-'));
const N = Math.round(DUR * FPS);
for (let i = 0; i < N; i += 8) {
  await Promise.all(Array.from({ length: Math.min(8, N - i) }, (_, k) =>
    sharp(Buffer.from(frame((i + k) / FPS))).png().toFile(join(dir, `f${String(i + k).padStart(4, '0')}.png`))));
  process.stdout.write(`\r畫格 ${Math.min(i + 8, N)}/${N}`);
}
writeFileSync(join(dir, 'encode.swift'), `
import AVFoundation
let a = CommandLine.arguments, dir = a[1], fps = Int32(a[3])!, n = Int(a[4])!, W = ${SIZE}, H = ${SIZE}
let url = URL(fileURLWithPath: a[2]); try? FileManager.default.removeItem(at: url)
let w = try! AVAssetWriter(outputURL: url, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 10_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel],
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
