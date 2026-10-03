// 產生「群記」開場動畫影片（1920×1080、60fps、8.5 秒、無聲）
// 故事：滿畫面亂抖的對話框（噪音）→ 暗處一雙金眼一直盯著 → 展翅同時伸出金爪，安靜滑翔爬升
//      → 高處停一下、鎖定唯一的金色訊號 → 收翅加速俯衝 → 張翅煞車、金爪往前一抓扣住訊號
//      → 收翅，一圈波紋把噪音清空 → 訊號收進身體、眼睛一亮 → 帶出標題與標語
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

const TILT = keys([[1.25, 0], [1.8, 9], [2.25, 4], [2.45, -6], [2.75, -26], [3.1, -24], [3.28, 5], [3.4, 0]]); // 身體傾斜：俯衝時頭往前衝、煞車時往後仰
const SPREAD = keys([[1.1, 0], [1.6, 1], [2.25, 1], [2.45, 1.05], [2.7, 0.3], [3.05, 0.28], [3.24, 1.08], [3.38, 1], [3.62, 0.1], [3.82, 0]]); // 翅膀張開程度
const WING_LIFT = keys([[2.25, 0], [2.45, 12], [2.7, -16], [3.05, -16], [3.24, 22], [3.42, 0]]); // 整片翅膀上揚（正）／往後收（負）
const FLAP = keys([[1.35, 0], [1.6, 16], [2.15, 16], [2.35, 0]]); // 只在滑翔時慢慢拍，俯衝時不拍（安靜）
const EXT = keys([[1.2, 0], [1.5, 1.12], [1.68, 1], [2.4, 1], [2.75, 0.55], [3.02, 0.55], [3.24, 1.35], [3.4, 1.2], [3.6, 1.2], [3.9, 1.18], [4.35, 0]]); // 腳伸出多長
const TOE = keys([[1.3, 0], [1.7, 0.7], [2.4, 0.7], [3.0, 0.7], [3.22, 1.3], [3.38, 1.3]]); // 爪子張開程度（0＝握起）
const POSE = keys([[2.5, 0], [2.75, 1], [3.08, 1], [3.24, -0.4], [3.4, 0]]); // 俯衝姿勢：1＝頭往前衝、身體縮成流線形；負＝煞車時挺胸張開
const TRAIL = keys([[2.7, 0], [3.12, 1], [3.3, 0]]); // 俯衝殘影的濃淡
const BLINKS = [1.0, 7.0];

// 翅膀（照真的貓頭鷹翅膀）：logo 原本的上翅（pieces 第 3 塊，左翅）當「翅膀前緣」，展開時往外上方轉出去；
// 底下藏著另外畫的飛羽：4 根寬的次級飛羽沿著手臂往下垂、5 根長的初級飛羽在翅尖散開（中間最長＝圓圓的翅尖）。
// 收起時羽毛縮小、轉回去躲在那片翅膀底下＝原本的 logo。全部描一圈底色邊，片與片之間有縫，跟 logo 的語言一致。
// 右翅＝左翅鏡像（第 4 塊本來就是第 3 塊的鏡像）。
const WING_PIVOT = [-88, 232], ARM = 100; // 肩膀（那片翅膀的頂端）、肩膀到翅膀尾端的長度
const HEAD = [0, 1, 2], LOWER = [5, 6, 7]; // logo 的頭部（額頭、兩側臉）與下半身（身體、兩側下翅）；第 3、4 塊是上翅
// 一根羽毛：羽根在原點、往下長 L；前緣窄（a）、後緣寬（c）、尖端圓，整根微微往後彎（b），像真的飛羽
const feather = (L, a, c, b) => `M${-a * 0.6} 0C${-a * 1.1} ${L * 0.35} ${-a + b * 0.4} ${L * 0.72} ${b - a * 0.55} ${L * 0.94}` +
  `C${b - a * 0.3} ${L * 1.03} ${b + c * 0.5} ${L * 1.04} ${b + c * 0.75} ${L * 0.9}` +
  `C${b * 0.7 + c * 1.1} ${L * 0.65} ${c * 1.15} ${L * 0.3} ${c * 0.6} 0Q0 ${-c * 0.5} ${-a * 0.6} 0Z`;
// [沿手臂的位置（0＝肩、1＝翅尾）, 展開時偏離手臂方向幾度（正＝往後下方）, 長, 前緣寬, 後緣寬, 彎度, 比手臂慢幾秒]
// 由內往外畫，越外面疊越上面；手臂先開、次級飛羽跟上、初級飛羽最後一根根滑出來
const FEATHERS = [
  [0.22, 96, 70, 9, 18, 6, 0.03], [0.38, 88, 76, 9, 18, 6, 0.035], [0.54, 80, 82, 9, 18, 7, 0.04], [0.7, 70, 88, 9, 18, 8, 0.05], [0.86, 58, 96, 9, 17, 8, 0.06],
  [0.97, 30, 104, 6, 14, 10, 0.08], [0.99, 20, 118, 6, 14, 10, 0.09], [1, 10, 126, 6, 14, 10, 0.1], [1, 0, 124, 6, 14, 9, 0.11], [1, -10, 110, 6, 13, 8, 0.12],
].map(([at, deg, L, a, c, b, lag], i) => ({
  at, deg, lag, d: feather(L, a, c, b), primary: i >= 5,
  atFold: Math.min(at, (92 - 0.4 * L) / ARM), // 收起時羽根退到哪裡，讓整根剛好藏在那片翅膀裡
}));

