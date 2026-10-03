// 產生「群記」開場動畫影片（1920×1080、60fps、8.5 秒、無聲）
// 故事：滿畫面亂抖的對話框（噪音）→ 暗處一雙金眼一直盯著 → 折扇般展翅、露出尾巴與金爪，翅膀攤平安靜滑翔爬升
//      → 高處停一下、變身成「俯衝 logo」（翅膀舉成 V 字、尖尾巴）→ 加速俯衝 → 張翅煞車、伸爪精準扣住訊號
//      → 收翅，一圈波紋把噪音清空 → 訊號收走、眼睛一亮 → 帶出標題與標語
// 用法：node scripts/intro-video.mjs → public/brand/intro.mp4（加 --still 3.2 只輸出那一秒的靜態圖）
// 流程：每一格算好位置寫成 SVG → sharp 轉 PNG → macOS 內建 AVFoundation（swift）壓成 H.264 MP4，不用裝 ffmpeg
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const W = 1920, H = 1080, FPS = 60, DUR = 8.5;
const OUT = 'public/brand/intro.mp4';
const BG = '#0b4a38', IVORY = '#f6f4ee', GOLD = '#d4b26a', MINT = '#e3ece5', NOISE_C = '#5b927d';

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
// 兩個顏色混合（k=0 是 a、k=1 是 b）；用來讓貓頭鷹「由暗變亮」但身體不透明，背景噪音不會透過來
const mix = (a, b, k) => '#' + [1, 3, 5].map((i) => Math.round(lerp(parseInt(a.slice(i, i + 2), 16), parseInt(b.slice(i, i + 2), 16), k)).toString(16).padStart(2, '0')).join('');
// 關鍵影格 [[秒, 值], …]：中間用平滑曲線（Catmull-Rom）串起來，速度連續，動作不會一頓一頓
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

// ── 動作設計（秒）：暗處盯著 → 1.25 起飛滑翔爬升 → 2.35 高處停一下、微微上提蓄力 → 2.55 俯衝 → 3.4 抓住
const GLIDE_START = 1.25, APEX = 2.35, DIVE_START = 2.55, STRIKE = 3.4;
const STRIKE_AT = [960, 440]; // 抓住訊號那刻貓頭鷹的位置（縮放 2 倍）
const GLIDE = [[520, 260], [720, 190], [1000, 150], [1240, 175]]; // 滑翔：往右上爬升（三次貝茲曲線的 4 個點）
const DIVE = [[1240, 160], [1255, 260], [1030, 420], STRIKE_AT]; // 俯衝：先幾乎垂直往下，最後拉平對準訊號
const bez = (P, k) => [0, 1].map((a) => (1 - k) ** 3 * P[0][a] + 3 * (1 - k) ** 2 * k * P[1][a] + 3 * (1 - k) * k * k * P[2][a] + k ** 3 * P[3][a]);
// 俯衝的速度：一路加速，最後 22% 急煞、剛好停在訊號上（速度連續，不是硬撞停）
const stoop = (x, k = 0.78) => (x <= k ? (x * x) / k : k + (2 / (1 - k)) * (x - k - (x * x - k * k) / 2));

