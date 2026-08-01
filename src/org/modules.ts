import { cache } from 'react';
import { ATTEND_MODULE, GS_MODULE, type ModuleDef } from '@/app/o/[org]/routes';
import { isPlatformOwner, orgBySlug, orgRole, type Org } from './orgs';

// 模組可見性的單一判定點。
//
// 規則一句話：
//   群組助理（gs）＝ 平台擁有者專屬（middleware 已是硬牆，不動）
//   考勤（attend）＝ 平台擁有者 ∪ org_members
//
// 為什麼「看不到」比「點了才發現被鎖」重要（使用者定調）：
//   LINE 群組裡可能有別家公司的人，他們該看得到本群的群組助理內容，
//   但完全不該知道考勤系統的存在。同理，別家公司的 org 管理員也不該看到
//   我們自己的群組助理。模組數 < 2 時工作區切換器整條不渲染——
//   沒權限的人連「有另一個工作區」這件事都看不到。
export type OrgAccess = { org: Org; modules: ModuleDef[]; owner: boolean };

// 同一次請求裡三層 layout 都會問，cache() 去重（orgBySlug 另有 30s TTL 快取）
export const visibleModules = cache(async (slug: string): Promise<OrgAccess | null> => {
  const org = await orgBySlug(slug);
  if (!org) return null;
  const owner = await isPlatformOwner();
  const role = owner ? 'owner' : await orgRole(org.id);
  if (!owner && !role) return null; // 兩者皆非：呼叫端 notFound()，不洩漏 org 是否存在
  return { org, modules: owner ? [GS_MODULE, ATTEND_MODULE] : [ATTEND_MODULE], owner };
});
