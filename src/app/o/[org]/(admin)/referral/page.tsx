import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { orgSettings, requireModule } from '@/org/orgs';
import { isPaidPlan } from '@/org/plans';
import { ensureRefCode, REFERRAL, referralStats } from '@/org/referral';
import { oh } from '@/org/href';
import { publicBase } from '@/http';
import { Banner } from '@/app/ui/banner';
import { StatGrid } from '@/app/ui/stat';

export const dynamic = 'force-dynamic';
export const metadata = { title: '推薦好友' };

// 推薦好友：拿自己的推薦連結、用 LINE 傳出去、看成績。規則見 src/org/referral.ts。
// 群組助理的管理員都看得到（分享連結不會洩漏任何資料；獎勵歸組織，不歸個人）。
export default async function ReferralPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org } = await requireModule(slug, 'gs');
  if (!org || slug === 'unclaimed') notFound();
  const [code, stats, st] = await Promise.all([ensureRefCode(org.id), referralStats(org.id), orgSettings(org.id)]);
  const days = REFERRAL.rewardDays;

  if (!code) {
    return (
      <main className="page">
        <h1 className="mb-4">推薦好友</h1>
        <Banner tone="warn">推薦功能還沒開通（資料庫需要套用 migration 029）。請聯絡平台管理員。</Banner>
      </main>
    );
  }

  const url = `${publicBase({ headers: await headers() })}/r/${code}`;
  // 文案只講具體漏掉的事，不講「摘要」（商業計劃第 2 節文案禁區：摘要是 LINE 官方的免費功能）
  const message = [
    '推薦你一個我們在用的工具「群記」：把它邀進 LINE 工作群，誰負責什麼、幾號要交、上次傳的估價單，會自動整理成行程和待辦，每一筆都點得回原話。',
    `免費 1 個群、不用綁卡。用這個連結建立，之後升級付費多送 ${days} 天：`,
    url,
  ].join('\n');
  const credit = Number(st.referral_credit_days ?? 0);
  const paid = isPaidPlan(st.plan);

  return (
    <main className="page space-y-6">
      <div>
        <h1 className="mb-1">推薦好友</h1>
        <p className="text-sm text-gray-500">
          推薦一家公司或團隊開始付費，<strong>你們雙方各得 {days} 天</strong>。
        </p>
      </div>

      <section className="card space-y-3">
        <h2 className="card-title">你的推薦連結</h2>
        <a className="btn-primary w-full md:w-auto" href={`https://line.me/R/share?text=${encodeURIComponent(message)}`}>
          用 LINE 傳給朋友
        </a>
        <input className="input block w-full text-sm" readOnly value={url} aria-label="推薦連結" />
        <p className="text-xs text-gray-500">
          也可以複製連結貼到其他地方。對方打開連結會看到你的組織名稱「{org.name}」。推薦碼 <strong className="tabular-nums">{code}</strong>
        </p>
      </section>

      {stats && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight">成績</h2>
          <StatGrid
            cols={3}
            items={[
              { n: stats.signedUp, label: '用你的連結建立' },
              { n: stats.paid, label: '已開始付費' },
              { n: stats.earnedDays, label: '你獲得的天數' },
            ]}
          />
          {credit > 0 && !paid && (
            <Banner tone="neutral">
              你有 <strong>{credit} 天</strong>獎勵存著：目前是免費方案，<a className="underline" href={oh(slug, '/upgrade')}>升級付費方案</a>時會自動加在到期日上。
            </Banner>
          )}
          {stats.earnedDays > 0 && paid && st.paid_until ? (
            <p className="text-xs text-gray-500">獎勵已直接加在你的付費到期日上（目前到 {String(st.paid_until)}）。</p>
          ) : null}
        </section>
      )}

      <section className="card space-y-2">
        <h2 className="card-title">怎麼算</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li>對方要從你的連結建立<strong>新的組織</strong>（點過連結 {REFERRAL.cookieDays} 天內建立都算）。</li>
          <li>
            對方<strong>第一次升級付費方案</strong>時，雙方各得 {days} 天。只建立、一直用免費方案的不算——免費方案的群數與 AI 額度不會因推薦增加。
          </li>
          <li>你在付費方案：直接延長到期日。你在免費方案：天數先存著，升級時自動折抵。</li>
          <li>
            每家組織最多領 {REFERRAL.maxRewards} 次（{REFERRAL.maxRewards * days} 天）。超過之後對方照樣拿到 {days} 天。
          </li>
          <li>你這家組織的管理員自己再開新組織，不算推薦。</li>
          <li>獎勵是服務天數，不能換現金、不能轉讓。以不正當方式取得的獎勵會被取消。</li>
        </ul>
      </section>
    </main>
  );
}
