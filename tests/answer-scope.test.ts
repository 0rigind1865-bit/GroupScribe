import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 守門測試：@群記 問答只能查「發問的這個群」的資料；
// 唯一例外是 1:1 個人筆記私下問：本人的筆記＋他「現在」還在的群（LINE 群成員 API 判定）。
//
// 為什麼要有這個：問答的三個資料來源（向量搜尋、已確認的行程/待辦/公告、群組理解）現在都綁 group_id，
// 所以不會問到別的群、更不會問到別家公司。但這是「程式剛好寫對」——有人改程式時拿掉條件，
// 不會有任何錯誤，只會默默把別群的報價、人名餵給 AI。這支測試把「寫對」變成「改錯就紅」。

const ROOT = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

test('問答的每個資料表查詢都綁 group_id', () => {
  const src = read('src/core/query.ts');
  const starts = [...src.matchAll(/\.from\(['"]/g)].map((m) => m.index!);
  const bad: string[] = [];
  starts.forEach((at, k) => {
    // 只看「這個查詢」：到下一個 .from( 為止（最多 400 字）。
    // 不能用「往下看幾行」——會看到下一個查詢的 group_id 條件而誤判通過（第一版就是這樣漏抓的）
    const end = Math.min(starts[k + 1] ?? src.length, at + 400);
    if (!/\.eq\(\s*['"]group_id['"]/.test(src.slice(at, end))) {
      const line = src.slice(0, at).split('\n').length;
      bad.push(`query.ts:${line}  ${src.slice(at, at + 60).split('\n')[0]}`);
    }
  });
  assert.ok(starts.length >= 3, '找不到問答的資料表查詢——檔案結構變了，請更新這支測試');
  assert.deepEqual(bad, [], `這些查詢沒有綁 group_id，@問答可能讀到別群的資料：\n${bad.join('\n')}`);
});

test('問答的向量搜尋帶了群組參數，資料庫函式也照它過濾', () => {
  const q = read('src/core/query.ts');
  const call = q.slice(q.indexOf("rpc('match_embeddings'"), q.indexOf("rpc('match_embeddings'") + 300);
  assert.match(call, /p_group_id:\s*groupId/, 'match_embeddings 呼叫沒有帶 p_group_id: groupId');

  const schema = read('supabase/schema.sql');
  const fn = schema.slice(schema.indexOf('create or replace function match_embeddings'));
  assert.match(fn.slice(0, 800), /where\s+e\.group_id\s*=\s*p_group_id/, 'match_embeddings 函式沒有 where e.group_id = p_group_id');
});

test('問答用的群組理解只讀這個群', () => {
  const p = read('src/core/profile.ts');
  const fn = p.slice(p.indexOf('export async function getProfile'));
  assert.match(fn.slice(0, 300), /\.eq\(\s*['"]group_id['"]\s*,\s*groupId\s*\)/, 'getProfile 沒有 .eq(group_id, groupId)');
});

test('個人筆記私下問：範圍只從 myGroups 來，一般群只查自己', () => {
  const q = read('src/core/query.ts');
  const fn = q.slice(q.indexOf('async function answerScope'), q.indexOf('async function searchGroup'));
  assert.match(fn, /if \(!isDm\(groupId\)\) return \[\{ id: groupId/, '一般群的問答範圍不再只有自己這個群');
  assert.match(fn, /await myGroups\(/, '個人筆記的範圍不是從 myGroups 來');
  assert.ok(!/\.from\(|rpc\(/.test(fn), 'answerScope 自己查了資料庫——範圍必須只從 myGroups 來');
  assert.match(q, /scope\.map\(\(g\) => searchGroup\(g\.id/, '向量搜尋沒有照範圍逐群查');

  const l = read('src/core/liff.ts');
  const mg = l.slice(l.indexOf('export async function myGroups'), l.indexOf('export async function memberName'));
  assert.match(mg, /isGroupMember\(g\.group_id, userId\)/, 'myGroups 沒有用 LINE 群成員 API 判定「現在在不在群裡」');
  assert.match(l, /if \(isDm\(groupId\)\) return groupId === dmGroupId\(userId\)/, '別人的個人筆記可能被當成我的群');
});
