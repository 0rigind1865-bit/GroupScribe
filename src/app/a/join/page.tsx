import { liffId, liffUser } from '@/core/liff';
import { locale, t, type MsgKey } from '@/attend/i18n';
import { Banner } from '@/app/ui/banner';
import { PageHeader } from '@/app/ui/page-header';
import { AttendLiffBoot } from '../shell';

export const dynamic = 'force-dynamic';

// 員工加入 org：LIFF 深連結（/a/join?org=&code=）自動帶入；部分 LINE 版本會掉 query，
// 表單保留手動輸入作為回退（計畫風險清單明列）。
const ERR: Record<string, MsgKey> = {
  ERR_JOIN_PARAMS: 'ERR_JOIN_PARAMS',
  ERR_JOIN_CODE: 'ERR_JOIN_CODE',
  ERR_WRITE: 'ERR_WRITE',
};

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; code?: string; err?: string }>;
}) {
  const loc = await locale();
  const tt = (key: MsgKey) => t(loc, key);
  const uid = await liffUser();
  if (!uid) return <AttendLiffBoot liffId={liffId()} tt={tt} />;
  const { org, code, err } = await searchParams;

  return (
    <main className="mx-auto max-w-md p-5">
      <PageHeader back="/g" title={tt('JOIN_TITLE')} />
      <p className="mb-4 text-sm text-gray-600">{tt('JOIN_DESC')}</p>
      {err && <Banner tone="err">{ERR[err] ? tt(ERR[err]) : err}</Banner>}
      <form action="/api/attend/join" method="post" className="card space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-bold text-gray-700">{tt('ORG_LABEL')}</span>
          <input className="input w-full" name="org" defaultValue={org ?? ''} placeholder="main" required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-bold text-gray-700">{tt('CODE_LABEL')}</span>
          <input className="input w-full" name="code" defaultValue={code ?? ''} required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-bold text-gray-700">{tt('NAME_LABEL')}</span>
          <input className="input w-full" name="name" placeholder={tt('NAME_PLACEHOLDER')} />
        </label>
        <button className="btn-primary w-full">{tt('SUBMIT')}</button>
      </form>
    </main>
  );
}
