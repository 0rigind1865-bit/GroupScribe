/** 報帳 App 的五語系字（最小版，審查 F20）：分頁、頁標題、記一筆的六個主要標籤；其餘仍是中文 */
export type ExpenseLabels = {
  tabAdd: string; tabList: string; tabExport: string; tabAnalytics: string;
  titleAdd: string; titleList: string; titleExport: string; titleAnalytics: string;
  amount: string; photo: string; category: string; project: string; pay: string; save: string;
};
export const ZH_LABELS: ExpenseLabels = {
  tabAdd: '記一筆', tabList: '清單', tabExport: '匯出', tabAnalytics: '分析',
  titleAdd: '記一筆', titleList: '我的清單', titleExport: '匯出報帳單', titleAnalytics: '花費分析',
  amount: '金額', photo: '收據照片', category: '分類', project: '專案', pay: '怎麼付的', save: '存起來',
};
