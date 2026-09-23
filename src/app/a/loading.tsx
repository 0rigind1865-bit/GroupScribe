import { Loading } from '@/app/ui/spinner';

// Next.js 路由層載入畫面：換頁時殼（頂欄／底部膠囊）留著、內容區先顯示轉圈，
// 伺服器查完資料再換成頁面。原本換頁期間畫面完全不動，慢的頁面會讓人以為沒點到。
export default function LoadingPage() {
  return <Loading />;
}
