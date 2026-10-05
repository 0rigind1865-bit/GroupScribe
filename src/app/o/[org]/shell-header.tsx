import { notFound } from 'next/navigation';
import { visibleModules } from '@/org/modules';
import { orgBySlug } from '@/org/orgs';
import { surfaces } from '@/org/surfaces';
import { groupSurfaces } from '@/org/surface-groups';
import { locale, t } from '@/attend/i18n';
import { IdentityBar } from '@/app/ui/identity-bar';
import { oh } from '@/org/href';
import { liffUrl } from '@/core/ingest';
import { moduleById, moreItems, type ModuleId } from './routes';
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
  // 工具選單最下面一段＝沒進分頁的頁面（取代原本的「更多」分頁，2026-10 設計畫布「身分與工具選單」）。
  // 路徑來自路由表；群組助理多一列「給成員的連結」（未設 LIFF_ID 時不出現）
  const sub = mod.base(slug).slice(`/o/${slug}`.length);
  const liff = mod.id === 'gs' ? liffUrl() : null;
  const extra = slug === 'unclaimed' ? null : (
    <section>
      <h2 className="id-sec">{mod.label} · 其他頁面</h2>
      {moreItems(mod).map((i) => {
        const n = i.badge ? (counts?.[i.badge] ?? 0) : 0;
        return (
          <a key={i.key} className="id-row" href={oh(slug, `${sub}${i.path}`)}>
            <span className="id-row-tile">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {i.icon}
              </svg>
            </span>
            <span className="id-row-text">
              <span className="id-row-name">{i.label}</span>
              <span className="id-row-desc">{i.desc}</span>
            </span>
            {n > 0 && <span className="id-count">{n > 99 ? '99+' : n}</span>}
          </a>
        );
      })}
      {liff && (
        <a className="id-row" href={liff} target="_blank" rel="noreferrer">
          <span className="id-row-tile">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="6" y="2" width="12" height="20" rx="2" />
              <path d="M11 18h2" />
            </svg>
          </span>
          <span className="id-row-text">
            <span className="id-row-name">給成員的連結</span>
            <span className="id-row-desc">貼到 LINE 群，成員點了會看到群組的行程、待辦與公告</span>
          </span>
        </a>
      )}
    </section>
  );

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
        menuExtra={extra}
      />
    </header>
  );
}
