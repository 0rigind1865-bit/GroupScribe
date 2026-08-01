import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { oh } from '../src/org/href';

// 守門測試：org 內部頁面不得出現缺 org 前綴的絕對路徑連結。
//
// 為什麼要有這個：管理頁搬進 /o/[org]/ 時漏改了 18 處 href，靠 middleware 的
// LEGACY 302 導到寫死的 /o/main —— 單租戶測不出來，多租戶就是跨租戶讀到別家資料。
// 「記得加前綴」是紀律，紀律會失效；這支測試不會。

const ROOT = join(import.meta.dirname, '..');
const SCAN_DIRS = [join(ROOT, 'src/app/o')];
const SCAN_FILES = [join(ROOT, 'src/core/links.ts')];

// 允許的絕對路徑開頭：org 連結、API、兩個 LIFF 入口、登入頁
const ALLOWED = /^\/(o\/|api\/|g$|g\/|a$|a\/|login|_next)/;

// 路由表定義檔：裡面的 '/inbox' 等是「模組內相對 path」，由 nav 組合時才加上 /o/<slug>。
// 語法上與漏改的絕對連結無法區分，只能整檔豁免。
// Phase 3 統一路由表後，這份清單會收斂成單一的 routes.tsx。
const EXEMPT = ['(admin)/nav.tsx', 'attend/layout.tsx'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') || p.endsWith('.ts') ? [p] : [];
  });
}

// 遮蔽 oh(...) 呼叫的內容（保留換行以維持行號）：它的第二個參數本來就是模組相對 path，
// 是正確用法，不該被當成漏改的絕對連結。括號配對處理巢狀與跨行呼叫。
// 命名慣例：`href` ＝ 完整連結（必須帶 /o/<slug>）、`path` ＝ 模組內相對路徑（由 oh() 組合）。
// 遮蔽 path: 的賦值，讓路由表常數不被誤判。
function maskPathProps(src: string): string {
  return src.replace(/\bpath:\s*(['"`])\/[^'"`\n]*\1/g, (m) => ' '.repeat(m.length));
}

function maskOhCalls(src: string): string {
  const out = src.split('');
  for (const m of src.matchAll(/\boh\(/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < src.length && depth > 0) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
      if (depth > 0 && src[i] !== '\n') out[i] = ' ';
      i++;
    }
  }
  return out.join('');
}

test('org 頁面內沒有缺 org 前綴的絕對路徑連結', () => {
  const files = [...SCAN_DIRS.flatMap(walk), ...SCAN_FILES];
  const bad: string[] = [];

  for (const file of files) {
    if (EXEMPT.some((e) => file.endsWith(e))) continue;
    const lines = maskPathProps(maskOhCalls(readFileSync(file, 'utf8'))).split('\n');
    lines.forEach((line, i) => {
      // 掃所有「引號內、以 / 開頭且後接字母」的字串字面量——涵蓋 href=""、href={``}、
      // href:''、edit: () => `` 、return `` 等所有寫法。要求後接字母，才不會抓到 split('/')。
      for (const m of line.matchAll(/['"`](\/[a-zA-Z][^'"`\n]*)['"`]/g)) {
        if (!ALLOWED.test(m[1])) bad.push(`${file.slice(ROOT.length + 1)}:${i + 1}  ${m[1]}`);
      }
    });
  }

  assert.deepEqual(bad, [], `發現缺 org 前綴的連結（請改用 oh(slug, path)）：\n${bad.join('\n')}`);
});

// ── oh() 本身 ──

test('oh：基本組合', () => {
  assert.equal(oh('main', '/tasks'), '/o/main/tasks');
  assert.equal(oh('main', ''), '/o/main');
});

test('oh：query 略過空值', () => {
  assert.equal(oh('acme', '/tasks', { group: 'C1', task: undefined, view: '' }), '/o/acme/tasks?group=C1');
});

test('oh：query 自動編碼', () => {
  assert.equal(oh('main', '/calendar', { group: 'a b&c' }), '/o/main/calendar?group=a+b%26c');
});

test('oh：數字 query', () => {
  assert.equal(oh('main', '/x', { n: 0 }), '/o/main/x?n=0');
});
