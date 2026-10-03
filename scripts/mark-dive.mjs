// 產生「群記」俯衝版標誌：
//   頭：銳利融合版（眉毛 V 往下壓蓋住眼睛上半、眼睛是尖角指向嘴的金色水滴、嘴是緊貼 V 尖的金色尖三角）
//   翅膀＋身體：照原本 logo 的「幾何拼接」——每一塊都是獨立的形狀，片與片之間留一樣寬的縫：
//     每邊 5 根彎刀形羽毛往上張開成 V 字；頭兩側各一片新月形「肩膀」蓋住羽根；
//     身體是原本 logo 的倒三角胸口（尖端＝整隻最下面的尖角）加左右兩塊往上彎的側身，外緣連成一道往下的圓弧。
//   感覺參考使用者給的 V 字翅膀貓頭鷹範例，但角度、長度、輪廓都是自己重新設計的。
// 用法：node scripts/mark-dive.mjs → public/brand/mark-dive.svg、mark-dive-512.png
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const BG = '#0b4a38', IVORY = '#f6f4ee', GOLD = '#d4b26a';
const G = 7; // 拼接的縫（畫布 px）
const halo = `stroke="${BG}" stroke-width="${G * 2}" paint-order="stroke" stroke-linejoin="round"`; // 疊在別塊上面時切出等寬的縫
const mark = readFileSync('public/brand/mark.svg', 'utf8');
const pieces = [...mark.split('<g fill="#d4b26a">')[0].matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
const NUM = /(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)/g;
const mapPath = (d, fn) => d.replace(NUM, (_, x, y) => fn(+x, +y).map((v) => +v.toFixed(2)).join(' '));
const f = (n) => +n.toFixed(2);
const rad = (d) => (d * Math.PI) / 180;
// 圓角多邊形：每個角往兩邊退 r，用二次曲線圓過去
const rounded = (P, r) => P.map((p, i) => {
  const a = P[(i + P.length - 1) % P.length], b = P[(i + 1) % P.length];
  const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]);
  const p1 = [p[0] + ((a[0] - p[0]) / da) * Math.min(r[i], da / 2), p[1] + ((a[1] - p[1]) / da) * Math.min(r[i], da / 2)];
  const p2 = [p[0] + ((b[0] - p[0]) / db) * Math.min(r[i], db / 2), p[1] + ((b[1] - p[1]) / db) * Math.min(r[i], db / 2)];
  return `${i ? 'L' : 'M'}${f(p1[0])} ${f(p1[1])}Q${f(p[0])} ${f(p[1])} ${f(p2[0])} ${f(p2[1])}`;
}).join('') + 'Z';

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
// 先畫一層「底色版的頭」（每塊描粗邊＋臉中間的橢圓）把後面的身體挖出一圈等寬的縫，再畫真正的頭；眉毛最後畫、描邊切出銳利的眼睛
const head = (x, y, s, gapPx) => `<g transform="translate(${x} ${y}) scale(${s}) translate(0 -190)">
  <g fill="${BG}" stroke="${BG}" stroke-width="${f((gapPx * 2) / s)}" stroke-linejoin="round">
    <path d="${brow}"/>${face.map((d) => `<path d="${d}"/>`).join('')}${eyes.map((d) => `<path d="${d}"/>`).join('')}<path d="${beak}"/><ellipse cx="0" cy="190" rx="82" ry="50"/></g>
  <g fill="${GOLD}">${eyes.map((d) => `<path d="${d}"/>`).join('')}<path d="${beak}"/></g>
  <g fill="${IVORY}">${face.map((d) => `<path d="${d}"/>`).join('')}</g>
  <path d="${brow}" fill="${IVORY}" stroke="${BG}" stroke-width="${GAP_HEAD * 2}" paint-order="stroke" stroke-linejoin="round"/>
</g>`;