const TILT = keys([[1.25, 0], [1.8, 9], [2.25, 4], [2.5, 0], [3.1, 0], [3.28, 4], [3.4, 0]]); // 身體傾斜：滑翔轉彎時、煞車時往後仰；俯衝時擺正（像一個完整的 logo）
const SPREAD = keys([[1.1, 0], [1.6, 1], [3.1, 1], [3.24, 1.08], [3.38, 1], [3.62, 0.1], [3.82, 0]]); // 翅膀張開程度
const FLAT_W = keys([[1.4, 0], [1.75, 1], [2.3, 1], [2.55, 0]]); // 滑翔攤平姿勢的比重
const V_W = keys([[2.35, 0], [2.65, 1], [3.12, 1], [3.28, 0]]); // 俯衝舉 V 姿勢的比重（煞車時張回大扇子）
const TAIL_K = keys([[1.1, 0], [1.6, 1], [3.38, 1], [3.62, 0.1], [3.82, 0]]); // 尾巴：起飛張開、整趟都在、抓到後收起
const REVEAL = keys([[1.1, 0], [1.6, 1], [2.4, 1], [2.7, 0.05], [3.05, 0.05], [3.24, 1.08], [3.38, 1], [3.62, 0.1], [3.82, 0]]); // 爪子露出多少：俯衝時收起、煞車時伸出
const WING_LIFT = keys([[2.25, 0], [2.45, 8], [2.6, 0], [3.1, 0], [3.24, 14], [3.42, 0]]); // 整片翅膀上揚：停在高處蓄力時、煞車時
const FLAP = keys([[1.35, 0], [1.6, 12], [2.15, 12], [2.35, 0]]); // 只在滑翔時慢慢拍，俯衝時不拍（安靜）
const POSE = keys([[3.05, 0], [3.24, -0.4], [3.4, 0]]); // 煞車時挺胸張開（負值）；1＝頭往前、身體縮成流線形（目前沒用到）
const TRAIL = keys([[2.7, 0], [3.12, 1], [3.3, 0]]); // 俯衝殘影的濃淡
const BLINKS = [1.0, 7.0];

// 翅膀：把 logo 原本的上翅（pieces 第 3 塊，左翅）複製 6 片，像折扇一樣展開；樣子參考羽毛一層層往外上方疊、最上面那根最長的貓頭鷹標誌。
// 每片展開時形狀各自變化（不是同一個形狀放大縮小）：拉長、變窄、尖端往上彎；原本那片變成最上面、最大的那根。
// 越下面的片，羽根沿著原本那片往下錯開越多，展開後羽毛一層層疊起來，不是全部從同一點散開。
// 收起時全部回到原本那片的位置＝原本的 logo。每片描一圈底色邊，片與片之間有縫，跟 logo 的語言一致。右翅＝左翅鏡像。
const WING_PIVOT = [-88, 232], ARM = 105; // 翅膀頂端（肩膀）、那片翅膀的長度
// [展開時轉幾度, 拉長倍數, 寬度倍數, 尖端往上彎多少, 羽根往下錯開多少, 根部變粗尖端變細多少, 羽根往外錯開多少]；第 0 片＝原本那片（最上面、最大），第 5 片最靠身體
// 三種姿勢，飛行中互相切換：一般折扇（煞車、抓住時）、滑翔時往兩側攤平拉長、俯衝時往上舉成 V 字
const FAN = [
  [128, 1.85, 0.8, -0.22, 0, 0.8, 0], [114, 1.68, 0.82, -0.16, 14, 0.75, 0], [100, 1.5, 0.85, -0.12, 28, 0.7, 0],
  [86, 1.33, 0.88, -0.08, 42, 0.6, 0], [72, 1.16, 0.92, -0.05, 56, 0.5, 0], [58, 1.0, 0.95, -0.03, 70, 0.4, 0],
];
const FAN_FLAT = [
  [98, 2.6, 0.75, -0.3, 0, 0.85, 0], [94, 2.35, 0.75, -0.18, 12, 0.8, 0], [90, 2.05, 0.78, -0.1, 24, 0.75, 0],
  [86, 1.75, 0.8, -0.04, 36, 0.7, 0], [82, 1.45, 0.85, 0, 48, 0.6, 0], [78, 1.2, 0.9, 0.03, 60, 0.5, 0],
];
// 俯衝 logo（舉 V）：6 根羽毛平行、往外上方 35 度，羽根貼著身體側面一根根往下疊（間距相同），越上面越長、尖端連成整齊斜線
const FAN_V = [0, 1, 2, 3, 4, 5].map((j) => [127 - j, 2.1 - 0.2 * j, [0.9, 0.9, 0.92, 0.94, 0.96, 1][j], -0.08 + 0.012 * j, 6 + 25.4 * j, 0.3, 8 - 5.6 * j]);
// 尾巴：翅膀張開時從身體後面滑出 4 根尾羽（同一片翅膀的縮小版），像小扇子往下散開；收翅時縮回身體後面
const TAIL = [[34, 0.88], [-34, 0.88], [12, 1], [-12, 1]]; // [展開時轉幾度（正＝往左）, 長度倍數]；外側先畫，中間兩根疊上面
// 把那片翅膀的路徑拆成點（直線切細，彎起來才順），每格再依展開程度拉長、變窄、彎曲
const WING_SEGS = (() => {
  const segs = [];
  let cur;
  for (const [, c, args] of pieces[3].matchAll(/([MQLZ])([^MQLZ]*)/g)) {
    const n = args.trim().split(/\s+/).filter(Boolean).map(Number);
    if (c === 'M') { cur = [n[0], n[1]]; segs.push(['M', cur]); }
    if (c === 'Q') { segs.push(['Q', [n[0], n[1]], [n[2], n[3]]]); cur = [n[2], n[3]]; }
    if (c === 'L') { for (let i = 1; i <= 6; i++) segs.push(['L', [lerp(cur[0], n[0], i / 6), lerp(cur[1], n[1], i / 6)]]); cur = [n[0], n[1]]; }
  }
  return segs;
})();
const wingPath = (len, wid, bend, taper) => {
  const [px, py] = WING_PIVOT;
  const w = ([x, y]) => {
    const a = y - py, k = wid * (1 + taper * (0.5 - a / ARM)); // 越靠尖端越窄
    return `${(px + (x - px) * k + bend * ARM * (a / ARM) ** 2).toFixed(2)} ${(py + a * len).toFixed(2)}`;
  };
  return WING_SEGS.map(([c, p, q]) => (c === 'Q' ? `Q${w(p)} ${w(q)}` : `${c}${w(p)}`)).join('') + 'Z';
};
const HEAD = [0, 1, 2], LOWER = [5, 6, 7]; // logo 的頭部（額頭、兩側臉）與下半身（身體、兩側下翅）；第 3、4 塊是上翅

