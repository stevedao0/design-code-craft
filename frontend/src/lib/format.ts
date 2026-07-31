export function formatCurrency(v: number) {
  if (v == null || Number.isNaN(v)) return '—';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0
  }).format(v);
}

export function formatShortVND(v: number) {
  if (v >= 1_000_000_000) {
    const billions = v / 1_000_000_000;
    return `${billions.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`;
  }
  if (v >= 1_000_000) {
    return `${(v / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
  }
  return new Intl.NumberFormat('vi-VN').format(v);
}

export function formatDate(v: string) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

export function formatNumber(v: number) {
  if (v == null || Number.isNaN(v)) return '0';
  return new Intl.NumberFormat('vi-VN').format(v);
}