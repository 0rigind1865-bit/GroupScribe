import type { ExpenseItem } from './types';

// 資料庫的一列 expenses → 畫面用的 ExpenseItem（員工 App、後台分析、CSV 匯出共用）
// v2／v3 欄位（migration 023／027）還沒建時給預設值
export function rowToItem(r: Record<string, any>, photo: string | null = null): ExpenseItem {
  return {
    id: r.id,
    amount: r.amount,
    category: r.category,
    note: r.note ?? '',
    vendor: r.vendor ?? '',
    project: r.project ?? '',
    pay_method: r.pay_method ?? '代墊',
    invoice_no: r.invoice_no ?? '',
    spent_on: r.spent_on,
    spent_at: r.spent_at ?? null,
    place_name: r.place_name ?? '',
    reimbursed: !!r.reimbursed_at,
    photo,
    person: r.person_name ?? '',
  };
}

/** 收據照片在哪：網頁上傳的在 photo_path、私訊的在 media_assets */
export const photoPathOf = (r: Record<string, any>): string | null => r.photo_path ?? r.media_assets?.storage_path ?? null;
