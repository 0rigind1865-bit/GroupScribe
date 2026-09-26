// 模組開關的純邏輯（不 import 路由表——routes.tsx 含 JSX，測試環境載不進來）。
export type ModuleId = 'gs' | 'attend' | 'expense';
export const MODULE_IDS: ModuleId[] = ['gs', 'attend', 'expense'];

/** org_settings.modules → 開啟的模組 id（順序固定 gs → attend → expense）；未知值忽略、null 視同只開考勤 */
export function enabledModuleIds(setting: unknown): ModuleId[] {
  const names = Array.isArray(setting) ? setting.map(String) : ['attend'];
  return MODULE_IDS.filter((id) => names.includes(id));
}

/**
 * 管理者實際能管的模組＝公司開的模組 ∩ 這位管理者被授權的模組（org_members.modules，migration 028）。
 *
 * 為什麼要有第二層：原本管理權是「整家公司」一顆開關。在考勤員工頁把會計設成管理員，
 * 他就同時拿到群組助理——能讀全公司 LINE 群組的整理內容，違反「權限即可見性」。
 *
 *   owner             ＝ 公司開的全部（擁有者不能被限縮，否則可能把自己鎖在門外）
 *   memberModules=null＝ 公司開的全部（migration 前的既有管理員，行為不變）
 *   memberModules=[…] ＝ 只取交集；未知值忽略
 */
export function scopedModuleIds(orgModules: ModuleId[], role: string | null, memberModules: unknown): ModuleId[] {
  if (role === 'owner' || !Array.isArray(memberModules)) return orgModules;
  const allowed = memberModules.map(String);
  return orgModules.filter((id) => allowed.includes(id));
}

/**
 * 考勤「員工管理」的管理權開關：只動 attend 這一格，不碰此人在其他模組的權限。
 * 回傳要寫入的 modules，或 'keep'（不用寫）／'delete'（刪掉整列）。
 *   新人設為管理員      → ['attend']（只能管考勤，看不到群組助理）
 *   owner               → 一律 keep（擁有者不可被此開關限縮或移除）
 *   modules=null 的舊管理員：開 → keep（本來就全部）；關 → delete（改版前的完整撤權）
 *   拿掉最後一格        → delete
 */
export function attendAdminToggle(
  cur: { role: string; modules: string[] | null } | null,
  orgModules: ModuleId[],
  on: boolean,
): string[] | 'keep' | 'delete' {
  if (cur?.role === 'owner') return 'keep';
  if (!cur) return on ? ['attend'] : 'keep';
  // 改版前的管理員（null＝整家公司）幾乎都是從這一頁加的：按「移除」維持原本的完整撤權，
  // 否則只拿掉考勤、群組助理和報帳的權限還留著，而這頁的徽章卻消失——擁有者會以為已經撤掉了
  if (cur.modules === null) return on ? 'keep' : 'delete';
  const have = cur.modules;
  if (on) return have.includes('attend') ? 'keep' : [...have, 'attend'];
  if (!have.includes('attend')) return 'keep';
  const rest = have.filter((m) => m !== 'attend');
  return rest.length ? rest : 'delete';
}

/** Supabase 錯誤是不是「org_members.modules 欄不存在」（migration 028 還沒跑）。
 *  只有這種錯誤才退回舊查詢；網路或逾時等其他錯誤不能退回，否則會暫時把只管考勤的人放成全部模組。 */
export function isMissingModulesColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === '42703' || /modules/.test(error.message ?? ''));
}
