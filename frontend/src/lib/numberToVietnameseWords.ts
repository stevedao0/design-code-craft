/**
 * Đổi số tiền (VND) thành chữ tiếng Việt.
 * Ví dụ: 20.217.600 → "Hai mươi triệu hai trăm mười bảy nghìn sáu trăm đồng"
 */

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

function readTriple(n: number, full: boolean): string {
  const tram = Math.floor(n / 100);
  const chuc = Math.floor((n % 100) / 10);
  const dvi = n % 10;
  const parts: string[] = [];

  if (tram > 0 || full) {
    parts.push(DIGITS[tram] + ' trăm');
  }

  if (chuc === 0) {
    if (dvi > 0) {
      if (tram > 0 || full) parts.push('lẻ');
      parts.push(DIGITS[dvi]);
    }
  } else if (chuc === 1) {
    parts.push('mười');
    if (dvi === 5) parts.push('lăm');
    else if (dvi > 0) parts.push(DIGITS[dvi]);
  } else {
    parts.push(DIGITS[chuc] + ' mươi');
    if (dvi === 1) parts.push('mốt');
    else if (dvi === 5) parts.push('lăm');
    else if (dvi > 0) parts.push(DIGITS[dvi]);
  }

  return parts.join(' ').trim();
}

export function numberToVietnameseWords(value: number, currency = 'đồng'): string {
  const n = Math.round(Math.abs(value));
  if (n === 0) return capitalizeFirst('không ' + currency);

  const ty = Math.floor(n / 1_000_000_000);
  const trieu = Math.floor((n % 1_000_000_000) / 1_000_000);
  const nghin = Math.floor((n % 1_000_000) / 1_000);
  const donVi = n % 1_000;

  const parts: string[] = [];
  if (ty > 0) parts.push(readTriple(ty, false) + ' tỷ');
  if (trieu > 0) parts.push(readTriple(trieu, ty > 0) + ' triệu');
  if (nghin > 0) parts.push(readTriple(nghin, ty > 0 || trieu > 0) + ' nghìn');
  if (donVi > 0) parts.push(readTriple(donVi, ty > 0 || trieu > 0 || nghin > 0));

  const text = parts.join(' ').replace(/\s+/g, ' ').trim() + ' ' + currency;
  return capitalizeFirst(text);
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
