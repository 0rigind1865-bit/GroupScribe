import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { orgSettings, requireModule } from '@/org/orgs';
import { Banner } from '@/app/ui/banner';
import { orgAiBudget } from '@/core/quota';
import { fmtDate } from '@/core/date';
import { isPlanId, PLAN_LIMITS, planLines, planPrice, PUBLIC_PLANS } from '@/org/plans';
import { digestSeats } from '@/org/digest-seats';
import { pendingReferredBonus, REFERRAL } from '@/org/referral';
import { oh } from '@/org/href';

export const dynamic = 'force-dynamic';

// 方案頁：認領第 N+1 個群時會被導來這裡。方案內容與價格全部來自 src/org/plans.ts（商業計劃第 4 節）。
// 考勤不屬於任何方案：計劃定案為加購、不進主定價頁——Team 卡片原本寫「考勤模組」，但升級並不會打開考勤。
// ponytail: 線上付款（PAYUNi）尚未串接——按鈕先開信件，升級由平台擁有者手動改 org_settings；
// PAYUNi 商店開通後把「聯絡升級」換成結帳頁（整合式支付頁＋Token 約定扣款）
const CONTACT = 'mailto:0rigin.d.1865@gmail.com?subject=GroupScribe%20升級方案';
const CONTACT_ATTEND = 'mailto:0rigin.d.1865@gmail.com?subject=GroupScribe%20考勤加購';
const CONTACT_RENEW = 'mailto:0rigin.d.1865@gmail.com?subject=GroupScribe%20續約';

export default async function UpgradePage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ limit?: string }>;
}) {
  const { org: slug } = await params;
  const { limit } = await searchParams;
  const { org } = await requireModule(slug, 'gs');
  if (!org) notFound();
  const st = await orgSettings(org.id);
  const plan = String(st.plan ?? 'free');
  const max = Number(st.max_groups ?? 1);
  const { count } = await getDb().from('groups').select('group_id', { count: 'exact', head: true }).eq('org_id', org.id).is('left_at', null).not('group_id', 'like', 'dm:%');
  const used = count ?? 0;
  const ai = await orgAiBudget(org.id, true);
  const seats = await digestSeats(org.id).catch(() => null);
  const referredBonus = await pendingReferredBonus(org.id).catch(() => false);
  const credit = Number(st.referral_credit_days ?? 0);

  return (
    <main className="page">
      <h1 className="mb-1">方案</h1>
      <p className="mb-4 text-sm text-gray-500">
        目前：<strong>{isPlanId(plan) ? PLAN_LIMITS[plan].label : plan}</strong> · 已認領 {used} / {max} 個群 · 本月 AI 呼叫 {ai.used}
        {ai.cap !== null ? ` / ${ai.cap}` : ''} 次
        {seats && ` · 每日提醒 ${seats.used.length}${seats.limit !== null ? ` / ${seats.limit}` : ''} 人`}
        {ai.paid.state !== 'none' && ` · 付費到 ${fmtDate(ai.paid.paidUntil)}`}
      </p>
      {ai.cap !== null && ai.used >= ai.cap && (
        <Banner tone="err">本月 AI 額度已用完：訊息會照常保存，但不再自動整理、問答與解析檔案，下個月 1 號恢復。升級可立即提高額度。</Banner>
      )}
      {limit && <Banner tone="warn">這個方案的群組數已用滿。升級後回到群裡再點一次認領連結即可。</Banner>}
      {referredBonus && <Banner tone="ok">你是朋友推薦來的：第一次升級付費方案，多送 {REFERRAL.rewardDays} 天。</Banner>}
      {credit > 0 && <Banner tone="ok">你有 {credit} 天推薦獎勵存著，升級付費方案時會自動加在到期日上。</Banner>}
      <div className="grid gap-3 md:grid-cols-3">
        {PUBLIC_PLANS.map((id) => {
          const current = id === plan;
          return (
            <div key={id} className={`card flex flex-col ${current ? 'border-emerald-600' : ''}`}>
              <p className="text-xs font-medium text-gray-500">{PLAN_LIMITS[id].label}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{planPrice(id)}</p>
              <p className="mt-2 flex-1 text-sm text-gray-600">{planLines(id).join('、')}</p>
              {current && (ai.paid.state === 'grace' || ai.paid.state === 'expired') ? (
                // 後台橫幅的「續約」連到這裡：目前方案的卡片要給得出動作，不能只寫「目前方案」
                <a className="btn-primary mt-4 w-full" href={CONTACT_RENEW}>
                  來信續約
                </a>
              ) : current ? (
                <span className="btn mt-4 w-full cursor-default opacity-60">目前方案</span>
              ) : PLAN_LIMITS[id].groups > max ? (
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
      <p className="mt-4 text-xs text-gray-500">
        每個方案的群組成員人數都不限。每日提醒名額以人計算，同一個人訂好幾個群只算一人。
        線上付款即將開通；目前升級請來信，我們會在一個工作天內開通並提供付款方式。
      </p>
      <p className="mt-2 text-xs text-gray-500">
        考勤（GPS 打卡、補卡審核、加班費計算）是另外加購的模組，不包含在上面的方案裡，
        <a className="underline" href={CONTACT_ATTEND}>來信洽詢</a>。
      </p>
      <a className="card mt-6 flex items-center gap-3 hover:bg-gray-50" href={oh(slug, '/referral')}>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">推薦好友，雙方各得 {REFERRAL.rewardDays} 天</span>
          <span className="block text-xs text-gray-500">對方開始付費時發，免費方案的你也拿得到（升級時折抵）。</span>
        </span>
        <span aria-hidden className="text-gray-400">→</span>
      </a>
    </main>
  );
}