// 爪子（金色，跟嘴巴同色）：翅膀張開時從身體下面伸出、張開，落下瞬間一把抓緊訊號，再連同訊號收回身體
const CLAW = ((L) => `M-7 0C-9 ${L * 0.5} ${L * 0.1} ${L * 0.95} ${L * 0.45} ${L}C${L * 0.15} ${L * 0.75} 7 ${L * 0.45} 7 0Q0 -6 -7 0Z`)(38);
const CLAW_OPEN = [55, 0], CLAW_SHUT = [22, 2]; // 左腳兩根爪的角度（右腳鏡像）
const ANKLE_X = 24, ANKLE_IN = 365, ANKLE_OUT = 402; // 腳踝收在身體裡 / 伸出來的位置
const GRIP_Y = 30; // 訊號在腳踝下方多遠
const SIG_W = 64, SIG_H = 16; // 訊號大小（貓頭鷹座標；舞台上是兩倍）
const SIGNAL = [STRIKE_AT[0], STRIKE_AT[1] + (ANKLE_OUT + GRIP_Y - OWL_CY) * 2]; // 金色訊號，剛好在爪子下
// 自我檢查：落下那刻身體不傾斜也不變形，俯衝曲線頭尾要是 0 和 1，不然抓住的瞬間訊號會跳
if (TILT(STRIKE) !== 0 || POSE(STRIKE) !== 0 || stoop(0) !== 0 || Math.abs(stoop(1) - 1) > 1e-9) throw new Error('動作曲線對不齊');

// 噪音：固定亂數種子，每次產生的畫面都一樣
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const NOISE = Array.from({ length: 170 }, () => ({
  x: 40 + rand() * 1840, y: 40 + rand() * 1000, w: 26 + rand() * 90, a: 0.25 + rand() * 0.35, p: rand() * 6.28, q: rand() * 6.28,
})).filter((n) => Math.hypot(n.x - SIGNAL[0], n.y - SIGNAL[1]) > 110);

