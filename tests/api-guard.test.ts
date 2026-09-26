import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { orgSlugFrom } from '../src/org/orgs';

// 守門測試（商業計劃 2.1 節 A4）：群組助理的每一支 API 都必須經過 gsAccess() 門禁。
//
// 為什麼要有這個：以 id 操作的路由（events/tasks/notes/batch）原本只 .eq('id')，
// 拿到別家 org 的 id 就能改；reindex 原本刪全庫向量。「記得加門禁」是紀律，紀律會失效。

const ROOT = join(import.meta.dirname, '..');
const API = join(ROOT, 'src/app/api');

// 不走 gsAccess 的白名單（各有自己的把關）：
//   webhook＝LINE 簽章、login＝密碼、liff＝LINE ID token、auth＝LINE Login 流程、
//   digest＝cron ?key、attend＝考勤模組自己的 orgAdminAccess 三重把關
//   org/create＝自助註冊（還沒有 org 可綁，自己驗 liffUser）
//   platform/＝平台管理（跨所有 org，不屬於任何一個 org，自己驗 isPlatformOwner）
//   health/＝健康檢查（公開、唯讀、只回 ok 布林，不碰任何 org 資料）
//   expense/＝報帳模組（非群組助理，不以 group_id 為鍵）：orgAdminAccess(表單 org) 把關＋查詢一律 .eq('org_id')，同考勤
const WHITELIST = ['webhook/', 'login/', 'liff/', 'auth/', 'digest/', 'attend/', 'org/', 'platform/', 'health/', 'expense/'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : name === 'route.ts' ? [p] : [];
  });
}

