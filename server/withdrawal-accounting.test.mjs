import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateWithdrawalAccounting, reviewWithdrawalRequest } from './withdrawal-accounting.mjs';

function makeClient() {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith("UPDATE withdrawal_requests SET status = 'REJECTED'")) return { rows: [{ id: 'w-1', status: 'REJECTED' }] };
      if (sql.startsWith("UPDATE withdrawal_requests SET status = 'APPROVED'")) return { rows: [{ id: 'w-1', status: 'APPROVED' }] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

function makeLedgerWriter() {
  const calls = [];
  return {
    calls,
    async writeLedger(_client, account, direction, amount, eventType, referenceType, referenceId, description, createdBy, idempotencyKey) {
      const before = Number(account.available_minor);
      const after = direction === 'DEBIT' ? before - amount : before + amount;
      if (after < 0) throw Object.assign(new Error('Insufficient balance.'), { status: 409 });
      calls.push({ before, after, amount, eventType, referenceType, referenceId, description, createdBy, idempotencyKey });
      return { before, after };
    },
  };
}

test('calculates 2% fee and net payable in minor units', () => {
  assert.deepEqual(calculateWithdrawalAccounting(10_000), { amountMinor: 10_000, chargesMinor: 200, payableMinor: 9_800 });
});

test('approves with separate payable and fee ledger debits totaling gross amount', async () => {
  const client = makeClient(); const ledger = makeLedgerWriter();
  const result = await reviewWithdrawalRequest(client, {
    withdrawal: { id: 'w-1', user_id: 'u-1', amount_minor: 10_000, charges_minor: 200, payable_minor: 9_800, status: 'PENDING' },
    decision: 'APPROVED', adminId: 'admin-1', loadFundAccount: async () => ({ id: 'a-1', type: 'FUND', available_minor: 20_000 }), writeLedger: ledger.writeLedger,
  });
  assert.equal(result.changed, true); assert.equal(ledger.calls.length, 2);
  assert.deepEqual(ledger.calls.map((call) => [call.eventType, call.amount]), [['WITHDRAWAL_APPROVED', 9_800], ['WITHDRAWAL_FEE', 200]]);
  assert.equal(ledger.calls[1].before, 10_200); assert.equal(ledger.calls[1].after, 10_000);
  assert.equal(ledger.calls[0].amount + ledger.calls[1].amount, 10_000);
});

test('rejection changes status without writing a ledger entry', async () => {
  const client = makeClient(); const ledger = makeLedgerWriter();
  const result = await reviewWithdrawalRequest(client, {
    withdrawal: { id: 'w-1', user_id: 'u-1', amount_minor: 10_000, charges_minor: 200, payable_minor: 9_800, status: 'PENDING' },
    decision: 'REJECTED', adminId: 'admin-1', loadFundAccount: async () => { throw new Error('must not load account'); }, writeLedger: ledger.writeLedger,
  });
  assert.equal(result.withdrawal.status, 'REJECTED'); assert.equal(ledger.calls.length, 0);
});

test('duplicate approval is an idempotent no-op', async () => {
  const client = makeClient(); const ledger = makeLedgerWriter();
  const result = await reviewWithdrawalRequest(client, {
    withdrawal: { id: 'w-1', status: 'APPROVED' }, decision: 'APPROVED', adminId: 'admin-1',
    loadFundAccount: async () => { throw new Error('must not load account'); }, writeLedger: ledger.writeLedger,
  });
  assert.equal(result.changed, false); assert.equal(ledger.calls.length, 0); assert.equal(client.calls.length, 0);
});

test('insufficient balance fails before approval update', async () => {
  const client = makeClient(); const ledger = makeLedgerWriter();
  await assert.rejects(() => reviewWithdrawalRequest(client, {
    withdrawal: { id: 'w-1', user_id: 'u-1', amount_minor: 10_000, charges_minor: 200, payable_minor: 9_800, status: 'PENDING' },
    decision: 'APPROVED', adminId: 'admin-1', loadFundAccount: async () => ({ id: 'a-1', type: 'FUND', available_minor: 9_900 }), writeLedger: ledger.writeLedger,
  }), /Insufficient balance/);
  assert.equal(ledger.calls.length, 0); assert.equal(client.calls.length, 0);
});

test('transaction wrapper rolls back when approval fails', async () => {
  const calls = [];
  const transaction = async (work) => { calls.push('BEGIN'); try { const result = await work({}); calls.push('COMMIT'); return result; } catch (error) { calls.push('ROLLBACK'); throw error; } };
  await assert.rejects(() => transaction(async () => { throw new Error('forced failure'); }), /forced failure/);
  assert.deepEqual(calls, ['BEGIN', 'ROLLBACK']);
});
