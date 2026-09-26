// 從 Snaptab lib/invoice.ts 搬來（X2 待決項的先行部分）：只有「QR 內容 → 發票資料」的解析，
// 不含相機掃描——掃描要 jsqr 套件（新依賴），等 jielin 決定要不要加（見夜間計劃早晨報告）。
// 接上掃描後：左碼 total／rocDate／invoiceNo 直接填進記一筆表單。
//
// 台灣電子發票證明聯「左右兩個 QR」解析。依財政部「電子發票證明聯一維及二維條碼規格」v1.7。
//
// 左碼前 77 個字元為定長欄位:
//   [0:10]  發票字軌號碼 (2 英文 + 8 數字,如 AB12345678)
//   [10:17] 開立日期 (民國 YYYMMDD)
//   [17:21] 隨機碼 (4)
//   [21:29] 銷售額 (8,16 進位,未稅)
//   [29:37] 總計額 (8,16 進位,含稅)  ← 報帳要的金額
//   [37:45] 買方統編 (8)
//   [45:53] 賣方統編 (8)
//   [53:77] 加密驗證 (24)
// 第 77 字元之後,每個欄位前皆以「:」區隔,依序為:
//   (9)  營業人自行使用區 (10 碼;不使用時為 10 個 '*')  ← 注意:此欄常為 '**********',不可當品項
//   (10) 二維條碼記載完整品目筆數(左右兩碼合計)
//   (11) 該張發票交易品目總筆數(整張發票)
//   (12) 中文編碼參數 (0=Big5,1=UTF-8,2=Base64)
//   (13+) 品名:數量:單價 …(不敷記載則接續於右碼)
// 右碼:首 2 碼固定 '**',其後為接續左碼的品項欄位。

export interface InvoiceData {
  invoiceNo: string; // 發票號碼
  rocDate: string; // 開立日期(民國 YYYMMDD)
  total: number; // 總計金額(含稅)
  items: string[]; // 品項明細(左碼前段 +(可選)右碼後段)
  itemCount: number; // 已解析到的品項筆數
  qrItemCount: number; // QR(左右合計)記載的品項數(規格欄位 10)
  totalItemCount: number; // 整張發票品項總數(規格欄位 11)— 顯示 n/總 用
  complete: boolean; // 是否已取得整張發票的完整明細
}

/** jsQR 解出的單一 QR:文字 + 原始位元組(中文明細依編碼可能為 Big5) */
export interface RawCode {
  data: string;
  binary?: Uint8Array;
}

const INVOICE_NO_RE = /^[A-Z]{2}\d{8}$/;
const ITEM_LIMIT = 100;

/** 是否為左碼(前 10 字為發票字軌號碼) */
export function isLeftCode(data: string): boolean {
  return (
    !!data && data.length >= 37 && INVOICE_NO_RE.test(data.slice(0, 10).toUpperCase())
  );
}

/** 是否為右碼(以 ** 起頭的接續碼) */
export function isRightCode(data: string): boolean {
  return !!data && /^\s*\*\*/.test(data);
}

/**
 * 解出整段字串。不盲信中文編碼旗標(實務上 POS 常把 Big5/UTF-8 旗標設錯):
 * 先以「嚴格 UTF-8」解,合法即用;非合法 UTF-8(多為 Big5)再以 Big5 解。
 * Base64(enc=2)的品名為 ASCII,UTF-8 可解,之後由 decodeName 再 base64 還原。
 * 沒有 binary 或皆失敗時退回 jsQR 的文字。
 */
function decodeAll(binary: Uint8Array | undefined, fallback: string): string {
  if (binary && binary.length && typeof TextDecoder !== 'undefined') {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(binary);
    } catch {
      try {
        return new TextDecoder('big5', { fatal: false }).decode(binary);
      } catch {
        /* 兩者皆失敗,退回原字串 */
      }
    }
  }
  return fallback;
}

