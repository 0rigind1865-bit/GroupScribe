// 產生「群記」俯衝版標誌（扁扁的）：原本的 logo（頭、眼睛、嘴不動；倒三角身體、兩側下翅上下壓扁），
// 只把兩片上翅換成往上舉成 V 字的羽毛扇（構圖參考使用者給的 V 字翅膀貓頭鷹範例）。
// 每根羽毛都是 logo 原本那片翅膀（斜斜的平行四邊形、圓角）拉長而成：最上面最長最斜，越往下越短越平。
// 用法：node scripts/mark-dive.mjs → public/brand/mark-dive.svg、mark-dive-512.png
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const BG = '#0b4a38', IVORY = '#f6f4ee', GOLD = '#d4b26a';
const GAP = 9; // 羽毛之間的縫（mark.svg 座標）

const mark = readFileSync('public/brand/mark.svg', 'utf8');
const [ivoryPart, goldPart] = mark.split('<g fill="#d4b26a">');
const pieces = [...ivoryPart.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
const beak = goldPart.match(/<path d="([^"]+)"/)[1];

// 把路徑上每個點套用仿射變換（直線還是直線、平行還是平行＝保留原本翅膀的平行四邊形感）；
// 直接改座標而不是用 transform，描邊（縫）才會到處一樣寬
const mapPath = (d, fn) => d.replace(/(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)/g, (_, x, y) => fn(+x, +y).map((v) => +v.toFixed(2)).join(' '));

// 左翅的羽毛：logo 原本那片翅膀（pieces 第 3 塊）以頂端為軸拉長、轉向；右翅鏡像
const ROOT = [-89, 230]; // 那片翅膀的頂端（羽根）
// [往外轉幾度（0＝原本朝下、90＝朝左、越大越往上）, 拉長倍數, 寬度倍數, 羽根沿原本那片往下移多少]；由上到下
const FEATHERS = [[130, 2.5, 1.45, 0], [120.5, 2.3, 1.45, 18], [111, 2.1, 1.45, 36], [101.5, 1.9, 1.45, 54], [92, 1.7, 1.45, 72]];
const feather = ([deg, len, wid, slide]) => {
  const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
  return mapPath(pieces[3], (x, y) => {
    const u = (x - ROOT[0]) * wid, v = (y - ROOT[1]) * len; // 先沿著翅膀本身拉長、變窄
    return [ROOT[0] + u * c - v * s, ROOT[1] + slide + u * s + v * c]; // 再繞羽根轉向（畫面上順時針）
  });
};
const halo = `stroke="${BG}" stroke-width="${GAP * 2}" paint-order="stroke" stroke-linejoin="round"`;
const leftWing = FEATHERS.slice().reverse().map((p) => `<path d="${feather(p)}" ${halo}/>`).join(''); // 最下面那根先畫，上面的疊上去
// 身體（倒三角胸口、兩側下翅）上下壓扁，整隻才會扁扁的；頭不動
const BODY_Y = 0.68;
const body = [5, 6, 7].map((i) => mapPath(pieces[i], (x, y) => [x, 245 + (y - 245) * BODY_Y]));

// 整隻放進 512 畫布正中間、外框 440：用所有路徑的座標點算出範圍（含曲線控制點，會略大一點點）
const pts = [...FEATHERS.map(feather), ...[0, 1, 2].map((i) => pieces[i]), ...body].flatMap((d) => [...d.matchAll(/(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)/g)].map((m) => [+m[1], +m[2]]));
const xMax = Math.max(...pts.map((p) => Math.abs(p[0]))), yMin = Math.min(...pts.map((p) => p[1])), yMax = Math.max(...pts.map((p) => p[1]));
const S = +(440 / Math.max(2 * xMax, yMax - yMin)).toFixed(4), CY = (yMin + yMax) / 2;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<!-- 群記俯衝版標誌：原本的 logo，上翅換成往上舉成 V 字的羽毛扇（每根是原本翅膀拉長）。由 scripts/mark-dive.mjs 產生 -->
<rect width="512" height="512" fill="${BG}"/>
<g transform="translate(256 256) scale(${S}) translate(0 ${-CY})">
  <g fill="${IVORY}">${leftWing}<g transform="scale(-1 1)">${leftWing}</g></g>
  <g fill="${IVORY}">${[...[0, 1, 2].map((i) => pieces[i]), ...body].map((d) => `<path d="${d}"/>`).join('')}</g>
  <g fill="${GOLD}"><circle cx="-45.5" cy="186" r="18"/><circle cx="45.5" cy="186" r="18"/><path d="${beak}"/></g>
</g>
</svg>
`;
writeFileSync('public/brand/mark-dive.svg', svg);
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile('public/brand/mark-dive-512.png');
console.log('public/brand/mark-dive.svg、mark-dive-512.png');
