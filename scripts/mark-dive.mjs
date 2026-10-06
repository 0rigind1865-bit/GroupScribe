// 產生「群記」俯衝版標誌（定稿「甲」）：原本 logo 張開翅膀、朝看的人衝過來
//   頭：銳利融合版（眉毛 V 往下壓、眼睛是尖角指向嘴的金色水滴、嘴短短的圓角尖、緊貼眉毛 V 尖）
//   翅膀：每邊 4 根長羽毛從胸口後面同一個軸心放射出去，縫一樣寬、尖端用同一個角度斜切；
//         羽根上蓋 2 片短羽毛（上長下短），每片對齊 2 根長羽毛，短羽毛之間的縫跟長羽毛的縫接成一直線
//   身體：原本 logo 的倒三角胸口（寬、短）；尾巴：5 片從胸口後面放射、底邊切成一條直線（沒爪子版才有）
//   爪子版：胸口下面兩隻金色小腳，每隻 3 顆像原本 logo 嘴巴那樣的圓角菱形爪尖，不畫尾巴
//   全部照原本 logo 的「幾何拼接」：直邊＋圓角、塊與塊之間一樣寬的縫
// 用法：node scripts/mark-dive.mjs → public/brand/mark-dive.svg、mark-dive-512.png、mark-dive-claw.svg、mark-dive-claw-512.png
// 其他程式（例如變形動畫 scripts/mark-dive-morph.mjs）可以 import { buildDive, flatten } 拿到每一片在 512 畫布上的座標
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const BG = '#0b4a38', IVORY = '#f6f4ee', GOLD = '#d4b26a';
const mark = readFileSync(new URL('../public/brand/mark.svg', import.meta.url), 'utf8');
export const P = [...mark.split('<g fill="#d4b26a">')[0].matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
export const ORIG_BEAK = mark.split('<g fill="#d4b26a">')[1].match(/<path d="([^"]+)"/)[1];
const NUM = /(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)/g;
export const mapPath = (d, fn) => d.replace(NUM, (_, x, y) => fn(+x, +y).map((v) => +v.toFixed(2)).join(' '));
const f = (n) => +n.toFixed(2);
const rad = (d) => (d * Math.PI) / 180;
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
const poly = (pts) => `M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join('L')}Z`;

// 圓角多邊形：每個角往兩邊退 r，用二次曲線圓過去（原本 logo 的每一塊都是這種直邊＋圓角）
const rounded = (Q, r) => Q.map((p, i) => {
  const a = Q[(i + Q.length - 1) % Q.length], b = Q[(i + 1) % Q.length];
  const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]);
  const p1 = [p[0] + ((a[0] - p[0]) / da) * Math.min(r[i], da / 2), p[1] + ((a[1] - p[1]) / da) * Math.min(r[i], da / 2)];
  const p2 = [p[0] + ((b[0] - p[0]) / db) * Math.min(r[i], db / 2), p[1] + ((b[1] - p[1]) / db) * Math.min(r[i], db / 2)];
  return `${i ? 'L' : 'M'}${f(p1[0])} ${f(p1[1])}Q${f(p[0])} ${f(p[1])} ${f(p2[0])} ${f(p2[1])}`;
}).join('') + 'Z';
const piece = (spec) => rounded(spec.map((s) => s[0]), spec.map((s) => s[1])); // [[點, 圓角], …]

