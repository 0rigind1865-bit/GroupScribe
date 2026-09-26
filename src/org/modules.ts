import { cache } from 'react';
import { ATTEND_MODULE, EXPENSE_MODULE, GS_MODULE, type ModuleDef } from '@/app/o/[org]/routes';
import { isPlatformOwner, orgBySlug, orgRole, orgSettings, type Org } from './orgs';
import { enabledModuleIds } from './module-ids';

// 模組可見性的單一判定點。
//
// 規則一句話（商業計劃 2.1 節 A1 之後）：
//   平台擁有者 ＝ 全部模組
//   org_members ＝ org_settings.modules 開的那些（migration 015；沒有列 → 只有考勤，維持開放前的狀態）
//
// 為什麼「看不到」比「點了才發現被鎖」重要（使用者定調）：
//   LINE 群組裡可能有別家公司的人，他們該看得到本群的群組助理內容，
//   但完全不該知道考勤系統的存在。同理，別家公司的 org 管理員也不該看到
//   我們自己的群組助理。模組數 < 2 時工作區切換器整條不渲染——
//   沒權限的人連「有另一個工作區」這件事都看不到。
export type OrgAccess = { org: Org; modules: ModuleDef[]; owner: boolean };

/** org_settings.modules → 模組清單（純邏輯在 module-ids.ts，供測試） */
export function modulesOf(setting: unknown): ModuleDef[] {
  const ids = enabledModuleIds(setting);
  return [GS_MODULE, ATTEND_MODULE, EXPENSE_MODULE].filter((m) => ids.includes(m.id));
}

// 同一次請求裡三層 layout 都會問，cache() 去重（orgBySlug 另有 30s TTL 快取）
export const visibleModules = cache(async (slug: string): Promise<OrgAccess | null> => {
  const org = await orgBySlug(slug);
  if (!org) return null;
  const owner = await isPlatformOwner();
  const role = owner ? 'owner' : await orgRole(org.id);
  if (!owner && !role) return null; // 兩者皆非：呼叫端 notFound()，不洩漏 org 是否存在
  const modules = owner ? [GS_MODULE, ATTEND_MODULE, EXPENSE_MODULE] : modulesOf((await orgSettings(org.id)).modules);
  return { org, modules, owner };
});
