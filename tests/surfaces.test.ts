// 身分切換（個人／管理兩層）的純邏輯：七種角色（docs/identity-switcher-plan.md 2.4 表格）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Surface } from '../src/org/surfaces';
import { barState, groupSurfaces, hasRoleToggle, itemsOf, multiOrg, resolveRoleJump } from '../src/org/surface-groups';

// 夾具：跨行業的假公司（不用 jielin 自己的產業）
const punch = (...slugs: string[]): Surface => ({ key: 'punch', id: 'punch', role: 'me', slugs, label: '', desc: '', href: '/a', rank: 1 });
const myexp = (...slugs: string[]): Surface => ({ key: 'myexpense', id: 'myexpense', role: 'me', slugs, label: '', desc: '', href: '/a/expense', rank: 1.5 });
const groups: Surface = { key: 'groups', id: 'groups', role: 'me', label: '', desc: '', href: '/g', rank: 2 };
const adm = (id: 'gs' | 'attend' | 'expense', slug: string, orgName = slug.toUpperCase()): Surface => ({
  key: `${id}:${slug}`,
  id,
  role: 'admin',
  slug,
  orgName,
  label: '',
  desc: '',
  href: id === 'gs' ? `/o/${slug}` : `/o/${slug}/${id}`,
  rank: 3,
});
const platform: Surface = { key: 'platform', id: 'platform', role: 'platform', label: '', desc: '', href: '/platform', rank: 5 };
const unclaimed: Surface = { key: 'unclaimed', id: 'unclaimed', role: 'platform', slug: 'unclaimed', label: '', desc: '', href: '/o/unclaimed/groups', rank: 5.1 };

test('P1 只打卡的外籍員工：沒有開關、一個工具（個人側整列不渲染）', () => {
  const g = groupSurfaces([punch('a')]);
  assert.equal(hasRoleToggle(g), false);
  assert.equal(barState(g, 'me'), 'c');
  assert.deepEqual(itemsOf(g, 'admin'), []);
});

test('P2 只在群組的外部成員：沒有開關、沒有任何管理項目', () => {
  const g = groupSurfaces([groups]);
  assert.equal(hasRoleToggle(g), false);
  assert.equal(barState(g, 'me'), 'c');
  assert.equal(g.admin.length + g.platform.length, 0);
});

test('P3 員工＋公司開報帳：沒有開關、工具按鈕有 ▾', () => {
  const g = groupSurfaces([punch('a'), myexp('a')]);
  assert.equal(hasRoleToggle(g), false);
  assert.equal(barState(g, 'me'), 'b');
});

test('P4 老闆＋員工＋群組成員：有開關', () => {
  const g = groupSurfaces([punch('a'), myexp('a'), groups, adm('gs', 'a'), adm('attend', 'a'), adm('expense', 'a')]);
  assert.equal(hasRoleToggle(g), true);
  assert.equal(barState(g, 'me'), 'a');
  assert.equal(barState(g, 'admin'), 'a');
  assert.equal(multiOrg(g), false);
});

test('P5 只管考勤的會計（非員工）：沒有開關、單一工具、不是多家公司', () => {
  const g = groupSurfaces([adm('attend', 'a')]);
  assert.equal(hasRoleToggle(g), false);
  assert.equal(barState(g, 'admin'), 'c');
  assert.equal(multiOrg(g), false);
  assert.deepEqual(g.admin[0].items.map((s) => s.id), ['attend']);
});

test('P6 只管 A 考勤、又是 B 員工：有開關；切到管理不會假裝是同一家（退回第一個）', () => {
  const g = groupSurfaces([punch('b'), adm('attend', 'a')]);
  assert.equal(hasRoleToggle(g), true);
  // B 的打卡 → A 的考勤：公司不同，同工具對應不成立，退到管理側第一個（也就是 A 考勤）
  assert.equal(resolveRoleJump(g, 'admin', 'punch')?.key, 'attend:a');
  // 反過來：A 考勤 → 個人：打卡在 B，公司不同，退到個人側第一個（打卡）
  assert.equal(resolveRoleJump(g, 'me', 'attend:a')?.key, 'punch');
});

test('P7 管 A（全開）與 B（只報帳）＋平台擁有者：多家公司、選單三段', () => {
  const g = groupSurfaces([adm('gs', 'a'), adm('attend', 'a'), adm('expense', 'a'), adm('expense', 'b'), platform, unclaimed]);
  assert.equal(multiOrg(g), true);
  assert.deepEqual(g.admin.map((o) => [o.slug, o.items.map((s) => s.id)]), [
    ['a', ['gs', 'attend', 'expense']],
    ['b', ['expense']],
  ]);
  assert.deepEqual(g.platform.map((s) => s.key), ['platform', 'unclaimed']);
  assert.equal(hasRoleToggle(g), false); // 沒有個人側
  assert.equal(barState(g, 'admin'), 'b');
});

test('同工具同公司優先：打卡 → 考勤、報帳 ↔ 報帳、群組 → 群組助理', () => {
  const g = groupSurfaces([punch('a'), myexp('a'), groups, adm('gs', 'a'), adm('attend', 'a'), adm('expense', 'a')]);
  assert.equal(resolveRoleJump(g, 'admin', 'punch')?.key, 'attend:a');
  assert.equal(resolveRoleJump(g, 'admin', 'myexpense')?.key, 'expense:a');
  assert.equal(resolveRoleJump(g, 'me', 'expense:a')?.key, 'myexpense');
  assert.equal(resolveRoleJump(g, 'admin', 'groups')?.key, 'gs:a');
  assert.equal(resolveRoleJump(g, 'me', 'gs:a')?.key, 'groups');
});

