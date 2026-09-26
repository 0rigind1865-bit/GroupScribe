import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { dbConfigured } from '@/db';
import { isGroupMember, liffId, liffUser } from '@/core/liff';
import { liffStatePath, parseLiffEntry } from '@/core/funnel';
import { surfaces, type Surface } from '@/org/surfaces';
import { BrandBar } from '@/app/ui/intro';
import { AttendLiffBoot, LangMenu } from './a/shell';
import { groupSurfaces, hasRoleToggle, homeMode } from '@/org/surface-groups';
import { TOOL_ICON, toolDesc, toolName } from '@/org/surface-meta';
import { locale, t, type MsgKey } from '@/attend/i18n';

export const dynamic = 'force-dynamic';

// 全站唯一入口：所有人都從同一個 LINE 連結進來，這裡依身分決定去哪。
//
//   只有一種身分 → 直接進去
//   兩種以上     → 記得上次選的就直接進去；第一次顯示選單讓他自己選
//   ?menu=1      → 一律顯示選單，連只有一種身分的人也是（身分列最底的「看全部身分」會來這裡，F6）
//   沒有身分     → 還沒用 LINE 登入就先跑 LIFF 開機；登入了還是沒有，就說明並給建立組織的入口
//
// 原本是系統「猜」：有員工身分就一律先進打卡。老闆同時是員工的話，每次點開都先跑到打卡頁，
// 而頁首那排切換膠囊不顯眼，很多人不知道還有別的頁面（principles.md：別讓我想）。
export default async function Root({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!dbConfigured()) redirect('/login');

  const uid = await liffUser();
  const sp = await searchParams;
  // LIFF endpoint 設在 / 時，觸點連結的 ?g=／?src=（或包在 liff.state 裡）會先到這裡；
  // 下面的 redirect 會丟掉 query，所以單群深連結要先處理（L1）
  // LIFF 深連結（/o/acme/inbox 這種）：已登入的人不跑 liff.init，路徑要自己從 liff.state 拆出來，
  // 不然會被下面的「上次用的身分」帶走。沒登入的人交給 LiffInit，liff.init 會自己轉過去。
  const dest = uid ? liffStatePath(sp) : null;
  if (dest) redirect(dest);
  const entry = parseLiffEntry(sp);
  if (uid && entry.g && (await isGroupMember(entry.g, uid)))
    redirect(`/g/${encodeURIComponent(entry.g)}${entry.src ? `?src=${entry.src}` : ''}`);
  const { list } = await surfaces();
  const menu = typeof sp.menu === 'string';
  const last = (await cookies()).get('gs_surface')?.value;
  const hit = list.find((s) => s.key === last);
  const mode = homeMode(list.length, !!uid, menu, !!hit);
  const loc = await locale();
  const tt = (key: MsgKey, params?: Record<string, string | number>) => t(loc, key, params);

  if (mode === 'redirect') redirect((list.length === 1 ? list[0] : hit!).href);
  // 開機畫面走員工端語系：越南籍員工第一眼不該是中文（審查 F44）
  if (mode === 'boot') return <AttendLiffBoot liffId={liffId()} tt={tt} brand="群記" />;

  if (mode === 'none')
    // 沒有任何身分：中性文案，不對可能是協力廠商的人講打卡與管理員（審查 F52）
    return (
      // 拿到加入碼的新員工也會落到這裡：給「輸入加入碼」主鈕與語言地球（T10 第 2 輪）
      <div className="mx-auto max-w-md pb-8">
        <BrandBar link={false} right={<LangMenu loc={loc} back="/" />} />
        <main className="px-6 pt-4 text-center">
          <p className="text-sm text-gray-500">{tt('HOME_NONE')}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <a className="btn-primary inline-block" href="/a/join">
              {tt('ENTER_CODE')}
            </a>
            <a className="btn inline-block" href="/start">
              {tt('HOME_CREATE_ORG')}
            </a>
          </div>
        </main>
      </div>
    );

  // 選單（畫布 IdHome）：個人一段（淺色）、每家公司一段（深色段頭）、平台一段
  const g = groupSurfaces(list);
  const toggle = hasRoleToggle(g);
  const row = (s: Surface) => (
    // home=1：只有在首頁選單選的才改「下次打開直接進來」；身分列的抽屜是臨時切換（T10 第 2 輪）
    <a key={s.key} href={`/go/${encodeURIComponent(s.key)}?home=1`} className="id-row">
      <span className="id-row-tile">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {TOOL_ICON[s.id]}
        </svg>
      </span>
      <span className="id-row-text">
        <span className="id-row-name">{toolName(s.id, tt)}</span>
        <span className="id-row-desc">{toolDesc(s.id, tt)}</span>
      </span>
      {menu && s.key === last && <span className="home-last">{tt('LAST_USED')}</span>}
    </a>
  );
  const section = (key: string, title: string, items: Surface[], dark: boolean) => (
    <section key={key}>
      <h2 className={dark ? 'home-sec home-sec--dark' : 'home-sec'}>{title}</h2>
      <div className={dark ? 'home-card home-card--dark' : 'home-card'}>{items.map(row)}</div>
    </section>
  );

  return (
    <div className="mx-auto max-w-md pb-8">
      <BrandBar link={false} right={<LangMenu loc={loc} back="/?menu=1" />} />
      <main className="px-4">
        <h1 className="mt-2 text-[30px] leading-tight font-black tracking-[1px]" style={{ fontFamily: 'var(--font-title)' }}>
          {tt('HOME_TITLE')}
        </h1>
        <p className="mt-1 mb-5 text-sm text-gray-600">
          {tt('HOME_HINT')}
          {/* 只有一個工具的人沒有換法可說（他的頁面沒有 ▾，T10 第 1 輪）；兩句之間留空白給拉丁語系 */}
          {list.length > 1 && ' '}
          {list.length > 1 && (toggle ? tt('HOME_HINT_TOGGLE', { me: tt('ROLE_ME'), admin: tt('ROLE_ADMIN') }) : tt('HOME_HINT_TOOL'))}
        </p>
        <div className="space-y-5">
          {g.me.length > 0 && section('me', toggle ? tt('ROLE_ME') : tt('YOUR_TOOLS'), g.me, false)}
          {g.admin.map((o) => section(`org:${o.slug}`, `${tt('ROLE_ADMIN')} · ${o.name}`, o.items, true))}
          {g.platform.length > 0 && section('platform', '平台', g.platform, true)}
        </div>
      </main>
    </div>
  );
}
