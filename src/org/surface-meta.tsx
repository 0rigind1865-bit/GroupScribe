import type { ReactNode } from 'react';
import { I } from '@/app/o/[org]/routes';
import type { MsgKey } from '@/attend/i18n';
import type { Surface, SurfaceId } from './surfaces';

// 身分列、工具選單、首頁選單的名稱／說明／圖示單一來源（docs/identity-switcher-plan.md 2.1、2.2）。
//
// 規則：圖示只說工具，兩個角色共用同一個（時鐘＝打卡／考勤、收據＝報帳、雙對話框＝群組／群組助理）；
// 名稱不帶「我的／我要／管理」——角色交給第一層的「個人｜管理」去說。
// 個人側給員工看，走 attend/i18n 五語系；管理側維持中文（操作者是台灣管理員，同 attend/i18n 註解）。

export const TOOL_ICON: Record<SurfaceId, ReactNode> = {
  punch: I.clock,
  attend: I.clock,
  myexpense: I.receipt,
  expense: I.receipt,
  groups: I.chat,
  gs: I.chat,
  platform: I.grid,
  unclaimed: I.chat, // 未認領的群本質是群組；同一段兩列不共用圖示（畫布 SPEC v2 §H）
};

export const ROLE_ICON = { me: I.person, admin: I.briefcase };

const ME: Partial<Record<SurfaceId, { name: MsgKey; desc: MsgKey }>> = {
  punch: { name: 'TOOL_PUNCH', desc: 'DESC_PUNCH' },
  myexpense: { name: 'TOOL_EXPENSE', desc: 'DESC_MYEXPENSE' },
  groups: { name: 'TOOL_GROUPS', desc: 'DESC_GROUPS' },
};

const ADMIN: Partial<Record<SurfaceId, { name: string; desc: string }>> = {
  gs: { name: '群組助理', desc: '群組行程、待辦與收件匣把關' },
  attend: { name: '考勤', desc: '員工、補卡審核、報表與薪資' },
  expense: { name: '報帳', desc: '員工代墊的收據、核銷與匯出' },
  platform: { name: '平台管理', desc: '所有公司、未認領的群、方案' },
  unclaimed: { name: '未認領的群', desc: '等管理員認領，7 天沒人要就退群' },
};

export type Tt = (key: MsgKey, params?: Record<string, string | number>) => string;

/** 工具名（不含公司）：個人側照語系、管理側中文 */
export function toolName(id: SurfaceId, tt: Tt): string {
  const m = ME[id];
  return m ? tt(m.name) : (ADMIN[id]?.name ?? id);
}

/** 工具說明（選單每列一行） */
export function toolDesc(id: SurfaceId, tt: Tt): string {
  const m = ME[id];
  // 報帳 App 目前只有繁中（審查 F20 最小版）：非中文語系的 DESC_MYEXPENSE 自帶「（只有中文）」
  return m ? tt(m.desc) : (ADMIN[id]?.desc ?? '');
}

/** 「考勤 · 公司A」——多家公司時用；個人側或沒有公司時只回工具名 */
export function toolLabel(s: Surface, tt: Tt, withOrg: boolean): string {
  const name = toolName(s.id, tt);
  return withOrg && s.orgName && s.role === 'admin' ? `${name} · ${s.orgName}` : name;
}