// 把只用 M／L／Q／C／Z（絕對座標）的路徑攤平成一串點（給算範圍、給變形動畫取樣用）
export const flatten = (d, steps = 12) => {
  const tok = d.match(/[MLQCZ]|-?\d+(?:\.\d+)?/g), out = [];
  let i = 0, cmd = '', cur = [0, 0];
  const num = () => +tok[i++];
  while (i < tok.length) {
    if (/[MLQCZ]/.test(tok[i])) cmd = tok[i++];
    if (cmd === 'Z') continue;
    if (cmd === 'M' || cmd === 'L') { cur = [num(), num()]; out.push(cur); }
    else if (cmd === 'Q') {
      const c = [num(), num()], e = [num(), num()], s = cur;
      for (let k = 1; k <= steps; k++) { const t = k / steps; out.push([0, 1].map((j) => (1 - t) ** 2 * s[j] + 2 * t * (1 - t) * c[j] + t * t * e[j])); }
      cur = e;
    } else if (cmd === 'C') {
      const c1 = [num(), num()], c2 = [num(), num()], e = [num(), num()], s = cur;
      for (let k = 1; k <= steps; k++) { const t = k / steps; out.push([0, 1].map((j) => (1 - t) ** 3 * s[j] + 3 * t * (1 - t) ** 2 * c1[j] + 3 * t * t * (1 - t) * c2[j] + t ** 3 * e[j])); }
      cur = e;
    }
  }
  return out;
};

