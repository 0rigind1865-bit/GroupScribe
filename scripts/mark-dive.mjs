// 產生「群記」俯衝版標誌：兩邊翅膀是平行四邊形（一條條平行的斜羽毛），中間是壓低眉頭、眼神銳利的頭，
// 下面接小小的倒三角身體與尾巴。頭、身體取自定稿 mark.svg，照同一套語言（圓角尖頭、片與片之間等寬的縫）
// 用法：node scripts/mark-dive.mjs → public/brand/mark-dive.svg、mark-dive-512.png
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const BG = '#0b4a38', IVORY = '#f6f4ee', GOLD = '#d4b26a';
const GAP = 8; // 片與片之間的縫（px，畫布 512）

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

// ── 翅膀（左邊；右邊鏡像）：同方向的平行羽毛疊成一片平行四邊形，每根羽毛兩端切在「內緣線」與「外緣線」上
const WING = {
  deg: 143, w: 24, n: 5, r: 9, // 羽毛方向（往外上方 37 度）、寬、根數、圓角
  inner: [[186, 0], [0, 1]], top: 204, // 內緣線（貼著頭和身體的直線）、最上面那根羽毛上緣碰到內緣線的高度
  outer: [[30, 92], dir(106)], // 外緣線：通過左上角、稍微往外傾（上面的羽毛比較長）
};
const leftWing = (() => {
  const d = dir(WING.deg), down = [d[1], -d[0]]; // down：垂直羽毛、往下一根的方向
  const start = [WING.inner[0][0], WING.top];
  return Array.from({ length: WING.n }, (_, k) => {
    const up = add(start, down, k * (WING.w + GAP)), lo = add(up, down, WING.w); // 這根羽毛的上、下兩條邊
    const pts = [meet(up, d, ...WING.inner), meet(up, d, ...WING.outer), meet(lo, d, ...WING.outer), meet(lo, d, ...WING.inner)];
    return `<path d="${rounded(pts, WING.r)}"/>`;
  }).join('');
})();

// ── 頭：mark.svg 的兩側臉、眼睛、嘴；眉毛（額頭那塊）往下壓、切到眼睛上緣＝眼神銳利；整顆頭稍微壓扁＝低頭往前衝
const HEAD = { x: 256, y: 238, s: 0.62, squash: 0.9, brow: 20 }; // 中心（mark.svg 頭部中心 y＝168）、縮放、上下壓扁、眉毛下壓多少
const head = `<g transform="translate(${HEAD.x} ${HEAD.y}) scale(${HEAD.s} ${HEAD.s * HEAD.squash}) translate(0 -168)">
  <g fill="${IVORY}">${[1, 2].map((i) => `<path d="${pieces[i]}"/>`).join('')}</g>
  <g fill="${GOLD}"><ellipse cx="-45.5" cy="188" rx="21" ry="18"/><ellipse cx="45.5" cy="188" rx="21" ry="18"/><path d="${beak}"/></g>
  <path d="${pieces[0]}" transform="translate(0 ${HEAD.brow})" fill="${IVORY}" ${halo(HEAD.s)}/>
</g>`;

// ── 身體：mark.svg 的倒三角胸口縮小；尾巴：3 根短羽毛往下散開，根部藏在身體後面，彼此之間留縫
const BODY = { y: 296, s: 0.42 }; // 身體上緣高度、縮放
const bodyTip = BODY.y + (403 - 245) * BODY.s;
const body = `<path d="${pieces[5]}" transform="translate(256 ${BODY.y}) scale(${BODY.s}) translate(0 -245)" fill="${IVORY}" ${halo(BODY.s)}/>`;
const tail = [[-114, 58], [-66, 58], [-90, 72]].map(([deg, len], i) => { // [方向（數學角度，-90＝正下方）, 長]；兩側先畫，中間那根疊上去
  const d = dir(deg), side = [-d[1], d[0]], root = [256, bodyTip - 16], w = 20;
  const a = add(root, side, w / 2), b = add(root, side, -w / 2);
  return `<path d="${rounded([a, add(a, d, len), add(b, d, len), b], 8)}"${i === 2 ? ` ${halo()}` : ''}/>`;
}).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<!-- 群記俯衝版標誌：平行四邊形翅膀、壓低眉頭的銳利眼神、小倒三角身體、尾巴。由 scripts/mark-dive.mjs 產生 -->
<rect width="512" height="512" fill="${BG}"/>
<g fill="${IVORY}">${leftWing}<g transform="translate(512 0) scale(-1 1)">${leftWing}</g>${tail}</g>
${body}
${head}
</svg>
`;
writeFileSync('public/brand/mark-dive.svg', svg);
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile('public/brand/mark-dive-512.png');
console.log('public/brand/mark-dive.svg、mark-dive-512.png');
