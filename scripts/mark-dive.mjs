// 產生「群記」俯衝版標誌（照使用者給的兩張貓頭鷹範例分析）：
//   1. 翅膀和身體是一整塊：10 根羽毛加上 U 字身體連在一起，羽毛只在外側自然裂開（縫由細變寬）
//   2. 頭很小（約整體寬度 24%），沿用定稿 mark.svg 的眉毛、兩側臉、金色圓眼睛、嘴
//   3. 頭放低、坐在身體的 U 字凹口裡；頭外圍挖掉一圈等寬的縫，凹口剛好沿著頭的輪廓
//   4. 每邊 5 根羽毛，角度從約 −3 度漸變到約 49 度，最上面最長
//   5. 整體寬約高的 1.5 倍，底部是一道往下的圓弧
// 用法：node scripts/mark-dive.mjs → public/brand/mark-dive.svg、mark-dive-512.png
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const BG = '#0b4a38', IVORY = '#f6f4ee', GOLD = '#d4b26a';
const GAP = 10; // 頭與身體之間的縫（畫布 px）

const mark = readFileSync('public/brand/mark.svg', 'utf8');
const [ivoryPart, goldPart] = mark.split('<g fill="#d4b26a">');
const pieces = [...ivoryPart.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
const beak = goldPart.match(/<path d="([^"]+)"/)[1];
const f = (n) => +n.toFixed(2);

// ── 羽毛（左翅，畫布座標；右翅鏡像）：羽根沿著頭的外圍等距排開（間距≈羽毛寬，根部剛好碰在一起，往外才慢慢分開＝細細的楔形縫），
//    尖端位置照範例量到的比例；[羽根在頭外圍的角度, 尖端, 根部寬, 尖端寬]，由上到下
const C = [256, 315], R_ROOT = 76; // 頭的中心、羽根所在的圓
const FEATHERS = [
  [128, [49, 111], 36, 30],
  [151, [37, 184], 36, 30],
  [174, [46, 251], 36, 29],
  [197, [70, 307], 35, 28],
  [220, [104, 362], 34, 27],
].map(([deg, T, w0, w1]) => {
  const R = [C[0] + R_ROOT * Math.cos((deg * Math.PI) / 180), C[1] - R_ROOT * Math.sin((deg * Math.PI) / 180)];
  const L = Math.hypot(T[0] - R[0], T[1] - R[1]), BACK = 22; // 羽根再往頭的方向延伸一點，圓頭整個藏進頭周圍那圈縫裡被挖掉
  return [[R[0] - ((T[0] - R[0]) / L) * BACK, R[1] - ((T[1] - R[1]) / L) * BACK], T, w0, w1];
});
const quarter = (c, r, a, b) => { // 四分之一圓：從 c+r*a 轉到 c+r*b（a、b 互相垂直）
  const k = 0.5523, p = (u, v) => `${f(c[0] + r * (u[0] + k * v[0]))} ${f(c[1] + r * (u[1] + k * v[1]))}`;
  return `C${p(a, b)} ${p(b, a)} ${f(c[0] + r * b[0])} ${f(c[1] + r * b[1])}`;
};
// 圓角多邊形：每個角往兩邊退 r，用二次曲線圓過去（跟 logo 一樣的圓角尖頭）
const rounded = (P, r) => P.map((p, i) => {
  const a = P[(i + P.length - 1) % P.length], b = P[(i + 1) % P.length];
  const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]);
  const p1 = [p[0] + ((a[0] - p[0]) / da) * Math.min(r[i], da / 2), p[1] + ((a[1] - p[1]) / da) * Math.min(r[i], da / 2)];
  const p2 = [p[0] + ((b[0] - p[0]) / db) * Math.min(r[i], db / 2), p[1] + ((b[1] - p[1]) / db) * Math.min(r[i], db / 2)];
  return `${i ? 'L' : 'M'}${f(p1[0])} ${f(p1[1])}Q${f(p[0])} ${f(p[1])} ${f(p2[0])} ${f(p2[1])}`;
}).join('') + 'Z';
// 一根羽毛：從羽根到尖端的長條，尖端斜切成圓角尖頭（上緣比較長，像刀片），羽根那頭圓的（藏在身體裡）
const blade = ([R, T, w0, w1]) => {
  const L = Math.hypot(T[0] - R[0], T[1] - R[1]), u = [(T[0] - R[0]) / L, (T[1] - R[1]) / L], n = [u[1], -u[0]];
  const at = (c, k, along = 0) => [c[0] + n[0] * k + u[0] * along, c[1] + n[1] * k + u[1] * along];
  return rounded([at(R, w0 / 2), at(T, w1 / 2), at(T, -w1 / 2, -w1 * 1.1), at(R, -w0 / 2)], [w0 / 2, 6, 8, w0 / 2]);
};
const wing = FEATHERS.map((p) => `<path d="${blade(p)}"/>`).join('');
// U 字身體：頭下方的半個橢圓（實心），底部就是往下的圓弧；再加一圈繞著頭的扇形墊在羽根下面，頭旁邊的邊緣才會順
const U = { cx: 256, cy: 315, a: 132, b: 95 };
const ring = (from, to, r1, r2) => { // 繞著頭中心的扇形環（數學角度，從 from 經過下方到 to）
  const pt = (r, d) => `${f(C[0] + r * Math.cos((d * Math.PI) / 180))} ${f(C[1] - r * Math.sin((d * Math.PI) / 180))}`;
  return `M${pt(r2, from)}A${r2} ${r2} 0 0 0 ${pt(r2, to)}L${pt(r1, to)}A${r1} ${r1} 0 0 1 ${pt(r1, from)}Z`;
};
const body = `<path d="M${U.cx - U.a} ${U.cy}A${U.a} ${U.b} 0 0 0 ${U.cx + U.a} ${U.cy}Z"/><path d="${ring(128, 240, 46, 94)}"/><path d="${ring(128, 240, 46, 94)}" transform="translate(512 0) scale(-1 1)"/>`;

