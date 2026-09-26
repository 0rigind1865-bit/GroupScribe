// E1 抽取回歸集：題目檔格式正確、比對器算得對
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compare } from '../src/core/eval-compare';

test('回歸題目：三個行業、各 30 則、都有期望項目、沒有舞台技術', () => {
  const dir = path.join(import.meta.dirname, 'fixtures/golden');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  assert.equal(files.length, 3);
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.equal(j.messages.length, 30, f);
    assert.ok(j.expected.length >= 5, f);
    assert.doesNotMatch(JSON.stringify(j), /燈光|音響|舞台/, f); // 產業無關原則：不用開發者本人的行業
  }
});

test('compare：同類型且關鍵字全包含才算對到，一個實際項目只對一次', () => {
  const r = compare(
    [
      { kind: 'task', keywords: ['補貨'] },
      { kind: 'event', keywords: ['冷凍庫'] },
      { kind: 'note', keywords: ['公休'] },
    ],
    [
      { kind: 'task', title: '阿強打給菜商補貨' },
      { kind: 'task', title: '冷凍庫維修' }, // 類型不對
      { kind: 'note', title: '週二公休' },
      { kind: 'task', title: '今天好熱' }, // 多抽
    ],
  );
  assert.equal(r.matched, 2);
  assert.deepEqual(r.missed, [{ kind: 'event', keywords: ['冷凍庫'] }]);
  assert.equal(r.extra.length, 2);
  assert.equal(r.falsePositiveRate, 0.5);
  assert.equal(compare([], []).falsePositiveRate, 0);
});
