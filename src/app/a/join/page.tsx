import { liffId, liffUser } from '@/core/liff';
import { LiffInit } from '@/app/g/liff-init';

export const dynamic = 'force-dynamic';

// 員工加入 org：LIFF 深連結（/a/join?org=&code=）自動帶入；部分 LINE 版本會掉 query，
// 表單保留手動輸入作為回退（計畫風險清單明列）。
const ERR: Record<string, string> = {
  ERR_JOIN_PARAMS: '請填組織代號與加入碼',
  ERR_JOIN_CODE: '組織代號或加入碼不正確，請向管理員確認',
  ERR_WRITE: '寫入失敗，請稍後再試',
};

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; code?: string; err?: string }>;
}) {
  const uid = await liffUser();
  if (!uid) return <LiffInit liffId={liffId()} />;
  const { org, code, err } = await searchParams;

  return (
    <main className="mx-auto max-w-md p-5">
      <h1 className="mb-2 text-xl font-bold">加入公司</h1>
      <p className="mb-4 text-sm text-gray-600">輸入管理員提供的組織代號與加入碼。送出後需等管理員啟用帳號。</p>
      {err && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{ERR[err] ?? err}</p>}
      <form action="/api/attend/join" method="post" className="card space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-bold text-gray-700">組織代號</span>
          <input className="input w-full" name="org" defaultValue={org ?? ''} placeholder="例：main" required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-bold text-gray-700">加入碼</span>
          <input className="input w-full" name="code" defaultValue={code ?? ''} required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-bold text-gray-700">你的姓名（顯示用）</span>
          <input className="input w-full" name="name" placeholder="不填則用 LINE 名稱" />
        </label>
        <button className="btn-primary w-full">送出</button>
      </form>
    </main>
  );
}