// 貓頭鷹在舞台上的位置、大小、傾斜
function flight(t) {
  let x, y, s;
  if (t < APEX) { // 滑翔爬升（起飛前在原地輕輕浮動）
    const g = inOutSine(prog(t, GLIDE_START, APEX - GLIDE_START));
    [x, y] = bez(GLIDE, g); y += 4 * Math.sin(t * 3) * (1 - g); s = lerp(0.75, 0.95, g);
  } else if (t < DIVE_START) { // 高處停一下、微微上提（蓄力）
    [x, y] = GLIDE[3]; y -= 15 * inOutSine(prog(t, APEX, DIVE_START - APEX)); s = 0.95;
  } else { // 俯衝：越衝越快、越來越大（朝鏡頭撲過來），最後急煞
    const d = stoop(prog(t, DIVE_START, STRIKE - DIVE_START));
    [x, y] = bez(DIVE, d); s = lerp(0.95, 2.0, d ** 1.8);
  }
  y = lerp(y, 540, inOutCubic(prog(t, 3.95, 0.5))); // 抓到後慢慢回到畫面中間
  const move = inOutCubic(prog(t, 4.4, 0.9)); // 再滑到左邊讓位給字
  return { x: lerp(x, 540, move), y: lerp(y, 540, move), s: lerp(s, 1.78, move), tilt: TILT(t) };
}

