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
  // 「換身分」的入口：手機在這裡，桌機與手機頂端的「公司名 ▾」也有
  const others = (await surfaces()).list.filter((s) => !(s.id === module.id && s.slug === slug));
  return (
    <main className="page">
      <h1 className="mb-5">更多</h1>
      <div className="space-y-2">
        {moreItems(module).map((i) => (
          <a
            key={i.key}
            href={oh(slug, `${module.base(slug).slice(`/o/${slug}`.length)}${i.path}`, ctx)}
            className="card flex items-center gap-4 hover:bg-gray-50"
          >
            {/* 設計稿：圖示放進淡綠圓角方塊 */}
            <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-emerald-100 text-emerald-700">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                {i.icon}
              </svg>
            </span>
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
          <h2 className="mt-6 mb-2 section-title">切換身分</h2>
          <div className="space-y-2">
            {others.map((s) => (
              <a key={s.key} href={`/go/${encodeURIComponent(s.key)}`} className="card flex items-center gap-4 hover:bg-gray-50">
                <span className="font-semibold">{s.label}</span>
                <span className="ml-auto text-gray-300">›</span>
              </a>
            ))}
            {/* 回到首頁的身分選單：記住選擇後首頁會直接跳走，這是回去重選的唯一明顯入口 */}
            <a href="/?menu=1" className="card flex items-center gap-4 hover:bg-gray-50">
              <span>
                <span className="block font-semibold">回到身分選單</span>
                <span className="block text-sm text-gray-500">看你所有的身分，重新選一個下次直接進入的</span>
              </span>
              <span className="ml-auto text-gray-300">›</span>
            </a>
          </div>
        </>
      )}
    </main>
  );
}
