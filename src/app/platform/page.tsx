import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { isPlatformOwner } from '@/org/orgs';
import { monthKey } from '@/core/quota';
import { paidStatus, PLAN_LIMITS, REFERRAL } from '@/org/plans';
import { todayISO } from '@/core/date';
import { IdentityBar } from '@/app/ui/identity-bar';
import { surfaces } from '@/org/surfaces';
import { groupSurfaces } from '@/org/surface-groups';
import { enabledModuleIds } from '@/org/module-ids';
import { locale, t } from '@/attend/i18n';
import { Banner } from '@/app/ui/banner';

export const dynamic = 'force-dynamic';
export const metadata = { title: '平台管理' }; // 分頁標題「平台管理 · 群記」（T10 第 2 輪）

// 入口一律經 /go/<key>：與身分列同一條路，會記下「管理上次用的」（T10 第 2 輪）
const go = (key: string) => `/go/${encodeURIComponent(key)}`;

// 平台管理：只有平台擁有者看得到（其他人一律「找不到頁面」，不洩漏這頁存在）。
// 一頁看完：所有公司（方案、群組數、管理員、本月 AI 用量）、未認領的群；可直接改方案、進任一家後台。
function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : '—';
}

type OrgRow = {
  id: string;
  slug: string;
  name: string;
  created_at: string;
  org_settings: { plan?: string; max_groups?: number; monthly_ai_calls?: number | null; modules?: string[]; paid_until?: string | null } | null;
  org_members: { display_name: string | null; role: string }[];
};

