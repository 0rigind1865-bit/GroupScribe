// 身分列：七種角色（docs/identity-switcher-plan.md 2.4）渲染出來的東西對不對、有沒有洩漏不該看的字
import './react-global';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
// @ts-expect-error 沒裝 @types/react-dom（不為測試加依賴，同 onboarding.test.ts）
import { renderToStaticMarkup } from 'react-dom/server';
import { IdentityBar, identityBarShown } from '../src/app/ui/identity-bar';
import { groupSurfaces, type Side } from '../src/org/surface-groups';
import { t, type Locale } from '../src/attend/i18n';
import type { Surface } from '../src/org/surfaces';

const tt = (loc: Locale) => (k: Parameters<typeof t>[1], p?: Record<string, string | number>) => t(loc, k, p);
const punch = (...slugs: string[]): Surface => ({ key: 'punch', id: 'punch', role: 'me', slugs, label: '打卡', desc: '', href: '/a', rank: 1 });
const myexp = (...slugs: string[]): Surface => ({ key: 'myexpense', id: 'myexpense', role: 'me', slugs, label: '報帳', desc: '', href: '/a/expense', rank: 1.5 });
const groups: Surface = { key: 'groups', id: 'groups', role: 'me', label: '群組', desc: '', href: '/g', rank: 2 };
const adm = (id: 'gs' | 'attend' | 'expense', slug: string, orgName: string): Surface => ({
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
const platform: Surface = { key: 'platform', id: 'platform', role: 'platform', label: '平台管理', desc: '', href: '/platform', rank: 5 };

function render(list: Surface[], currentKey: string, side: Side, loc: Locale = 'zh-TW', extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(IdentityBar, { groups: groupSurfaces(list), currentKey, side, tt: tt(loc), ...extra }));
}
const hasNone = (html: string, words: string[]) => words.filter((w) => html.includes(w));

test('P1 只打卡的外籍員工：身分列整列不渲染', () => {
  const list = [punch('a')];
  assert.equal(identityBarShown(groupSurfaces(list), 'me'), false);
  assert.equal(render(list, 'punch', 'me', 'vi'), '');
});

test('P2 只在群組的外部成員：整列不渲染，什麼管理字都沒有', () => {
  assert.equal(render([groups], 'groups', 'me'), '');
});

test('P3 員工＋報帳：沒有角色開關，工具按鈕有選單；看不到管理', () => {
  const html = render([punch('a'), myexp('a')], 'punch', 'me', 'vi');
  assert.ok(!html.includes('id-toggle'));
  assert.ok(html.includes('<details class="id-menu" data-no-swipe="">')); // 遮罩上滑動不換分頁（T10 第 2 輪）
  assert.ok(html.includes('Chấm công'));
  assert.deepEqual(hasNone(html, ['Quản lý', '管理', '考勤', '群組助理']), []);
});

test('P4 老闆＋員工＋群組成員：個人頁有開關，目前角色是 span、另一格連 /go/@admin 帶 from', () => {
  const list = [punch('a'), myexp('a'), groups, adm('gs', 'a', '頂好餐飲'), adm('attend', 'a', '頂好餐飲'), adm('expense', 'a', '頂好餐飲')];
  const html = render(list, 'punch', 'me', 'zh-TW', { dot: true });
  assert.match(html, /<span class="id-role" aria-current="page">.*個人<\/span>/);
  assert.ok(html.includes('href="/go/@admin?from=punch"'));
  assert.ok(html.includes('class="id-dot"'));
  // 個人頁的選單只列個人的工具
  assert.deepEqual(hasNone(html.slice(html.indexOf('id-panel')), ['群組助理', '考勤']), []);
});

test('P4 老闆在管理頁：深色、選單依公司分段、只管一家時按鈕不帶公司名', () => {
  const list = [punch('a'), adm('gs', 'a', '頂好餐飲'), adm('attend', 'a', '頂好餐飲')];
  const html = render(list, 'attend:a', 'admin');
  assert.ok(html.includes('id-bar--dark'));
  assert.ok(html.includes('管理 · 頂好餐飲'));
  assert.ok(!html.includes('id-tool-org'));
  assert.ok(html.includes('href="/go/@me?from=attend%3Aa"'));
});

test('P5 只管考勤的會計（非員工）：深色列、沒有開關、沒有選單、標題帶公司名；看不到群組助理／報帳／個人', () => {
  const html = render([adm('attend', 'a', '頂好餐飲')], 'attend:a', 'admin');
  assert.ok(html.includes('id-bar--dark'));
  assert.ok(!html.includes('id-toggle'));
  assert.ok(!html.includes('<details'));
  assert.ok(html.includes('id-tool--title'));
  assert.ok(html.includes('<span class="id-tool-org">頂好餐飲</span>'));
  assert.deepEqual(hasNone(html, ['群組助理', '報帳', '個人', '看全部身分']), []);
});

test('P6 只管 A 考勤、又是 B 員工：管理頁有開關、考勤沒有 ▾；看不到群組助理', () => {
  const html = render([punch('b'), adm('attend', 'a', '頂好餐飲')], 'attend:a', 'admin');
  assert.ok(html.includes('id-toggle'));
  assert.ok(!html.includes('<details'));
  assert.deepEqual(hasNone(html, ['群組助理']), []);
});

test('P7 管兩家公司＋平台：按鈕帶公司名、選單三段、有「看全部身分」', () => {
  const list = [adm('gs', 'a', '頂好餐飲'), adm('attend', 'a', '頂好餐飲'), adm('expense', 'b', '光明診所'), platform];
  const html = render(list, 'attend:a', 'admin');
  assert.ok(html.includes('<span class="id-tool-org">頂好餐飲</span>'));
  assert.ok(html.includes('管理 · 頂好餐飲') && html.includes('管理 · 光明診所') && html.includes('>平台<'));
  assert.ok(html.includes('href="/?menu=1"'));
});

test('所有連結只有 /go/…、目前頁（關閉）與 /?menu=1——不直連別的工具（routes 守門、F31）', () => {
  const list = [punch('a'), myexp('a'), groups, adm('gs', 'a', 'A'), adm('attend', 'a', 'A'), adm('expense', 'b', 'B'), platform];
  for (const [key, side] of [['punch', 'me'], ['attend:a', 'admin']] as const) {
    const html = render(list, key, side);
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    const cur = list.find((s) => s.key === key)!.href;
    const bad = hrefs.filter((h) => !h.startsWith('/go/') && h !== '/?menu=1' && h !== cur);
    assert.deepEqual(bad, [], key);
  }
});

test('無障礙：選單按鈕的 aria-label 說出工具名、角色開關是 nav、目前選單列有 aria-current', () => {
  const html = render([punch('a'), myexp('a'), adm('attend', 'a', 'A')], 'myexpense', 'me', 'zh-TW', { closeHref: '/a/expense?tab=list' });
  assert.ok(html.includes('<summary class="id-tool" aria-label="報帳, 切換工具">')); // 半形逗號：五語系共用（T10 第 2 輪）
  assert.ok(html.includes('<nav class="id-toggle" aria-label="切換角色">'));
  // 目前那列＝關閉、留在原頁（不經 /go/；補進來的 key 走 /go/ 會落到別家，T10 第 1 輪）
  assert.match(html, /<a class="id-row" href="\/a\/expense\?tab=list" aria-current="page">/);
  assert.ok(html.includes('<a class="id-close" href="/a/expense?tab=list">'));
});

test('琥珀小點給工具 key：點「管理」直達有待辦的工具，不走同工具對應（T10 第 1 輪）', () => {
  const list = [punch('a'), adm('gs', 'a', 'A'), adm('attend', 'a', 'A')];
  const html = render(list, 'punch', 'me', 'zh-TW', { dot: 'gs:a' });
  assert.ok(html.includes('href="/go/gs%3Aa?from=punch"')); // 帶 from：回程按「個人」回打卡（T10 第 2 輪）
  assert.ok(html.includes('role="img"'));
  assert.ok(!html.includes('/go/@admin'));
});

test('工具畫成純標題（沒有選單）時帶公司名；沒有角色開關時抽屜底部寫「看全部工具」（T10 第 1 輪）', () => {
  // P6：管理側只有 A 考勤 → 純標題，要看得到「A」
  assert.ok(render([punch('b'), adm('attend', 'a', '頂好')], 'attend:a', 'admin').includes('<span class="id-tool-org">頂好</span>'));
  // P3：沒有開關
  const html = render([punch('a'), myexp('a')], 'punch', 'me');
  assert.ok(html.includes('看全部工具') && !html.includes('看全部身分'));
});

test('五語系：角色名照語系（越南文 Tôi／Quản lý）', () => {
  const html = render([punch('a'), adm('attend', 'a', 'A')], 'punch', 'me', 'vi');
  assert.ok(html.includes('Tôi') && html.includes('Quản lý'));
});

// ── 員工端外殼：任何角色都恰好一顆語言地球（審查 F3）──
import { AttendHeader } from '../src/app/a/shell';

function shell(list: Surface[], loc: Locale = 'vi') {
  return renderToStaticMarkup(
    createElement(AttendHeader, {
      emp: { display_name: '阿明', dept: null, picture_url: null },
      loc,
      tt: tt(loc),
      back: '/a',
      groups: groupSurfaces(list),
    }),
  );
}

test('員工端外殼：七種角色都恰好一顆「切換語言」，單一工具時在姓名列、有身分列時在身分列', () => {
  const personas: Surface[][] = [
    [punch('a')], // P1
    [punch('a'), myexp('a')], // P3
    [punch('a'), myexp('a'), groups, adm('gs', 'a', 'A'), adm('attend', 'a', 'A')], // P4
    [punch('b'), adm('attend', 'a', 'A')], // P6
  ];
  for (const list of personas) {
    const html = shell(list);
    const n = html.split('aria-label="Đổi ngôn ngữ"').length - 1;
    assert.equal(n, 1, JSON.stringify(list.map((s) => s.key)));
  }
  // P1：沒有身分列
  assert.ok(!shell([punch('a')]).includes('id-bar'));
});

test('有角色開關時姓名下方寫公司名（P6：個人側的公司可能不是管理側那家，T10 第 2 輪）', () => {
  const html = renderToStaticMarkup(
    createElement(AttendHeader, { emp: { display_name: '阿明', dept: '外場', picture_url: null }, loc: 'zh-TW', tt: tt('zh-TW'), back: '/a', groups: groupSurfaces([punch('b'), adm('attend', 'a', 'A')]), org: '光明診所' }),
  );
  assert.ok(html.includes('光明診所 · 外場'));
});

// ── T10 第 3 輪 ──
test('平台擁有者站在這家沒開的工具：第二行標「未開通」、抽屜說明講清楚只有平台看得到', () => {
  const list = [adm('gs', 'a', '頂好'), adm('expense', 'b', '光明'), platform];
  const g = groupSurfaces(list, { slug: 'b', name: '光明', id: 'attend' });
  const html = renderToStaticMarkup(createElement(IdentityBar, { groups: g, currentKey: 'attend:b', side: 'admin', tt: tt('zh-TW') }));
  assert.ok(html.includes('光明 · 未開通'));
  assert.ok(html.includes('只有平台擁有者看得到'));
});

test('管理側的角色開關跟員工端同語系（roleTt），工具名仍是中文；沒給 closeHref 時「關閉」是空 href（留在原網址）', () => {
  const html = render([punch('a'), adm('attend', 'a', 'A'), adm('gs', 'a', 'A')], 'attend:a', 'admin', 'zh-TW', { roleTt: tt('vi') });
  assert.ok(html.includes('Tôi') && html.includes('Quản lý'));
  assert.ok(html.includes('考勤'));
  assert.ok(html.includes('<a class="id-close" href="">'));
});