test('兩家都是員工的老闆：從 B 的考勤切到個人，會找到有 B 的打卡', () => {
  const g = groupSurfaces([punch('a', 'b'), adm('attend', 'a'), adm('attend', 'b')]);
  assert.equal(resolveRoleJump(g, 'me', 'attend:b')?.key, 'punch');
  assert.equal(resolveRoleJump(g, 'admin', 'punch')?.key, 'attend:a'); // 兩家都對得上，取清單順序第一家
});

test('沒有同工具的另一邊 → 上次用的 → 第一個', () => {
  const g = groupSurfaces([groups, adm('attend', 'a'), adm('expense', 'a')]);
  assert.equal(resolveRoleJump(g, 'admin', 'groups', 'expense:a')?.key, 'expense:a');
  assert.equal(resolveRoleJump(g, 'admin', 'groups', 'gone:x')?.key, 'attend:a');
  assert.equal(resolveRoleJump(g, 'admin', null, null)?.key, 'attend:a');
});

test('點已經在的角色 → 原地不動；目標角色沒東西 → null', () => {
  const g = groupSurfaces([punch('a'), adm('attend', 'a'), adm('gs', 'a')]);
  assert.equal(resolveRoleJump(g, 'admin', 'attend:a', 'gs:a')?.key, 'attend:a');
  assert.equal(resolveRoleJump(groupSurfaces([adm('attend', 'a')]), 'me', 'attend:a'), null);
});

test('平台擁有者站在清單外的公司：補一段、算多家公司（F4）', () => {
  const g = groupSurfaces([adm('gs', 'main', '主公司'), platform], { slug: 'acme', name: '頂好餐飲', id: 'expense' });
  assert.deepEqual(g.admin.map((o) => o.slug), ['main', 'acme']);
  const acme = g.admin[1];
  assert.equal(acme.injected, true);
  assert.equal(acme.name, '頂好餐飲');
  assert.equal(acme.items[0].href, '/o/acme/expense');
  assert.equal(multiOrg(g), true);
});

test('只管一家但站在自己公司：不補、不算多家', () => {
  const g = groupSurfaces([adm('attend', 'a')], { slug: 'a', name: 'A', id: 'attend' });
  assert.equal(g.admin.length, 1);
  assert.equal(multiOrg(g), false);
});

test('未認領的群歸平台段，不會長出一家叫「未認領」的公司（F42）', () => {
  const g = groupSurfaces([adm('gs', 'main'), platform, unclaimed], { slug: 'unclaimed', name: '未認領', id: 'gs' });
  assert.deepEqual(g.admin.map((o) => o.slug), ['main']);
  assert.ok(g.platform.some((s) => s.key === 'unclaimed'));
});

// ── /go/<key> 的目的地（T3）──
import { goTarget } from '../src/org/surface-groups';
const noLast = () => undefined;

test('/go：只接受清單裡有的 key；只有群組身分的人打別人的後台 → null（回落地頁 /g）', () => {
  const list = [groups];
  assert.equal(goTarget(list, 'attend:x', null, noLast), null);
  assert.equal(goTarget(list, 'groups', null, noLast)?.href, '/g');
});

test('/go/@admin：從打卡切過去同公司考勤；/go/@me 沒有個人側 → null', () => {
  const list = [punch('a'), adm('gs', 'a'), adm('attend', 'a')];
  assert.equal(goTarget(list, '@admin', 'punch', noLast)?.key, 'attend:a');
  assert.equal(goTarget([adm('attend', 'a')], '@me', 'attend:a', noLast), null);
});

test('/go/@admin：沒有 from 時用該角色上次用的 cookie', () => {
  const list = [groups, adm('gs', 'a'), adm('attend', 'a')];
  assert.equal(goTarget(list, '@admin', null, (side) => (side === 'admin' ? 'attend:a' : undefined))?.key, 'attend:a');
});

// ── T1／T2 審查補測 ──
test('平台擁有者站在清單內、但該公司沒開這個工具的頁：補進那一家，不另開一段', () => {
  const g = groupSurfaces([adm('expense', 'acme', '頂好')], { slug: 'acme', name: '頂好', id: 'attend' });
  assert.equal(g.admin.length, 1);
  assert.deepEqual(g.admin[0].items.map((s) => s.id), ['expense', 'attend']);
  assert.equal(g.admin[0].injected, true);
  assert.equal(multiOrg(g), true); // 補過的公司就帶公司名，免得看不出在哪家
});

test('有公司但查不到公司（slugs 空陣列）不算同一家：退到上次用的', () => {
  const g = groupSurfaces([punch(), adm('attend', 'a'), adm('gs', 'a')]);
  assert.equal(resolveRoleJump(g, 'admin', 'punch', 'gs:a')?.key, 'gs:a');
});

test('平台擁有者有個人側、管理側只有平台：有開關；從平台切到個人退到第一個', () => {
  const g = groupSurfaces([groups, platform]);
  assert.equal(hasRoleToggle(g), true);
  assert.equal(barState(g, 'admin'), 'a');
  assert.equal(resolveRoleJump(g, 'me', 'platform')?.key, 'groups');
});

test('三家公司：分段照清單順序（surfaces 已改成公司優先排序）', () => {
  const list = [adm('gs', 'a'), adm('attend', 'a'), adm('attend', 'b'), adm('gs', 'c')];
  assert.deepEqual(groupSurfaces(list).admin.map((o) => o.slug), ['a', 'b', 'c']);
});
