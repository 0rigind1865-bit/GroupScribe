import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { isPlatformOwner } from '@/org/orgs';
import { monthKey } from '@/core/quota';
import { PLAN_LIMITS } from '@/org/plans';
import { IdentityBar } from '@/app/ui/identity-bar';
import { surfaces } from '@/org/surfaces';
import { groupSurfaces } from '@/org/surface-groups';
import { t } from '@/attend/i18n';
import { Banner } from '@/app/ui/banner';

export const dynamic = 'force-dynamic';

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
  const db = getDb();

  const [{ data: orgsRaw }, { data: groups }, { data: usage }] = await Promise.all([
    db
      .from('orgs')
      .select('id, slug, name, created_at, org_settings(plan, max_groups, monthly_ai_calls, modules, paid_until), org_members(display_name, role)')
      .order('created_at'),
    db.from('groups').select('group_id, name, org_id, left_at, updated_at'),
    db.from('org_usage').select('org_id, calls').eq('month', monthKey()),
  ]);
  const orgs = (orgsRaw ?? []) as unknown as OrgRow[];
  const unclaimed = orgs.find((o) => o.slug === 'unclaimed');
  const tenants = orgs.filter((o) => o.slug !== 'unclaimed');
  const live = (groups ?? []).filter((g: any) => !g.left_at);
  const groupCount = (orgId: string) => live.filter((g: any) => g.org_id === orgId).length;
  const callsOf = new Map((usage ?? []).map((u: any) => [u.org_id, u.calls as number]));
  const waiting = unclaimed ? live.filter((g: any) => g.org_id === unclaimed.id) : [];
  const totalCalls = [...callsOf.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="pb-10">
      {/* 平台頁也是「管理」那一邊：深色身分列，工具按鈕「平台管理 ▾」可切到未認領的群與各家公司（畫布 IdPlatform） */}
      <header className="shell-bar md:sticky md:top-0 md:z-30">
        <IdentityBar groups={groupSurfaces((await surfaces()).list)} currentKey="platform" side="admin" tt={(k, p) => t('zh-TW', k, p)} brand />
      </header>
      <main className="page space-y-8">
        <div>
          {/* 襯線大標同管理端各頁（.nav-gap h1）；平台頁不在殼裡，直接寫 */}
          <h1 className="text-[30px] leading-tight font-black tracking-[1px] md:text-[42px]" style={{ fontFamily: 'var(--font-title)' }}>
            平台管理
          </h1>
          <p className="text-sm text-gray-500">只有平台擁有者看得到這一頁。</p>
        </div>
        {ok && <Banner tone="ok">方案已更新。</Banner>}
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
              <a className="btn btn-sm" href="/o/unclaimed/groups">
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
              const mods = st.modules ?? ['attend'];
              const cap = st.monthly_ai_calls ?? null;
              const owners = o.org_members.map((m) => m.display_name ?? '（未命名）').join('、') || '（沒有管理員）';
              return (
                <div key={o.id} className="card space-y-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-base font-semibold">{o.name}</span>
                    <span className="text-xs text-gray-500">/{o.slug}</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-px text-[11px] font-medium text-emerald-900">
                      {PLAN_LIMITS[plan]?.label ?? plan}
                    </span>
                    <span className="ml-auto text-xs text-gray-500">建立於 {fmt(o.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    群組 {groupCount(o.id)} / {st.max_groups ?? 1}・本月 AI {callsOf.get(o.id) ?? 0}
                    {cap !== null ? ` / ${cap}` : '（不限）'}・管理員：{owners}
                    {st.paid_until ? `・付費到 ${st.paid_until}` : ''}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {mods.includes('gs') && (
                      <a className="btn btn-sm" href={`/o/${o.slug}`}>
                        群組助理 →
                      </a>
                    )}
                    {mods.includes('attend') && (
                      <a className="btn btn-sm" href={`/o/${o.slug}/attend`}>
                        考勤 →
                      </a>
                    )}
                    {mods.includes('expense') && (
                      <a className="btn btn-sm" href={`/o/${o.slug}/expense`}>
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
