import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// 守門測試：畫面上用到的每個 Tailwind 色彩 class，深色模式都要有對應的 remap。
//
// 為什麼需要：globals.css 用「未分層規則整表 remap」處理深色（不是 dark: 變體），
// 漏一個 class 的症狀是「亮色底配深色字浮在深色背景上」——刺眼但不會壞，
// 沒人主動切深色就不會發現。這支測試把它變成 CI 問題。
//
// 白名單＝實心色（深色下維持原值即可）：白字疊在飽和色塊上，兩個主題都夠對比。
const SOLID_OK = new Set([
  'bg-emerald-500', 'bg-emerald-600', 'bg-amber-400', 'bg-amber-500',
  'bg-red-500', 'bg-sky-600', 'bg-purple-600', 'bg-gray-800', 'bg-gray-900',
  // 描邊/左邊條：本來就是飽和色，深色下仍清楚
  'border-emerald-600', 'border-purple-400', 'border-red-400', 'border-sky-400', 'border-sky-500',
  // 實心色塊上的文字
  'text-red-500',
]);

const ROOT = join(import.meta.dirname, '..');
const COLOR_RE = /\b((?:bg|text|border)-(?:emerald|sky|amber|red|purple|indigo|teal|blue|gray)-\d+)/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

test('用到的色彩 class 都有深色模式 remap', () => {
  const css = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8');
  const dark = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
  const remapped = new Set([...dark.matchAll(/\.((?:bg|text|border)-[a-z]+-\d+)/g)].map((m) => m[1]));

  const missing = new Map<string, Set<string>>();
  for (const file of walk(join(ROOT, 'src/app'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(COLOR_RE)) {
      const cls = m[1];
      if (remapped.has(cls) || SOLID_OK.has(cls)) continue;
      const set = missing.get(cls) ?? new Set();
      set.add(file.slice(ROOT.length + 1));
      missing.set(cls, set);
    }
  }

  const lines = [...missing.entries()].map(([cls, files]) => `${cls}  ← ${[...files].join(', ')}`);
  assert.deepEqual(lines, [], `這些色彩 class 在深色模式下沒有 remap：\n${lines.join('\n')}`);
});

test('已退場的語意色不再出現（indigo / teal）', () => {
  // 色彩收斂：全站狀態語意只留 emerald/amber/red/gray（見 src/app/ui/tone.ts）。
  // indigo（已結算/管理員/金額）與 teal（補卡核准）已各自歸位到中性色或 emerald。
  const hits: string[] = [];
  for (const file of walk(join(ROOT, 'src/app'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\b(?:bg|text|border)-(indigo|teal)-\d+/g)) {
      hits.push(`${file.slice(ROOT.length + 1)}  ${m[0]}`);
    }
  }
  assert.deepEqual(hits, [], `indigo/teal 已退場，請改用 tone.ts 的語意色：\n${hits.join('\n')}`);
});
