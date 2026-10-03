// 產生「群記」俯衝版標誌（扁扁的）：眼神銳利的頭（眉毛壓低切到眼睛，嘴緊貼眉毛的 V 尖＝一體的倒三角）、扁扁的倒梯形身體，
// 兩邊是往上舉成 V 字的羽毛扇，身體下面是扁扁的尾羽扇；翅膀尖端與尾巴尖端落在同一道下圓弧上（構圖參考使用者給的 V 字翅膀貓頭鷹範例）。
// 每根羽毛（翅膀與尾巴）都是 logo 原本那片翅膀（斜斜的平行四邊形、圓角）拉長而成。
// 用法：node scripts/mark-dive.mjs → public/brand/mark-dive.svg、mark-dive-512.png
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const BG = '#0b4a38', IVORY = '#f6f4ee', GOLD = '#d4b26a';
const GAP = 9; // 羽毛之間的縫（mark.svg 座標）

const mark = readFileSync('public/brand/mark.svg', 'utf8');
const [ivoryPart, goldPart] = mark.split('<g fill="#d4b26a">');
const pieces = [...ivoryPart.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);

// 把路徑上每個點套用仿射變換（直線還是直線、平行還是平行＝保留原本翅膀的平行四邊形感）；
// 直接改座標而不是用 transform，描邊（縫）才會到處一樣寬
const mapPath = (d, fn) => d.replace(/(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)/g, (_, x, y) => fn(+x, +y).map((v) => +v.toFixed(2)).join(' '));

// 左翅的羽毛：logo 原本那片翅膀（pieces 第 3 塊）以頂端為軸拉長、轉向；右翅鏡像
const ROOT = [-89, 230]; // 那片翅膀的頂端（羽根）
const PIECE_LEN = 107; // 那片翅膀從頂端到尖端的長度
// [往外轉幾度（0＝原本朝下、90＝朝左、越大越往上）, 拉長倍數, 寬度倍數, 羽根沿原本那片往下移多少]；由上到下，最下面那根往外下方斜
const FEATHERS = [[130, 2.5, 1.45, 0], [115.5, 2.25, 1.45, 18], [101, 2.0, 1.45, 36], [86.5, 1.75, 1.45, 54], [72, 1.5, 1.45, 72]];
// 一根羽毛：把那片翅膀的頂端移到 at、沿自己拉長加寬、再轉向
const blade = (deg, len, wid, at) => {
  const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
  return mapPath(pieces[3], (x, y) => {
    const u = (x - ROOT[0]) * wid, v = (y - ROOT[1]) * len; // 先沿著翅膀本身拉長、加寬
    return [at[0] + u * c - v * s, at[1] + u * s + v * c]; // 再繞羽根轉向（畫面上順時針）
  });
};
const feather = ([deg, len, wid, slide]) => blade(deg, len, wid, [ROOT[0], ROOT[1] + slide]);
const tipOf = ([deg, len, , slide]) => [ROOT[0] - PIECE_LEN * len * Math.sin((deg * Math.PI) / 180), ROOT[1] + slide + PIECE_LEN * len * Math.cos((deg * Math.PI) / 180)];

// 尾巴：身體下面的扁扁尾羽扇（左半邊 0°、30°、60°，右半邊鏡像）。每根長度算好，讓尖端剛好落在
// 「穿過最下面那根翅膀尖端」的大橢圓上＝翅膀與尾巴連成同一道下圓弧
const TAIL_AT = [0, 276], ARC_C = 300, TAIL_DROP = 70; // 尾羽根部（藏在身體後面）、下圓弧橢圓的中心高度、弧線最低點離中心多遠
const W = tipOf(FEATHERS[FEATHERS.length - 1]);
const ARC = { b: TAIL_DROP, a: Math.abs(W[0]) / Math.sqrt(1 - ((W[1] - ARC_C) / TAIL_DROP) ** 2) };
const tailHalf = [60, 30, 0].map((deg) => {
  const dx = Math.sin((deg * Math.PI) / 180), dy = Math.cos((deg * Math.PI) / 180), oy = TAIL_AT[1] - ARC_C;
  // 從根部沿這個方向走，碰到橢圓的距離（解一元二次方程式取正根）
  const qa = (dx / ARC.a) ** 2 + (dy / ARC.b) ** 2, qb = (2 * oy * dy) / ARC.b ** 2, qc = (oy / ARC.b) ** 2 - 1;
  const L = (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa);
  return blade(deg, L / PIECE_LEN, 1.35, TAIL_AT);
});
const halo = `stroke="${BG}" stroke-width="${GAP * 2}" paint-order="stroke" stroke-linejoin="round"`;
const leftWing = FEATHERS.slice().reverse().map((p) => `<path d="${feather(p)}" ${halo}/>`).join(''); // 最下面那根先畫，上面的疊上去
// 圓角多邊形：每個角往兩邊退 r，用二次曲線圓過去
const rounded = (P, r) => P.map((p, i) => {
  const a = P[(i + P.length - 1) % P.length], b = P[(i + 1) % P.length];
  const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]);
  const ra = Math.min(r[i], da / 2), rb = Math.min(r[i], db / 2);
  const p1 = [p[0] + ((a[0] - p[0]) / da) * ra, p[1] + ((a[1] - p[1]) / da) * ra], p2 = [p[0] + ((b[0] - p[0]) / db) * rb, p[1] + ((b[1] - p[1]) / db) * rb];
  return `${i ? 'L' : 'M'}${p1.map((v) => +v.toFixed(2)).join(' ')}Q${p.join(' ')} ${p2.map((v) => +v.toFixed(2)).join(' ')}`;
}).join('') + 'Z';

