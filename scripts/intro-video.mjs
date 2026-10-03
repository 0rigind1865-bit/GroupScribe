// 產生「群記」開場動畫影片（1920×1080、60fps、8.5 秒、無聲）
// 故事：滿畫面亂抖的對話框（噪音）→ 暗處一雙金眼一直盯著 → 貓頭鷹折扇般展翅、安靜滑翔進場
//      → 瞄準圈鎖定唯一的金色訊號 → 伸爪精準抓住、收翅，一圈波紋把噪音清空 → 訊號收進身體、眼睛一亮 → 帶出標題與標語
// 用法：node scripts/intro-video.mjs → public/brand/intro.mp4
// 流程：每一格算好位置寫成 SVG → sharp 轉 PNG → macOS 內建 AVFoundation（swift）壓成 H.264 MP4，不用裝 ffmpeg
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const W = 1920, H = 1080, FPS = 60, DUR = 8.5;
const OUT = 'public/brand/intro.mp4';
const IVORY = '#f6f4ee', GOLD = '#d4b26a', MINT = '#e3ece5', NOISE_C = '#5b927d';

// 形狀直接從定稿 mark.svg 抓，logo 改了重跑一次影片就跟著改
const mark = readFileSync('public/brand/mark.svg', 'utf8');
const [ivoryPart, goldPart] = mark.split('<g fill="#d4b26a">');
const pieces = [...ivoryPart.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
const beak = goldPart.match(/<path d="([^"]+)"/)[1];
const EYES = [[-45.5, 186], [45.5, 186]];
const OWL_CY = 252.5; // 貓頭鷹在 mark.svg 座標裡的中心 y

const clamp = (x) => Math.min(1, Math.max(0, x));
const prog = (t, start, dur) => clamp((t - start) / dur);
const outCubic = (x) => 1 - (1 - x) ** 3;
const outBack = (x) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2; // 稍微衝過頭再彈回
const inOutCubic = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const inOutSine = (x) => (1 - Math.cos(Math.PI * x)) / 2;
const lerp = (a, b, k) => a + (b - a) * k;
const bump = (t, at, width) => Math.exp(-(((t - at) / width) ** 2));
const BG = '#0b4a38';
// 兩個顏色混合（k=0 是 a、k=1 是 b）；用來讓貓頭鷹「由暗變亮」但身體不透明，背景噪音不會透過來
const mix = (a, b, k) => '#' + [1, 3, 5].map((i) => Math.round(lerp(parseInt(a.slice(i, i + 2), 16), parseInt(b.slice(i, i + 2), 16), k)).toString(16).padStart(2, '0')).join('');

// 翅膀：把 logo 原本的上翅（pieces 第 3 塊，左翅）複製 6 片，像折扇一樣繞翅膀頂端轉開；
// 收起時 6 片全部疊回原位＝原本的 logo。每片描一圈底色邊，展開後片與片之間有縫，跟 logo 的語言一致。
// 右翅＝左翅鏡像（第 4 塊本來就是第 3 塊的鏡像）。
const WING_PIVOT = [-88, 232];
const FAN = [30, 50, 70, 90, 110, 130]; // 全展開時每片轉幾度（由內到外）
const FAN_GROW = [0, 0.12, 0.26, 0.42, 0.58, 0.72]; // 外側的片拉長，像飛羽
const UPPER_WINGS = [3, 4];

// 爪子（金色，跟嘴巴同色）：俯衝時從身體下面伸出、張開，落下瞬間一把抓緊訊號，再連同訊號收回身體
const CLAW = ((L) => `M-7 0C-9 ${L * 0.5} ${L * 0.1} ${L * 0.95} ${L * 0.45} ${L}C${L * 0.15} ${L * 0.75} 7 ${L * 0.45} 7 0Q0 -6 -7 0Z`)(38);
const CLAW_OPEN = [55, 0], CLAW_SHUT = [22, 2]; // 左腳兩根爪的角度（右腳鏡像）
const ANKLE_X = 24, ANKLE_IN = 365, ANKLE_OUT = 402; // 腳踝收在身體裡 / 伸出來的位置
const GRIP_Y = 30; // 訊號在腳踝下方多遠
const SIG_W = 64, SIG_H = 16; // 訊號大小（貓頭鷹座標；舞台上是兩倍）

// 噪音：固定亂數種子，每次產生的畫面都一樣
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const STRIKE_AT = [960, 480]; // 貓頭鷹落下時的位置（縮放 2 倍）
const SIGNAL = [960, STRIKE_AT[1] + (ANKLE_OUT + GRIP_Y - OWL_CY) * 2]; // 金色訊號，剛好在爪子下
const NOISE = Array.from({ length: 170 }, () => ({
  x: 40 + rand() * 1840, y: 40 + rand() * 1000, w: 26 + rand() * 90, a: 0.25 + rand() * 0.35, p: rand() * 6.28, q: rand() * 6.28,
})).filter((n) => Math.hypot(n.x - SIGNAL[0], n.y - SIGNAL[1]) > 110);

