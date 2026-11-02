/**
 * Barcode normalization utilities for retail packaging formats (UPC-A, EAN-13, EAN-8).
 * Handles leading zeros, whitespace, and UPC-A / EAN-13 cross-format equivalence.
 */

/**
 * Strips whitespace and normalizes barcode input.
 */
export function cleanBarcodeString(input: string): string {
  if (!input) return '';
  return input.trim().replace(/\s+/g, '');
}

/**
 * Returns an ordered array of barcode candidate strings to query.
 * For example:
 * - A 12-digit UPC-A "012345678905" -> ["012345678905", "0012345678905"] (EAN-13 with '0' prefix)
 * - A 13-digit EAN-13 starting with 0 "0012345678905" -> ["0012345678905", "012345678905"]
 * - An 8-digit EAN-8 or custom standard code -> [cleaned]
 */
export function getBarcodeVariants(rawBarcode: string): string[] {
  const clean = cleanBarcodeString(rawBarcode);
  if (!clean) return [];

  const variants: string[] = [clean];

  // If 12 digits (UPC-A), also check standard EAN-13 (prefixed with '0')
  if (/^\d{12}$/.test(clean)) {
    variants.push(`0${clean}`);
  }

  // If 13 digits (EAN-13) starting with '0', also check 12-digit UPC-A (without leading '0')
  if (/^0\d{12}$/.test(clean)) {
    variants.push(clean.slice(1));
  }

  return Array.from(new Set(variants));
}
