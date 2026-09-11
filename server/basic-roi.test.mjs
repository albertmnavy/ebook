import assert from 'node:assert/strict';
import test from 'node:test';
import { BASIC_ROI_BPS, basicRoiMinor, basicTotalReturnMinor } from './basic-roi.mjs';

test('Basic Package ROI is exactly 10% for 25 days', () => {
  assert.equal(BASIC_ROI_BPS, 1_000);
  const cases = [
    [150_000, 15_000, 3_750_00],
    [250_000, 25_000, 6_250_00],
    [400_000, 40_000, 10_000_00],
    [600_000, 60_000, 15_000_00],
    [800_000, 80_000, 20_000_00],
    [1_000_000, 100_000, 25_000_00],
  ];
  for (const [principal, daily, total] of cases) {
    assert.equal(basicRoiMinor(principal), daily);
    assert.equal(basicTotalReturnMinor(principal, 25), total);
  }
});
