// 換月：‹ 9 月 ›（2026-10 設計畫布「薪資」「一個人的月份」）。薪資總表與個人頁共用。
// 箭頭是 44×44 觸控目標；boxed＝電腦版那種白底框（設計稿 AttendDesktop）
export function MonthNav({ prev, next, label, boxed }: { prev: string; next: string; label: string; boxed?: boolean }) {
  const arrow = 'grid h-11 w-11 flex-none place-items-center rounded-xl text-gray-700 hover:bg-gray-100';
  return (
    <div className={`flex items-center ${boxed ? 'rounded-xl border border-gray-200 bg-white' : ''}`}>
      <a className={arrow} aria-label="上個月" href={prev}>
        <Chevron d="M15 6l-6 6 6 6" />
      </a>
      <span className="px-1 text-[15px] font-bold whitespace-nowrap">{label}</span>
      <a className={arrow} aria-label="下個月" href={next}>
        <Chevron d="M9 6l6 6-6 6" />
      </a>
    </div>
  );
}

function Chevron({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
