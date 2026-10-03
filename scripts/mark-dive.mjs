// 產生「群記」俯衝版標誌（以使用者選定的試看圖為基礎重畫，翅膀是自己的形狀）：
//   頭：銳利融合版（眉毛 V 往下壓蓋住眼睛上半、眼睛是尖角指向嘴的金色水滴、嘴是緊貼 V 尖的金色尖三角），坐在凹口裡
//   照原本 logo 的「幾何拼接」：每一塊都是簡單、完整的幾何形狀（直邊＋圓角），塊與塊之間留一樣寬的縫
//   肩膀：頭兩側各一片原本 logo 的翅膀葉片（斜斜的菱形、圓角），往外傾斜蓋住羽根，羽毛從它後面排出去
//   羽毛：每邊 5 根斜平行四邊形（兩端斜切、圓角尖頭），角度約 10 度到 44 度，最上面最長
//   身體：碗拆成 3 塊——中間是原本 logo 的倒三角胸口（尖端＝整隻最下面的尖角），兩側各一片彎彎的斜長條（像原本 logo 的下翅），
//     外緣連成碗底的圓弧
// 用法：node scripts/mark-dive.mjs → public/brand/mark-dive.svg、mark-dive-512.png
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const BG = '#0b4a38', IVORY = '#f6f4ee', GOLD = '#d4b26a';
const G = 8; // 拼接的縫（畫布 px）
const halo = `stroke="${BG}" stroke-width="${G * 2}" paint-order="stroke" stroke-linejoin="round"`; // 疊在別塊上面時切出等寬的縫
const mark = readFileSync('public/brand/mark.svg', 'utf8');
const pieces = [...mark.split('<g fill="#d4b26a">')[0].matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
const NUM = /(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)/g;
const mapPath = (d, fn) => d.replace(NUM, (_, x, y) => fn(+x, +y).map((v) => +v.toFixed(2)).join(' '));
const f = (n) => +n.toFixed(2);

// ── 頭（mark.svg 座標，頭部中心 y＝168）：銳利融合版
const SQ = 0.9, BROW = 26, GAP_HEAD = 9; // 整顆頭稍微壓扁、眉毛往下壓多少、眉毛與眼睛之間的縫
const sq = (x, y) => [x, 168 + (y - 168) * SQ];
const brow = mapPath(mapPath(pieces[0], (x, y) => [x, y + BROW]), sq);
const face = [1, 2].map((i) => mapPath(pieces[i], sq));
const vTip = sq(0, 191 + BROW)[1], slope = 0.783 * SQ, notch = vTip + GAP_HEAD * Math.hypot(1, slope);
const beak = `M-15 ${f(notch - slope * 15)}L0 ${f(notch)}L15 ${f(notch - slope * 15)}L0 ${f(notch + 30)}Z`; // 上緣嵌在眉毛 V 尖下面
const tear = (cx, cy, r, px, py) => { // 圓形加一個尖角（從尖角畫兩條切線到圓上）
  const d = Math.hypot(px - cx, py - cy), phi = Math.atan2(py - cy, px - cx), a = Math.acos(r / d);
  const t1 = [cx + r * Math.cos(phi + a), cy + r * Math.sin(phi + a)], t2 = [cx + r * Math.cos(phi - a), cy + r * Math.sin(phi - a)];
  return `M${f(t1[0])} ${f(t1[1])}A${r} ${r} 0 1 1 ${f(t2[0])} ${f(t2[1])}L${px} ${py}Z`;
};
const ey = sq(0, 186)[1];
const eyes = [tear(-45.5, ey, 19, -18, ey + 20), tear(45.5, ey, 19, 18, ey + 20)]; // 眼角尖尖地指向嘴
// 先畫一層「底色版的頭」（每塊描粗邊＋臉中間的橢圓）把後面的翅膀、身體挖出一圈等寬的縫，再畫真正的頭；眉毛最後畫、描邊切出銳利的眼睛
const head = (x, y, s, gapPx) => `<g transform="translate(${x} ${y}) scale(${s}) translate(0 -168)">
  <g fill="${BG}" stroke="${BG}" stroke-width="${f((gapPx * 2) / s)}" stroke-linejoin="round">
    <path d="${brow}"/>${face.map((d) => `<path d="${d}"/>`).join('')}${eyes.map((d) => `<path d="${d}"/>`).join('')}<path d="${beak}"/><ellipse cx="0" cy="190" rx="82" ry="50"/></g>
  <g fill="${GOLD}">${eyes.map((d) => `<path d="${d}"/>`).join('')}<path d="${beak}"/></g>
  <g fill="${IVORY}">${face.map((d) => `<path d="${d}"/>`).join('')}</g>
  <path d="${brow}" fill="${IVORY}" stroke="${BG}" stroke-width="${GAP_HEAD * 2}" paint-order="stroke" stroke-linejoin="round"/>
</g>`;
const HEAD = { x: 256, y: 313, s: 0.55 };

// 一串點用 Catmull-Rom 串成平滑的封閉曲線
const smooth = (Q) => Q.map((p, i) => {
  const a = Q[(i - 1 + Q.length) % Q.length], b = Q[(i + 1) % Q.length], c = Q[(i + 2) % Q.length];
  const c1 = [p[0] + (b[0] - a[0]) / 6, p[1] + (b[1] - a[1]) / 6], c2 = [b[0] - (c[0] - p[0]) / 6, b[1] - (c[1] - p[1]) / 6];
  return `${i ? '' : `M${f(p[0])} ${f(p[1])}`}C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(b[0])} ${f(b[1])}`;
}).join('') + 'Z';

// 圓角多邊形：每個角往兩邊退 r，用二次曲線圓過去（原本 logo 的每一塊都是這種直邊＋圓角）
const rounded = (P, r) => P.map((p, i) => {
  const a = P[(i + P.length - 1) % P.length], b = P[(i + 1) % P.length];
  const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]);
  const p1 = [p[0] + ((a[0] - p[0]) / da) * Math.min(r[i], da / 2), p[1] + ((a[1] - p[1]) / da) * Math.min(r[i], da / 2)];
  const p2 = [p[0] + ((b[0] - p[0]) / db) * Math.min(r[i], db / 2), p[1] + ((b[1] - p[1]) / db) * Math.min(r[i], db / 2)];
  return `${i ? 'L' : 'M'}${f(p1[0])} ${f(p1[1])}Q${f(p[0])} ${f(p[1])} ${f(p2[0])} ${f(p2[1])}`;
}).join('') + 'Z';
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const meet = (p, d, q, c) => { const t = cross([q[0] - p[0], q[1] - p[1]], c) / cross(d, c); return [p[0] + d[0] * t, p[1] + d[1] * t]; }; // 兩條線的交點

