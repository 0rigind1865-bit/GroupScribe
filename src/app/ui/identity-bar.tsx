import type { ReactNode } from 'react';
import { barState, hasRoleToggle, itemsOf, multiOrg, type Grouped, type Side } from '@/org/surface-groups';
import { ROLE_ICON, TOOL_ICON, toolDesc, toolName, type Tt } from '@/org/surface-meta';
import type { Surface, SurfaceId } from '@/org/surfaces';

// 身分列（docs/identity-switcher-plan.md 第 2 節；畫布「身分切換提案 A」）：
//   由左到右 角色開關 → 工具按鈕 → （電腦版的分頁）→ 情境膠囊（群組／員工）→ 右側（語言地球）
//   顏色只說角色：個人＝淺色、管理＝深色（variant 由 side 決定）。
//
// 刻意做成**同步純元件**：不 import next/headers、不呼叫 surfaces()——資料由頁面層取好傳進來。
// 這樣 node:test 能直接 renderToStaticMarkup 驗七種角色（tests/identity-bar.test.ts），
// 本機不必開會寫正式庫的 /g 頁也能看到每種角色的畫面（審查 F1、F2、F12）。
//
// 所有連結一律 /go/…（routes 守門測試只放行這種），選單用 <details> 零 JS。

const Svg = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const Chevron = () => (
  <svg className="id-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const Check = () => (
  <svg className="id-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12l5 5 9-10" />
  </svg>
);

export type IdentityBarProps = {
  groups: Grouped;
  /** 目前所在的工具（surface key）；找不到就當成該角色第一個 */
  currentKey: string;
  /** 這一頁屬於哪個角色：個人頁（/a、/g）＝me；管理頁（/o、/platform）＝admin */
  side: Side;
  tt: Tt;
  /** 角色開關的字（個人／管理）用的語系；預設＝tt。管理端的工具名仍是中文，但開關要與員工在打卡頁看到的同一種語言（T10 第 3 輪） */
  roleTt?: Tt;
  /** 電腦版頂欄的分頁（管理側）；手機不顯示 */
  navSlot?: ReactNode;
  /** 情境膠囊（群組／員工） */
  contextSlot?: ReactNode;
  /** 最右邊（個人側的語言地球） */
  rightSlot?: ReactNode;
  /** 另一個角色有事等你（只在個人側、畫在「管理」格，審查 F30）。
   *  給字串＝有待辦的那個工具的 key：點「管理」直達那裡，不走「同工具對應」——
   *  否則小點亮著、點下去卻落到沒事的工具（T10 第 1 輪 high） */
  dot?: boolean | string;
  /** 目前這一頁的完整網址（含 ?month、?emp、?tab）：選單的「關閉」與目前那列在沒有 JS 時連回這裡；
   *  沒給＝空 href（瀏覽器解析成目前網址、含 query，T10 第 3 輪） */
  closeHref?: string;
  /** 電腦版最左邊的「群記」字樣（管理側頂欄） */
  brand?: boolean;
  /** 工具選單最下面多一段（管理側：這個工具沒進分頁的頁面，取代原本的「更多」分頁）。
   *  有它就一定有選單——只管一個工具的人也要點得到設定、匯入 */
  menuExtra?: ReactNode;
};

/** 身分列會不會出現（個人側單一工具時整列不渲染，語言地球要改放姓名列——審查 F3） */
export const identityBarShown = (g: Grouped, side: Side) => !(side === 'me' && barState(g, side) === 'c');

