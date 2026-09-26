'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Chevron, PILL } from '@/app/ui/group-switcher';

// 全域員工選擇器：跨考勤各分頁保持選擇（?emp=）。
//
// 為什麼用 URL 參數而不是 cookie：
//   1. 機制已存在——nav 的換頁保留 ?group 就是同一套，泛化成 module.ctxParam 即可
//   2. 可分享、可加書籤（把「阿明的 10 月報表」貼給會計，cookie 做不到）
//   3. principles.md「別讓我想」：cookie 是隱形狀態，換裝置行為就不一致；URL 看得見
//
// 結構與 group-switcher.tsx 同構：手機整塊可點（透明 select 疊在上面叫原生選單），
// 桌面一般下拉；location.assign 維持 MPA 整頁載入。
export type EmpOption = { id: string; display_name: string; dept: string | null; status: string };

// 跨員工的聚合視圖（總覽、審核）支援「全部」；報表這類單員工頁不支援
const ALL_OK = [/\/attend$/, /\/attend\/reviews/];

export function EmployeeSwitcher({ employees }: { employees: EmpOption[] }) {
  const pathname = usePathname();
  const search = useSearchParams();
  if (!employees.length) return null;

  const current = search.get('emp') ?? '';
  const cur = employees.find((e) => e.id === current);
  const supportsAll = ALL_OK.some((re) => re.test(pathname));
  const label = cur ? cur.display_name : supportsAll ? '全部員工' : '選擇員工…';

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    const params = new URLSearchParams();
    if (id) params.set('emp', id);
    // 月份要跟著走（換人看同一個月是常見動作）；其餘 entity 參數丟棄
    const month = search.get('month');
    if (month) params.set('month', month);
    location.assign(params.toString() ? `${pathname}?${params}` : pathname);
  }

  const options = (
    <>
      {supportsAll ? <option value="">全部員工</option> : !current && <option value="">選擇員工…</option>}
      {employees.map((e) => (
        <option key={e.id} value={e.id}>
          {e.display_name}
          {e.dept ? `（${e.dept}）` : ''}
          {e.status === 'disabled' ? '｜停用' : ''}
        </option>
      ))}
    </>
  );

  // 與群組膠囊同一顆外觀（PILL）；原生 <select> 透明疊在上面叫出選單
  return (
    <label className={`relative ${PILL}`}>
      <span className="max-w-40 truncate">{label}</span>
      <Chevron />
      <select value={current} onChange={onChange} aria-label="切換員工" className="absolute inset-0 cursor-pointer opacity-0">
        {options}
      </select>
    </label>
  );
}