// under：要畫在「尾巴前面、爪子後面」的舞台元素（金色訊號），用舞台座標傳進來
function owl(t, under = '') {
  const { x, y, s, tilt } = flight(t);
  const D = POSE(t);
  const lit = lerp(0.25, 1, inOutSine(prog(t, 1.3, 1.3))); // 暗處只看得到眼睛，飛起來後慢慢亮
  const ivory = mix(BG, IVORY, lit);

  // 翅膀：最上面那片（原本那片）先開、下面的依序跟上，像折扇；拍翅時外側慢半拍，像波浪；姿勢依比重在折扇／攤平／舉 V 之間變化
  const [px, py] = WING_PIVOT;
  const fw = FLAT_W(t), vw = V_W(t);
  const wing = FAN.map((row, j) => {
    const [deg, len, wid, bend, slide, taper, slideX] = row.map((b, i) => b + fw * (FAN_FLAT[j][i] - b) + vw * (FAN_V[j][i] - b));
    const sp = SPREAD(t - 0.025 * j);
    const flap = FLAP(t) * Math.sin((2 * Math.PI * (t - GLIDE_START - 0.035 * (5 - j))) / 0.9);
    const a = deg * sp + (WING_LIFT(t) + flap) * (0.4 + 0.12 * (5 - j)) * clamp(sp * 3);
    return `<path d="${wingPath(lerp(1, len, sp), lerp(1, wid, sp), bend * sp, taper * sp)}" stroke="${BG}" stroke-width="${10 * clamp((sp - 0.15) * 2.5)}" paint-order="stroke" transform="translate(${slideX * sp} ${slide * sp}) rotate(${a} ${px} ${py})"/>`;
  }).reverse().join(''); // 最下面那片先畫，原本那片疊在最上層
  const head = HEAD.map((i) => `<path d="${pieces[i]}"/>`).join(''), lower = LOWER.map((i) => `<path d="${pieces[i]}"/>`).join('');

  // 尾巴：起飛時跟著翅膀張開、整趟都在（俯衝 logo 時收窄成尖尾）、抓到後收起；藏起來時整個躲在身體後面
  const r = TAIL_K(t - 0.08), rk = clamp(r);
  const tail = TAIL.map(([deg, len]) => {
    const ty = lerp(300, 378, rk), sc = lerp(0.45, 1.05, rk) * lerp(1, len, rk);
    const [src, sx] = deg >= 0 ? [pieces[3], 88] : [pieces[4], -88];
    return `<g transform="rotate(${deg * r * (1 - 0.45 * V_W(t))} 0 ${ty}) translate(0 ${ty}) scale(${sc}) translate(${sx} -232)"><path d="${src}" stroke="${BG}" stroke-width="${(10 * clamp((r - 0.15) * 2.5)) / sc}" paint-order="stroke"/></g>`;
  }).join('');

  // 爪子：翅膀張開時一起伸出（俯衝時縮回），煞車時再往前一伸 → 落下瞬間抓緊 → 3.95 秒連同訊號收回身體
  const ext = t < STRIKE ? clamp((REVEAL(t - 0.05) - 0.15) * 1.4) + 0.25 * bump(t, 3.22, 0.08) : 1 - inOutCubic(prog(t, 3.95, 0.4));
  const ankleY = lerp(ANKLE_IN, ANKLE_OUT, ext);
  const grip = outBack(prog(t, STRIKE - 0.06, 0.16));
  const foot = `<g transform="translate(${-ANKLE_X} ${ankleY})">${CLAW_OPEN.map((o, i) =>
    `<path d="${CLAW}" transform="rotate(${lerp(o, CLAW_SHUT[i], grip)})" stroke="${BG}" stroke-width="6" paint-order="stroke"/>`).join('')}</g>`;
  const claws = ext > 0.01 ? foot + `<g transform="scale(-1 1)">${foot}</g>` : '';
  // 抓到之後訊號改成跟著貓頭鷹走（畫在貓頭鷹座標裡，落點剛好對齊不會跳）
  const held = t >= STRIKE ? `<g opacity="${1 - prog(t, 4.1, 0.25)}" fill="${GOLD}">
    <rect x="${-SIG_W / 2 - 3}" y="${ankleY + GRIP_Y - SIG_H / 2 - 1}" width="${SIG_W + 6}" height="${SIG_H + 2}" rx="${SIG_H / 2}" opacity="0.6" filter="url(#blur)"/>
    <rect x="${-SIG_W / 2}" y="${ankleY + GRIP_Y - SIG_H / 2}" width="${SIG_W}" height="${SIG_H}" rx="${SIG_H / 2}"/></g>` : '';

  // 眼睛：從頭亮到尾；暗處最亮、變身成俯衝 logo 時亮一下、俯衝時更專注、抓到與收進身體時各閃一下、之後像呼吸一樣
  const blink = BLINKS.reduce((k, b) => k * (1 - 0.92 * Math.sin(Math.PI * prog(t, b, 0.2))), 1);
  const eyes = EYES.map(([ex, ey]) =>
    `<circle cx="${ex}" cy="${ey}" r="18" transform="translate(${ex} ${ey}) scale(1 ${blink * (1 - 0.3 * D)}) translate(${-ex} ${-ey})"/>`).join(''); // 俯衝時瞇眼、煞車時睜大
  const dark = 1 - inOutSine(prog(t, 1.3, 1.6));
  const glow = clamp(0.35 + 0.65 * dark + 0.6 * bump(t, 2.66, 0.12) + 0.3 * bump(t, 3.0, 0.25) + 0.1 * Math.sin(t * 2.4) * prog(t, STRIKE, 0.6)
    + 0.7 * bump(t, STRIKE + 0.1, 0.18) + 0.5 * bump(t, 4.3, 0.18)) * blink;
  const glows = EYES.map(([ex, ey]) => `<circle cx="${ex}" cy="${ey}" r="${32 + 24 * dark}" fill="${GOLD}" opacity="${glow}" filter="url(#blur)"/>`).join('');

  // 俯衝變形：頭變大、壓低、耳羽往後貼（像朝鏡頭衝過來），身體變窄往後縮（遠一點）＝水滴形；煞車時反過來挺胸張開
  const headT = `translate(0 ${190 + 12 * D}) scale(${1 + 0.08 * D} ${1 - 0.06 * D}) translate(0 -190)`;
  const lowerT = `translate(0 245) scale(${1 - 0.16 * D} ${1 - 0.28 * D}) translate(0 -245)`;
  // 把舞台座標的東西放進下半身圖層：先套上「反過來的」貓頭鷹變形，抵銷後位置不變，只改前後順序
  const stage = under && `<g transform="translate(0 245) scale(${1 / (1 - 0.16 * D)} ${1 / (1 - 0.28 * D)}) translate(0 -245) translate(0 ${OWL_CY}) scale(${1 / (s * (1 - 0.1 * D))} ${1 / s}) rotate(${-tilt}) translate(${-x} ${-y})">${under}</g>`;
  return `<g transform="translate(${x} ${y}) rotate(${tilt}) scale(${s * (1 - 0.1 * D)} ${s}) translate(0 ${-OWL_CY})">
  <g transform="${headT}">${glows}</g><g fill="${ivory}">${wing}<g transform="scale(-1 1)">${wing}</g></g>
  <g transform="${lowerT}"><g fill="${ivory}">${tail}</g>${stage}${held}<g fill="${mix(BG, GOLD, lit)}">${claws}</g><g fill="${ivory}">${lower}</g></g>
  <g transform="${headT}"><g fill="${ivory}">${head}</g><g fill="${GOLD}">${eyes}<path d="${beak}" fill="${mix(BG, GOLD, lit)}"/></g></g>
</g>`;
}

