export const WITHDRAWAL_FEE_BPS = 200;

export function calculateWithdrawalAccounting(amountMinor) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error('Withdrawal amount must be a positive integer in minor currency units.');
  }
  const chargesMinor = Math.round(amountMinor * WITHDRAWAL_FEE_BPS / 10_000);
  return { amountMinor, chargesMinor, payableMinor: amountMinor - chargesMinor };
}

export async function reviewWithdrawalRequest(client, {
  withdrawal,
  decision,
  adminId,
  adminNote = '',
  loadFundAccount,
  writeLedger,
  failure = (message, status = 400) => Object.assign(new Error(message), { status }),
}) {
  if (!withdrawal) throw failure('Withdrawal request not found.', 404);
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw failure('Invalid withdrawal review status.');
  if (withdrawal.status !== 'PENDING') return { withdrawal, changed: false };

  if (decision === 'REJECTED') {
    const rejected = await client.query(
      "UPDATE withdrawal_requests SET status = 'REJECTED', reviewed_at = NOW(), reviewed_by = $1, admin_note = $2, updated_at = NOW() WHERE id = $3 AND status = 'PENDING' RETURNING *",
      [adminId, adminNote, withdrawal.id],
    );
    return { withdrawal: rejected.rows[0] || withdrawal, changed: Boolean(rejected.rows[0]) };
  }

  const accounting = calculateWithdrawalAccounting(Number(withdrawal.amount_minor));
  if (Number(withdrawal.charges_minor) !== accounting.chargesMinor || Number(withdrawal.payable_minor) !== accounting.payableMinor) {
    throw failure('Withdrawal accounting values are inconsistent.', 409);
  }

  const account = await loadFundAccount(client, withdrawal.user_id);
  if (Number(account.available_minor) < accounting.amountMinor) throw failure('Insufficient balance.', 409);
  const payout = await writeLedger(client, account, 'DEBIT', accounting.payableMinor, 'WITHDRAWAL_APPROVED', 'withdrawal_request', withdrawal.id, 'Withdrawal payable approved', adminId, `withdrawal:${withdrawal.id}:payable`);
  const feeAccount = { ...account, available_minor: payout.after };
  await writeLedger(client, feeAccount, 'DEBIT', accounting.chargesMinor, 'WITHDRAWAL_FEE', 'withdrawal_request', withdrawal.id, 'Withdrawal fee (2%)', adminId, `withdrawal:${withdrawal.id}:fee`);
  const approved = await client.query(
    "UPDATE withdrawal_requests SET status = 'APPROVED', reviewed_at = NOW(), reviewed_by = $1, updated_at = NOW() WHERE id = $2 AND status = 'PENDING' RETURNING *",
    [adminId, withdrawal.id],
  );
  if (!approved.rows[0]) throw failure('Withdrawal review could not be completed.', 409);
  return { withdrawal: approved.rows[0], changed: true, accounting };
}
