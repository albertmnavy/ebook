export const BASIC_ROI_BPS = 1_000;

export function basicRoiMinor(amountMinor) {
  return Math.round(Number(amountMinor) * BASIC_ROI_BPS / 10_000);
}

export function basicTotalReturnMinor(amountMinor, durationDays) {
  return basicRoiMinor(amountMinor) * Number(durationDays);
}
