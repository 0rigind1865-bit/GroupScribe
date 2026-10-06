// 產生「原本 logo 張開翅膀、調整姿勢變成俯衝版（甲），再伸出金色爪子抓住訊息」的動畫（1080×1080、60fps、無聲）
//   1. 原本 logo 停一下
//   2. 調整姿勢：頭壓低、眉毛下壓、眼神變銳利、整顆頭縮到兩翼中間；身體往前傾（胸口看起來變短）、尾巴從後面張開露出來；
//      兩側收著的翅膀抬起來變成肩上的短羽毛
//   3. 張開翅膀：長羽毛原本收在兩側那片翅膀裡，一根接一根轉出來、伸長（硬的，不變形，像折扇打開）
//   4. 一個訊息框從下面浮上來 → 尾巴收回、金色爪子從胸口下面往下伸、張開 → 一把扣住、把訊息往上拉（整隻微微往上一提）
// 用法：node scripts/mark-dive-open.mjs → public/brand/dive-open.mp4（加 --still 2.9 只輸出那一秒的靜態圖）
import sharp from 'sharp';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDive, flatten, mapPath, P, ORIG_BEAK, BG, IVORY } from './mark-dive.mjs';

const SIZE = 1080, FPS = 60, DUR = 7.2, N_PTS = 180;
const OUT = 'public/brand/dive-open.mp4';

const clamp = (x) => Math.min(1, Math.max(0, x));
const prog = (t, start, dur) => clamp((t - start) / dur);
const inOutCubic = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const outBack = (x) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2; // 稍微衝過頭再彈回
const lerp = (a, b, u) => a + (b - a) * u;
const rad = (d) => (d * Math.PI) / 180;
const f2 = (n) => +n.toFixed(2);
const pathOf = (pts) => `M${pts.map((p) => `${f2(p[0])} ${f2(p[1])}`).join('L')}Z`;

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
  const fn = (u, m = u) => { // u：位置、角度走到哪；m：形狀變到哪
    const c = [lerp(cS[0], cT[0], u), lerp(cS[1], cT[1], u)], a = aS + dA * u;
    return Sl.map((p, i) => { const q = rot([lerp(p[0], Ta[i][0], m), lerp(p[1], Ta[i][1], m)], a); return [c[0] + q[0], c[1] + q[1]]; });
  };
  fn.pose = (u) => ({ c: [lerp(cS[0], cT[0], u), lerp(cS[1], cT[1], u)], a: aS + dA * u }); // 這一片在 u 的位置、角度
  fn.src = S;
  return fn;
};