// ── 羽毛（左翅；右翅鏡像）：斜平行四邊形。兩條長邊順著羽毛方向，尖端那頭沿著翅膀外輪廓斜切（一角尖、一角鈍，都圓角）；
//    根部藏在肩膀下面。[羽根, 尖端, 寬]，由上到下
const FEATHERS = [[[214, 272], [47, 111], 40], [[198, 293], [36, 184], 40], [[189, 317], [44, 250], 39], [[187, 341], [67, 306], 38], [[193, 362], [113, 349], 36]];
const TIPS = FEATHERS.map((p) => p[1]);
const feather = ([R, T, w], k) => {
  const L = Math.hypot(T[0] - R[0], T[1] - R[1]), u = [(T[0] - R[0]) / L, (T[1] - R[1]) / L], n = [-u[1], u[0]];
  const a = TIPS[Math.max(0, k - 1)], b = TIPS[Math.min(TIPS.length - 1, k + 1)], c = [b[0] - a[0], b[1] - a[1]]; // 外輪廓在這根尖端的走向
  const back = [R[0] - u[0] * 30, R[1] - u[1] * 30];
  const s1 = [back[0] + (n[0] * w) / 2, back[1] + (n[1] * w) / 2], s2 = [back[0] - (n[0] * w) / 2, back[1] - (n[1] * w) / 2];
  return rounded([s1, meet(s1, u, T, c), meet(s2, u, T, c), s2], [4, 12, 12, 4]);
};
const wing = FEATHERS.map((p, k) => `<path d="${feather(p, k)}" ${halo}/>`).reverse().join(''); // 最下面那根先畫，上面的疊上去

// ── 肩膀（左；右鏡像）：原本 logo 的翅膀葉片（pieces 第 3 塊），放大、往外傾斜，站在頭旁邊蓋住羽根
const C = [256, 318];
const SH = { x: 182, y: 322, s: 0.95, tilt: -32 }; // 葉片中心、放大、傾斜（負＝上端往外）
const shoulder = (() => {
  const c = Math.cos((SH.tilt * Math.PI) / 180), s = Math.sin((SH.tilt * Math.PI) / 180);
  return mapPath(pieces[3], (x, y) => { const u = (x + 88) * SH.s, v = (y - 278) * SH.s; return [SH.x + u * c - v * s, SH.y + u * s + v * c]; });
})();

// ── 身體：兩側的斜長條（外緣是碗底圓弧，用平滑曲線）＋中間的倒三角胸口（原本 logo 胸口的形狀，壓扁縮小）
const side = smooth([[196, 336], [178, 352], [170, 372], [178, 392], [204, 405], [244, 412], [240, 394], [226, 370], [210, 348]]);
const chest = mapPath(pieces[5], (x, y) => [C[0] + x * 0.5, 354 + (y - 245) * 0.36]);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<!-- 群記俯衝版標誌（幾何拼接）：銳利融合版的頭、新月形肩膀、兩邊各 5 根斜平行四邊形羽毛、倒三角胸口加兩片斜長條身體，片與片之間等寬的縫。由 scripts/mark-dive.mjs 產生 -->
<rect width="512" height="512" fill="${BG}"/>
<g transform="translate(0 -4)">
  <g fill="${IVORY}">
    <path d="${side}"/><path d="${side}" transform="translate(512 0) scale(-1 1)"/>
    ${wing}<g transform="translate(512 0) scale(-1 1)">${wing}</g>
    <path d="${shoulder}" ${halo}/><path d="${shoulder}" transform="translate(512 0) scale(-1 1)" ${halo}/>
    <path d="${chest}" ${halo}/>
  </g>
  ${head(HEAD.x, HEAD.y, HEAD.s, G + 2)}
</g>
</svg>
`;

writeFileSync('public/brand/mark-dive.svg', svg);
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile('public/brand/mark-dive-512.png');
console.log('public/brand/mark-dive.svg、mark-dive-512.png');
