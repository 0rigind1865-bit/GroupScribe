import { oh } from '@/org/href';
import { moreItems, type ModuleDef } from './routes';
import { surfaces } from '@/org/surfaces';

// 「更多」頁的清單：沒進手機底部 tab 的那些入口。
// 兩個模組共用——項目來自路由表（routes.tsx），加一頁不必動這裡。
export async function MoreList({
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
  // 手機頂欄拿掉面向切換器後，「換身分」的入口在這裡（桌機頂欄仍有）
  const others = (await surfaces()).list.filter((s) => !(s.id === module.id && s.slug === slug));
  return (
    <main className="mx-auto max-w-3xl p-5">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">更多</h1>
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
      {others.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-sm font-medium text-gray-500">切換身分</h2>
          <div className="space-y-2">
            {others.map((s) => (
              <a key={s.key} href={`/go/${encodeURIComponent(s.key)}`} className="card flex items-center gap-4 hover:bg-gray-50">
                <span className="font-semibold">{s.label}</span>
                <span className="ml-auto text-gray-300">›</span>
              </a>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
