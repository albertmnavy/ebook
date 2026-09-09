# Infotech finance platform setup

This project is a finance/recharge platform. The private admin surface manages users, balances, manual QR recharge requests, package plans, transfers, swaps, withdrawals, referrals, rewards, support, reports, payment settings, and audit logs.

## Local setup

1. Copy `.env.example` to `.env` and set a development PostgreSQL `DATABASE_URL` plus a random `SESSION_SECRET`.
2. Run `npm run admin:migrate` once against that database.
3. Create the first platform-owner account without putting credentials in source control:

   ```powershell
   $env:BOOTSTRAP_ADMIN_EMAIL = "owner@example.com"
   $env:BOOTSTRAP_ADMIN_PASSWORD = "use-a-long-random-password"
   npm run admin:seed
   Remove-Item Env:BOOTSTRAP_ADMIN_EMAIL, Env:BOOTSTRAP_ADMIN_PASSWORD
   ```

4. Build the frontend with `npm run build`.
5. Start the private backend with `npm run admin:dev` and open `/admin/login`.

Run `npm run admin:seed-plans` only when the approved Basic and FD package configuration should be loaded into a fresh database.

The platform owner configures the manual payment QR, account name, instructions, minimum, maximum, and enabled state under Payment settings. Customer recharge submissions remain `PENDING` until an authorized admin reviews the UTR/reference and approves them. Approval credits the fund account and creates the immutable ledger entry in the same database transaction.

Package plans are configuration data and should be created or maintained by the owner. Package activation, transfers, income-to-fund swaps, and withdrawal approvals run inside server-side database transactions; the browser is never the balance source of truth.

## Production gate

Do not deploy until PostgreSQL, session secrets, the manual QR configuration, admin account, customer authentication, migration checks, financial-integrity tests, authorization tests, and customer UI regression checks have passed. No automated payment provider is enabled by this project.
