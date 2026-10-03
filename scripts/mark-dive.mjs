// 產生「群記」俯衝版標誌（以使用者選定的試看圖為基礎重畫，翅膀是自己的形狀）：
//   頭：銳利融合版（眉毛 V 往下壓蓋住眼睛上半、眼睛是尖角指向嘴的金色水滴、嘴是緊貼 V 尖的金色尖三角），坐在凹口裡
//   身體：翅膀根部加底下的碗連成一大塊（兩側寬、底部往下是圓弧），頭坐在它的 U 形凹口裡
//   翅膀：每邊 5 根寬的彎刀形羽毛（上緣直、下緣往上收成圓角尖頭），從身體外緣長出去；
//     角度從約 10 度漸變到約 44 度，最上面最長；羽毛很寬、縫很細，往外慢慢變寬
//   拼接感：身體、每根羽毛都是獨立的一塊，彼此之間留一樣寬的縫（照原本 logo）
// 用法：node scripts/mark-dive.mjs → public/brand/mark-dive.svg、mark-dive-512.png
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const BG = '#0b4a38', IVORY = '#f6f4ee', GOLD = '#d4b26a';
const G = 6; // 拼接的縫（畫布 px）
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

// ── 身體（翅膀根部＋碗）：左半邊的外緣點（由上往下到底部正中間），右半邊鏡像；頂端中間那段藏在頭後面
const BODY_L = [[207, 279], [192, 291], [184, 314], [183, 338], [178, 358], [168, 380], [186, 396], [220, 406], [256, 409]];
const body = smooth([...BODY_L, ...BODY_L.slice(0, -1).reverse().map(([x, y]) => [512 - x, y]), [256, 300]]);

// ── 羽毛（左翅；右翅鏡像）：彎刀形——上緣是直線一路到尖端，下緣在後段往上收、跟上緣會合成圓角尖頭；羽根藏在身體下面
// [羽根, 尖端, 寬]；由上到下
const FEATHERS = [[[214, 272], [47, 111], 42], [[198, 293], [36, 184], 42], [[189, 317], [44, 250], 41], [[187, 341], [67, 306], 40], [[193, 362], [113, 349], 38]];
const feather = ([R0, T, w]) => {
  const L0 = Math.hypot(T[0] - R0[0], T[1] - R0[1]), u = [(T[0] - R0[0]) / L0, (T[1] - R0[1]) / L0];
  const R = [R0[0] - u[0] * 26, R0[1] - u[1] * 26], L = L0 + 26; // 羽根往內縮進身體裡，圓頭完全被蓋住（縫碰到身體就乾淨地停住）
  const n = [u[1], -u[0]]; // 指向下緣那一側（左翅羽毛朝左上，下緣在左下）
  const top = [], bot = [];
  for (let i = 0; i <= 40; i++) {
    const s = i / 40, e = [R[0] + u[0] * L * s - (n[0] * w) / 2, R[1] + u[1] * L * s - (n[1] * w) / 2];
    const k = s < 0.62 ? 1 : Math.cos((Math.PI / 2) * ((s - 0.62) / 0.38)) ** 0.6; // 後段下緣往上收（留一點圓）
    top.push(e); bot.unshift([e[0] + n[0] * w * k, e[1] + n[1] * w * k]);
  }
  return smooth([...top, ...bot.slice(1, -1)]);
};
const wing = FEATHERS.map((p) => `<path d="${feather(p)}" ${halo}/>`).reverse().join(''); // 最下面那根先畫，上面的疊上去

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<!-- 群記俯衝版標誌：銳利融合版的頭坐在馬蹄形身體的凹口裡，兩邊各 5 根圓頭羽毛從身體外緣往上張開成 V 字，片與片之間等寬的縫。由 scripts/mark-dive.mjs 產生 -->
<rect width="512" height="512" fill="${BG}"/>
<g transform="translate(0 -4)">
  <g fill="${IVORY}">${wing}<g transform="translate(512 0) scale(-1 1)">${wing}</g><path d="${body}"/></g>
  ${head(HEAD.x, HEAD.y, HEAD.s, G + 2)}
</g>
</svg>
`;

writeFileSync('public/brand/mark-dive.svg', svg);
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile('public/brand/mark-dive-512.png');
console.log('public/brand/mark-dive.svg、mark-dive-512.png');