// 飛行路線（三次貝茲曲線）：左上遠處 → 往右上拉高 → 繞回來俯衝到正中間
const PATH = [[330, 250], [760, 40], [1330, 300], STRIKE_AT];
const bez = (k, axis) => {
  const [a, b, c, d] = PATH.map((p) => p[axis]), m = 1 - k;
  return m ** 3 * a + 3 * m * m * k * b + 3 * m * k * k * c + k ** 3 * d;
};
const FLY_START = 1.4, FLY_DUR = 2.0, STRIKE = FLY_START + FLY_DUR; // 3.4 秒落下
const BLINKS = [1.1, 7.0];

function frame(t) {
  // ── 貓頭鷹位置：遠處盯著 → 滑翔 → 落在中間 → 4.4 秒起滑到左邊讓位給字
  const fly = prog(t, FLY_START, FLY_DUR), u = inOutSine(fly);
  let ox = bez(u, 0), oy = bez(u, 1);
  let scale = lerp(0.6, 2.0, u ** 1.6); // 由遠而近，越靠近變大越快
  const dx = bez(Math.min(u + 0.01, 1), 0) - bez(Math.max(u - 0.01, 0), 0);
  const dy = bez(Math.min(u + 0.01, 1), 1) - bez(Math.max(u - 0.01, 0), 1);
  const tilt = 14 * (dx / (Math.hypot(dx, dy) || 1)) * Math.sin(Math.PI * fly); // 轉彎時往前傾
  if (t < FLY_START) oy += 4 * Math.sin(t * 3); // 停在遠處時輕微浮動
  oy = lerp(oy, 540, inOutCubic(prog(t, 3.95, 0.5))); // 抓到後慢慢回到畫面中間
  const move = inOutCubic(prog(t, 4.4, 0.9));
  ox = lerp(ox, 540, move); scale = lerp(scale, 1.78, move);
  const lit = lerp(0.25, 1, u ** 1.5); // 遠處暗暗的只剩眼睛，靠近才亮

  // ── 翅膀：起飛時折扇展開，緩慢無聲地拍（一秒一下），落下前上揚煞車，落地時一片片疊回 logo 的樣子（收過頭一點再彈回）
  // 每片錯開一點時間：展開時外側先開、收起時內側先收，像折扇一片片轉
  const spreadOf = (k) => outCubic(prog(t, 1.2 + 0.07 * (5 - k), 0.6)) * (1 - outBack(prog(t, STRIKE - 0.08 + 0.03 * k, 0.5)));
  const spread = spreadOf(5);
  const flap = 16 * Math.sin((2 * Math.PI * (t - FLY_START)) / 0.95) * clamp(spread) + 22 * bump(t, STRIKE - 0.2, 0.15);
  const [px, py] = WING_PIVOT;
  const fan = FAN.map((deg, k) => { const sp = spreadOf(k); return `<path d="${pieces[3]}" stroke="${BG}" stroke-width="${10 * clamp((sp - 0.15) * 2.5)}" paint-order="stroke" transform="translate(${px} ${py}) rotate(${deg * sp + flap * (0.4 + 0.12 * k) * clamp(sp * 3)}) scale(${1 + FAN_GROW[k] * sp}) translate(${-px} ${-py})"/>`; })
    .reverse().join(''); // 外側先畫，最內側（原本那片）疊在最上面，像從它底下展開
  const wings = fan + `<g transform="scale(-1 1)">${fan}</g>`;
  const body = pieces.filter((_, i) => !UPPER_WINGS.includes(i)).map((d) => `<path d="${d}"/>`).join('');

  // ── 爪子：2.75 秒伸出張開 → 落下瞬間抓緊 → 3.95 秒連同訊號收回身體
  const ext = outCubic(prog(t, 2.75, 0.4)) * (1 - inOutCubic(prog(t, 3.95, 0.4)));
  const ankleY = lerp(ANKLE_IN, ANKLE_OUT, ext);
  const grip = outBack(prog(t, STRIKE - 0.06, 0.16));
  const foot = `<g transform="translate(${-ANKLE_X} ${ankleY})">${CLAW_OPEN.map((o, i) =>
    `<path d="${CLAW}" transform="rotate(${lerp(o, CLAW_SHUT[i], grip)})" stroke="${BG}" stroke-width="6" paint-order="stroke"/>`).join('')}</g>`;
  const claws = ext > 0.01 ? foot + `<g transform="scale(-1 1)">${foot}</g>` : '';
  // 抓到之後訊號改成跟著貓頭鷹走（畫在貓頭鷹座標裡，落點剛好對齊不會跳）
  const held = t >= STRIKE ? `<g opacity="${1 - prog(t, 4.1, 0.25)}"><rect x="${-SIG_W / 2 - 3}" y="${ankleY + GRIP_Y - SIG_H / 2 - 1}" width="${SIG_W + 6}" height="${SIG_H + 2}" rx="${SIG_H / 2}" fill="${GOLD}" opacity="0.6" filter="url(#blur)"/>
    <rect x="${-SIG_W / 2}" y="${ankleY + GRIP_Y - SIG_H / 2}" width="${SIG_W}" height="${SIG_H}" rx="${SIG_H / 2}" fill="${GOLD}"/></g>` : '';

  // ── 眼睛：從頭到尾都亮著；遠處最亮、落下抓到訊號時閃一下、之後像呼吸一樣持續發光
  const blink = BLINKS.reduce((k, b) => k * (1 - 0.92 * Math.sin(Math.PI * prog(t, b, 0.2))), 1);
  const eyes = EYES.map(([ex, ey]) =>
    `<circle cx="${ex}" cy="${ey}" r="18" transform="translate(${ex} ${ey}) scale(1 ${blink}) translate(${-ex} ${-ey})"/>`).join('');
  const glow = clamp(lerp(1, 0.35, u) + 0.1 * Math.sin(t * 2.4) * prog(t, STRIKE, 0.6) + 0.7 * bump(t, STRIKE + 0.1, 0.18) + 0.5 * bump(t, 4.3, 0.18)) * blink;
  const glowR = lerp(70, 32, u);
  const glows = EYES.map(([ex, ey]) => `<circle cx="${ex}" cy="${ey}" r="${glowR}" fill="${GOLD}" opacity="${glow}" filter="url(#blur)"/>`).join('');

  // ── 噪音對話框：亂抖、閃爍；落下那刻從訊號點擴散一圈波紋，波紋掃過的地方全部清空
  const wave = 2300 * outCubic(prog(t, STRIKE, 1.1));
  const noise = NOISE.map((n) => {
    const d = Math.hypot(n.x - SIGNAL[0], n.y - SIGNAL[1]);
    const a = n.a * (0.6 + 0.4 * Math.sin(t * 7 + n.p * 3)) * clamp(t / 0.8) * (t < STRIKE ? 1 : clamp((d - wave) / 60));
    if (a <= 0.01) return '';
    return `<rect x="${n.x + 4 * Math.sin(t * 11 + n.p)}" y="${n.y + 3 * Math.sin(t * 15 + n.q)}" width="${n.w}" height="16" rx="8" fill="${NOISE_C}" opacity="${a}"/>`;
  }).join('');
  const waveRing = t > STRIKE ? `<circle cx="${SIGNAL[0]}" cy="${SIGNAL[1]}" r="${wave}" fill="none" stroke="${GOLD}" stroke-width="2" opacity="${0.5 * (1 - prog(t, STRIKE, 1.1))}"/>` : '';

  // ── 金色訊號＋瞄準圈：飛行途中瞄準圈慢慢縮小鎖定，落下那刻被爪子抓走
  const sig = t < STRIKE ? clamp(t / 0.8) : 0;
  const sigGlow = 0.25 + 0.5 * prog(t, 1.9, 1.4);
  const lock = clamp((t - 1.9) / 0.3) * (1 - prog(t, STRIKE - 0.1, 0.2));
  const r = lerp(150, 50, inOutSine(prog(t, 1.9, STRIKE - 2.05))); // 一路縮到落下那刻才鎖死
  const [sx, sy] = SIGNAL;
  const ticks = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([a, b]) =>
    `<line x1="${sx + a * r}" y1="${sy + b * r}" x2="${sx + a * (r + 16)}" y2="${sy + b * (r + 16)}"/>`).join('');
  const signal = `<g opacity="${sig}">
    <rect x="${sx - SIG_W - 6}" y="${sy - SIG_H - 2}" width="${SIG_W * 2 + 12}" height="${SIG_H * 2 + 4}" rx="${SIG_H + 2}" fill="${GOLD}" opacity="${sigGlow}" filter="url(#blur)"/>
    <rect x="${sx - SIG_W}" y="${sy - SIG_H}" width="${SIG_W * 2}" height="${SIG_H * 2}" rx="${SIG_H}" fill="${GOLD}"/>
  </g>
  <g stroke="${GOLD}" stroke-width="2" fill="none" opacity="${lock * 0.8}"><circle cx="${sx}" cy="${sy}" r="${r}"/>${ticks}</g>`;

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
<rect width="${W}" height="${H}" fill="#0b4a38"/>
${noise}${waveRing}${signal}
<g transform="translate(${ox} ${lerp(oy, 540, move)}) rotate(${tilt}) scale(${scale}) translate(0 ${-OWL_CY})">
  ${glows}<g fill="${mix(BG, IVORY, lit)}">${wings}</g>${held}<g fill="${mix(BG, GOLD, lit)}">${claws}</g>
  <g fill="${mix(BG, IVORY, lit)}">${body}</g><g fill="${GOLD}">${eyes}<path d="${beak}" fill="${mix(BG, GOLD, lit)}"/></g>
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
