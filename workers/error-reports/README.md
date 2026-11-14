# Desktop error reports Worker

A Cloudflare Worker that receives the error reports the Desktop updater window sends (OPS-010). It keeps only daily counts in D1 and sends one Telegram message the first time a combination shows up on a day. It runs apart from erdbpro-saas, so reports still arrive when SaaS is down.

The request and response shapes are in the architecture repository: `contracts/desktop-error-report.md`. The tests run with the app's tests (`npx vitest run workers`) against SQLite, which D1 uses too.

## Deploy

Run these in this folder. Wrangler 4.36 or later is needed for the rate limiting binding.

1. `npm install`, then `npx wrangler login`.
2. `npx wrangler d1 create erdbpro-error-reports` and copy the `database_id` it prints into `wrangler.toml`.
3. `npm run db:init` to create the table.
4. `npx wrangler secret put TELEGRAM_BOT_TOKEN` and `npx wrangler secret put TELEGRAM_CHAT_ID`.
5. `npm run deploy`. The route in `wrangler.toml` attaches `reports.erdbuilderpro.com` as a custom domain; the zone must be on the same Cloudflare account.
6. Check it: an `OPTIONS` request to `https://reports.erdbuilderpro.com/v1/desktop-error` answers 204.

The Desktop app has the address built in. To point a build somewhere else, set `VITE_ERROR_REPORT_URL` when building the app.

## Read the counts

```sh
npx wrangler d1 execute erdbpro-error-reports --remote \
  --command "SELECT * FROM daily_reports ORDER BY day DESC, count DESC LIMIT 50"
```
