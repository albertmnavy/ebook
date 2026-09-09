# Infotech production deployment

This project is prepared for a Vercel frontend, Railway Node.js API, and Railway PostgreSQL. It has not been deployed from this workspace.

## 1. GitHub

Push the project to a private GitHub repository. Do not commit `.env`, production credentials, QR payloads, database exports, or bootstrap passwords. The checked-in `.env.example` contains placeholders only.

## 2. Railway API and PostgreSQL

1. Create a Railway project and add a PostgreSQL service.
2. Create a Node service from the GitHub repository.
3. Railway will use `railway.json`: it builds with `npm run build` and starts with `npm run start:backend`.
4. Add these API service variables:

   - `NODE_ENV=production`
   - `DATABASE_URL` from the Railway PostgreSQL service
   - `SESSION_SECRET` with at least 32 random characters
   - `FRONTEND_URL` set to the exact Vercel production origin; comma-separated preview origins may be added temporarily
   - `TRUST_PROXY=true`
   - `ADMIN_SESSION_TTL_HOURS=8`

5. Run the safe baseline migration once against the new database:

   ```text
   npm run migrate
   ```

   It does not drop tables or delete rows. It refuses to apply the baseline when an existing `users` table has no recorded migration, so an existing database requires manual review first.

6. Bootstrap the first administrator as a one-time Railway command using `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (12+ characters), and optional `BOOTSTRAP_ADMIN_NAME`, then remove those variables:

   ```text
   npm run admin:seed
   ```

7. Confirm `GET https://<railway-api-domain>/health` returns `status: ok` and `database: connected`.

## 3. Vercel frontend

1. Import the same GitHub repository into Vercel.
2. Use the repository defaults or set:

   - Build command: `npm run build`
   - Output directory: `dist`

3. Add the build-time variable `VITE_API_URL=https://<railway-api-domain>`.
4. Connect the approved custom domain in Vercel. Set Railway's `FRONTEND_URL` to that exact origin, including `https://` and excluding a trailing slash.

The browser sends authenticated requests with credentials. Production sessions use Secure, HttpOnly, SameSite=None cookies because the Vercel frontend and Railway API are separate origins. Railway CORS allows only the configured frontend origins.

## 4. Manual QR recharge

After the admin account is ready, open the Railway admin surface at `/admin/login` and configure Payment settings: QR payload or image URL, account name, instructions, minimum, maximum, and enabled state.

The workflow is: customer submits amount plus UTR/reference → request is `PENDING` → admin reviews → approval credits the fund wallet and immutable ledger exactly once in a PostgreSQL transaction. The browser cannot approve or verify a recharge.

## 5. Package configuration

Do not run `npm run admin:seed-plans` until the platform owner confirms the exact Basic and FD amounts, returns, and maturity periods for production. The application reads package prices from PostgreSQL; the browser cannot set them. No package values are automatically applied by the deployment configuration.

## 6. Production smoke test

Run this against the real services after configuration:

1. Register and log in as a customer.
2. Log out and verify the session is invalidated.
3. Submit a QR recharge and verify it remains pending.
4. Log in as admin, approve it once, and verify exactly one fund credit and ledger entry.
5. Reject a second pending recharge and verify no balance change.
6. Test package activation, P2P transfer, income-to-fund swap, withdrawal request, and admin withdrawal review.
7. Verify a customer cannot access admin APIs or another customer's data.
8. Verify duplicate and concurrent financial requests cannot double-credit or overspend.
9. Verify referral/downline and support-ticket access.
10. Confirm no production secrets or credentials appear in GitHub or frontend assets.

## Current deployment blockers

The workspace does not have a Railway PostgreSQL connection, real Vercel domain, production QR configuration, administrator credentials, or owner-confirmed production package values. Full database-backed authentication and financial-concurrency tests must run after those are supplied. Deployment should remain paused until those checks pass.