// 頭：眉毛（額頭那塊）往下壓、切到眼睛上緣＝眼神銳利；整顆頭稍微壓扁＝低頭往前衝
const SQ = 0.9, BROW = 22;
const sq = (d) => mapPath(d, (x, y) => [x, 168 + (y - 168) * SQ]);
const brow = sq(mapPath(pieces[0], (x, y) => [x, y + BROW]));
const face = [1, 2].map((i) => sq(pieces[i]));

// 嘴：上緣剛好嵌在眉毛 V 尖的下面（中間只留一條縫）、往下收尖＝眉毛加嘴看起來是一體的倒三角
const vTip = 168 + (191 + BROW - 168) * SQ, slope = 0.783 * SQ, notch = vTip + GAP * Math.hypot(1, slope);
const beakTri = rounded([[-15, notch - slope * 15], [0, notch], [15, notch - slope * 15], [0, notch + 26]], [3, 5, 3, 5]);

// 身體：扁扁的倒梯形（上緣保留原本胸口那道淺淺的 V，底部平的）
const body = rounded([[-66, 246], [0, 260], [66, 246], [40, 294], [-40, 294]], [8, 22, 8, 12, 12]);
// 整隻放進 512 畫布正中間、外框 440：用所有路徑的座標點算出範圍（含曲線控制點，會略大一點點）
const pts = [...FEATHERS.map(feather), ...tailHalf, brow, ...face, body].flatMap((d) => [...d.matchAll(/(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)/g)].map((m) => [+m[1], +m[2]]));
const xMax = Math.max(...pts.map((p) => Math.abs(p[0]))), yMin = Math.min(...pts.map((p) => p[1])), yMax = Math.max(...pts.map((p) => p[1]));
const S = +(440 / Math.max(2 * xMax, yMax - yMin)).toFixed(4), CY = (yMin + yMax) / 2;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<!-- 群記俯衝版標誌：眼神銳利的頭（眉毛與嘴成一體倒三角）、扁倒梯形身體、往上舉成 V 字的羽毛扇與扁扁的尾羽扇連成一道下圓弧。由 scripts/mark-dive.mjs 產生 -->
<rect width="512" height="512" fill="${BG}"/>
<g transform="translate(256 256) scale(${S}) translate(0 ${-CY})">
  <g fill="${IVORY}">
    <g transform="scale(-1 1)">${tailHalf.map((d) => `<path d="${d}" ${halo}/>`).join('')}</g>${tailHalf.map((d) => `<path d="${d}" ${halo}/>`).join('')}
    ${leftWing}<g transform="scale(-1 1)">${leftWing}</g>
    <path d="${body}" ${halo}/>${face.map((d) => `<path d="${d}"/>`).join('')}
  </g>
  <g fill="${GOLD}"><ellipse cx="-45.5" cy="186" rx="21" ry="16.5"/><ellipse cx="45.5" cy="186" rx="21" ry="16.5"/><path d="${beakTri}"/></g>
  <path d="${brow}" fill="${IVORY}" ${halo}/>
</g>
</svg>
`;
writeFileSync('public/brand/mark-dive.svg', svg);
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile('public/brand/mark-dive-512.png');
console.log('public/brand/mark-dive.svg、mark-dive-512.png');
