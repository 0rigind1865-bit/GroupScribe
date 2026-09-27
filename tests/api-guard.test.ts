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

// ── 成員頁不得透露後台（權限即可見性，2026-09-27 F5）──
// /g 原本在 ADMIN_LINE_USER_ID 未設時，對每一位群組成員（含別家公司的人）顯示
// 「我是管理者，要開啟免密碼進後台」與他的 LINE userId。成員頁只該有群組整理。
test('成員頁（src/app/g）不出現後台入口、環境變數名或 LINE userId', () => {
  const G = join(ROOT, 'src/app/g');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
    });
  const bad: string[] = [];
  for (const f of files(G)) {
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (/^\s*(\/\/|\*|\{\/\*)/.test(line)) return; // 註解可以提
        if (/後台|ADMIN_LINE_USER_ID|\.env\.local|=\{uid\}/.test(line)) bad.push(`${f.slice(ROOT.length + 1)}:${i + 1}  ${line.trim()}`);
      });
  }
  assert.deepEqual(bad, [], `成員頁不該出現這些：\n${bad.join('\n')}`);
});

// ── 分頁標題不得洩漏公司名（T10 第 1 輪 critical）──
test('o/[org]/layout.tsx 的 generateMetadata 先過 visibleModules 才放公司名', () => {
  const src = readFileSync(join(ROOT, 'src/app/o/[org]/layout.tsx'), 'utf8');
  const i = src.indexOf('export async function generateMetadata');
  assert.ok(i >= 0, '找不到 generateMetadata');
  const body = src.slice(i, src.indexOf('\n}\n', i));
  assert.match(body, /visibleModules\(/, 'generateMetadata 沒有先驗權限——非成員會從分頁標題看到公司名');
  assert.doesNotMatch(body, /orgBySlug\(/, '不要直接用 orgBySlug 取名字');
});

// ── 全站入口不得寫「打卡」（T10 第 1 輪：群組外部成員第一眼就看到工具名）──
test('首頁 / 的 LIFF 開機畫面品牌字是「群記」，不是員工端的 APP_TITLE', () => {
  const src = readFileSync(join(ROOT, 'src/app/page.tsx'), 'utf8');
  const boot = src.match(/<AttendLiffBoot[^>]*\/>/g) ?? [];
  assert.ok(boot.length > 0);
  for (const b of boot) assert.match(b, /brand="群記"/, b);
});

// ── T10 第 2 輪 ──
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

test('只有首頁選單改「下次打開直接進來」：/go 只在 home=1 時寫 gs_surface，首頁選單列帶 home=1', () => {
  const route = read('src/app/go/[key]/route.ts');
  assert.match(route, /if \(home\) res\.cookies\.set\('gs_surface'/, '抽屜、角色開關不該改首頁預設');
  assert.equal(route.match(/'gs_surface'/g)?.length, 1);
  assert.match(read('src/app/page.tsx'), /\/go\/\$\{encodeURIComponent\(s\.key\)\}\?home=1/);
});

test('三個模組內殼用 moduleGate：成員打到沒開的模組轉到自己有的，不是英文 404', () => {
  for (const f of ['src/app/o/[org]/(admin)/layout.tsx', 'src/app/o/[org]/attend/layout.tsx', 'src/app/o/[org]/expense/layout.tsx']) {
    const src = read(f);
    assert.match(src, /await moduleGate\(slug, '(gs|attend|expense)'\)/, f);
    assert.doesNotMatch(src, /modules\.some\(/, `${f} 又自己判斷模組了`);
  }
  assert.ok(statSync(join(ROOT, 'src/app/not-found.tsx')).isFile(), '全站 404 頁不見了');
});

test('未認領的群不畫群組助理的分頁；更多頁與成員頁的字與身分列一致', () => {
  assert.match(read('src/app/o/[org]/shell-header.tsx'), /navSlot=\{slug === 'unclaimed' \? undefined/);
  assert.match(read('src/app/o/[org]/(admin)/layout.tsx'), /slug !== 'unclaimed' && \(\s*<Suspense/);
  assert.doesNotMatch(read('src/app/o/[org]/more-list.tsx'), /看全部身分/, '更多頁要依有沒有角色開關選字');
  assert.match(read('src/app/g/liff-init.tsx'), /brand: '群記'/);
  assert.match(read('src/app/a/expense/page.tsx'), /<AttendLiffBoot[^>]*brand=\{tt\('TOOL_EXPENSE'\)\}/);
});

// ── T10 第 3 輪 ──
test('停用的員工不給打卡面向（除非是唯一身分）；/a/expense 沒身分走全站 404', () => {
  const src = read('src/org/surfaces.ts');
  assert.match(src, /e\.status !== 'disabled'/, '停用的員工又拿到打卡了——只管考勤的會計會多一個通往「帳號已被停用」的個人開關');
  assert.match(src, /if \(!list\.length && employees\.length\)/, '只剩停用一種身分的人要落回 /a 看「已停用」');
  assert.match(read('src/app/a/expense/page.tsx'), /if \(!me\) notFound\(\);/);
});

// ── 不整頁重載＋收件匣選取全部 ──
test('收件匣「選取全部」只在本公司的群裡動手（all=1 不靠 ids，範圍綁 access.groupIds）', () => {
  const src = read('src/app/api/batch/route.ts');
  const i = src.indexOf("form.get('all') === '1'");
  assert.ok(i > 0, '找不到 all=1 分支');
  const body = src.slice(i, src.indexOf('if (!ids.length)', i));
  assert.match(body, /if \(g && !access\.groupIds\.includes\(g\)\) return redirectTo\(back\);/, 'group 不是本公司的群要什麼都不做，不能擴大成整家公司');
  assert.match(body, /\.in\('group_id', scope\)/);
  assert.match(body, /\.eq\('needs_confirmation', true\)/, '全部＝待確認的全部，不能動到已確認的');
  assert.match(body, /\.lte\('updated_at', cutoff\)/, '畫面算出 N 筆之後才進來、或被 AI 改過的不能算進「全部」');
});

test('全站換頁元件掛在 root layout；伺服器端點（/api、/go）一律整頁、不接手', () => {
  assert.match(read('src/app/layout.tsx'), /<SoftNav \/>/);
  // 換頁完成要重建內容區：不重建的話只換 ?note= 或送出回同一頁時，下拉選單與全選狀態會沿用上一筆（會寫錯資料）
  assert.match(read('src/app/layout.tsx'), /<Remount>\{children\}<\/Remount>/);
  assert.doesNotMatch(read('src/app/ui/soft-nav.tsx'), /\.reset\(\)/, '不要用 form.reset()：<select> 會被打回第一次渲染的值');
  const src = read('src/app/ui/soft-nav.tsx');
  assert.match(src, /const SERVER = \/\^\\\/\(api\|go\|_next\)/);
  assert.match(src, /e\.defaultPrevented/, '要讓身分列「關閉」的收合腳本與 React 元件先處理');
  // f.action／f.target 會被 name="action" 的按鈕蓋掉（批次列、報帳、員工管理），一律讀 HTML 屬性
  assert.doesNotMatch(src, /\bf\.(action|target|method)\b/, '不要讀 form 的 IDL 屬性');
  // 內容區跟著網址重建（含上一頁／下一頁），不只靠換頁完成事件
  assert.match(src, /key=\{`\$\{path\}\?\$\{q\}\|\$\{n\}`\}/);
});

test('頁面裡不放 <script dangerouslySetInnerHTML>：站內換頁進來時 React 插入的 script 不會執行（只有 root layout 可以）', () => {
  const bad: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(join(ROOT, dir))) {
      const p = join(dir, f);
      if (statSync(join(ROOT, p)).isDirectory()) walk(p);
      else if (p.endsWith('.tsx') && p !== join('src', 'app', 'layout.tsx') && read(p).includes('dangerouslySetInnerHTML')) bad.push(p);
    }
  };
  walk(join('src', 'app'));
  assert.deepEqual(bad, []);
});