/** Base64(編碼=2)的品名 → UTF-8 字串;失敗則原樣回傳。 */
function decodeName(name: string, enc: string | undefined): string {
  if (enc !== '2') return name;
  try {
    const bin = atob(name);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return name;
  }
}

/** 把「品名:數量:單價」三個一組轉成顯示字串,最多取 cap 筆。 */
function groupItems(fields: string[], enc: string | undefined, cap: number): string[] {
  const items: string[] = [];
  for (let i = 0; i < fields.length && items.length < cap; i += 3) {
    const rawName = fields[i];
    const qty = fields[i + 1];
    if (!rawName) continue;
    const name = decodeName(rawName, enc);
    const hasQty = qty && /^\d+$/.test(qty) && qty !== '1';
    items.push(hasQty ? `${name}×${qty}` : name);
  }
  return items;
}

/**
 * 解析台灣電子發票 QR。一定要有左碼;右碼可選(沒有就只取前段品項)。
 * 非電子發票左碼則回 null。
 */
export function parseInvoiceCodes(
  left: RawCode,
  right?: RawCode | null,
): InvoiceData | null {
  if (!left || !isLeftCode(left.data)) return null;
  const d = left.data;
  const invoiceNo = d.slice(0, 10).toUpperCase();
  const rocDate = d.slice(10, 17);
  const total = parseInt(d.slice(29, 37), 16);

  // 77 字後依「位置」取欄位(不可 filter,因為營業人自用區可能為空字串會位移)。
  // 開頭的 ':' 會產生一個空字串,故:[0]='' [1]=營業人自用 [2]=完整品目筆數 [3]=發票總筆數 [4]=編碼 [5..]=品項
  const ascii = d.slice(77).split(':');
  const qrItemCount = parseInt(ascii[2] ?? '', 10) || 0;
  const invoiceItemTotal = parseInt(ascii[3] ?? '', 10) || 0;
  const enc = ascii[4];
  const cap = Math.min(qrItemCount > 0 ? qrItemCount : ITEM_LIMIT, ITEM_LIMIT);

  // 左碼品項欄位:自動偵測編碼解碼,去掉 77 字主資訊後再丟掉前 5 個元素(空 + 4 個 header)
  const leftFields = decodeAll(left.binary, d)
    .slice(77)
    .split(':')
    .slice(5)
    .filter((s) => s.length > 0); // 品項欄位皆非空,過濾掉分隔產生的空字串
  // 右碼品項欄位:去掉開頭 ** 後即為接續品項
  const rightFields =
    right && isRightCode(right.data)
      ? decodeAll(right.binary, right.data)
          .replace(/^\s*\*\*/, '')
          .split(':')
          .filter((s) => s.length > 0)
      : [];

  // 串接後再每 3 個一組(避免三元組跨左右碼邊界被切斷),最多取 qrItemCount 筆(避開補充說明)
  const items = groupItems([...leftFields, ...rightFields], enc, cap);

  return {
    invoiceNo,
    rocDate,
    total: Number.isFinite(total) ? total : 0,
    items,
    itemCount: items.length,
    qrItemCount,
    totalItemCount: invoiceItemTotal,
    // 沒宣告明細(0)視為完整;否則需湊到整張發票的品項總數
    complete: invoiceItemTotal === 0 ? true : items.length >= invoiceItemTotal,
  };
}

/** 單一左碼的便捷包裝(相容舊呼叫 / 單元測試)。 */
export function parseTaiwanEInvoice(
  data: string,
  binary?: Uint8Array,
): InvoiceData | null {
  return parseInvoiceCodes({ data, binary });
}

/** 民國 YYYMMDD → '2026/06/05';無法解析則回空字串 */
export function rocDateToISO(rocDate: string): string {
  if (!/^\d{7}$/.test(rocDate)) return '';
  const year = 1911 + Number(rocDate.slice(0, 3));
  const mm = rocDate.slice(3, 5);
  const dd = rocDate.slice(5, 7);
  return `${year}/${mm}/${dd}`;
}
