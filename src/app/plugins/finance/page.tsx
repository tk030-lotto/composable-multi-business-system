import FinancePlugin from '@/plugins/finance';

export const metadata = {
  title: '決済管理 - BaseKit',
};

export default function FinancePage() {
  return (
    <div className="p-6">
      <FinancePlugin />
    </div>
  );
}
