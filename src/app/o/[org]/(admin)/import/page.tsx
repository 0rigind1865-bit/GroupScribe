import { notFound } from 'next/navigation';
import { orgBySlug } from '@/org/orgs';
import { dbConfigured, getDb } from '@/db';
import { SetupNotice } from '../setup-notice';
import { ExtractButton } from './extract-button';

export const dynamic = 'force-dynamic';

export default async function ImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{
    inserted?: string;
    indexed?: string;
    archived?: string;
    error?: string;
    group?: string;
  }>;
}) {
  if (!dbConfigured()) return <SetupNotice />;
  const { org: slug } = await params;
  const org = await orgBySlug(slug);
  if (!org) notFound();
  const { inserted, indexed, archived, error, group } = await searchParams;
  const db = getDb();
  const { data: groups } = await db
    .from('groups_view')
    .select('group_id, name, message_count')
    .eq('org_id', org.id)
    .order('last_at', { ascending: false });

  // 各群組未提取則數（extracted_at 游標保證已提取的不會重複提取）
  const pendings = await Promise.all(
    (groups ?? []).map(async (g: any) => {
      const { count, error } = await db
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', g.group_id)
        .is('extracted_at', null); // 與 extractBatch 的認領範圍一致
      return [g.group_id, error ? -1 : (count ?? 0)] as const; // -1 = 查詢失敗（別謊報成已全部提取）
    }),
  );
  const pendingOf = new Map(pendings);

  return (
    <main className="mx-auto max-w-3xl p-5">
      <h1 className="mb-4 text-2xl font-bold">匯入 LINE 聊天記錄</h1>
      <ol className="mb-3 list-decimal space-y-1 pl-6 text-sm text-gray-700">
        <li>手機 LINE → 群組右上選單 → 其他設定 → 傳送聊天記錄，取得 .txt（可整檔上傳，或打開複製內容直接貼上）</li>
        <li>群組：從下拉選既有群組，或在下方補一個新群組（純匯入、bot 還沒進的群組用得到）</li>
      </ol>
      <ul className="mb-4 list-disc space-y-1 pl-6 text-sm text-gray-500">
        <li>txt 只包含文字；歷史圖片與檔案拿不回來</li>
        <li>沒有訊息 ID 可去重：重複匯入會產生重複資料，重匯前請先在總覽頁刪除該群組資料</li>
        <li>暱稱直接作為發送者名稱（與 LINE userId 的對應之後再做）</li>
        <li>
          只有<strong>最近 30 天</strong>的匯入訊息會排入抽取；更早的直接歸為「群組理解素材」——仍進索引、問答與群組歸納讀得到，
          但不會變成今天的行程/待辦（去年的約定不是今天的事，整批送 AI 也是最貴的一筆帳）
        </li>
        <li>匯入不會自動抽取（控制 API 費用）；下方「提取狀態」隨時看得到哪些還沒抽、一鍵補抽</li>
        <li>抽取時「已過期」的行程/待辦，與「無期限且來源超過 30 天」的過舊待辦會直接略過（訊息本身仍在索引，不影響問答）</li>
      </ul>

      {inserted && (
        <div className="card mb-4 border-emerald-200 bg-emerald-50 text-sm">
          <p className="mb-2">
            <strong>✅ 匯入成功：</strong>寫入 {inserted} 則，其中 {indexed} 則進入索引（其餘為低資訊訊息）。
            {Number(archived) > 0 && <> 其中 {archived} 則超過 30 天，歸為群組理解素材、不排入抽取。</>}
          </p>
          {group && (pendingOf.get(group) ?? 0) > 0 ? (
            <ExtractButton groupId={group} pending={pendingOf.get(group)!} />
          ) : (pendingOf.get(group ?? '') ?? 0) < 0 ? (
            <p className="text-red-700">提取狀態查詢失敗，請重新整理。</p>
          ) : (
            <p className="text-gray-600">此群組沒有待提取的訊息。</p>
          )}
        </div>
      )}
      {error === '1' && (
        <p className="card mb-4 border-red-200 bg-red-50 text-sm text-red-700">
          匯入失敗——請確認「已選群組（或補了新群組）」且「貼上內容或選了檔案」。
        </p>
      )}
      {error === '2' && (
        <p className="card mb-4 border-red-200 bg-red-50 text-sm text-red-700">
          匯入中途失敗（常見原因：AI 服務配額/花費上限用完，詳見伺服器 log）。部分訊息可能已寫入——重試前請先到
          總覽刪除該群組資料，避免重複。
        </p>
      )}

      <form action="/api/import" method="post" encType="multipart/form-data" className="card mb-6 space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold">1. 群組</legend>
          <label className="block text-sm">
            選既有群組
            <select className="input mt-1 block w-full" name="group_id" defaultValue="">
              <option value="">— 選擇群組 —</option>
              {groups?.map((g: any) => (
                <option key={g.group_id} value={g.group_id}>
                  {g.name ?? g.group_id}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            或補一個新群組（自訂名稱／ID，優先於上方選擇）
            <input className="input mt-1 block w-full" name="new_group" placeholder="例：中山北路案（留空則用上方選的）" />
          </label>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-bold">2. 聊天記錄（貼上，或上傳檔案）</legend>
          <label className="block text-sm">
            貼上內容
            <textarea
              className="input mt-1 block w-full font-mono text-xs"
              name="text"
              rows={8}
              placeholder="直接貼上 LINE 匯出的聊天記錄文字…"
            />
          </label>
          <label className="block text-sm">
            或上傳 .txt 檔（貼上內容有填時，以貼上為準）
            <input className="mt-1 block text-sm" type="file" name="file" accept=".txt,text/plain" />
          </label>
        </fieldset>

        <button className="btn-primary">開始匯入</button>
      </form>

      {groups?.length ? (
        <section>
          <h2 className="mb-2 text-xl font-bold">提取狀態</h2>
          <p className="mb-3 text-sm text-gray-500">
            已提取的訊息會被標記（不會重複提取），這裡只需要處理「未提取」的部分。bot 在線收到的新訊息會自動提取。
          </p>
          <div className="space-y-2">
            {groups.map((g: any) => {
              const p = pendingOf.get(g.group_id) ?? 0;
              return (
                <div key={g.group_id} className="card flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-semibold">{g.name ?? g.group_id}</span>
                  <span className="text-gray-500">{g.message_count} 則訊息</span>
                  {p > 0 ? (
                    <>
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">未提取 {p} 則</span>
                      <div className="ml-auto">
                        <ExtractButton groupId={g.group_id} pending={p} />
                      </div>
                    </>
                  ) : p < 0 ? (
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">狀態查詢失敗</span>
                  ) : (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">✅ 已全部提取</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}