// ── 頭：mark.svg 頭部（中心 y＝168）縮小放進凹口。先畫一層「底色版的頭」（每塊描粗邊＋臉中間一個橢圓）
//    把身體挖出一圈等寬的縫，再畫真正的頭
const HEAD = { x: 256, y: 313, s: 0.53 };
const eyes = '<circle cx="-45.5" cy="186" r="18"/><circle cx="45.5" cy="186" r="18"/>';
const cutout = `<g fill="${BG}" stroke="${BG}" stroke-width="${f((GAP * 2) / HEAD.s)}" stroke-linejoin="round">
    ${[0, 1, 2].map((i) => `<path d="${pieces[i]}"/>`).join('')}${eyes}<path d="${beak}"/><ellipse cx="0" cy="190" rx="82" ry="52"/></g>`;
const head = `<g transform="translate(${HEAD.x} ${HEAD.y}) scale(${HEAD.s}) translate(0 -168)">
  ${cutout}
  <g fill="${IVORY}">${[0, 1, 2].map((i) => `<path d="${pieces[i]}"/>`).join('')}</g>
  <g fill="${GOLD}">${eyes}<path d="${beak}"/></g>
</g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<!-- 群記俯衝版標誌：翅膀與 U 字身體一整塊、羽毛往外裂開，小小的頭坐在凹口裡。由 scripts/mark-dive.mjs 產生 -->
<rect width="512" height="512" fill="${BG}"/>
<g transform="translate(0 -4)">
  <g fill="${IVORY}">${wing}<g transform="translate(512 0) scale(-1 1)">${wing}</g>${body}</g>
  ${head}
</g>
</svg>
`;
writeFileSync('public/brand/mark-dive.svg', svg);
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile('public/brand/mark-dive-512.png');
console.log('public/brand/mark-dive.svg、mark-dive-512.png');
