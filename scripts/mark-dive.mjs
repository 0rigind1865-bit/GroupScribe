// 產生「群記」俯衝版標誌（扁的）：翅膀幾乎水平往兩邊展開、翅尖微微上翹，每邊 4 層平行羽毛一層疊一層（越上面越長）；
// 中間是壓低眉頭、眼神銳利的頭，下面接小小的倒三角身體與短尾巴。頭、身體取自定稿 mark.svg，片與片之間等寬的縫
// 用法：node scripts/mark-dive.mjs → public/brand/mark-dive.svg、mark-dive-512.png
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const BG = '#0b4a38', IVORY = '#f6f4ee', GOLD = '#d4b26a';
const GAP = 7; // 片與片之間的縫（px，畫布 512）

const mark = readFileSync('public/brand/mark.svg', 'utf8');
const [ivoryPart, goldPart] = mark.split('<g fill="#d4b26a">');
const pieces = [...ivoryPart.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
const beak = goldPart.match(/<path d="([^"]+)"/)[1];

const f = (n) => +n.toFixed(2);
const rad = (d) => (d * Math.PI) / 180;
const dir = (deg) => [Math.cos(rad(deg)), -Math.sin(rad(deg))]; // 數學角度（0＝右、90＝上）→ 畫面向量（y 往下）
const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const meet = (p, d, q, c) => add(p, d, cross([q[0] - p[0], q[1] - p[1]], c) / cross(d, c)); // 兩條線（點＋方向）的交點
// 描一圈底色邊：疊在別片上面時切出等寬的縫；在縮放過的群組裡要除以縮放倍數
const halo = (s = 1) => `stroke="${BG}" stroke-width="${f((GAP * 2) / s)}" paint-order="stroke" stroke-linejoin="round"`;
// 圓角多邊形：每個角往兩邊退 r，用二次曲線圓過去（銳角就變成 logo 那種圓角尖頭）
const rounded = (pts, r) => pts.map((p, i) => {
  const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length];
  const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]);
  const p1 = add(p, [(a[0] - p[0]) / da, (a[1] - p[1]) / da], Math.min(r, da / 2));
  const p2 = add(p, [(b[0] - p[0]) / db, (b[1] - p[1]) / db], Math.min(r, db / 2));
  return `${i ? 'L' : 'M'}${f(p1[0])} ${f(p1[1])}Q${f(p[0])} ${f(p[1])} ${f(p2[0])} ${f(p2[1])}`;
}).join('') + 'Z';

// ── 翅膀（左邊；右邊鏡像）：沿著一條「翅骨」曲線（從肩膀幾乎水平往外，到翅尖微微上翹）
// 往下平行疊 4 層羽毛；越上面越長、越往尖端越細，尖端是圓角尖頭
const SPINE = [[194, 222], [104, 226], [20, 160]]; // 二次曲線：肩膀 → 控制點 → 翅尖
const LAYERS = [[1, 32], [0.84, 29], [0.68, 26], [0.52, 23]]; // [長度（翅骨的幾成）, 根部寬]；由上到下
const spine = (t) => { const [a, b, c] = SPINE, m = 1 - t; return [0, 1].map((i) => m * m * a[i] + 2 * m * t * b[i] + t * t * c[i]); };
const normal = (t) => { // 翅骨的法向量（朝下）
  const [a, b, c] = SPINE, d = [0, 1].map((i) => 2 * (1 - t) * (b[i] - a[i]) + 2 * t * (c[i] - b[i])), l = Math.hypot(...d);
  const n = [-d[1] / l, d[0] / l];
  return n[1] < 0 ? [-n[0], -n[1]] : n;
};
// 一串點用 Catmull-Rom 串成平滑的封閉曲線
const smooth = (P) => P.map((p, i) => {
  const a = P[(i - 1 + P.length) % P.length], b = P[(i + 1) % P.length], c = P[(i + 2) % P.length];
  const c1 = [p[0] + (b[0] - a[0]) / 6, p[1] + (b[1] - a[1]) / 6], c2 = [b[0] - (c[0] - p[0]) / 6, b[1] - (c[1] - p[1]) / 6];
  return `${i ? '' : `M${f(p[0])} ${f(p[1])}`}C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(b[0])} ${f(b[1])}`;
}).join('') + 'Z';
const leftWing = LAYERS.map(([len, w], k) => {
  const off = LAYERS.slice(0, k).reduce((s, [, wj]) => s + wj + GAP, 0); // 這層上緣離翅骨多遠
  const top = [], bot = [];
  for (let i = 0; i <= 40; i++) {
    const t = (len * i) / 40, n = normal(t), edge = add(spine(t), n, off);
    top.push(edge); bot.unshift(add(edge, n, w * (1 - 0.94 * (i / 40) ** 2.4))); // 上緣順順的；下緣到尖端往上收＝彎刀般的尖頭
  }
  return `<path d="${smooth([...top, ...bot])}" ${halo()}/>`;
}).reverse().join(''); // 最下面那層先畫，上面的疊上去