export default async function PlatformPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  if (!(await isPlatformOwner())) notFound();
  const { ok, err } = await searchParams;
  const loc = await locale();
  const db = getDb();

  const [{ data: orgsRaw }, { data: groups }, { data: usage }, { data: refsRaw }, { data: credits }] = await Promise.all([
    db
      .from('orgs')
      .select('id, slug, name, created_at, org_settings(plan, max_groups, monthly_ai_calls, modules, paid_until), org_members(display_name, role)')
      .order('created_at'),
    db.from('groups').select('group_id, name, org_id, left_at, updated_at'),
    db.from('org_usage').select('org_id, calls').eq('month', monthKey()),
    // 推薦（migration 029）分開查：表或欄位還不存在時只是空的，不拖垮整頁
    db.from('referrals').select('referrer_org_id, referred_org_id, status'),
    db.from('org_settings').select('org_id, referral_credit_days').gt('referral_credit_days', 0),
  ]);
  const orgs = (orgsRaw ?? []) as unknown as OrgRow[];
  const unclaimed = orgs.find((o) => o.slug === 'unclaimed');
  const tenants = orgs.filter((o) => o.slug !== 'unclaimed');
  const live = (groups ?? []).filter((g: any) => !g.left_at);
  const groupCount = (orgId: string) => live.filter((g: any) => g.org_id === orgId).length;
  const callsOf = new Map((usage ?? []).map((u: any) => [u.org_id, u.calls as number]));
  const waiting = unclaimed ? live.filter((g: any) => g.org_id === unclaimed.id) : [];
  const totalCalls = [...callsOf.values()].reduce((a, b) => a + b, 0);
  const today = todayISO();
  const refs = ((refsRaw ?? []) as { referrer_org_id: string; referred_org_id: string; status: string }[]).filter((r) => r.status !== 'void');
  const creditOf = new Map((credits ?? []).map((c: any) => [c.org_id, c.referral_credit_days as number]));
  const nameOf = new Map(orgs.map((o) => [o.id, o.name]));

  return (
    <div className="pb-10">
      {/* 平台頁也是「管理」那一邊：深色身分列，工具按鈕「平台管理 ▾」可切到未認領的群與各家公司（畫布 IdPlatform） */}
      <header className="shell-bar md:sticky md:top-0 md:z-30">
        <IdentityBar groups={groupSurfaces((await surfaces()).list)} currentKey="platform" side="admin" tt={(k, p) => t('zh-TW', k, p)} roleTt={(k, p) => t(loc, k, p)} brand />
      </header>
      <main className="page space-y-8">
        <div>
          {/* 襯線大標同管理端各頁（.nav-gap h1）；平台頁不在殼裡，直接寫 */}
          <h1 className="text-[30px] leading-tight font-black tracking-[1px] md:text-[42px]" style={{ fontFamily: 'var(--font-title)' }}>
            平台管理
          </h1>
          <p className="text-sm text-gray-500">只有平台擁有者看得到這一頁。</p>
        </div>
        {ok === 'ref' ? (
          <Banner tone="ok">
            方案已更新。這家是被推薦來的、第一次付費：推薦獎勵已發放，雙方各 +{REFERRAL.rewardDays} 天
            （推薦人已領滿 {REFERRAL.maxRewards} 次的話只發給這家）。到期日已自動延長，請看下方。
          </Banner>
        ) : (
          ok && <Banner tone="ok">方案已更新。</Banner>
        )}
        {err && <Banner tone="err">更新失敗，請再試一次。</Banner>}

        <div className="grid grid-cols-3 gap-3">
          {[
            ['公司', tenants.length],
            ['使用中的群', live.length - waiting.length],
            ['本月 AI 呼叫', totalCalls],
          ].map(([k, v]) => (
            <div key={k} className="card">
              <span className="block text-xs font-medium text-gray-500">{k}</span>
              <span className="mt-1 block text-2xl font-semibold tabular-nums">{v}</span>
            </div>
          ))}
        </div>

        <section>
          <h2 className="mb-2 text-lg font-semibold tracking-tight">未認領的群（{waiting.length}）</h2>
          {waiting.length ? (
            <div className="card space-y-2">
              {waiting.map((g: any) => (
                <p key={g.group_id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{g.name ?? g.group_id}</span>
                  <span className="text-xs text-gray-500">{fmt(g.updated_at)} 進群</span>
                </p>
              ))}
              <a className="btn btn-sm" href={go('unclaimed')}>
                去移轉（指定給某家公司）
              </a>
            </div>
          ) : (
            <p className="text-sm text-gray-500">沒有。群記被邀進群後，管理員認領前會先出現在這裡，7 天沒人認領會自動退群。</p>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold tracking-tight">所有公司</h2>
          <div className="space-y-3">
            {tenants.map((o) => {
              const st = o.org_settings ?? {};
              const plan = (st.plan ?? 'free') as keyof typeof PLAN_LIMITS;
              // 與 surfaces() 同一規則：預設公司三個工具全開，其他照 org_settings.modules（T10 第 2 輪）
              const mods = o.slug === (process.env.DEFAULT_ORG_SLUG ?? 'main') ? ['gs', 'attend', 'expense'] : enabledModuleIds(st.modules);
              const cap = st.monthly_ai_calls ?? null;
              const owners = o.org_members.map((m) => m.display_name ?? '（未命名）').join('、') || '（沒有管理員）';
              const paid = paidStatus(plan, st.paid_until, today);
              return (
                <div key={o.id} className="card space-y-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-base font-semibold">{o.name}</span>
                    <span className="text-xs text-gray-500">/{o.slug}</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-px text-[11px] font-medium text-emerald-900">
                      {PLAN_LIMITS[plan]?.label ?? plan}
                    </span>
                    {/* 付費到期（plans.ts paidStatus）：寬限期內要追款，過了寬限期 AI 已自動暫停 */}
                    {paid.state === 'grace' && (
                      <span className="rounded-full bg-amber-100 px-2 py-px text-[11px] font-medium text-amber-900">逾期・{paid.lastDay} 後暫停</span>
                    )}
                    {paid.state === 'expired' && (
                      <span className="rounded-full bg-red-100 px-2 py-px text-[11px] font-medium text-red-800">已到期・AI 暫停中</span>
                    )}
                    <span className="ml-auto text-xs text-gray-500">建立於 {fmt(o.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    群組 {groupCount(o.id)} / {st.max_groups ?? 1}・本月 AI {callsOf.get(o.id) ?? 0}
                    {cap !== null ? ` / ${cap}` : '（不限）'}・管理員：{owners}
                    {st.paid_until ? `・付費到 ${st.paid_until}` : ''}
                  </p>
                  <ReferralLine orgId={o.id} refs={refs} credit={creditOf.get(o.id) ?? 0} nameOf={nameOf} />
                  <div className="flex flex-wrap items-center gap-2">
                    {mods.includes('gs') && (
                      <a className="btn btn-sm" href={go(`gs:${o.slug}`)}>
                        群組助理 →
                      </a>
                    )}
                    {mods.includes('attend') && (
                      <a className="btn btn-sm" href={go(`attend:${o.slug}`)}>
                        考勤 →
                      </a>
                    )}
                    {mods.includes('expense') && (
                      <a className="btn btn-sm" href={go(`expense:${o.slug}`)}>
                        報帳 →
                      </a>
                    )}
                    <form action="/api/platform/plan" method="post" className="ml-auto flex flex-wrap items-center gap-1.5">
                      <input type="hidden" name="org_id" value={o.id} />
                      <select className="input h-8 text-xs" name="plan" defaultValue={plan} aria-label="方案">
                        {Object.entries(PLAN_LIMITS).map(([id, p]) => (
                          <option key={id} value={id}>
                            {p.label}（{p.groups} 群）
                          </option>
                        ))}
                      </select>
                      <input className="input h-8 text-xs" type="date" name="paid_until" defaultValue={st.paid_until ?? ''} aria-label="付費到期日" />
                      <button className="btn btn-sm">改方案</button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

// 一行看完這家的推薦狀態：誰推薦它、它推薦了幾家、還有幾天沒折抵（沒有就不畫）
function ReferralLine({ orgId, refs, credit, nameOf }: { orgId: string; refs: { referrer_org_id: string; referred_org_id: string; status: string }[]; credit: number; nameOf: Map<string, string> }) {
  const by = refs.find((r) => r.referred_org_id === orgId);
  const mine = refs.filter((r) => r.referrer_org_id === orgId);
  const parts = [
    by && `由「${nameOf.get(by.referrer_org_id) ?? '（已刪除）'}」推薦${by.status === 'rewarded' ? '（已付費、獎勵已發）' : '（付費時雙方各 +' + REFERRAL.rewardDays + ' 天）'}`,
    mine.length > 0 && `推薦了 ${mine.length} 家（${mine.filter((r) => r.status === 'rewarded').length} 家已付費）`,
    credit > 0 && `待折抵 ${credit} 天（改成付費方案並填到期日時自動加上）`,
  ].filter(Boolean);
  if (!parts.length) return null;
  return <p className="text-xs text-gray-500">推薦：{parts.join('・')}</p>;
}