// ── 目標：甲（爪子版）
const dive = buildDive({ claws: true });
const byId = Object.fromEntries(dive.map((l) => [l.id, l]));
const tracks = [];
// 調整姿勢的零件：輪廓對應著變過去（頭的表情、胸口、肩上的短羽毛）
const morphs = {};
const morph = (id, srcD, side, time, haloFrom) => {
  const l = byId[id], m = pair(srcD, l.d, side);
  morphs[id] = { m, time, poseAt: (t) => m.pose(inOutCubic(prog(t, time[0], time[1]))) };
  tracks.push({ ...l, draw: (t) => { const raw = prog(t, time[0], time[1]); return { pts: m(inOutCubic(raw)), halo: lerp(haloFrom ?? l.halo, l.halo, inOutCubic(raw)) }; } });
};
// 張開翅膀的長羽毛：一開始收在兩側那片翅膀裡（縮到跟它差不多長、轉成跟它同一個方向、疊在它下面），
// 跟著它一起抬起來；輪到它時再一根接一根轉出去、伸長到定位（形狀不變，像折扇打開）
const spread = (id, k, side, host, time) => {
  const l = byId[id], H = morphs[host], F = resample(l.d), cF = centroid(F), aF = axis(F, side);
  const along = (pts, a) => { const pr = pts.map((p) => p[0] * Math.cos(a) + p[1] * Math.sin(a)); return Math.max(...pr) - Math.min(...pr); };
  const hostSrc = H.m.src, s0 = (0.9 * along(hostSrc, axis(hostSrc, side))) / along(F, aF);
  const local = F.map((p) => [p[0] - cF[0], p[1] - cF[1]]);
  const wrap = (x) => { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
  tracks.push({ ...l, draw: (t) => {
    const hp = H.poseAt(t), hostAxis = hp.a + (axis(hostSrc, side) - H.m.pose(0).a); // 那片翅膀現在的中心、方向
    const u = outBack(prog(t, time[0], time[1])), w = inOutCubic(prog(t, time[0], time[1]));
    const a = aF + wrap(hostAxis - aF) * (1 - u), sc = lerp(s0, 1, u), c = [lerp(hp.c[0], cF[0], w), lerp(hp.c[1], cF[1], w)];
    const r = a - aF, cs = Math.cos(r), sn = Math.sin(r);
    return { pts: local.map(([x, y]) => [c[0] + sc * (x * cs - y * sn), c[1] + sc * (x * sn + y * cs)]), halo: l.halo };
  } });
};
// 頭（0.55 秒起）、胸口、肩上的短羽毛（covert0／2＝下面那片從原本下翅變、covert1／3＝上面那片從原本收著的翅膀變）
const HEAD_T = [0.8, 1.35];
const headSrc = { mask0: SRC.brow, mask1: SRC.faceL, mask2: SRC.faceR, mask3: SRC.eyeL, mask4: SRC.eyeR, mask5: SRC.beak,
  eye0: SRC.eyeL, eye1: SRC.eyeR, face0: SRC.faceL, face1: SRC.faceR, brow: SRC.brow, beak: SRC.beak };
for (const [id, src] of Object.entries(headSrc)) morph(id, src, 0, HEAD_T, id === 'brow' ? 0 : undefined);
morph('mask6', mapPath(byId.mask6.d, (x, y) => [256 + (x - 256) * 0.01, 172 + (y - 270) * 0.01]), 0, HEAD_T); // 臉中間挖縫用的橢圓：一開始縮成一點
morph('chest', SRC.chest, 0, [1.0, 1.3]); // 身體往前傾：胸口看起來變短（尾巴同時露出來，見下面）
morph('covert0', SRC.lowL, -1, [1.0, 1.45]); morph('covert2', SRC.lowR, 1, [1.0, 1.45]);
morph('covert1', SRC.wingL, -1, [1.05, 1.45]); morph('covert3', SRC.wingR, 1, [1.05, 1.45]);
// 上面那片短羽毛（原本收著的翅膀）收著長羽毛 1、2；下面那片（原本的下翅）收著 3、4 —— 正好是一片短羽毛對兩根長羽毛
for (let j = 0; j < 4; j++) {
  const time = [1.55 + 0.16 * j, 1.5];
  spread(`long${j}`, j + 1, -1, j < 2 ? 'covert1' : 'covert0', time);
  spread(`long${j + 4}`, j + 1, 1, j < 2 ? 'covert3' : 'covert2', time);
}

// ── 尾巴：身體往前傾（胸口看起來變短）的同時，尾巴從胸口後面張開露出來；爪子往前伸的時候再收回胸口後面（爪子版沒有尾巴）
const TILT = [1.2, 1.1], TUCK = [4.0, 0.6];
{
  const [px, py] = dive.place(...dive.tailPivot), A = dive.tailAngles;
  dive.tail.forEach((d, j) => {
    const pts = resample(d).map(([x, y]) => [x - px, y - py]), mid = rad((A[j] + A[j + 1]) / 2);
    tracks.push({ id: `tail${j}`, fill: IVORY, draw: (t) => {
      const u = outBack(prog(t, ...TILT)) * (1 - inOutCubic(prog(t, ...TUCK))), r = mid * (1 - u), sc = lerp(0.3, 1, u), c = Math.cos(r), sn = Math.sin(r);
      return { pts: pts.map(([x, y]) => [px + sc * (x * c - y * sn), py + sc * (x * sn + y * c)]), halo: 0 };
    } });
  });
}

// ── 訊息框：象牙白的對話框＋兩條字（底色），從下面浮上來；被抓住時往上一頓
const Z = dive.zoom, BUB = { cx: 256, top: 391, w: 52, h: 25, r: 8 }; // 上緣剛好在爪尖下面一點，爪尖輕輕扣住
const bx = BUB.cx - BUB.w / 2, by = BUB.top, bw = BUB.w, bh = BUB.h, br = BUB.r;
const bubbleD = mapPath(`M${bx + br} ${by}L${bx + bw - br} ${by}Q${bx + bw} ${by} ${bx + bw} ${by + br}L${bx + bw} ${by + bh - br}Q${bx + bw} ${by + bh} ${bx + bw - br} ${by + bh}L${bx + 21} ${by + bh}L${bx + 10} ${by + bh + 9}L${bx + 12} ${by + bh}L${bx + br} ${by + bh}Q${bx} ${by + bh} ${bx} ${by + bh - br}L${bx} ${by + br}Q${bx} ${by} ${bx + br} ${by}Z`, dive.place);
const lines = [[bx + 12, by + 11, bx + bw - 12], [bx + 12, by + 18, bx + bw - 24]].map(([x1, y, x2]) => [dive.place(x1, y), dive.place(x2, y)]);
const bubC = dive.place(BUB.cx, BUB.top + BUB.h / 2);
const BUB_IN = [3.7, 0.7], REACH = 10, CLOSE = [4.75, 0.22], PULL = [4.85, 0.45]; // 訊息框先停在低一點的地方，爪子伸下去抓、合起來、再往上拉回定位
const bubble = (t) => {
  const u = outBack(prog(t, ...BUB_IN)), s = lerp(0.2, 1, u), dy = (lerp(30, REACH, u) - REACH * outBack(prog(t, ...PULL))) * Z;
  const tf = (x, y) => [bubC[0] + s * (x - bubC[0]), bubC[1] + s * (y - bubC[1]) + dy];
  if (prog(t, ...BUB_IN) <= 0) return '';
  return `<path d="${mapPath(bubbleD, tf)}" fill="${IVORY}" stroke="${BG}" stroke-width="${f2(dive.gap * 2 * Z)}" paint-order="stroke" stroke-linejoin="round"/>`
    + lines.map(([a, b]) => { const p = tf(...a), q = tf(...b); return `<path d="M${f2(p[0])} ${f2(p[1])}L${f2(q[0])} ${f2(q[1])}" stroke="${BG}" stroke-width="${f2(3.6 * Z * s)}" stroke-linecap="round"/>`; }).join('');
};

// ── 爪子：從胸口下面伸出來（往下、變大），一邊伸一邊張開，碰到訊息框時一把扣起來
const toes = dive.filter((l) => l.id.startsWith('toe'));
const OPEN = [52, 24, -36]; // 左腳三根爪張開的角度（右腳相反）：張得很開，抓的時候才看得出來
const EXT = [4.0, 0.7];
const toeTracks = toes.map((l, i) => {
  const pts = resample(l.d), base = pts.reduce((b, p) => (p[1] < b[1] ? p : b)), side = i < 3 ? -1 : 1, open = rad(OPEN[i % 3]) * (side < 0 ? 1 : -1);
  return (t) => {
    // 伸：從胸口後面往下伸到訊息框（比定位低 REACH），一邊變大、一邊張開；扣：爪子一口氣合起來；拉：連訊息框一起拉回定位
    const e = inOutCubic(prog(t, ...EXT)), g = outBack(prog(t, ...CLOSE)), pull = outBack(prog(t, ...PULL));
    const a = open * e * (1 - g), s = lerp(0.35, 1.12, e) - 0.12 * pull, dy = (lerp(-16, REACH, e) - REACH * pull) * Z;
    const c = Math.cos(a), sn = Math.sin(a);
    return pts.map(([x, y]) => { const X = x - base[0], Y = y - base[1]; return [base[0] + s * (X * c - Y * sn), base[1] + dy + s * (X * sn + Y * c)]; });
  };
});
const feet = (t) => {
  if (prog(t, ...EXT) <= 0) return '';
  const all = toeTracks.map((fn) => pathOf(fn(t)));
  return `<g fill="${BG}" stroke="${BG}" stroke-width="${f2(dive.gap * 2 * Z)}" stroke-linejoin="round">${all.map((d) => `<path d="${d}"/>`).join('')}</g><g fill="${byId.toe0.fill}">${all.map((d) => `<path d="${d}"/>`).join('')}</g>`;
};

// 照定稿的前後順序畫；訊息框和爪子插在胸口後面、頭前面（爪子要蓋在胸口上面）
const order = (id) => (id.startsWith('tail') ? dive.findIndex((l) => l.id === 'chest') - 0.5 : dive.findIndex((l) => l.id === id)); // 尾巴畫在胸口後面
tracks.sort((a, b) => order(a.id) - order(b.id));
const LIFT = 9; // 抓到訊息時整隻往上提一點（加上訊息框之後還是置中）
const frame = (t) => {
  const draw = (tr) => { const { pts, halo } = tr.draw(t); return `<path d="${pathOf(pts)}" fill="${tr.fill}"${halo > 0.05 ? ` stroke="${BG}" stroke-width="${f2(halo * 2)}" paint-order="stroke" stroke-linejoin="round"` : ''}/>`; };
  const chestAt = tracks.findIndex((tr) => tr.id === 'chest');
  const shown = () => true;
  const before = tracks.slice(0, chestAt + 1).filter(shown).map(draw).join(''), after = tracks.slice(chestAt + 1).filter(shown).map(draw).join('');
  const lift = -LIFT * inOutCubic(prog(t, 3.7, 1.4));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${SIZE}" height="${SIZE}"><rect width="512" height="512" fill="${BG}"/><g transform="translate(0 ${f2(lift)})">${before}${bubble(t)}${feet(t)}${after}</g></svg>`;
};

// 只輸出一張靜態圖檢查：node scripts/mark-dive-open.mjs --still 2.9 [輸出檔名]
const stillAt = process.argv.indexOf('--still');
if (stillAt > 0) {
  const t = Number(process.argv[stillAt + 1] ?? 1.5), out = process.argv[stillAt + 2] ?? `dive-open-still-${Math.round(t * 100)}.png`;
  await sharp(Buffer.from(frame(t))).png().toFile(out);
  console.log(out);
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), 'dive-open-'));
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