// 腳與爪（金色，跟嘴巴同色）：從身體 V 形尖端旁的縫伸出來，每腳兩根爪
const HIP = [8, 380], REACH = [18, 52]; // 左腳髖部（藏在身體後面）；伸出 1 倍時腳踝往外、往下移多少（x 用正值，畫左腳時加負號）
const ankle = (e) => [HIP[0] + REACH[0] * e, HIP[1] + REACH[1] * e];
const CLAW = ((L) => `M-7 0C-9 ${L * 0.5} ${L * 0.1} ${L * 0.95} ${L * 0.45} ${L}C${L * 0.15} ${L * 0.75} 7 ${L * 0.45} 7 0Q0 -6 -7 0Z`)(38);
const CLAW_OPEN = [60, -12], CLAW_SHUT = [22, 2]; // 左腳外爪、內爪的角度（右腳鏡像）
const GRIP_Y = 30; // 抓住時訊號在腳踝下方多遠
const SIG_W = 72, SIG_H = 16; // 訊號大小（貓頭鷹座標；舞台上是兩倍）
const SIGNAL = [STRIKE_AT[0], STRIKE_AT[1] + (ankle(EXT(STRIKE))[1] + GRIP_Y - OWL_CY) * 2]; // 金色訊號＝落下那刻爪子的位置
// 自我檢查：落下那刻腳要剛好伸出 1.2 倍、身體不傾斜也不變形，俯衝曲線頭尾要是 0 和 1，不然抓住的瞬間訊號會跳
if (EXT(STRIKE) !== 1.2 || TILT(STRIKE) !== 0 || POSE(STRIKE) !== 0 || stoop(0) !== 0 || Math.abs(stoop(1) - 1) > 1e-9) throw new Error('動作曲線對不齊');

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

