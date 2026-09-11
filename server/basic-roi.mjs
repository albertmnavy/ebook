export const BASIC_ROI_NUMERATOR = 4;
export const BASIC_ROI_DENOMINATOR = 3;
export const BASIC_ROI_DURATION_DAYS = 25;

function roundedDivision(numerator, denominator) {
  return Math.floor((Number(numerator) + Math.floor(Number(denominator) / 2)) / Number(denominator));
}

export function basicTotalReturnMinor(amountMinor) {
  return roundedDivision(Number(amountMinor) * BASIC_ROI_NUMERATOR, BASIC_ROI_DENOMINATOR);
}

export function basicDailyRoiMinor(amountMinor) {
  return roundedDivision(Number(amountMinor) * BASIC_ROI_NUMERATOR, BASIC_ROI_DENOMINATOR * BASIC_ROI_DURATION_DAYS);
}

export function basicDailyAccrualMinor(totalReturnMinor, durationDays, dayNumber) {
  const duration = Number(durationDays);
  const day = Number(dayNumber);
  if (!Number.isInteger(duration) || duration < 1 || !Number.isInteger(day) || day < 1 || day > duration) {
    throw new RangeError('Basic ROI accrual day is outside the activation duration.');
  }
  const base = Math.floor(Number(totalReturnMinor) / duration);
  const remainder = Number(totalReturnMinor) % duration;
  return base + (day <= remainder ? 1 : 0);
}
