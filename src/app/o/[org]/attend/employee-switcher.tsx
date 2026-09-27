'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Chevron, PANEL, PILL, rowCls } from '@/app/ui/group-switcher';
import { oh } from '@/org/href';

// 全域員工選擇器：跨考勤各分頁保持選擇（?emp=）。
//
// 為什麼用 URL 參數而不是 cookie：
//   1. 機制已存在——nav 的換頁保留 ?group 就是同一套，泛化成 module.ctxParam 即可
//   2. 可分享、可加書籤（把「阿明的 10 月報表」貼給會計，cookie 做不到）
//   3. principles.md「別讓我想」：cookie 是隱形狀態，換裝置行為就不一致；URL 看得見
//
// 與群組膠囊同一顆外觀、同一種清單（<details>）：原本疊一個透明 <select> 叫原生選單，
// 但群組膠囊早就因為 LINE 內建瀏覽器不一定叫得出 <select> 而改掉了（審查 F40）。
export type EmpOption = { id: string; display_name: string; dept: string | null; status: string };

// 跨員工的聚合視圖支援「全部」；報表這類單員工頁不支援。員工／打卡地點／薪資規則／更多頁不吃 ?emp，
// 也算「全部」——否則膠囊一直催「選擇員工…」，選了卻什麼都沒變（審查 F28）
const ALL_OK = [/\/attend$/, /\/attend\/(reviews|employees|locations|rules|more)/];

export function EmployeeSwitcher({ employees }: { employees: EmpOption[] }) {
  const pathname = usePathname();
  const search = useSearchParams();
  if (!employees.length) return null;

  const current = search.get('emp') ?? '';
  const cur = employees.find((e) => e.id === current);
  const supportsAll = ALL_OK.some((re) => re.test(pathname));
  const label = cur ? cur.display_name : supportsAll ? '全部員工' : '選擇員工…';

  // 換人時月份要跟著走（換人看同一個月是常見動作）；其餘 entity 參數丟棄
  function hrefFor(id: string): string {
    // 總覽、審核、員工、地點、規則這些頁不分人：選了某人只換膠囊字、內容不變，等於說謊——改成去看他的報表
    if (supportsAll && id) {
      const slug = pathname.match(/^\/o\/([^/]+)/)?.[1] ?? '';
      return oh(slug, '/attend/report', { emp: id, month: search.get('month') ?? undefined });
    }
    const params = new URLSearchParams();
    if (id) params.set('emp', id);
    const month = search.get('month');
    if (month) params.set('month', month);
    return params.toString() ? `${pathname}?${params}` : pathname;
  }

  return (
    // data-no-swipe 掛在 details 而非面板：在點外面收合的遮罩（summary::before）上橫滑不換分頁（同群組膠囊）
    <details className="group relative" data-no-swipe="">
      {/* aria-label 會蓋掉膠囊上的字，要把目前選的人一起念出來（最後審查） */}
      <summary className={PILL} aria-label={`切換員工：${label}`}>
        <span>{label}</span>
        <Chevron />
      </summary>
      <div className={PANEL}>
        {supportsAll && (
          <a href={hrefFor('')} aria-current={!current ? 'page' : undefined} className={rowCls(!current)}>
            全部員工
          </a>
        )}
        {employees.map((e) => (
          <a key={e.id} href={hrefFor(e.id)} aria-current={e.id === current ? 'page' : undefined} className={rowCls(e.id === current)}>
            {e.display_name}
            {e.dept ? `（${e.dept}）` : ''}
            {e.status === 'disabled' ? '｜停用' : ''}
          </a>
        ))}
      </div>
    </details>
  );
}
