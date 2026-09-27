import { notFound } from 'next/navigation';
import { visibleModules } from '@/org/modules';
import { orgBySlug } from '@/org/orgs';
import { surfaces } from '@/org/surfaces';
import { groupSurfaces } from '@/org/surface-groups';
import { locale, t } from '@/attend/i18n';
import { IdentityBar } from '@/app/ui/identity-bar';
import { moduleById, type ModuleId } from './routes';
import { TopNav, type Counts } from './nav';

// 管理端頂欄（docs/identity-switcher-plan.md 第 2 節；畫布 IdAdminAttend／IdDesktopGs／IdDesktopMenu）：
//   一條深色帶，手機也是（深色＝在管公司）：角色開關 → 工具按鈕 → 電腦版分頁 → 情境膠囊（群組／員工）
//   公司名不再放右邊：只管一家時在工具選單標題；管多家、或站在清單外的公司時工具按鈕寫「考勤 · 公司A」。
//   手機不黏頂（往下捲就讓位給內容）；電腦黏頂。所有路徑由 IdentityBar 從 surfaces 產生，這裡只傳資料。
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
  const [org, { list }, loc] = await Promise.all([orgBySlug(slug), surfaces(), locale()]);
  // 未認領的群不是一家公司：歸在平台那一段（F42）
  const currentKey = slug === 'unclaimed' ? 'unclaimed' : `${mod.id}:${slug}`;
  const groups = groupSurfaces(list, { slug, name: org?.name ?? slug, id: mod.id });

  return (
    <header className="shell-bar md:sticky md:top-0 md:z-30">
      <IdentityBar
        groups={groups}
        currentKey={currentKey}
        side="admin"
        tt={(k, p) => t('zh-TW', k, p)}
        // 角色開關跟員工端同一種語言：越南籍的員工兼管理者兩側看到同樣的「Tôi｜Quản lý」（T10 第 3 輪）
        roleTt={(k, p) => t(loc, k, p)}
        brand
        // 未認領的群只有群組清單一頁：不畫群組助理的分頁（身分列說「未認領的群」，分頁卻是今天／收件匣，T10 第 2 輪）
        navSlot={slug === 'unclaimed' ? undefined : <TopNav moduleId={mod.id} counts={counts} />}
        contextSlot={context}
      />
    </header>
  );
}
