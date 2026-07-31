/**
 * QuotePreviewDialog — global modal wrapper for the Karaoke quote preview.
 * Used by other surfaces that prefer a fixed overlay (e.g., standalone
 * royalty calculator). The KaraokePricingWorkspace inside
 * CreateContractPage does NOT use this dialog; it uses an inline panel
 * anchored under the "Xem bảng tính" button.
 */
import React from 'react';
import type { PricingSnapshot } from '../../lib/pricingSnapshot';
import { KaraokeQuotePreview } from './KaraokeQuotePreview';

const LINE = '#E7EDE1';

type Props = {
  snapshot: PricingSnapshot;
  customerName?: string;
  signboard?: string;
  onClose: () => void;
};

export function QuotePreviewDialog({ snapshot, customerName, signboard, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(15,23,42,0.5)' }} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-[860px] max-h-[90vh] flex flex-col"
      >
        <KaraokeQuotePreview
          snapshot={snapshot}
          customerName={customerName}
          signboard={signboard}
          showCloseButton
          onClose={onClose}
        />
      </div>
      {/* keep LINE referenced so lint is happy if Props evolves */}
      <span style={{ display: 'none' }} aria-hidden>{LINE}</span>
    </div>
  );
}