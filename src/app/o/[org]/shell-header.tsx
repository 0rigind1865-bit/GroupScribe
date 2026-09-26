import { notFound } from 'next/navigation';
import { visibleModules } from '@/org/modules';
import { orgBySlug } from '@/org/orgs';
import { moduleById, type ModuleId } from './routes';
import { IdentityMenu } from '@/app/ui/surface-switcher';
import { TopNav, type Counts } from './nav';

// 管理端頂欄（照設計稿 2026-09）：
//   桌機：一條深色橫條＝「群記 · 模組名」＋完整 nav＋右側 context（群組／員工）＋「公司名 ▾」身分選單
//   手機：一小行＝「公司名 ▾」＋ context 小膠囊，不黏頂——往下捲就讓位給內容；nav 交給底部膠囊
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
  const mod = moduleById(moduleId);
  const org = await orgBySlug(slug);

  return (
    <header className="shell-bar px-4 pt-2 md:sticky md:top-0 md:z-30 md:px-10 md:py-3">
      <div className="mx-auto flex max-w-[1200px] items-center gap-3 md:gap-6">
        <span className="hidden font-black whitespace-nowrap md:block" style={{ fontFamily: 'var(--font-title)', fontSize: 20 }}>
          群記{mod.id === 'gs' ? '' : ` · ${mod.label}`}
        </span>
        <div className="min-w-0 md:order-last">
          <IdentityMenu current={mod.id} slug={slug} label={org?.name ?? slug} />
        </div>
        <div className="hidden min-w-0 flex-1 md:block">
          <TopNav moduleId={mod.id} counts={counts} />
        </div>
        {context && <div className="ml-auto flex-none md:ml-0">{context}</div>}
      </div>
    </header>
  );
}
