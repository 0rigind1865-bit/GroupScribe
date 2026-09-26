import { oh } from '@/org/href';
import { moreItems, type ModuleDef } from './routes';
import { surfaces } from '@/org/surfaces';
import { groupSurfaces, hasRoleToggle } from '@/org/surface-groups';
import { t } from '@/attend/i18n';

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
  // 換身分、換工具、換公司都在頂端身分列（工具名 ▾）；這裡只留一行回首頁選單。
  // 只有一種身分時不顯示——那一頁沒有別的選擇，點了只會看到自己（審查 F6）
  const { list } = await surfaces();
  const total = list.length;
  // 沒有角色開關的人說「看全部工具」，與抽屜同一個規則（T10 第 2 輪）
  const see = t('zh-TW', hasRoleToggle(groupSurfaces(list)) ? 'SEE_ALL_ROLES' : 'SEE_ALL_TOOLS');
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
      {total >= 2 && (
        <a href="/?menu=1" className="mt-6 block px-1 py-3 text-sm text-gray-500 hover:text-gray-700">
          {see}
        </a>
      )}
    </main>
  );
}
