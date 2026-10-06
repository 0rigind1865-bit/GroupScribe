import { getDb } from '@/db';
import { notFound } from 'next/navigation';
import { orgSettings, requireModule } from '@/org/orgs';
import { enabledModuleIds, isMissingModulesColumn, scopedModuleIds } from '@/org/module-ids';
import { liffUrl } from '@/core/ingest';
import type { Employee } from '@/attend/auth';
import { Banner } from '@/app/ui/banner';
import { Badge, OutlineBadge } from '@/app/ui/badge';
import { Empty } from '@/app/ui/empty';
import { DetailSheet } from '@/app/ui/detail-sheet';
import type { Tone } from '@/app/ui/tone';
import { oh } from '@/org/href';
import { taipeiHm, workDate } from '@/attend/util';

export const dynamic = 'force-dynamic';

// 員工管理（對等舊員工管理分頁：啟用/停用、部門、月薪、管理權、加入碼）。
// 2026-10 設計畫布「員工」：邀請收進右上角按鈕（抽屜）、等你啟用放最上面、每個人旁邊看得到今天在不在班；
// 點在職的人＝他的月份，改資料在抽屜（?emp=）。全部原生 form POST → /api/attend/employee → redirect 回來（零 client JS）。
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
  searchParams: Promise<{ emp?: string; err?: string; invite?: string; show?: string; ok?: string; who?: string }>;
}) {
  const { org: slug } = await params;
  const { org } = await requireModule(slug, 'attend');
  if (!org) notFound();
  const { emp: openId, err, invite, show, ok, who } = await searchParams;
  const db = getDb();

  const members = (cols: string) => db.from('org_members').select(cols).eq('org_id', org.id);
  const [{ data: emps }, settings, first, { data: punches }] = await Promise.all([
    db.from('employees').select('*').eq('org_id', org.id).order('display_name'),
    orgSettings(org.id),
    members('line_user_id, role, modules'),
    db.from('punch_records').select('employee_id, type, punched_at').eq('org_id', org.id).eq('work_date', workDate(new Date())).order('punched_at'),
  ]);
  const admins = (isMissingModulesColumn(first.error) ? (await members('line_user_id, role')).data : first.data) as
    | { line_user_id: string; role: string; modules?: string[] | null }[]
    | null;
  const employees = (emps ?? []) as Employee[];
  // 等你啟用放最上面（從「今天」的「等你啟用」點進來的人，要找的就是這些，審查 F29）；清單分在職／停用兩頁
  const pendingEmps = employees.filter((e) => e.status === 'pending');
  const offList = show === 'disabled';
  const listed = employees.filter((e) => e.status === (offList ? 'disabled' : 'active'));
  const disabledN = employees.filter((e) => e.status === 'disabled').length;
  const open = employees.find((e) => e.id === openId);
  const orgMods = enabledModuleIds(settings.modules);
  const adminSet = new Map((admins ?? []).map((a) => [a.line_user_id, a.role]));
  // 這一頁的「管理員」＝能管考勤的人（migration 028：管理權依模組授權）
  const attendAdmins = new Set(
    (admins ?? []).filter((a) => scopedModuleIds(orgMods, a.role, a.modules ?? null).includes('attend')).map((a) => a.line_user_id),
  );
  const joinCode = (settings.attend_join_code as string | null) ?? null;
  const liff = liffUrl();
  const joinLink = liff && joinCode ? `${liff}/a/join?org=${slug}&code=${joinCode}` : null;

  // 今天在不在班（設計畫布：每個人旁邊看得到）：最後一張是上班卡＝在班
  const todayOf = new Map<string, { in?: string; out?: string; last?: string }>();
  for (const p of punches ?? []) {
    const t = todayOf.get(p.employee_id) ?? {};
    const hm = taipeiHm(new Date(p.punched_at));
    if (p.type === 'in' && !t.in) t.in = hm;
    if (p.type === 'out') t.out = hm;
    t.last = p.type;
    todayOf.set(p.employee_id, t);
  }
  const todayBadge = (id: string): [string, Tone] => {
    const t = todayOf.get(id);
    if (t?.last === 'in') return [`在班 ${t.in}`, 'ok'];
    if (t?.out) return [`已下班 ${t.out}`, 'neutral'];
    return ['還沒打卡', 'neutral'];
  };
  const [openLabel, openTone] = open ? (STATUS_BADGE[open.status] ?? [open.status, 'neutral' as Tone]) : ['', 'neutral' as Tone];

  return (
    <main className="page">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1>員工</h1>
        <a className="btn text-[13px]" href={oh(slug, '/attend/employees', { invite: 1 })}>
          ＋ 邀請員工
        </a>
      </div>
      {err && <Banner tone="err">操作失敗，請重試。</Banner>}
      {ok === 'activate' && (
        <Banner>
          已啟用 ✓ 月薪之後再填也可以——
          <a className="font-bold underline" href={oh(slug, '/attend/employees', { emp: who })}>
            現在填 →
          </a>
        </Banner>
      )}
      {ok === 'disable' && <Banner tone="neutral">已停用；在「停用的」裡可以重新啟用。</Banner>}

      {/* 等你啟用：一鍵啟用，月薪之後再填（點他的名字 → 改資料） */}
      {pendingEmps.length > 0 && (
        <section aria-label="等你啟用" className="mb-5 space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-3.5">
          <h2 className="section-title text-amber-800">等你啟用</h2>
          {pendingEmps.map((e) => (
            <div key={e.id} className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-white text-sm font-black text-amber-900">{e.display_name.slice(-1)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold">{e.display_name}</span>
                  <span className="block text-xs text-amber-800">
                    {e.dept ? `填了「${e.dept}」· ` : ''}
                    {new Date(e.created_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' })} 用加入碼申請
                  </span>
                </span>
              </div>
              <form action="/api/attend/employee" method="post" className="grid grid-cols-[1fr_2fr] gap-2">
                <input type="hidden" name="org" value={slug} />
                <input type="hidden" name="id" value={e.id} />
                <button className="btn" name="action" value="disable">
                  不認識
                </button>
                <button className="btn-confirm" name="action" value="activate">
                  啟用，月薪之後再填
                </button>
              </form>
            </div>
          ))}
        </section>
      )}

      {employees.length > pendingEmps.length ? (
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="section-title">
              {offList ? '停用' : '在職'} · {listed.length}
            </h2>
            {offList ? (
              <a className="text-[13px] font-bold text-gray-600" href={oh(slug, '/attend/employees')}>
                ← 在職的
              </a>
            ) : (
              disabledN > 0 && (
                <a className="text-[13px] font-bold text-gray-600" href={oh(slug, '/attend/employees', { show: 'disabled' })}>
                  停用的 →
                </a>
              )
            )}
          </div>
          {/* 在職的點進去＝他這個月的月曆與薪資（設計稿）；停用的點進去＝資料抽屜（多半是要重新啟用） */}
          {listed.length > 0 && (
            <ul className="card divide-y divide-gray-100 overflow-hidden p-0">
              {listed.map((e) => {
                const [label, tone] = offList ? ['停用', 'neutral' as Tone] : todayBadge(e.id);
                return (
                  <li key={e.id}>
                    <a
                      href={offList ? oh(slug, '/attend/employees', { show: 'disabled', emp: e.id }) : oh(slug, '/attend/report', { emp: e.id })}
                      className="flex min-h-[62px] items-center gap-3 px-3.5 hover:bg-gray-50"
                    >
                      <span
                        className={`grid h-[34px] w-[34px] flex-none place-items-center rounded-full text-[13px] font-black ${tone === 'ok' ? 'bg-emerald-100 text-emerald-900' : 'bg-gray-100 text-gray-700'}`}
                      >
                        {e.display_name.slice(-1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[15px] font-bold">
                          <span className="truncate">{e.display_name}</span>
                          {attendAdmins.has(e.line_user_id) && <OutlineBadge>考勤管理員</OutlineBadge>}
                        </span>
                        {e.dept && <span className="block text-xs text-gray-600">{e.dept}</span>}
                      </span>
                      <Badge tone={tone}>{label}</Badge>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : (
        !pendingEmps.length && (
          <Empty
            title="還沒有員工"
            hint="把邀請連結傳給員工，他們加入後會出現在這裡等你啟用。"
            action={
              <a className="btn-primary" href={oh(slug, '/attend/employees', { invite: 1 })}>
                邀請員工
              </a>
            }
          />
        )
      )}

      {/* 邀請員工（設計畫布：收進右上角按鈕，不再永遠佔住最上面）。
          員工端的打卡入口只對「已是員工」的人顯示（見 src/app/g/page.tsx 檔頭），
          所以這條連結是新員工唯一的入口——發連結這個動作本身就是授權。 */}
      {invite && (
        <DetailSheet closeHref={oh(slug, '/attend/employees')} title="邀請員工">
          {joinCode ? (
            <>
              <p className="mb-2 text-xs text-gray-500">
                把下面這條連結傳給要加入的員工（只發給該加入的人——收到的人才看得到考勤系統）。
                他開啟後組織與加入碼會自動帶入，送出即可，之後在員工頁啟用。
              </p>
              {/* 主要路徑：一鍵叫出 LINE 的分享畫面選人傳送（line.me 分享網址，零 JS）——
                  員工本來就在 LINE 上，不必先長按複製再切 App 貼上。只有產生得出連結時才給。 */}
              {joinLink && (
                <a
                  className="btn-primary mb-2 w-full"
                  href={`https://line.me/R/share?text=${encodeURIComponent(`${org.name} 邀請你加入打卡，點連結送出即可：\n${joinLink}`)}`}
                >
                  用 LINE 傳給員工
                </a>
              )}
              {/* 後備：readOnly input 而非純文字，長按/雙擊即可全選複製（LINE 以外的管道），零 client JS */}
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
        </DetailSheet>
      )}

      {/* 一個人的資料（?emp=）：改名字／部門／月薪、停用或啟用、考勤管理權。
          從「一個人的月份」的「改資料」、停用清單、或存檔後轉回來時打開 */}
      {open && (
        <DetailSheet
          closeHref={oh(slug, '/attend/employees', { show: offList ? 'disabled' : undefined })}
          title={open.display_name}
          badge={<Badge tone={openTone}>{openLabel}</Badge>}
        >
          <div className="space-y-4">
            <form action="/api/attend/employee" method="post" className="grid grid-cols-2 gap-2 text-sm">
              <input type="hidden" name="org" value={slug} />
              <input type="hidden" name="id" value={open.id} />
              <label className="col-span-2 block">
                <span className="label mb-1 block">姓名</span>
                <input className="input w-full" name="name" defaultValue={open.display_name} />
              </label>
              <label className="block">
                <span className="label mb-1 block">部門</span>
                <input className="input w-full" name="dept" defaultValue={open.dept ?? ''} />
              </label>
              <label className="block">
                <span className="label mb-1 block">月薪（NTD）</span>
                <input className="input w-full" type="number" name="salary" min={0} step={1} defaultValue={open.monthly_salary} />
              </label>
              <button className="btn-primary col-span-2" name="action" value="save">
                儲存
              </button>
            </form>
            <form action="/api/attend/employee" method="post" className="flex flex-wrap gap-2 text-sm">
              <input type="hidden" name="org" value={slug} />
              <input type="hidden" name="id" value={open.id} />
              {open.status !== 'active' && (
                <button className="btn-confirm" name="action" value="activate">
                  啟用帳號
                </button>
              )}
              {open.status === 'active' && (
                <button className="btn-danger" name="action" value="disable">
                  停用帳號
                </button>
              )}
              {adminSet.get(open.line_user_id) !== 'owner' &&
                (attendAdmins.has(open.line_user_id) ? (
                  <button className="btn" name="action" value="admin_off">
                    移除考勤管理權
                  </button>
                ) : (
                  <button className="btn" name="action" value="admin_on">
                    設為考勤管理員
                  </button>
                ))}
            </form>
            {open.status !== 'pending' && (
              <a className="btn w-full" href={oh(slug, '/attend/report', { emp: open.id })}>
                看他的月曆與薪資 →
              </a>
            )}
            <p className="text-xs text-gray-400">
              LINE ID：{open.line_user_id.slice(0, 12)}…｜加入於 {new Date(open.created_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}
            </p>
          </div>
        </DetailSheet>
      )}
    </main>
  );
}
