import assert from 'node:assert/strict';
import test from 'node:test';
import { BASIC_ROI_DENOMINATOR, BASIC_ROI_DURATION_DAYS, BASIC_ROI_NUMERATOR, basicDailyAccrualMinor, basicDailyRoiMinor, basicTotalReturnMinor } from './basic-roi.mjs';

test('Basic Package ROI is principal multiplied by 4/3 over 25 days', () => {
  assert.equal(BASIC_ROI_NUMERATOR, 4);
  assert.equal(BASIC_ROI_DENOMINATOR, 3);
  assert.equal(BASIC_ROI_DURATION_DAYS, 25);
  const cases = [
    [150_000, 8_000, 200_000],
    [250_000, 13_333, 333_333],
    [400_000, 21_333, 533_333],
    [600_000, 32_000, 800_000],
    [800_000, 42_667, 1_066_667],
    [1_000_000, 53_333, 1_333_333],
  ];
  for (const [principal, dailyDisplay, total] of cases) {
    assert.equal(basicDailyRoiMinor(principal), dailyDisplay);
    assert.equal(basicTotalReturnMinor(principal), total);
    const dailyAccruals = Array.from({ length: 25 }, (_, index) => basicDailyAccrualMinor(total, 25, index + 1));
    assert.equal(dailyAccruals.reduce((sum, amount) => sum + amount, 0), total);
  }
});

test('fractional daily ROI is distributed without losing minor units', () => {
  assert.deepEqual(Array.from({ length: 25 }, (_, index) => basicDailyAccrualMinor(333_333, 25, index + 1)), [
    ...Array(8).fill(13_334),
    ...Array(17).fill(13_333),
  ]);
});
