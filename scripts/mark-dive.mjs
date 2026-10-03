// 產生「群記」俯衝版標誌（構圖：U 字身體托住頭、兩邊各 5 根羽毛往外上方散開）
// 頭、金色眼睛、嘴直接沿用定稿 mark.svg；馬蹄形身體托住頭，羽毛從它後面長出來，片與片之間是等寬的縫（跟原本 logo 一樣）
// 用法：node scripts/mark-dive.mjs → public/brand/mark-dive.svg、mark-dive-512.png
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const BG = '#0b4a38', IVORY = '#f6f4ee', GOLD = '#d4b26a';
const GAP = 9; // 片與片之間的縫（px，畫布 512）

const mark = readFileSync('public/brand/mark.svg', 'utf8');
const [ivoryPart, goldPart] = mark.split('<g fill="#d4b26a">');
const pieces = [...ivoryPart.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
const beak = goldPart.match(/<path d="([^"]+)"/)[1];

const f = (n) => +n.toFixed(2);
const rad = (d) => (d * Math.PI) / 180;
// 數學角度（0＝右、90＝上）轉成畫面上的單位向量（畫面 y 往下）
const dir = (deg) => [Math.cos(rad(deg)), -Math.sin(rad(deg))];
// 每片都描一圈底色邊：疊在別片上面時，自動切出等寬的縫
const piece = (d, fill = IVORY) => `<path d="${d}" fill="${fill}" stroke="${BG}" stroke-width="${GAP * 2}" paint-order="stroke" stroke-linejoin="round"/>`;

// ── 頭：mark.svg 的額頭、兩側臉、眼睛、嘴，縮小放進 U 字凹口
const HEAD = { x: 256, y: 296, s: 0.58 }; // 頭的中心（mark.svg 頭部中心 y＝168）與縮放
const head = `<g transform="translate(${HEAD.x} ${HEAD.y}) scale(${HEAD.s}) translate(0 -168)">
  <g fill="${IVORY}">${[0, 1, 2].map((i) => `<path d="${pieces[i]}"/>`).join('')}</g>
  <g fill="${GOLD}"><circle cx="-45.5" cy="186" r="18"/><circle cx="45.5" cy="186" r="18"/><path d="${beak}"/></g>
</g>`;

// ── 馬蹄形身體：從左上繞過頭底下到右上，內緣是平順的弧、跟頭保持一圈縫；兩邊羽毛的根部都藏在它後面
const U = { cx: 256, cy: 290, a1: 84, b1: 72, a2: 128, b2: 116, from: 148, to: 32 }; // 內外橢圓、兩端角度（數學角度，從左上經過下方繞到右上）
const ell = (a, b, deg) => [U.cx + a * Math.cos(rad(deg)), U.cy - b * Math.sin(rad(deg))];
const uPath = (() => {
  const o1 = ell(U.a2, U.b2, U.from), o2 = ell(U.a2, U.b2, U.to), i2 = ell(U.a1, U.b1, U.to), i1 = ell(U.a1, U.b1, U.from);
  const cap = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) / 2;
  return `M${f(o1[0])} ${f(o1[1])}A${U.a2} ${U.b2} 0 1 0 ${f(o2[0])} ${f(o2[1])}A${f(cap(o2, i2))} ${f(cap(o2, i2))} 0 0 0 ${f(i2[0])} ${f(i2[1])}` +
    `A${U.a1} ${U.b1} 0 1 1 ${f(i1[0])} ${f(i1[1])}A${f(cap(i1, o1))} ${f(cap(i1, o1))} 0 0 0 ${f(o1[0])} ${f(o1[1])}Z`;
})();