export function IdentityBar({ groups, currentKey, side, tt, roleTt = tt, navSlot, contextSlot, rightSlot, dot, brand, closeHref, menuExtra }: IdentityBarProps) {
  if (!identityBarShown(groups, side)) return null;
  const items = itemsOf(groups, side);
  // 目前這頁不在清單裡（非員工的老闆開 /a、不在群裡的人開 /g）：按鈕照實寫這一頁的工具，
  // 選單裡沒有「目前那列」——否則第一個工具被當成目前、那列點了只會收合（最後審查）
  const found = items.find((s) => s.key === currentKey);
  const cur = found ?? items[0];
  const curId: SurfaceId = found?.id ?? (currentKey in TOOL_ICON ? (currentKey as SurfaceId) : cur?.id);
  const dark = side === 'admin';
  const hasMenu = items.length > 1 || !found || !!menuExtra;
  // 公司名：管多家時一定帶；工具畫成純標題（沒有選單）時也帶——那是畫面上唯一說「你在管哪家」的地方（F9、T10 第 1 輪）
  const withOrg = side === 'admin' && !!cur?.orgName && (multiOrg(groups) || !hasMenu);
  // 第二行：公司名；平台段的工具（未認領的群）寫「平台」
  // 補進來的工具（平台擁有者站在這家沒開的工具）：標「未開通」——這家的管理者看不到這裡（T10 第 3 輪）
  const orgLine = cur?.role === 'platform' && cur.slug ? '平台' : withOrg ? `${cur?.orgName}${cur?.injected ? ' · 未開通' : ''}` : undefined;
  const here = closeHref ?? '';
  const total = itemsOf(groups, 'me').length + itemsOf(groups, 'admin').length;

  const tool = cur && (
    <>
      <span className="id-tile">
        <Svg>{TOOL_ICON[curId]}</Svg>
      </span>
      <span className="id-tool-text">
        <span className="id-tool-name">{toolName(curId, tt)}</span>
        {orgLine && <span className="id-tool-org">{orgLine}</span>}
      </span>
    </>
  );

  return (
    <div className={`id-bar ${dark ? 'id-bar--dark' : 'id-bar--light'}`}>
      {brand && (
        <span className="id-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark-512.png" alt="" />
          群記
        </span>
      )}

      {hasRoleToggle(groups) && (
        <>
          <nav className="id-toggle" aria-label={roleTt('SWITCH_ROLE')}>
            {(['me', 'admin'] as const).map((r) =>
              r === side ? (
                <span key={r} className="id-role" aria-current="page">
                  <Svg size={15}>{ROLE_ICON[r]}</Svg>
                  {roleTt(r === 'me' ? 'ROLE_ME' : 'ROLE_ADMIN')}
                </span>
              ) : (
                <a
                  key={r}
                  className="id-role"
                  // 小點直達也帶 from：回程按「個人」才回得到剛離開的那一格（T10 第 2 輪）
                  href={`/go/${r === 'admin' && typeof dot === 'string' ? encodeURIComponent(dot) : `@${r}`}?from=${encodeURIComponent(found?.key ?? currentKey)}`}
                >
                  <Svg size={15}>{ROLE_ICON[r]}</Svg>
                  {roleTt(r === 'me' ? 'ROLE_ME' : 'ROLE_ADMIN')}
                  {r === 'admin' && dot && <span className="id-dot" role="img" aria-label={roleTt('HAS_PENDING')} />}
                </a>
              ),
            )}
          </nav>
          <span className="id-sep" aria-hidden="true" />
        </>
      )}

      {cur &&
        (hasMenu ? (
          // data-no-swipe 掛在 details：遮罩是 summary::before，在遮罩上滑動不該換分頁（T10 第 2 輪）
          <details className="id-menu" data-no-swipe="">
            <summary className="id-tool" aria-label={`${toolName(curId, tt)}${orgLine ? ` · ${orgLine}` : ''}, ${tt('SWITCH_TOOL')}`}>
              {tool}
              <Chevron />
            </summary>
            <div className="id-panel">
              {/* 關閉＝收合、留在原頁（root layout 的一行腳本攔截）；沒有 JS 時連回目前完整網址（T10 第 1 輪 high） */}
              <a className="id-close" href={here}>
                {tt('CLOSE')}
              </a>
              {/* 這個工具的其他頁面放最上面：比換工具、換公司常用（平台擁有者的清單很長，放後面要捲很久） */}
              {menuExtra}
              <Sections groups={groups} side={side} curKey={found?.key} tt={tt} here={here} />
              {total >= 2 && (
                <a className="id-all" href="/?menu=1">
                  {tt(hasRoleToggle(groups) ? 'SEE_ALL_ROLES' : 'SEE_ALL_TOOLS')}
                </a>
              )}
            </div>
          </details>
        ) : (
          <span className="id-tool id-tool--title">{tool}</span>
        ))}

      {navSlot && <div className="id-nav">{navSlot}</div>}
      {contextSlot && <div className="id-context">{contextSlot}</div>}
      {rightSlot && <div className="id-right">{rightSlot}</div>}
    </div>
  );
}

function Sections({ groups, side, curKey, tt, here }: { groups: Grouped; side: Side; curKey?: string; tt: Tt; here: string }) {
  // 目前那列＝關閉（留在原頁）；不經 /go/——補進來的 key 不在清單裡，走 /go/ 會被送到別家（T10 第 1 輪）
  const row = (s: Surface) => (
    <a key={s.key} className="id-row" href={s.key === curKey ? here : `/go/${encodeURIComponent(s.key)}`} aria-current={s.key === curKey ? 'page' : undefined}>
      <span className="id-row-tile">
        <Svg size={20}>{TOOL_ICON[s.id]}</Svg>
      </span>
      <span className="id-row-text">
        <span className="id-row-name">{toolName(s.id, tt)}</span>
        <span className="id-row-desc">{s.injected ? '這家公司沒開這個工具，只有平台擁有者看得到' : toolDesc(s.id, tt)}</span>
      </span>
      {s.key === curKey && <Check />}
    </a>
  );
  if (side === 'me')
    return (
      <section>
        <h2 className="id-sec">{hasRoleToggle(groups) ? tt('ROLE_ME') : tt('YOUR_TOOLS')}</h2>
        {groups.me.map(row)}
      </section>
    );
  return (
    <>
      {groups.admin.map((o) => (
        <section key={o.slug}>
          <h2 className="id-sec">
            {tt('ROLE_ADMIN')} · {o.name}
          </h2>
          {o.items.map(row)}
        </section>
      ))}
      {groups.platform.length > 0 && (
        <section>
          <h2 className="id-sec">平台</h2>
          {groups.platform.map(row)}
        </section>
      )}
    </>
  );
}
