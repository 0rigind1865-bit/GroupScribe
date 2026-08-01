import { dbConfigured, getDb } from '@/db';
import { isAdminLineUser, isGroupMember, liffId, liffUser } from '@/core/liff';
import { myEmployees } from '@/attend/auth';
import { LiffInit } from './liff-init';

export const dynamic = 'force-dynamic';

// LIFF 首頁：列出「你是成員」的群組（成員＝在該群發過言，messages.sender_id 推導）。
// 管理員（ADMIN_LINE_USER_ID）另有管理後台入口——session 端點已一併發過 admin cookie，點進去免密碼。
// 考勤入口也放這裡：LIFF 深連結（liff.line.me/<id>/a）對「已登入」的使用者不會生效——
// 已有 session 時本頁直接渲染群組列表、不載入 LIFF SDK，附帶路徑就沒人處理。
// 這張卡片是員工進打卡系統的實際入口，不必記網址。
export default async function LiffHome() {
  const uid = await liffUser();
  if (!uid) return <LiffInit liffId={liffId()} />;
  if (!dbConfigured()) return <main className="p-6 text-gray-500">系統尚未設定資料庫。</main>;

  const isAdmin = isAdminLineUser(uid);
  const adminUnset = !process.env.ADMIN_LINE_USER_ID?.trim();
  const employees = await myEmployees();
  const emp = employees.find((e) => e.status === 'active') ?? employees[0];

  const db = getDb();
  const { data: allGroups } = await db.from('groups_view').select('group_id, name').order('last_at', { ascending: false });
  const membership = await Promise.all(
    (allGroups ?? []).map(async (g: any) => ((await isGroupMember(g.group_id, uid)) ? g : null)),
  );
  const mine = membership.filter(Boolean) as { group_id: string; name: string | null }[];

  return (
    <main className="mx-auto max-w-md p-5">
      <h1 className="mb-1 text-xl font-bold">你的群組</h1>
      <p className="mb-4 text-sm text-gray-500">
        {mine.length ? '選一個群組看整理好的行程、待辦與公告。' : '在有 GroupScribe 的 LINE 群組裡發過訊息，這裡就會出現該群的整理。'}
      </p>

      <div className="space-y-2">
        {mine.map((g) => (
          <a key={g.group_id} href={`/g/${encodeURIComponent(g.group_id)}`} className="card flex items-center gap-3 hover:bg-gray-50">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-emerald-600 font-bold text-white">
              {(g.name ?? g.group_id).slice(0, 1)}
            </span>
            <span className="font-bold">{g.name ?? g.group_id}</span>
            <span className="ml-auto text-gray-300">›</span>
          </a>
        ))}
      </div>

      {/* 打卡系統：已是員工＝直接進打卡；還不是＝進加入頁（加入碼由管理員提供） */}
      <a
        href={emp ? '/a' : '/a/join'}
        className="card mt-4 flex items-center gap-3 border-sky-200 bg-sky-50 hover:bg-sky-100"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6 flex-none text-sky-700" fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        <span>
          <span className="block font-bold text-sky-900">打卡系統</span>
          <span className="block text-xs text-sky-700">
            {emp
              ? emp.status === 'active'
                ? '上下班打卡、月曆紀錄、補卡申請'
                : '帳號等待啟用中'
              : '加入公司後即可打卡'}
          </span>
        </span>
        <span className="ml-auto text-sky-700">›</span>
      </a>

      {isAdmin && (
        <a href="/" className="card mt-3 flex items-center gap-3 border-emerald-200 bg-emerald-50 hover:bg-emerald-100">
          <svg viewBox="0 0 24 24" className="h-6 w-6 flex-none text-emerald-700" fill="none" stroke="currentColor" strokeWidth="1.7">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 9h18M8 13h8M8 16h5" />
          </svg>
          <span>
            <span className="block font-bold text-emerald-900">管理後台</span>
            <span className="block text-xs text-emerald-700">全群總覽、收件匣、匯入與設定</span>
          </span>
          <span className="ml-auto text-emerald-700">›</span>
        </a>
      )}

      {adminUnset && (
        <details className="mt-6 text-xs text-gray-400">
          <summary className="cursor-pointer">我是管理者，要開啟免密碼進後台</summary>
          <p className="mt-2">
            把下面這行加進伺服器的 <code>.env.local</code> 後重啟，用這個 LINE 帳號開啟時就會出現「管理後台」入口：
          </p>
          <p className="mt-1 rounded bg-gray-100 px-2 py-1 font-mono break-all text-gray-600">ADMIN_LINE_USER_ID={uid}</p>
        </details>
      )}
    </main>
  );
}
