# Implementation status

## Included in this update

- Generic standard-SMM-API provider add, edit, enable/disable and removal controls.
- Provider catalog import with category selection, platform selection, service search and multi-select import.
- Imported-service order routing and scheduled status polling.
- Provider cancellation and refill actions for imported orders when the provider advertises those capabilities.
- Admin pages for provider services, service/category icons, currency rates, payment-method configuration and editable Telegram bot message templates.
- Message overrides for welcome, order lifecycle, refunds, top-ups, help and referral messages. Blank fields use built-in translated defaults.
- First-run setup no longer asks for a single supplier's API key; connect suppliers in Admin → Providers after setup.
- Legacy provider-specific catalogue sync and provider-balance alert are disabled. Existing legacy services are disabled by migration `0018_provider_first.sql`.
- Professional responsive styles for the new admin screens; existing customer UI and theme system are preserved.

## Not included / needs a separate implementation

- Non-Stars payment checkout and payment verification (UPI, Paytm, eSewa, Khalti, bank transfer, bKash, Binance and crypto). The admin screen clearly warns that enabling a method only saves its configuration; it does not create a live gateway.
- Customer top-up method/currency checkout. The existing Telegram Stars top-up remains the only live customer top-up.
- Automatic cheapest-provider selection per category and provider price refresh scheduling. Imported services can be re-imported to update them; there is no automated cross-provider price optimizer yet.
- Full visual redesign of every customer screen. Existing customer screens and styles are retained; the new admin pages use a consistent responsive card layout.
- Full removal of the old internal adapter code. It remains isolated for historical provider_id=0 order compatibility, but its branding and key setup are removed from the visible app flow.

## Validation

- All SQL migrations were applied to an in-memory SQLite database successfully.
- All TypeScript/TSX source files passed TypeScript parser syntax checks.
- Full typecheck, unit tests and production build were not run because dependencies are not installed in this environment. Run `npm ci`, then `npm run typecheck && npm test && npm run build` before deployment.

## Currency, free claims, manual deposits and support (v6 work)

- User display currency defaults to USDT and is selectable per profile. 56 built-in currency codes are seeded; owners can add more codes and set conversion rates. Customer-facing money formatting uses the selected currency, including order totals, balances, refunds, and bot order/refund notices. Telegram Stars are retained only as an actual checkout rail.
- Free services are owner-enabled and selected from imported provider services by provider/category/service. Each service has min/max quantity and an hours-based reset period. Optional multi-channel membership checks run only when the owner enables the free-claim channel gate.
- Manual payment methods are configurable and can be added without a fixed limit. Seeded options include eSewa, UPI, Binance, banks, crypto and additional wallets. Each method supports currency, instructions, QR image URL/upload, min/max, fee and bonus. Users submit a transaction reference and optional screenshot; requests remain pending until an owner approves or rejects them. Approval credits the in-app balance.
- Users can create support tickets from Profile, attach issue screenshots, reply and close tickets. Owners can review tickets, inspect attachments, reply and close them from Admin → Support tickets.
- Owner placeholders include `{name}`, `{firstname}`, `{lastname}`, `{username}`, `{userid}`, `{currency}`, `{currency_symbol}`, `{totalorders}`, `{totalspent}`, `{totalrefund}`, `{totalfreeclaim}`, `{totalreferral}`, `{totaldeposits}`, `{depositamount}`, `{totaltickets}`, `{joined}`, `{created}`, `{date}`, `{balance}`, `{brand}` and `{support}`.

## Validation note

- All 20 SQL migrations apply successfully to an in-memory SQLite database; the final schema contains 56 currencies and 21 manual payment methods.
- All TypeScript/TSX files passed TypeScript transpilation syntax checks.
- Full `npm run typecheck`, `npm test` and `npm run build` could not be completed in this environment: the archive's dependency installation did not finish (registry package unavailable in offline cache), and the available Node runtime is v22 while the project requires Node >=24. Run `npm ci` under Node 24, then `npm run typecheck && npm test && npm run build` before deployment.
