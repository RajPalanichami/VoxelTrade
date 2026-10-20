# Page regression matrix

Checked 2026-10-20 against `http://localhost:3000` after the performance changes. Every URL below returned HTTP 200. That confirms the route renders. It does not by itself prove every button on that page.

| Route | HTTP | Notes |
| --- | --- | --- |
| `/` | 200 | Overview. Pulse still returns live tiles. US10Y 5.117. |
| `/dashboard` | 200 | Same signal dashboard as `/signals`. |
| `/signals` | 200 | |
| `/scalp-analyzer` | 200 | |
| `/trade-your-plan` | 200 | |
| `/trade-your-plan/AAPL` | 200 | Dynamic symbol route. |
| `/stock-decision` | 200 | |
| `/stock-decision/AAPL` | 200 | |
| `/patterns` | 200 | |
| `/stock-buying-engine` | 200 | |
| `/stock-buying-engine/AAPL` | 200 | |
| `/breakout-potential` | 200 | |
| `/opportunity` | 200 | |
| `/options` | 200 | |
| `/option-analyzer` | 200 | |
| `/swing` | 200 | |
| `/crypto` | 200 | |
| `/compare` | 200 | |
| `/multi-timeframe` | 200 | |
| `/watchlist` | 200 | |
| `/news` | 200 | |
| `/mag7` | 200 | |
| `/mag7-compare` | 200 | |
| `/comparison` | 200 | |
| `/sector/technology` | 200 | Other sector slugs use this same page. |
| `/sectors` | 200 | |
| `/tools` | 200 | |
| `/technical` | 200 | Chart studio from the prior change. |
| `/fundamentals` | 200 | |
| `/alerts` | 200 | |
| `/settings` | 200 | Middleware-protected when Supabase is configured. This environment returned 200. |
| `/login` | 200 | |
| `/signup` | 200 | |
| `/forgot-password` | 200 | |
| `/auth/update-password` | 200 | |
| `/markets` | 200 | |
| `/market` | 200 | |
| `/backtesting` | 200 | |

## Interaction coverage

Earlier in this session the technical chart was exercised in a browser: ticker changes, daily timeframe, invalid symbol error, light and dark theme, and a 390px layout. This pass did not click every control on every route.

## Automated tests

`npx vitest run`: 346 passed, 3 failed. The failures are existing option-analyzer fixtures dated 2026-10-16, which is now in the past. `tests/singleFlight.test.ts` passed.

`npx next build` was not green. The current blocker is an existing type error in `components/opportunity/OpportunityMonitor.tsx` at line 309. End-to-end Playwright was not re-run in this pass.
