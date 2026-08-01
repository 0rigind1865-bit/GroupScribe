import { getDb } from '@/db';
import { notFound } from 'next/navigation';
import { orgBySlug, orgSettings } from '@/org/orgs';
import type { Employee } from '@/attend/auth';

export const dynamic = 'force-dynamic';

// 員工管理（對等舊員工管理分頁：啟用/停用、部門、月薪、管理權、加入碼）。
// 全部原生 form POST → /api/attend/employee → redirect 回來（MPA，零 client JS）。
const STATUS_BADGE: Record<string, [string, string]> = {
  pending: ['待啟用', 'bg-amber-100 text-amber-800'],
  active: ['在職', 'bg-emerald-100 text-emerald-800'],
  disabled: ['停用', 'bg-gray-200 text-gray-500'],
};

export default async function EmployeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ emp?: string; err?: string }>;
}) {
  const { org: slug } = await params;
  const org = await orgBySlug(slug);
  if (!org) notFound();
  const { emp: openId, err } = await searchParams;
  const db = getDb();

  const [{ data: emps }, settings, { data: admins }] = await Promise.all([
    db.from('employees').select('*').eq('org_id', org.id).order('status').order('display_name'),
    orgSettings(org.id),
    db.from('org_members').select('line_user_id, role').eq('org_id', org.id),
  ]);
  const employees = (emps ?? []) as Employee[];
  const adminSet = new Map((admins ?? []).map((a) => [a.line_user_id, a.role]));
  const joinCode = (settings.attend_join_code as string | null) ?? null;

  return (
    <main className="mx-auto max-w-4xl p-5">
      <h1 className="mb-4 text-2xl font-bold">員工管理</h1>
      {err && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">操作失敗，請重試。</p>}

      <section className="card mb-5">
        <h2 className="mb-1 text-sm font-bold text-gray-700">員工加入碼</h2>
        {joinCode ? (
          <p className="mb-2 text-sm">
            組織代號 <code className="rounded bg-gray-100 px-1.5 font-bold">{slug}</code>｜加入碼{' '}
            <code className="rounded bg-gray-100 px-1.5 font-bold">{joinCode}</code>
            <span className="ml-2 text-xs text-gray-500">員工在 LIFF「加入公司」頁輸入這兩個值</span>
          </p>
        ) : (
          <p className="mb-2 text-sm text-gray-500">尚未產生加入碼。</p>
        )}
        <form action="/api/attend/employee" method="post">
          <input type="hidden" name="org" value={slug} />
          <button className="btn px-3 py-1 text-sm" name="action" value="joincode">
            {joinCode ? '重設加入碼（舊碼立即失效）' : '產生加入碼'}
          </button>
        </form>
      </section>

      <section className="space-y-3">
        {employees.map((e) => {
          const [label, cls] = STATUS_BADGE[e.status] ?? [e.status, ''];
          const isAdmin = adminSet.has(e.line_user_id);
          const open = openId === e.id;
          return (
            <details key={e.id} className="card" open={open}>
              <summary className="flex cursor-pointer items-center gap-2">
                <span className="font-bold">{e.display_name}</span>
                <span className="text-xs text-gray-500">{e.dept ?? ''}</span>
                {isAdmin && <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-bold text-indigo-800">管理員</span>}
                <span className={`ml-auto rounded px-1.5 py-0.5 text-xs font-bold ${cls}`}>{label}</span>
              </summary>
              <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                <form action="/api/attend/employee" method="post" className="flex flex-wrap items-end gap-2 text-sm">
                  <input type="hidden" name="org" value={slug} />
                  <input type="hidden" name="id" value={e.id} />
                  <label className="block">
                    <span className="mb-1 block text-xs text-gray-500">姓名</span>
                    <input className="input w-32" name="name" defaultValue={e.display_name} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-gray-500">部門</span>
                    <input className="input w-28" name="dept" defaultValue={e.dept ?? ''} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-gray-500">月薪（NTD）</span>
                    <input className="input w-28" type="number" name="salary" min={0} step={1} defaultValue={e.monthly_salary} />
                  </label>
                  <button className="btn-primary px-3 py-1.5" name="action" value="save">儲存</button>
                </form>
                <form action="/api/attend/employee" method="post" className="flex flex-wrap gap-2 text-sm">
                  <input type="hidden" name="org" value={slug} />
                  <input type="hidden" name="id" value={e.id} />
                  {e.status !== 'active' && (
                    <button className="btn-confirm px-3 py-1.5" name="action" value="activate">啟用帳號</button>
                  )}
                  {e.status === 'active' && (
                    <button className="btn-danger px-3 py-1.5" name="action" value="disable">停用帳號</button>
                  )}
                  {adminSet.get(e.line_user_id) !== 'owner' &&
                    (isAdmin ? (
                      <button className="btn px-3 py-1.5" name="action" value="admin_off">移除管理權</button>
                    ) : (
                      <button className="btn px-3 py-1.5" name="action" value="admin_on">設為管理員</button>
                    ))}
                  <a className="btn ml-auto px-3 py-1.5" href={`/o/${slug}/attend/calendar?emp=${e.id}`}>月曆與薪資 →</a>
                </form>
                <p className="text-xs text-gray-400">
                  LINE ID：{e.line_user_id.slice(0, 12)}…｜加入於 {new Date(e.created_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}
                </p>
              </div>
            </details>
          );
        })}
        {!employees.length && <p className="text-gray-500">還沒有員工。把加入碼發給員工即可開始。</p>}
      </section>
    </main>
  );
}
