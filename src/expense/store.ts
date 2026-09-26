// 報帳 v2 欄位（migration 023）的向後相容寫入：欄位還不存在時，自動退回只寫 v1 欄位。
// 早上可能先部署、後貼 SQL——這段時間員工記帳不能失敗。

export const V2_FIELDS = ['pay_method', 'source', 'photo_path', 'lat', 'lng', 'place_name'] as const;

type Err = { code?: string; message?: string } | null;

/** PostgREST／Postgres 的「欄位不存在」 */
export const isMissingColumn = (e: Err): boolean =>
  !!e && (e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(e.message ?? ''));

export function stripV2<T extends Record<string, unknown>>(row: T): Partial<T> {
  const out: Record<string, unknown> = { ...row };
  for (const k of V2_FIELDS) delete out[k];
  return out as Partial<T>;
}

/** 先照原樣寫；欄位不存在就拿掉 v2 欄位再寫一次 */
export async function withV2Fallback<T extends Record<string, unknown>, R extends { error: Err }>(
  row: T,
  run: (row: Partial<T>) => PromiseLike<R>,
): Promise<R> {
  const r = await run(row);
  return r.error && isMissingColumn(r.error) ? run(stripV2(row)) : r;
}
