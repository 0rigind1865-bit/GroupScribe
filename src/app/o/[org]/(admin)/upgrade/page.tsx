import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { orgBySlug, orgSettings } from '@/org/orgs';
import { Banner } from '@/app/ui/banner';
import { orgAiBudget } from '@/core/quota';

export const dynamic = 'force-dynamic';

// 方案頁：認領第 N+1 個群時會被導來這裡。定價依商業計劃第 4 節（Free／Starter 690／Team 2,190）。
// ponytail: 線上付款（PAYUNi）尚未串接——按鈕先開信件，升級由平台擁有者手動改 org_settings；
// PAYUNi 商店開通後把「聯絡升級」換成結帳頁（整合式支付頁＋Token 約定扣款）
const PLANS = [
  { id: 'free', name: 'Free', price: '免費', groups: 1, desc: '1 個群、成員不限、每月 1,500 次 AI 呼叫' },
  { id: 'starter', name: 'Starter', price: 'NT$690 / 月', groups: 3, desc: '3 個群、每月 6,000 次 AI 呼叫、每日提醒' },
  { id: 'team', name: 'Team', price: 'NT$2,190 / 月', groups: 10, desc: '10 個群、每月 20,000 次 AI 呼叫、考勤模組、優先支援' },
];
const CONTACT = 'mailto:0rigin.d.1865@gmail.com?subject=GroupScribe%20升級方案';

export default async function UpgradePage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ limit?: string }>;
}) {
  const { org: slug } = await params;
  const { limit } = await searchParams;
  const org = await orgBySlug(slug);
  if (!org) notFound();
  const st = await orgSettings(org.id);
  const plan = String(st.plan ?? 'free');
  const max = Number(st.max_groups ?? 1);
  const { count } = await getDb().from('groups').select('group_id', { count: 'exact', head: true }).eq('org_id', org.id).is('left_at', null).not('group_id', 'like', 'dm:%');
  const used = count ?? 0;
  const ai = await orgAiBudget(org.id, true);

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-5">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">方案</h1>
      <p className="mb-4 text-sm text-gray-500">
        目前：<strong>{PLANS.find((p) => p.id === plan)?.name ?? plan}</strong> · 已認領 {used} / {max} 個群 · 本月 AI 呼叫 {ai.used}
        {ai.cap !== null ? ` / ${ai.cap}` : ''} 次
      </p>
      {ai.cap !== null && ai.used >= ai.cap && (
        <Banner tone="err">本月 AI 額度已用完：訊息會照常保存，但不再自動整理、問答與解析檔案，下個月 1 號恢復。升級可立即提高額度。</Banner>
      )}
      {limit && <Banner tone="warn">這個方案的群組數已用滿。升級後回到群裡再點一次認領連結即可。</Banner>}
      <div className="grid gap-3 md:grid-cols-3">
        {PLANS.map((p) => {
          const current = p.id === plan;
          return (
            <div key={p.id} className={`card flex flex-col ${current ? 'border-emerald-600' : ''}`}>
              <p className="text-xs font-medium text-gray-500">{p.name}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{p.price}</p>
              <p className="mt-2 flex-1 text-sm text-gray-600">{p.desc}</p>
              {current ? (
                <span className="btn mt-4 w-full cursor-default opacity-60">目前方案</span>
              ) : p.groups > max ? (
                <a className="btn-primary mt-4 w-full" href={CONTACT}>
                  聯絡升級
                </a>
              ) : (
                <span className="btn mt-4 w-full cursor-default opacity-60">—</span>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-gray-500">線上付款即將開通；目前升級請來信，我們會在一個工作天內開通並提供付款方式。</p>
    </main>
  );
}
