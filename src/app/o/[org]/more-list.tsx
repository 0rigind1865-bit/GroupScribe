import { oh } from '@/org/href';
import { moreItems, type ModuleDef } from './routes';

// 「更多」頁的清單：沒進手機底部 tab 的那些入口。
// 兩個模組共用——項目來自路由表（routes.tsx），加一頁不必動這裡。
export function MoreList({
  slug,
  module,
  ctx,
  extra,
}: {
  slug: string;
  module: ModuleDef;
  ctx?: Record<string, string | undefined>;
  extra?: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl p-5">
      <h1 className="mb-4 text-2xl font-bold">更多</h1>
      <div className="space-y-2">
        {moreItems(module).map((i) => (
          <a
            key={i.key}
            href={oh(slug, `${module.base(slug).slice(`/o/${slug}`.length)}${i.path}`, ctx)}
            className="card flex items-center gap-4 hover:bg-gray-50"
          >
            <svg viewBox="0 0 24 24" className="h-7 w-7 flex-none text-emerald-700" fill="none" stroke="currentColor" strokeWidth="1.6">
              {i.icon}
            </svg>
            <span>
              <span className="block font-bold">{i.label}</span>
              <span className="block text-sm text-gray-500">{i.desc}</span>
            </span>
            <span className="ml-auto text-gray-300">›</span>
          </a>
        ))}
        {extra}
      </div>
    </main>
  );
}