function owl(t) {
  const { x, y, s, tilt } = flight(t);
  const D = POSE(t);
  const lit = lerp(0.25, 1, inOutSine(prog(t, 1.3, 1.3))); // 暗處只看得到眼睛，飛起來後慢慢亮
  const ivory = mix(BG, IVORY, lit);

  // 翅膀：手臂（logo 那片）轉出去當前緣，羽毛跟著手臂、各自晚一點展開；拍翅時翅尖慢半拍，像被風帶著
  const [px, py] = WING_PIVOT;
  const armFlap = (tt) => FLAP(tt) * Math.sin((2 * Math.PI * (tt - GLIDE_START)) / 0.9);
  const sp0 = SPREAD(t);
  const armDeg = 100 * sp0 + (WING_LIFT(t) + armFlap(t)) * clamp(sp0 * 3);
  const rad = (armDeg * Math.PI) / 180;
  const u = [-Math.sin(rad), Math.cos(rad)], v = [u[1], -u[0]]; // 沿手臂往外、往翅膀後緣
  const wing = FEATHERS.map((f) => {
    // 手臂張開超過三成，羽毛才開始滑出來；俯衝時翅膀半收＝羽毛全部藏好，只剩 logo 那片貼著身體（水滴形）
    const raw = Math.max(0, (SPREAD(t - f.lag) - 0.3) / 0.7), k = clamp(raw);
    const at = lerp(f.atFold, f.at, k) * ARM * (1 + 0.08 * sp0), off = 10 * k;
    const drag = (armFlap(t - 0.06) - armFlap(t)) * (f.primary ? 1 : 0.4) * clamp(k * 3);
    const g = lerp(0.4, 1, k);
    return `<path d="${f.d}" transform="translate(${px + u[0] * at + v[0] * off} ${py + u[1] * at + v[1] * off}) rotate(${armDeg - f.deg * raw + drag}) scale(${g})" stroke="${BG}" stroke-width="${(6 * clamp(k * 3)) / g}" paint-order="stroke"/>`;
  }).join('') + `<path d="${pieces[3]}" transform="translate(${px} ${py}) rotate(${armDeg}) scale(${1 + 0.08 * sp0}) translate(${-px} ${-py})" stroke="${BG}" stroke-width="${9 * clamp(sp0 * 3)}" paint-order="stroke"/>`;
  const head = HEAD.map((i) => `<path d="${pieces[i]}"/>`).join(''), lower = LOWER.map((i) => `<path d="${pieces[i]}"/>`).join('');

  // 腳與爪：起飛時跟著翅膀一起伸出（衝過頭再彈回）、爪子張開 → 俯衝最後往前一抓、張到最大
  //        → 落下瞬間「咔」一下扣緊 → 連同訊號收回身體
  const e = EXT(t), [ax, ay] = ankle(e);
  const open = TOE(t) * (1 - outBack(prog(t, STRIKE - 0.04, 0.12)));
  const cs = clamp(e * 1.6) * (1 + 0.15 * clamp((e - 1) / 0.35)); // 爪子邊伸出邊變大，往前抓時再大一點
  const foot = `<line x1="${-HIP[0]}" y1="${HIP[1]}" x2="${-ax}" y2="${ay}" stroke="${BG}" stroke-width="17" stroke-linecap="round"/>
    <line x1="${-HIP[0]}" y1="${HIP[1]}" x2="${-ax}" y2="${ay}" stroke="${GOLD}" stroke-width="10" stroke-linecap="round"/>
    <g transform="translate(${-ax} ${ay}) scale(${cs})">${CLAW_OPEN.map((o, i) =>
    `<path d="${CLAW}" transform="rotate(${lerp(CLAW_SHUT[i], o, open)})" stroke="${BG}" stroke-width="6" paint-order="stroke"/>`).join('')}<circle r="8"/></g>`;
  const talons = e > 0.02 ? `<g fill="${GOLD}">${foot}<g transform="scale(-1 1)">${foot}</g></g>` : '';
  // 抓到之後訊號跟著爪子走（畫在貓頭鷹座標裡，落點剛好對齊不會跳）
  const gk = clamp(e / 1.2), gy = ay + GRIP_Y * gk, gw = SIG_W * (0.4 + 0.6 * gk); // 收腳時訊號一起被拉進身體、變小
  const held = t >= STRIKE ? `<g opacity="${1 - prog(t, 4.15, 0.25)}" fill="${GOLD}">
    <rect x="${-gw / 2 - 3}" y="${gy - SIG_H / 2 - 1}" width="${gw + 6}" height="${SIG_H + 2}" rx="${SIG_H / 2}" opacity="0.6" filter="url(#blur)"/>
    <rect x="${-gw / 2}" y="${gy - SIG_H / 2}" width="${gw}" height="${SIG_H}" rx="${SIG_H / 2}"/></g>` : '';

  // 眼睛：從頭亮到尾；暗處最亮、俯衝時更專注、抓到與收進身體時各閃一下、之後像呼吸一樣
  const blink = BLINKS.reduce((k, b) => k * (1 - 0.92 * Math.sin(Math.PI * prog(t, b, 0.2))), 1);
  const eyes = EYES.map(([ex, ey]) =>
    `<circle cx="${ex}" cy="${ey}" r="18" transform="translate(${ex} ${ey}) scale(1 ${blink * (1 - 0.3 * D)}) translate(${-ex} ${-ey})"/>`).join(''); // 俯衝時瞇眼、煞車時睜大
  const dark = 1 - inOutSine(prog(t, 1.3, 1.6));
  const glow = clamp(0.35 + 0.65 * dark + 0.3 * bump(t, 3.0, 0.25) + 0.1 * Math.sin(t * 2.4) * prog(t, STRIKE, 0.6)
    + 0.7 * bump(t, STRIKE + 0.1, 0.18) + 0.5 * bump(t, 4.3, 0.18)) * blink;
  const glows = EYES.map(([ex, ey]) => `<circle cx="${ex}" cy="${ey}" r="${32 + 24 * dark}" fill="${GOLD}" opacity="${glow}" filter="url(#blur)"/>`).join('');

  // 俯衝變形：頭變大、壓低、耳羽往後貼（像朝鏡頭衝過來），身體變窄往後縮（遠一點）＝水滴形；煞車時反過來挺胸張開
  const headT = `translate(0 ${190 + 12 * D}) scale(${1 + 0.08 * D} ${1 - 0.06 * D}) translate(0 -190)`;
  const lowerT = `translate(0 245) scale(${1 - 0.16 * D} ${1 - 0.28 * D}) translate(0 -245)`;
  return `<g transform="translate(${x} ${y}) rotate(${tilt}) scale(${s * (1 - 0.1 * D)} ${s}) translate(0 ${-OWL_CY})">
  <g transform="${headT}">${glows}</g><g fill="${ivory}">${wing}<g transform="scale(-1 1)">${wing}</g></g>
  <g transform="${lowerT}">${held}${talons}<g fill="${ivory}">${lower}</g></g>
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
  </g>
  <g stroke="${GOLD}" stroke-width="2" fill="none" opacity="${lock * 0.8}"><circle cx="${sx}" cy="${sy}" r="${r}"/>${ticks}</g>`;

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
${noise}${waveRing}${signal}
${trail}${owl(t)}
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
