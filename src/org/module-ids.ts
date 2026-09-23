// 模組開關的純邏輯（不 import 路由表——routes.tsx 含 JSX，測試環境載不進來）。
export type ModuleId = 'gs' | 'attend';
export const MODULE_IDS: ModuleId[] = ['gs', 'attend'];

/** org_settings.modules → 開啟的模組 id（順序固定 gs → attend）；未知值忽略、null 視同只開考勤 */
export function enabledModuleIds(setting: unknown): ModuleId[] {
  const names = Array.isArray(setting) ? setting.map(String) : ['attend'];
  return MODULE_IDS.filter((id) => names.includes(id));
}