test('群組助理 API 全部經過 gsAccess 門禁', () => {
  const bad: string[] = [];
  for (const file of walk(API)) {
    const rel = file.slice(API.length + 1);
    if (WHITELIST.some((w) => rel.startsWith(w))) continue;
    const src = readFileSync(file, 'utf8');
    if (!/\bgsAccess\(/.test(src)) bad.push(rel);
  }
  assert.deepEqual(bad, [], `這些 API 沒有呼叫 gsAccess()（或加進白名單並說明它自己怎麼把關）：\n${bad.join('\n')}`);
});

test('群組助理 API 不再寫死舊路徑 redirect', () => {
  const bad: string[] = [];
  for (const file of walk(API)) {
    const rel = file.slice(API.length + 1);
    if (WHITELIST.some((w) => rel.startsWith(w))) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        // redirectTo('/groups') 這種會被 middleware 302 到預設 org——對第二個租戶就是導錯家
        if (/redirectTo\(\s*['"`]\/(?!o\/)/.test(line)) bad.push(`${rel}:${i + 1}  ${line.trim()}`);
      });
  }
  assert.deepEqual(bad, [], `redirect 請用 access.base 當前綴：\n${bad.join('\n')}`);
});

// ── orgSlugFrom：slug 的來源 ──

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

test('orgSlugFrom：表單 org 優先', () => {
  assert.equal(orgSlugFrom(fd({ org: 'acme' }), 'https://x.test/o/main/tasks'), 'acme');
});

test('orgSlugFrom：沒帶就取 Referer 的 /o/<slug>', () => {
  assert.equal(orgSlugFrom(null, 'https://x.test/o/main/tasks?group=C1'), 'main');
  assert.equal(orgSlugFrom(fd({}), 'https://x.test/o/acme-2'), 'acme-2');
  assert.equal(orgSlugFrom(null, 'https://x.test/o/acme?x=1'), 'acme');
});

test('orgSlugFrom：Referer 不是 org 頁或缺席 → 空字串（呼叫端 403）', () => {
  assert.equal(orgSlugFrom(null, null), '');
  assert.equal(orgSlugFrom(null, 'https://x.test/g/C1'), '');
  assert.equal(orgSlugFrom(null, 'https://x.test/o/'), '');
  assert.equal(orgSlugFrom(null, 'https://x.test/o/Bad_Slug/tasks'), ''); // 不符 orgs.slug 的 check
});

// ── enabledModuleIds：org_settings.modules → 開啟的模組（A1）──
import { enabledModuleIds } from '../src/org/module-ids';

test('enabledModuleIds：null（沒有 org_settings 列）＝只有考勤，維持開放前的狀態', () => {
  assert.deepEqual(enabledModuleIds(null), ['attend']);
  assert.deepEqual(enabledModuleIds(undefined), ['attend']);
});

test('enabledModuleIds：依欄位開模組，順序固定為 gs → attend，未知值忽略', () => {
  assert.deepEqual(enabledModuleIds(['gs']), ['gs']);
  assert.deepEqual(enabledModuleIds(['attend', 'gs']), ['gs', 'attend']);
  assert.deepEqual(enabledModuleIds(['bogus']), []);
});

// ── 管理權依模組授權（migration 028）──
// 在考勤「員工管理」把會計設成管理員，原本會連群組助理一起給（能讀全公司 LINE 群組整理）。
import { attendAdminToggle, isMissingModulesColumn, scopedModuleIds } from '../src/org/module-ids';

test('考勤／報帳後台 API 一律走 moduleAccess，不准用裸的 orgAdminAccess', () => {
  const bad: string[] = [];
  for (const file of walk(API)) {
    const rel = file.slice(API.length + 1);
    if (!rel.startsWith('attend/') && !rel.startsWith('expense/')) continue;
    if (/\borgAdminAccess\(/.test(readFileSync(file, 'utf8'))) bad.push(rel);
  }
  assert.deepEqual(bad, [], `這些 API 只驗「是不是公司管理員」，沒驗「有沒有被授權管這個模組」：\n${bad.join('\n')}`);
});

test('scopedModuleIds：只被授權考勤的人拿不到群組助理', () => {
  assert.deepEqual(scopedModuleIds(['gs', 'attend', 'expense'], 'admin', ['attend']), ['attend']);
});

test('scopedModuleIds：null＝公司開的全部（既有管理員行為不變）；owner 不受限', () => {
  assert.deepEqual(scopedModuleIds(['gs', 'attend'], 'admin', null), ['gs', 'attend']);
  assert.deepEqual(scopedModuleIds(['gs', 'attend'], 'owner', ['attend']), ['gs', 'attend']);
});

test('scopedModuleIds：授權了但公司沒開的模組不算；未知值忽略', () => {
  assert.deepEqual(scopedModuleIds(['attend'], 'admin', ['gs', 'attend', 'bogus']), ['attend']);
  assert.deepEqual(scopedModuleIds(['gs'], 'admin', []), []);
});

test('attendAdminToggle：新人設為管理員＝只給考勤', () => {
  assert.deepEqual(attendAdminToggle(null, ['gs', 'attend'], true), ['attend']);
  assert.equal(attendAdminToggle(null, ['gs', 'attend'], false), 'keep');
});

test('attendAdminToggle：owner 永遠不動', () => {
  assert.equal(attendAdminToggle({ role: 'owner', modules: null }, ['gs', 'attend'], false), 'keep');
  assert.equal(attendAdminToggle({ role: 'owner', modules: ['gs'] }, ['gs', 'attend'], true), 'keep');
});

test('attendAdminToggle：只動考勤那一格，不碰其他模組的權限', () => {
  // 舊管理員（null＝整家公司）按移除 → 完整撤權（改版前語意；否則群組助理權限留著、徽章卻消失）
  assert.equal(attendAdminToggle({ role: 'admin', modules: null }, ['gs', 'attend'], false), 'delete');
  assert.equal(attendAdminToggle({ role: 'admin', modules: null }, ['gs', 'attend'], true), 'keep');
  // 只管群組助理的人加上考勤
  assert.deepEqual(attendAdminToggle({ role: 'admin', modules: ['gs'] }, ['gs', 'attend'], true), ['gs', 'attend']);
  // 拿掉最後一格 → 整列刪掉
  assert.equal(attendAdminToggle({ role: 'admin', modules: ['attend'] }, ['gs', 'attend'], false), 'delete');
  assert.equal(attendAdminToggle({ role: 'admin', modules: null }, ['attend'], false), 'delete');
  // 同時管群組助理＋考勤（新制）的人拿掉考勤 → 只剩群組助理
  assert.deepEqual(attendAdminToggle({ role: 'admin', modules: ['gs', 'attend'] }, ['gs', 'attend'], false), ['gs']);
});

test('isMissingModulesColumn：只有「欄位不存在」才退回舊查詢，網路錯誤不行', () => {
  assert.equal(isMissingModulesColumn({ code: '42703', message: 'column org_members.modules does not exist' }), true);
  assert.equal(isMissingModulesColumn({ message: 'TypeError: fetch failed' }), false);
  assert.equal(isMissingModulesColumn({ code: '57014', message: 'canceling statement due to statement timeout' }), false);
  assert.equal(isMissingModulesColumn(null), false);
});

test('管理端每一頁都自己驗模組權限（requireModule），不能只靠 layout', () => {
  // Next 的 RSC 請求可以偽造 router state 跳過 layout，只 render page（2026-09-26 本機實測可讀到別家公司的待辦）
  const O = join(ROOT, 'src/app/o/[org]');
  const MOD: Record<string, string> = { '(admin)': 'gs', attend: 'attend', expense: 'expense' };
  const pages = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? pages(p) : n === 'page.tsx' ? [p] : [];
    });
  const bad: string[] = [];
  for (const file of pages(O)) {
    const rel = file.slice(O.length + 1);
    const mod = MOD[rel.split('/')[0]];
    const src = readFileSync(file, 'utf8');
    if (!mod || !new RegExp(`requireModule\\([^,]+,\\s*'${mod}'\\)`).test(src)) bad.push(`${rel}（應呼叫 requireModule(…, '${mod ?? '?'}')）`);
  }
  assert.deepEqual(bad, [], `這些頁面沒有自己的權限門禁：\n${bad.join('\n')}`);
});