// ── 羽毛：一條條寬帶、圓頭，根部藏在馬蹄形後面；羽毛之間描等寬的細縫（跟原本 logo 一樣）；最上面斜 47 度，往下每根平一點，最下面幾乎水平。
// 尖端剛好落在一個大橢圓上，連成順的外輪廓
const ROOTS = { cx: 256, cy: 290, r: 110 }; // 羽根所在的圓（繞著頭）
const TIPS = { cx: 256, cy: 286, a: 224, b: 232 }; // 羽毛尖端所在的橢圓
// [羽根在頭外圍的角度, 羽毛方向（數學角度）, 根部寬, 尖端寬]；由上到下
const FEATHERS = [[136, 133, 46, 22], [151, 144, 46, 22], [166, 155, 46, 22], [181, 165, 46, 21], [196, 175, 46, 20]];
const quarter = (c, r, a, b) => { // 四分之一圓：從 c+r*a 轉到 c+r*b（a、b 互相垂直）
  const k = 0.5523, p = (u, v) => `${f(c[0] + r * (u[0] + k * v[0]))} ${f(c[1] + r * (u[1] + k * v[1]))}`;
  return `C${p(a, b)} ${p(b, a)} ${f(c[0] + r * b[0])} ${f(c[1] + r * b[1])}`;
};
const feather = ([at, deg, w0, w1]) => {
  const root = [ROOTS.cx + ROOTS.r * Math.cos(rad(at)), ROOTS.cy - ROOTS.r * Math.sin(rad(at))], u = dir(deg), n = [-u[1], u[0]];
  // 沿著方向走到碰到尖端橢圓為止（二分法）
  let lo = 0, hi = 600;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2, x = root[0] + u[0] * m - TIPS.cx, y = root[1] + u[1] * m - TIPS.cy;
    (x / TIPS.a) ** 2 + (y / TIPS.b) ** 2 < 1 ? (lo = m) : (hi = m);
  }
  const tip = [root[0] + u[0] * (lo - w1 / 2), root[1] + u[1] * (lo - w1 / 2)]; // 圓頭剛好碰到橢圓
  const side = (c, w, s) => `${f(c[0] + n[0] * s * w / 2)} ${f(c[1] + n[1] * s * w / 2)}`;
  const neg = [-n[0], -n[1]], back = [-u[0], -u[1]];
  return `M${side(root, w0, -1)}L${side(tip, w1, -1)}${quarter(tip, w1 / 2, neg, u)}${quarter(tip, w1 / 2, u, n)}` +
    `L${side(root, w0, 1)}${quarter(root, w0 / 2, n, back)}${quarter(root, w0 / 2, back, neg)}Z`;
};
const leftWing = FEATHERS.slice().reverse().map((p) => piece(feather(p))).join(''); // 最下面那根先畫，上面的疊上去；描底色邊＝羽毛之間等寬的細縫
// 最上面那根羽毛的根部跟馬蹄形上端之間補一段圓頭粗線，內側輪廓才會順（不然會有個小凹口）
const joint = (() => {
  const a = [ROOTS.cx + ROOTS.r * Math.cos(rad(FEATHERS[0][0])), ROOTS.cy - ROOTS.r * Math.sin(rad(FEATHERS[0][0]))];
  const o = ell(U.a2, U.b2, U.from), i = ell(U.a1, U.b1, U.from), b = [(o[0] + i[0]) / 2, (o[1] + i[1]) / 2];
  return `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${IVORY}" stroke-width="${f(Math.hypot(o[0] - i[0], o[1] - i[1]))}" stroke-linecap="round"/>`;
})();

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<!-- 群記俯衝版標誌：U 字身體托住頭、兩邊各 5 根羽毛往外上方散開。由 scripts/mark-dive.mjs 產生 -->
<rect width="512" height="512" fill="${BG}"/>
${leftWing}<g transform="translate(512 0) scale(-1 1)">${leftWing}</g>
<path d="${uPath}" fill="${IVORY}"/>${joint}<g transform="translate(512 0) scale(-1 1)">${joint}</g>
${head}
</svg>
`;
writeFileSync('public/brand/mark-dive.svg', svg);
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile('public/brand/mark-dive-512.png');
console.log('public/brand/mark-dive.svg、mark-dive-512.png');
