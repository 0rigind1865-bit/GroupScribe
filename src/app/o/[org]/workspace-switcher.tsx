import type { ModuleDef, ModuleId } from './routes';

// 工作區切換器：群組助理 ⇄ 考勤。
//
// 只在 modules.length >= 2 時渲染——這同時是權限的視覺實現（見 src/org/modules.ts）：
// 只有考勤權限的 org 管理員看不到這一列，畫面上不存在「另一個工作區」。
//
// 切換時不帶任何 query：A 模組的 group id 帶進 B 模組是無意義的
// （比照 group-switcher.tsx 的 KEEP_PARAMS 白名單紀律）。
export function WorkspaceSwitcher({
  modules,
  current,
  slug,
}: {
  modules: ModuleDef[];
  current: ModuleId;
  slug: string;
}) {
  if (modules.length < 2) return null;
  return (
    <nav className="flex gap-0.5 rounded-full bg-gray-100 p-0.5 text-sm" aria-label="工作區">
      {modules.map((m) => {
        const on = m.id === current;
        return (
          <a
            key={m.id}
            href={m.base(slug)}
            aria-current={on ? 'page' : undefined}
            className={`rounded-full px-3 py-1 font-bold whitespace-nowrap ${
              on ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {m.label}
          </a>
        );
      })}
    </nav>
  );
}
