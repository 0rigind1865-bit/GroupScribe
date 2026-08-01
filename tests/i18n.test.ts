import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 守門測試：五個語系檔的 key 集合必須完全相同。
//
// 為什麼 typecheck 擋不住：MsgKey 只由 zh-TW.json 生成（src/attend/i18n/index.ts），
// 其他四檔缺 key 時 t() 靜默回退繁中——畫面不會壞，但越南籍員工看到的是中文，
// 而且沒有人會回報（他們以為本來就這樣）。
const ROOT = join(import.meta.dirname, '..');
const LANGS = ['zh-TW', 'en', 'ja', 'vi', 'id'];

const load = (l: string) => JSON.parse(readFileSync(join(ROOT, `src/attend/i18n/${l}.json`), 'utf8')) as Record<string, string>;

test('五語系檔的 key 集合一致', () => {
  const base = Object.keys(load('zh-TW')).sort();
  for (const lang of LANGS.slice(1)) {
    const keys = Object.keys(load(lang)).sort();
    const missing = base.filter((k) => !keys.includes(k));
    const extra = keys.filter((k) => !base.includes(k));
    assert.deepEqual(missing, [], `${lang}.json 缺少 key（會靜默回退繁中）：${missing.join(', ')}`);
    assert.deepEqual(extra, [], `${lang}.json 有 zh-TW 沒有的 key（已死）：${extra.join(', ')}`);
  }
});

test('帶參數的訊息，五個語系都保留了 placeholder', () => {
  const base = load('zh-TW');
  // zh-TW 裡有 {x} 的 key，其他語系也必須有同一個 {x}——漏掉會顯示成空白而非數字
  const withParams = Object.entries(base).flatMap(([k, v]) => {
    const ps = [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    return ps.length ? [[k, ps] as const] : [];
  });
  assert.ok(withParams.length > 0, '應該有帶參數的訊息');

  for (const lang of LANGS.slice(1)) {
    const d = load(lang);
    for (const [k, ps] of withParams) {
      for (const p of ps) {
        assert.ok(d[k]?.includes(`{${p}}`), `${lang}.json 的 ${k} 少了參數 {${p}}：「${d[k]}」`);
      }
    }
  }
});

test('沒有空字串翻譯', () => {
  for (const lang of LANGS) {
    const empty = Object.entries(load(lang))
      .filter(([, v]) => !v.trim())
      .map(([k]) => k);
    assert.deepEqual(empty, [], `${lang}.json 有空翻譯：${empty.join(', ')}`);
  }
});
