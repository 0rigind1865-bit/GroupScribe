// 產生「群記」俯衝版標誌・箭頭版（Claude 自己的設計）：
// logo 的眉毛那塊本身就像一隻張開翅膀的鳥，把它放大成 3 層疊在頭上方當翅膀（越上面越寬、越薄、外側越往上翹），
// 每層 V 尖都往下指；頭、圓眼睛、嘴、倒三角身體照原樣，整隻成為往下俯衝的箭頭，尖端瞄準一顆金色訊號（也像驚嘆號）。
// 用法：node scripts/mark-dive-arrow.mjs → public/brand/mark-dive-arrow.svg、mark-dive-arrow-512.png
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const BG = '#0b4a38', IVORY = '#f6f4ee', GOLD = '#d4b26a';
const GAP = 9; // 片與片之間的縫（mark.svg 座標，跟原本 logo 一樣）

const mark = readFileSync('public/brand/mark.svg', 'utf8');
const [ivoryPart, goldPart] = mark.split('<g fill="#d4b26a">');
const pieces = [...ivoryPart.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
const beak = goldPart.match(/<path d="([^"]+)"/)[1];
const NUM = /(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)/g;
const mapPath = (d, fn) => d.replace(NUM, (_, x, y) => fn(+x, +y).map((v) => +v.toFixed(2)).join(' '));
const halo = `stroke="${BG}" stroke-width="${GAP * 2}" paint-order="stroke" stroke-linejoin="round"`; // 疊在別片上時切出等寬的縫

// 眉毛那塊：V 尖在 y＝191、上緣中間凹口在 y＝136、兩端耳羽在 x＝±103
const BROW_DROP = 10; // 頭的眉毛微微壓低＝眼神專注（圓眼睛保留）
const LAYERS = [[1.5, 0.85, 14], [1.95, 0.75, 26], [2.4, 0.66, 40]]; // 翅膀由下到上：[左右放大, 上下放大（越上面越薄）, 外側往上翹多少]
const wings = [];
let dip = 136 + BROW_DROP;
for (const [sx, sy, lift] of LAYERS) {
  const v = dip - GAP - 4; // 這層的 V 尖放在下面那層凹口的上方
  wings.push(mapPath(pieces[0], (x, y) => [x * sx, v + (y - 191) * sy - lift * (Math.abs(x) / 103) ** 2]));
  dip = v + (136 - 191) * sy;
}
const brow = mapPath(pieces[0], (x, y) => [x, y + BROW_DROP]);
const SIGNAL = { y: 403 + GAP + 16, r: 13 }; // 身體尖端下方的金色訊號

// 整隻放進 512 畫布正中間、外框 430
const pts = [...wings, brow, pieces[1], pieces[2], pieces[5]].flatMap((d) => [...d.matchAll(NUM)].map((m) => [+m[1], +m[2]]));
pts.push([0, SIGNAL.y + SIGNAL.r]);
const xMax = Math.max(...pts.map((p) => Math.abs(p[0]))), yMin = Math.min(...pts.map((p) => p[1])), yMax = Math.max(...pts.map((p) => p[1]));
const S = +(430 / Math.max(2 * xMax, yMax - yMin)).toFixed(4), CY = (yMin + yMax) / 2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<!-- 群記俯衝版標誌・箭頭版：眉毛形狀放大成 3 層翅膀、整隻往下指向一顆金色訊號。由 scripts/mark-dive-arrow.mjs 產生 -->
<rect width="512" height="512" fill="${BG}"/>
<g transform="translate(256 256) scale(${S}) translate(0 ${-CY})">
  <g fill="${IVORY}">${[...wings.reverse(), pieces[1], pieces[2], pieces[5]].map((d) => `<path d="${d}" ${halo}/>`).join('')}</g>
  <g fill="${GOLD}"><circle cx="-45.5" cy="186" r="18"/><circle cx="45.5" cy="186" r="18"/><path d="${beak}"/><circle cx="0" cy="${SIGNAL.y}" r="${SIGNAL.r}"/></g>
  <path d="${brow}" fill="${IVORY}" ${halo}/>
</g>
</svg>
`;
writeFileSync('public/brand/mark-dive-arrow.svg', svg);
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile('public/brand/mark-dive-arrow-512.png');
console.log('public/brand/mark-dive-arrow.svg、mark-dive-arrow-512.png');