// ── 頭：mark.svg 的兩側臉、眼睛、嘴；眉毛（額頭那塊）往下壓、切到眼睛上緣＝眼神銳利；整顆頭稍微壓扁＝低頭往前衝
const HEAD = { x: 256, y: 232, s: 0.6, squash: 0.9, brow: 20 }; // 中心（mark.svg 頭部中心 y＝168）、縮放、上下壓扁、眉毛下壓多少
const head = `<g transform="translate(${HEAD.x} ${HEAD.y}) scale(${HEAD.s} ${HEAD.s * HEAD.squash}) translate(0 -168)">
  <g fill="${IVORY}">${[1, 2].map((i) => `<path d="${pieces[i]}"/>`).join('')}</g>
  <g fill="${GOLD}"><ellipse cx="-45.5" cy="188" rx="21" ry="18"/><ellipse cx="45.5" cy="188" rx="21" ry="18"/><path d="${beak}"/></g>
  <path d="${pieces[0]}" transform="translate(0 ${HEAD.brow})" fill="${IVORY}" ${halo(HEAD.s)}/>
</g>`;

// ── 身體：mark.svg 的倒三角胸口縮小；尾巴：3 根尖尖的短羽毛往下散開，根部藏在身體後面，彼此之間留縫
const BODY = { y: 286, s: 0.36 }; // 身體上緣高度、縮放
const bodyTip = BODY.y + (403 - 245) * BODY.s;
const body = `<path d="${pieces[5]}" transform="translate(256 ${BODY.y}) scale(${BODY.s}) translate(0 -245)" fill="${IVORY}" ${halo(BODY.s)}/>`;
const tail = [[-126, 44], [-54, 44], [-90, 54]].map(([deg, len], i) => { // [方向（數學角度，-90＝正下方）, 長]；兩側先畫，中間那根疊上去
  const d = dir(deg), side = [-d[1], d[0]], root = [256, bodyTip - 18], w = 22; // 根部寬、往尖端收成尖頭（跟翅膀一樣）
  return `<path d="${rounded([add(root, side, w / 2), add(root, d, len), add(root, side, -w / 2)], 6)}"${i === 2 ? ` ${halo()}` : ''}/>`;
}).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<!-- 群記俯衝版標誌（扁的）：水平展開的層疊翅膀、壓低眉頭的銳利眼神、小倒三角身體、短尾巴。由 scripts/mark-dive.mjs 產生 -->
<rect width="512" height="512" fill="${BG}"/>
<g fill="${IVORY}">${leftWing}<g transform="translate(512 0) scale(-1 1)">${leftWing}</g>${tail}</g>
${body}
${head}
</svg>
`;
writeFileSync('public/brand/mark-dive.svg', svg);
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile('public/brand/mark-dive-512.png');
console.log('public/brand/mark-dive.svg、mark-dive-512.png');
