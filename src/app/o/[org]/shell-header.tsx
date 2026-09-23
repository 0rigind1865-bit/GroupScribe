import { notFound } from 'next/navigation';
import { visibleModules } from '@/org/modules';
import { ATTEND_MODULE, GS_MODULE, type ModuleId } from './routes';
import { SurfaceSwitcher } from '@/app/ui/surface-switcher';
import { TopNav, type Counts } from './nav';

// 兩個模組共用的頂欄：工作區切換器 + 桌面 nav + 右側 context 切換器（群組 / 員工）。
//
// 手機版的資訊層級（由左至右）：工作區膠囊 → context（你正在看哪個群組/員工）。
// 桌面再加上完整 nav。底部膠囊由各內殼自己掛（BottomNav）。
export async function ShellHeader({
  slug,
  moduleId,
  counts,
  context,
}: {
  slug: string;
  moduleId: ModuleId;
  counts?: Counts;
  context?: React.ReactNode;
}) {
  const access = await visibleModules(slug);
  if (!access) notFound();
  const mod = moduleId === 'attend' ? ATTEND_MODULE : GS_MODULE;

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white px-4 py-2 md:py-3">
      <div className="mx-auto flex max-w-5xl items-center gap-3 md:gap-5">
        {/* 手機頂欄讓給群組／員工 context；面向切換在「更多」頁（U6） */}
        <div className="hidden md:block">
          <SurfaceSwitcher current={mod.id} />
        </div>
        <TopNav moduleId={mod.id} counts={counts} />
        {context && <div className="ml-auto min-w-0 flex-1 md:flex-none">{context}</div>}
      </div>
    </header>
  );
}
