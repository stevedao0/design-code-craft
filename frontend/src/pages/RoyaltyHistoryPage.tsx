/**
 * Route entry: Lịch sử bảng tính.
 * Wraps the new history UI so it integrates with the existing router.
 */
import React from 'react';
import { CalculationHistoryPage } from '../components/calculations/CalculationHistoryPage';

export type RoyaltyHistoryPageContainerProps = {
  viewingSnapshotId?: string | null;
  onNavigate?: (route: string) => void;
};

export function RoyaltyHistoryPageContainer({
  onNavigate,
}: RoyaltyHistoryPageContainerProps) {
  return (
    <div data-history-page="royalty">
      <CalculationHistoryPage
        onOpenCalculator={() => onNavigate?.('tools.royalty')}
        onPickSnapshot={() => {
          /* Word export from history is intentionally a no-op — the Excel
             export is the official "history export" flow. */
        }}
      />
    </div>
  );
}

export default RoyaltyHistoryPageContainer;