function frame(t) {
  // ── 噪音對話框：亂抖、閃爍；抓住那刻從訊號點擴散一圈波紋，波紋掃過的地方全部清空
  const wave = 2300 * outCubic(prog(t, STRIKE, 1.1));
  const noise = NOISE.map((n) => {
    const d = Math.hypot(n.x - SIGNAL[0], n.y - SIGNAL[1]);
    const a = n.a * (0.6 + 0.4 * Math.sin(t * 7 + n.p * 3)) * clamp(t / 0.8) * (t < STRIKE ? 1 : clamp((d - wave) / 60));
    if (a <= 0.01) return '';
    return `<rect x="${n.x + 4 * Math.sin(t * 11 + n.p)}" y="${n.y + 3 * Math.sin(t * 15 + n.q)}" width="${n.w}" height="16" rx="8" fill="${NOISE_C}" opacity="${a}"/>`;
  }).join('');
  const waveRing = t > STRIKE ? `<circle cx="${SIGNAL[0]}" cy="${SIGNAL[1]}" r="${wave}" fill="none" stroke="${GOLD}" stroke-width="2" opacity="${0.5 * (1 - prog(t, STRIKE, 1.1))}"/>` : '';

  // ── 金色訊號＋瞄準圈：飛行途中瞄準圈慢慢縮小，落下那刻鎖死、訊號被爪子抓走
  const sig = t < STRIKE ? clamp(t / 0.8) : 0;
  const sigGlow = 0.25 + 0.5 * prog(t, 1.9, 1.4);
  const lock = clamp((t - 1.9) / 0.3) * (1 - prog(t, STRIKE - 0.1, 0.2));
  const r = lerp(150, 50, inOutSine(prog(t, 1.9, STRIKE - 2.05)));
  const [sx, sy] = SIGNAL;
  const ticks = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([a, b]) =>
    `<line x1="${sx + a * r}" y1="${sy + b * r}" x2="${sx + a * (r + 16)}" y2="${sy + b * (r + 16)}"/>`).join('');
  const signal = `<g opacity="${sig}" fill="${GOLD}">
    <rect x="${sx - SIG_W - 6}" y="${sy - SIG_H - 2}" width="${SIG_W * 2 + 12}" height="${SIG_H * 2 + 4}" rx="${SIG_H + 2}" opacity="${sigGlow}" filter="url(#blur)"/>
    <rect x="${sx - SIG_W}" y="${sy - SIG_H}" width="${SIG_W * 2}" height="${SIG_H * 2}" rx="${SIG_H}"/>
  </g>`;
  const lockRing = `<g stroke="${GOLD}" stroke-width="2" fill="none" opacity="${lock * 0.8}"><circle cx="${sx}" cy="${sy}" r="${r}"/>${ticks}</g>`;

  // ── 俯衝時拖出幾道淡淡的殘影（同一隻貓頭鷹稍早的樣子），速度感
  const tr = TRAIL(t);
  const trail = tr > 0.01 ? [0.04, 0.08, 0.13, 0.2].map((a, i) => `<g opacity="${a * tr}">${owl(t - 0.022 * (4 - i))}</g>`).join('') : '';

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
${noise}${waveRing}${lockRing}
${trail}${owl(t, signal)}
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