// ── 翅膀（左翅，畫布座標；右翅鏡像）：羽根沿著頭外圍的圓弧排開，往外上方張開；每根描底色邊＝羽毛之間等寬的縫
const H = [256, 318], R_ROOT = 78; // 頭的中心、羽根所在的圓
// [羽根在頭外圍的角度, 往上幾度, 長, 寬]；由上到下
const FEATHERS = [[130, 45, 222, 38], [150, 32, 190, 38], [170, 20, 158, 37], [194, 9, 126, 36], [218, 0, 94, 34]];
// 一串點用 Catmull-Rom 串成平滑的封閉曲線
const smooth = (Q) => Q.map((p, i) => {
  const a = Q[(i - 1 + Q.length) % Q.length], b = Q[(i + 1) % Q.length], c = Q[(i + 2) % Q.length];
  const c1 = [p[0] + (b[0] - a[0]) / 6, p[1] + (b[1] - a[1]) / 6], c2 = [b[0] - (c[0] - p[0]) / 6, b[1] - (c[1] - p[1]) / 6];
  return `${i ? '' : `M${f(p[0])} ${f(p[1])}`}C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(b[0])} ${f(b[1])}`;
}).join('') + 'Z';
// 一根羽毛＝彎刀：上緣（朝 V 字開口那側）是直線一路到尖端；下緣到後半段往上彎、在尖端跟上緣會合成圓角尖頭
const blade = ([at, up, len, w]) => {
  const R0 = [H[0] + R_ROOT * Math.cos(rad(at)), H[1] - R_ROOT * Math.sin(rad(at))];
  const u = [-Math.cos(rad(up)), -Math.sin(rad(up))], n = [u[1], -u[0]]; // u：往外上方；n：下緣那一側
  const R = [R0[0] - u[0] * 20 - n[0] * w / 2, R0[1] - u[1] * 20 - n[1] * w / 2]; // 上緣的起點（羽根往內延伸一點）
  const L = len + 20, N = 40, top = [], bot = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N, e = [R[0] + u[0] * L * s, R[1] + u[1] * L * s];
    const k = s < 0.66 ? 1 : Math.cos((Math.PI / 2) * ((s - 0.66) / 0.34)) ** 0.55; // 最後一段下緣往上收（收得圓一點，保留一點尖）
    top.push(e); bot.unshift([e[0] + n[0] * w * k, e[1] + n[1] * w * k]);
  }
  // 羽根那頭做成圓頭（不然根部的角會變成小尖齒）
  const c = [R[0] + n[0] * w / 2, R[1] + n[1] * w / 2], cap = [];
  for (let i = 1; i < 8; i++) {
    const a = Math.PI * (i / 8), v = [Math.cos(a), Math.sin(a)];
    cap.push([c[0] + (n[0] * v[0] - u[0] * v[1]) * (w / 2), c[1] + (n[1] * v[0] - u[1] * v[1]) * (w / 2)]);
  }
  return smooth([...top, ...bot.slice(1), ...cap]);
};
const wing = FEATHERS.slice().reverse().map((p) => `<path d="${blade(p)}" ${halo}/>`).join(''); // 最下面那根先畫，上面的疊上去
// 肩膀：直接用原本 logo 頭兩側那片翅膀（pieces 第 3 塊，斜斜、兩頭尖的葉片形），放大、稍微往外傾，站在頭旁邊蓋住羽根
const SH = { x: 176, y: 322, s: 0.95, tilt: -32 }; // 放的位置（葉片中心）、放大、傾斜（負＝上端往外）
const shoulder = (() => {
  const c = Math.cos(rad(SH.tilt)), s = Math.sin(rad(SH.tilt));
  return mapPath(pieces[3], (x, y) => { const u = (x + 88) * SH.s, v = (y - 278) * SH.s; return [SH.x + u * c - v * s, SH.y + u * s + v * c]; });
})();
// 身體：左右兩塊側身（外緣是往下的圓弧），中間疊上原本 logo 的倒三角胸口，胸口尖端＝整隻最下面的尖角
const side = 'M170 330L170 383C200 392 228 410 256 413L256 330Z';
const chest = mapPath(pieces[5], (x, y) => [H[0] + x * 0.5, 366 + (y - 245) * 0.29]);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<!-- 群記俯衝版標誌（幾何拼接）：銳利融合版的頭、新月形肩膀、兩邊各 5 根羽毛往上張開成 V 字、倒三角胸口加兩塊側身。由 scripts/mark-dive.mjs 產生 -->
<rect width="512" height="512" fill="${BG}"/>
<g transform="translate(0 -8)">
  <g fill="${IVORY}">
    <path d="${side}"/><path d="${side}" transform="translate(512 0) scale(-1 1)"/>
    ${wing}<g transform="translate(512 0) scale(-1 1)">${wing}</g>
    <path d="${shoulder}" ${halo}/><path d="${shoulder}" transform="translate(512 0) scale(-1 1)" ${halo}/>
    <path d="${chest}" ${halo}/>
  </g>
  ${head(H[0], H[1], 0.56, G)}
</g>
</svg>
`;
writeFileSync('public/brand/mark-dive.svg', svg);
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile('public/brand/mark-dive-512.png');
console.log('public/brand/mark-dive.svg、mark-dive-512.png');
