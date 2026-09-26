import type { ReactNode } from 'react';
import { barState, hasRoleToggle, itemsOf, multiOrg, type Grouped, type Side } from '@/org/surface-groups';
import { ROLE_ICON, TOOL_ICON, toolDesc, toolName, type Tt } from '@/org/surface-meta';
import type { Surface } from '@/org/surfaces';

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
  /** 電腦版頂欄的分頁（管理側）；手機不顯示 */
  navSlot?: ReactNode;
  /** 情境膠囊（群組／員工） */
  contextSlot?: ReactNode;
  /** 最右邊（個人側的語言地球） */
  rightSlot?: ReactNode;
  /** 另一個角色有事等你（只在個人側、畫在「管理」格，審查 F30） */
  dot?: boolean;
  /** 電腦版最左邊的「群記」字樣（管理側頂欄） */
  brand?: boolean;
};

/** 身分列會不會出現（個人側單一工具時整列不渲染，語言地球要改放姓名列——審查 F3） */
export const identityBarShown = (g: Grouped, side: Side) => !(side === 'me' && barState(g, side) === 'c');

export function IdentityBar({ groups, currentKey, side, tt, navSlot, contextSlot, rightSlot, dot, brand }: IdentityBarProps) {
  if (!identityBarShown(groups, side)) return null;
  const items = itemsOf(groups, side);
  const cur = items.find((s) => s.key === currentKey) ?? items[0];
  const state = barState(groups, side);
  const dark = side === 'admin';
  // 公司名：管多家時一定帶；管理側單一工具（c 態）也帶——那是畫面上唯一說「你在管哪家」的地方（F9）
  const withOrg = side === 'admin' && !!cur?.orgName && (multiOrg(groups) || state === 'c');
  const hasMenu = items.length > 1;
  const total = itemsOf(groups, 'me').length + itemsOf(groups, 'admin').length;

  const tool = cur && (
    <>
      <span className="id-tile">
        <Svg>{TOOL_ICON[cur.id]}</Svg>
      </span>
      <span className="id-tool-text">
        <span className="id-tool-name">{toolName(cur.id, tt)}</span>
        {withOrg && <span className="id-tool-org">{cur.orgName}</span>}
      </span>
    </>
  );

  return (
    <div className={`id-bar ${dark ? 'id-bar--dark' : 'id-bar--light'}`}>
      {brand && <span className="id-brand">群記</span>}

      {hasRoleToggle(groups) && (
        <>
          <nav className="id-toggle" aria-label={tt('SWITCH_ROLE')}>
            {(['me', 'admin'] as const).map((r) =>
              r === side ? (
                <span key={r} className="id-role" aria-current="page">
                  <Svg size={15}>{ROLE_ICON[r]}</Svg>
                  {tt(r === 'me' ? 'ROLE_ME' : 'ROLE_ADMIN')}
                </span>
              ) : (
                <a key={r} className="id-role" href={`/go/@${r}?from=${encodeURIComponent(cur?.key ?? '')}`}>
                  <Svg size={15}>{ROLE_ICON[r]}</Svg>
                  {tt(r === 'me' ? 'ROLE_ME' : 'ROLE_ADMIN')}
                  {r === 'admin' && dot && <span className="id-dot" aria-label={tt('HAS_PENDING')} />}
                </a>
              ),
            )}
          </nav>
          <span className="id-sep" aria-hidden="true" />
        </>
      )}

      {cur &&
        (hasMenu ? (
          <details className="id-menu">
            <summary className="id-tool" aria-label={tt('SWITCH_TOOL')}>
              {tool}
              <Chevron />
            </summary>
            <div className="id-panel" data-no-swipe="">
              <a className="id-close" href={cur.href}>
                {tt('CLOSE')}
              </a>
              <Sections groups={groups} side={side} cur={cur} tt={tt} />
              {total >= 2 && (
                <a className="id-all" href="/?menu=1">
                  {tt('SEE_ALL_ROLES')}
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

function Sections({ groups, side, cur, tt }: { groups: Grouped; side: Side; cur: Surface; tt: Tt }) {
  const row = (s: Surface) => (
    <a key={s.key} className="id-row" href={`/go/${encodeURIComponent(s.key)}`} aria-current={s.key === cur.key ? 'page' : undefined}>
      <span className="id-row-tile">
        <Svg size={20}>{TOOL_ICON[s.id]}</Svg>
      </span>
      <span className="id-row-text">
        <span className="id-row-name">{toolName(s.id, tt)}</span>
        <span className="id-row-desc">{toolDesc(s.id, tt)}</span>
      </span>
      {s.key === cur.key && <Check />}
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
