import { getDb } from '@/db';
import { notFound } from 'next/navigation';
import { orgSettings, requireModule } from '@/org/orgs';
import { enabledModuleIds, isMissingModulesColumn, scopedModuleIds } from '@/org/module-ids';
import { liffUrl } from '@/core/ingest';
import type { Employee } from '@/attend/auth';
import { Banner } from '@/app/ui/banner';
import { Badge, OutlineBadge } from '@/app/ui/badge';
import { Empty } from '@/app/ui/empty';
import type { Tone } from '@/app/ui/tone';

export const dynamic = 'force-dynamic';

// 員工管理（對等舊員工管理分頁：啟用/停用、部門、月薪、管理權、加入碼）。
// 全部原生 form POST → /api/attend/employee → redirect 回來（MPA，零 client JS）。
const STATUS_BADGE: Record<string, [string, Tone]> = {
  pending: ['待啟用', 'warn'],
  active: ['在職', 'ok'],
  disabled: ['停用', 'neutral'],
};

export default async function EmployeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ emp?: string; err?: string }>;
}) {
  const { org: slug } = await params;
  const { org } = await requireModule(slug, 'attend');
  if (!org) notFound();
  const { emp: openId, err } = await searchParams;
  const db = getDb();

  const members = (cols: string) => db.from('org_members').select(cols).eq('org_id', org.id);
  const [{ data: emps }, settings, first] = await Promise.all([
    db.from('employees').select('*').eq('org_id', org.id).order('status').order('display_name'),
    orgSettings(org.id),
    members('line_user_id, role, modules'),
  ]);
  const admins = (isMissingModulesColumn(first.error) ? (await members('line_user_id, role')).data : first.data) as
    | { line_user_id: string; role: string; modules?: string[] | null }[]
    | null;
  const employees = (emps ?? []) as Employee[];
  const orgMods = enabledModuleIds(settings.modules);
  const adminSet = new Map((admins ?? []).map((a) => [a.line_user_id, a.role]));
  // 這一頁的「管理員」＝能管考勤的人（migration 028：管理權依模組授權）
  const attendAdmins = new Set(
    (admins ?? []).filter((a) => scopedModuleIds(orgMods, a.role, a.modules ?? null).includes('attend')).map((a) => a.line_user_id),
  );
  const joinCode = (settings.attend_join_code as string | null) ?? null;
  const liff = liffUrl();
  const joinLink = liff && joinCode ? `${liff}/a/join?org=${slug}&code=${joinCode}` : null;

  return (
    <main className="page">
      <h1 className="mb-5">員工管理</h1>
      {err && <Banner tone="err">操作失敗，請重試。</Banner>}

      {/* 加入邀請：員工端的打卡入口只對「已是員工」的人顯示（見 src/app/g/page.tsx 檔頭），
          所以這條連結是新員工唯一的入口——發連結這個動作本身就是授權。 */}
      <section className="card mb-5">
        <h2 className="mb-2 card-title">邀請員工加入</h2>
        {joinCode ? (
          <>
            <p className="mb-2 text-xs text-gray-500">
              把下面這條連結傳給要加入的員工（只發給該加入的人——收到的人才看得到考勤系統）。
              他開啟後組織與加入碼會自動帶入，送出即可，之後在下方清單啟用。
            </p>
            {/* readOnly input 而非純文字：長按/雙擊即可全選複製，零 client JS */}
            <input
              readOnly
              className="input mb-2 w-full font-mono text-xs"
              defaultValue={joinLink ?? `組織代號 ${slug}｜加入碼 ${joinCode}（未設 LIFF_ID，無法產生連結）`}
            />
            <p className="mb-2 text-xs text-gray-400">
              連結失效時請員工手動輸入：組織代號 <code className="font-bold">{slug}</code>、加入碼{' '}
              <code className="font-bold">{joinCode}</code>
            </p>
          </>
        ) : (
          <p className="mb-2 text-sm text-gray-500">尚未產生加入碼，按下方按鈕產生後才能邀請員工。</p>
        )}
        <form action="/api/attend/employee" method="post">
          <input type="hidden" name="org" value={slug} />
          <button className="btn px-3 py-1 text-sm" name="action" value="joincode">
            {joinCode ? '重設加入碼（舊碼與舊連結立即失效）' : '產生加入碼'}
          </button>
        </form>
      </section>

      <section className="space-y-3">
        {employees.map((e) => {
          const [label, tone] = STATUS_BADGE[e.status] ?? [e.status, 'neutral' as Tone];
          const isAdmin = attendAdmins.has(e.line_user_id);
          const open = openId === e.id;
          return (
            <details key={e.id} className="card" open={open}>
              <summary className="flex cursor-pointer items-center gap-2">
                <span className="font-bold">{e.display_name}</span>
                <span className="text-xs text-gray-500">{e.dept ?? ''}</span>
                {isAdmin && <OutlineBadge>考勤管理員</OutlineBadge>}
                <span className="ml-auto">
                  <Badge tone={tone}>{label}</Badge>
                </span>
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
                      <button className="btn px-3 py-1.5" name="action" value="admin_off">移除考勤管理權</button>
                    ) : (
                      <button className="btn px-3 py-1.5" name="action" value="admin_on">設為考勤管理員</button>
                    ))}
                  <a className="btn ml-auto px-3 py-1.5" href={`/o/${slug}/attend/report?emp=${e.id}`}>月曆與薪資 →</a>
                </form>
                <p className="text-xs text-gray-400">
                  LINE ID：{e.line_user_id.slice(0, 12)}…｜加入於 {new Date(e.created_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}
                </p>
              </div>
            </details>
          );
        })}
        {!employees.length && (
          <Empty title="還沒有員工" hint="把上面那條邀請連結傳給員工，他們加入後會出現在這裡等你啟用。" />
        )}
      </section>
    </main>
  );
}