// ── 頭（mark.svg 座標，頭部中心 y＝168）：銳利融合版
const SQ = 0.9, BROW = 26, GAP_HEAD = 9; // 整顆頭稍微壓扁、眉毛往下壓多少、眉毛與眼睛之間的縫
const BEAK = { len: 24, tip: 9, side: 3, gap: 4 }; // 嘴：長度、尖端圓角、上面兩角圓角、跟眉毛 V 尖的距離（比其他縫窄，嘴靠近眉毛）
const sq = (x, y) => [x, 168 + (y - 168) * SQ];
export const HEAD = {
  brow: mapPath(mapPath(P[0], (x, y) => [x, y + BROW]), sq),
  face: [1, 2].map((i) => mapPath(P[i], sq)),
};
const vTip = sq(0, 191 + BROW)[1], slope = 0.783 * SQ, notch = vTip + BEAK.gap * Math.hypot(1, slope);
HEAD.beak = rounded([[-15, notch - slope * 15], [0, notch], [15, notch - slope * 15], [0, notch + BEAK.len]], [BEAK.side, 1.5, BEAK.side, BEAK.tip]);
const tear = (cx, cy, r, px, py) => { // 圓形加一個尖角（從尖角畫兩條切線到圓上），用一圈點表示
  const d = Math.hypot(px - cx, py - cy), phi = Math.atan2(py - cy, px - cx), a = Math.acos(r / d), pts = [[px, py]];
  for (let k = 0; k <= 40; k++) { const t = phi + a + ((2 * Math.PI - 2 * a) * k) / 40; pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
  return poly(pts);
};
const ey = sq(0, 186)[1];
HEAD.eyes = [tear(-45.5, ey, 19, -18, ey + 20), tear(45.5, ey, 19, 18, ey + 20)]; // 眼角尖尖地指向嘴
HEAD.mask = poly(Array.from({ length: 48 }, (_, k) => [82 * Math.cos((k / 48) * 2 * Math.PI), 190 + 50 * Math.sin((k / 48) * 2 * Math.PI)])); // 臉中間的橢圓（挖縫用）
HEAD.gap = GAP_HEAD;

// ── 構圖參數（512 畫布、縮放前的座標，中線 x＝256；左半邊算好、右半邊鏡像）
const G = 6;                                          // 塊與塊之間的縫
const HEAD_AT = [256, 300, 0.55];                     // 頭的中心、縮放
const ZOOM = 1.04;
const C = [270, 370];                                 // 長羽毛放射的軸心（藏在胸口後面）
const D = [49.4, 42.5, 32, 21.5, 11, 0.5];            // 分隔線角度（離水平往上幾度）；最上面那根（D[0]～D[1]）不畫
const R = [338, 298, 256, 214, 172];                  // 每根羽毛尖端離軸心多遠
const WING = { rA: 10, rHeel: 8, cut: [47, 55, 47, 38, 29], root: 50 }; // 尖端圓角、腳跟圓角、斜切長度、羽根伸到哪
const COVERT = { bounds: [1, 3, 5], rIn: [148, 112], rInner: [56, 62], cut: 26, rA: 10, rHeel: 8 }; // 短羽毛：上長下短
const CHEST = { kx: 0.7, ky: 0.3, y0: 322, w: 0.6 };  // 胸口＝原本 logo 的 P[5]：寬、高、上緣位置、下半部加寬
const TAIL = { C: [256, 344], angs: [-54, -33, -11, 11, 33, 54], bottom: 398, r: 6 };
const FEET = { x: 243, y: 376 };

const dir = (a) => [-Math.cos(rad(a)), -Math.sin(rad(a))];
const nUp = (a) => { const u = dir(a); return [-u[1], u[0]]; };
const on = (a, r, side = 0) => add(add(C, dir(a), r), nUp(a), (side * G) / 2); // 分隔線 a 上、離軸心 r、往上(+)/下(-)退半個縫

// 左半邊的零件（縮放前座標）
const longFeathers = [1, 2, 3, 4].map((k) => {
  const up = (r) => on(D[k], r, -1), lo = (r) => on(D[k + 1], r, +1);
  return piece([[up(WING.root), 0], [up(R[k]), WING.rA], [lo(R[k] - WING.cut[k]), WING.rHeel], [lo(WING.root), 0]]);
});
const coverts = COVERT.bounds.slice(0, -1).map((b, i) => {
  const up = (rr) => on(D[b], rr, -1), lo = (rr) => on(D[COVERT.bounds[i + 1]], rr, +1), r = COVERT.rIn[i];
  return piece([[up(40), 0], [[244, 346], 0], [lo(COVERT.rInner[i]), 6], [lo(r - COVERT.cut), COVERT.rHeel], [up(r), COVERT.rA]]); // 內端藏在胸口後面
});
const chest = mapPath(P[5], (x, y) => { const t = Math.max(0, (y - 250) / 153); return [256 + x * CHEST.kx * (1 + CHEST.w * t * t), CHEST.y0 + (y - 240) * CHEST.ky]; });
const tdir = (a) => [Math.sin(rad(a)), Math.cos(rad(a))], tn = (a) => [Math.cos(rad(a)), -Math.sin(rad(a))];
const tat = (a, s, r) => add(add(TAIL.C, tdir(a), r), tn(a), (s * G) / 2);
const lineHit = (a, s) => { const p = tat(a, s, 0), u = tdir(a); return add(p, u, (TAIL.bottom - p[1]) / u[1]); }; // 尾端切在同一條水平線上
const tail = TAIL.angs.slice(0, -1).map((aL, i) => { const aR = TAIL.angs[i + 1]; return piece([[tat(aL, +1, 4), 0], [lineHit(aL, +1), TAIL.r], [lineHit(aR, -1), TAIL.r], [tat(aR, -1, 4), 0]]); });
const kite = (cx, cy, w, h, ang) => { // 爪尖：圓角菱形（上端寬圓、下端尖），旋轉 ang 度
  const c = Math.cos(rad(ang)), s = Math.sin(rad(ang)), T = ([x, y]) => [cx + x * c - y * s, cy + x * s + y * c];
  return piece([[T([0, -h * 0.35]), w * 0.45], [T([w / 2, 0]), w * 0.3], [T([0, h * 0.65]), w * 0.28], [T([-w / 2, 0]), w * 0.3]]);
};
const toes = [kite(FEET.x - 7, FEET.y + 4, 7.5, 15, 22), kite(FEET.x, FEET.y + 6, 8, 16, 2), kite(FEET.x + 7, FEET.y + 4, 7.5, 15, -18)];

// 組起來：回傳一串由後往前畫的圖層（座標已換到 512 畫布上），halo＝描一圈底色切出縫的寬度
export const buildDive = ({ claws = false } = {}) => {
  const mir = (d) => mapPath(d, (x, y) => [512 - x, y]);
  const both = (list) => [...list, ...list.map(mir)];
  const headTo = (d) => mapPath(d, (x, y) => [HEAD_AT[0] + x * HEAD_AT[2], HEAD_AT[1] + (y - 168) * HEAD_AT[2]]);
  const raw = [
    ...both(longFeathers).map((d, i) => ({ id: `long${i}`, d, fill: IVORY })),
    ...both(coverts.slice().reverse()).map((d, i) => ({ id: `covert${i}`, d, fill: IVORY, halo: G })), // 下面那片先畫，上面那片蓋上去切出縫
    ...(claws ? [] : tail.map((d, i) => ({ id: `tail${i}`, d, fill: IVORY }))),
    { id: 'chest', d: chest, fill: IVORY, halo: G },
    ...(claws ? both(toes).map((d, i) => ({ id: `toe${i}`, d, fill: GOLD, halo: G })) : []),
    // 頭：先一層底色版的頭把後面的東西挖出一圈縫，再畫金色眼睛、白色臉、眉毛（描邊切出銳利的眼睛）、嘴
    ...[HEAD.brow, ...HEAD.face, ...HEAD.eyes, HEAD.beak, HEAD.mask].map((d, i) => ({ id: `mask${i}`, d: headTo(d), fill: BG, halo: G })),
    ...HEAD.eyes.map((d, i) => ({ id: `eye${i}`, d: headTo(d), fill: GOLD })),
    ...HEAD.face.map((d, i) => ({ id: `face${i}`, d: headTo(d), fill: IVORY })),
    { id: 'brow', d: headTo(HEAD.brow), fill: IVORY, halo: (GAP_HEAD * HEAD_AT[2]) },
    { id: 'beak', d: headTo(HEAD.beak), fill: GOLD },
  ];
  // 上下置中：看得到的零件（不算挖縫用的底色層）攤平後的範圍
  const ys = raw.filter((l) => l.fill !== BG).flatMap((l) => flatten(l.d).map((p) => p[1]));
  const dy = 256 - (Math.min(...ys) + Math.max(...ys)) / 2;
  const place = (x, y) => [256 + ZOOM * (x - 256), 256 + ZOOM * (y - 256 + dy)];
  const layers = raw.map((l) => ({ ...l, d: mapPath(l.d, place), halo: l.halo ? l.halo * ZOOM : 0 }));
  // 給動畫用：換座標的函式、縮放、長羽毛的軸心與角度、爪子的位置（都是縮放前的座標，用 place 換到畫布）
  return Object.assign(layers, { place, zoom: ZOOM, pivot: C, angles: D, feet: FEET, gap: G });
};

// 圖層 → SVG（爪子那幾片是一隻腳連成一塊：先全部描底色，再一起填色，腳裡面才不會有縫）
export const toSvg = (layers, size = 512) => {
  const out = [];
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (l.id.startsWith('toe')) {
      const toesL = layers.filter((x) => x.id.startsWith('toe'));
      if (l === toesL[0]) out.push(`<g fill="${BG}" stroke="${BG}" stroke-width="${f(l.halo * 2)}" stroke-linejoin="round">${toesL.map((t) => `<path d="${t.d}"/>`).join('')}</g><g fill="${GOLD}">${toesL.map((t) => `<path d="${t.d}"/>`).join('')}</g>`);
      continue;
    }
    out.push(`<path d="${l.d}" fill="${l.fill}"${l.halo ? ` stroke="${BG}" stroke-width="${f(l.halo * 2)}" paint-order="stroke" stroke-linejoin="round"` : ''}/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
<!-- 群記俯衝版標誌（甲）：原本 logo 張開翅膀，長短兩段羽毛、倒三角胸口${layers.some((l) => l.id.startsWith('toe')) ? '、金色爪子' : '、扇形尾巴'}。由 scripts/mark-dive.mjs 產生 -->
<rect width="512" height="512" fill="${BG}"/>
${out.join('\n')}
</svg>
`;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [name, claws] of [['mark-dive', false], ['mark-dive-claw', true]]) {
    const svg = toSvg(buildDive({ claws }));
    writeFileSync(`public/brand/${name}.svg`, svg);
    await sharp(Buffer.from(svg)).resize(512, 512).png().toFile(`public/brand/${name}-512.png`);
    console.log(`public/brand/${name}.svg、${name}-512.png`);
  }
}
