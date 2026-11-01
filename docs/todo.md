# Todo

## Prototype (frontend only)

- [x] Read Cash Flow '26 (all tabs) and the Net Worth tracker tab
- [x] Vue 3 + PrimeVue app scaffold with Vite, mobile-first layout (bottom tabs, desktop rail)
- [x] Overview: month strip, net cash flow, income/expense chart, spending donut, net worth card
- [x] Cash flow: entries for the month grouped by category and subcategory, search, edit and delete
- [x] Add entry dialog with new category/subcategory inline
- [x] Trends: averages, stacked spending by category, one category over time, year over year, sheet-style year grid
- [x] Net worth: hero, stacked area by account group, accounts table, snapshots, add/edit snapshot, add account
- [x] Data: export (Excel workbook, entries CSV, net worth CSV)
- [x] Data: import (entries CSV/XLSX, Cash Flow workbook layout, Net Worth tracker layout)
- [x] Data: category manager (add, rename, remove, essential flag), subscriptions list
- [x] Keep real numbers out of the public repo (local seed + generated sample seed)
- [x] a page that allows the user to set their current static income/expenses/contributions/taxes. Allows for solo rent or splitting rent. This page is nice because it allows me to have a single source of truth to get quick figures, but also other locations in the app can use it to pull in for their own calculations. changing them will auto update dependencies for projects. Perhaps long term this can be stored in s3 or something?
- [x] Convert the frontend to TypeScript (strict, vue-tsc type-check in the build)
- [x] Remove the Savings entry type (contribution boxes were only a reminder)
- [x] Editable subscriptions (add, edit, delete)
- [x] Use My numbers on other screens: Overview plan check, Net worth expected growth, entry prefill, Trends planned lines
- [x] Loans on My numbers (amortized); Net worth subtracts balances and shows principal vs interest
- [x] Plan check: Rent and bills row counts spending on those items (by name), so editing them changes the check
- [ ] Devin reviews the preview and sends tweaks
- [x] Net worth import over the sample data removes the sample accounts (the stray −$25k Brokerage)
- [x] Devin: re-import the Net Worth tracker after the deploy to clear the sample Brokerage
- [x] Clear leftover sample data: Devin removed the sample Car loan, subscriptions and budget numbers by hand (2026-11-01).
  The `sample` flag still never turns off after an import; harmless for him now, matters for new users
- [x] Bug hunt on the math and imports: CSV dates shifting a day back (moved entries a month), blank net worth cells
  read as $0, car insurance matched to the Car loan in Add entry and Trends, negative sheet totals dropped
- [x] Bug hunt fixes and the loan double-count block live as Lambda version 14 (2026-11-01)
- [ ] Devin: if an entries CSV was ever re-imported, check entries dated the last day of a month (they were on the 1st)
- [ ] Devin: delete any empty $0 months at the end of Net worth history (from the blank-cell bug; re-importing doesn't remove them)
- [x] Loading splash while the app cold starts (animated trend-line icon instead of a black page)
- [x] Loading splash deployed as Lambda version 15 (2026-11-01)
- [ ] Maybe: serve `index.html` and `/assets/*` from S3/CloudFront so the splash shows before the Lambda wakes

## Next

- [x] Backend: Spring Boot + Kotlin skeleton in `backend/` with Gradle, JUnit 5
- [x] Gradle task that runs the frontend build and copies it into the jar's static resources
- [x] REST API for categories, entries, accounts, snapshots, subscriptions, budget setup
- [x] Repository interface with in-memory sample data (mock until DynamoDB)
- [x] Server-side loan amortization, budget setup figures, month totals, net worth series (tested)
- [x] Frontend loads from and saves to the API when it's running; falls back to local data otherwise
- [x] DynamoDB repository layer (one table), tested on DynamoDB Local; `local-dynamodb` profile for dev
- [x] Login: Google sign-in via Spring Security OAuth2 with an allowed-email list; avatar shows the Google photo, Sign out
- [x] Hosting under $5/month: Lambda (SnapStart) + CloudFront instead of Beanstalk; sessions in DynamoDB; `lambdaZip`
- [ ] Frontend reads server-side summaries instead of recomputing (optional; keep the math in one place)
- [ ] CI: GitHub Actions running backend tests, frontend typecheck and `npm test`
- [ ] Move import/export parsing server-side (Apache POI) and keep the UI as the front end for it
- [ ] Recurring subscriptions feeding the Subscriptions category automatically
- [x] Devin: AWS go-ahead, personal account via an admin IAM user; HTTPS via CloudFront's free address
- [x] DynamoDB table created (us-east-1, on-demand, point-in-time recovery)
- [x] Deploy: TTL on the table, Lambda + role, deploy bucket, CloudFront (health and sign-in redirect checked)
- [x] Google OAuth client; client id/secret and allowed email on the function (Devin's Gmail only)
- [x] Fixed on Lambda: session cookie dropped (sign-in loop), UI files garbled (black page), land on `/` after sign-in
- [x] Live and signed in at the CloudFront address (2026-11-01)
- [ ] Optional: more sign-in providers (Microsoft, Apple...) on a picker page; data would need keying by provider + account
- [ ] Later: CI deploy (GitHub Actions + OIDC role) so deploys don't need Devin's Mac
- [x] Make the Cash Flow '22 to '26 sheets importable: older layouts mapped to the 2026 categories, checked against the real files
- [ ] First sign-in and import the real sheets ('22 to '26 with "Cash Flow workbook", one file at a time)
- [ ] S3 for exports/backups
- [ ] Serve `site.webmanifest` as `application/manifest+json` (it goes out as octet-stream; browsers cope)
- [x] Taller month strip bars on the Cash flow tab, baseline placed to fit the data (live as version 12)
- [x] Deployed main c9db4df (PRs #6 to #12: Paid tooltip, plan check, sample accounts on import, Trends Other, phone tooltips/popovers) as Lambda version 13, 2026-11-01
- [x] Deployed main ba5b86b (PRs #16 loading splash, #17 Net worth chart/snapshots, #18 category icons and Add entry form) as Lambda version 15, 2026-11-01
- [x] App icon and favicon (trend line): tab icon, iOS home screen, Android/PWA manifest; open before sign-in
- [ ] After the next deploy: add the site to a phone's home screen and check the icon, and that Google sign-in works from the home-screen app
- [ ] Decide what a brand-new user starts from in production (sample data today, replaced on first import)
- [x] Tapping "Paid" (and other Select fields) in the profile opened the link-marker popover; fixed
- [x] "Playground" pages (Devin, 2026-11-01): a Plan section in the nav, separate from the real-data pages, with
  shared plumbing (`useScenario`, `realFigures`, `SimulatorShell`, `SimField`) so simulators tweak copies, never the profile
- [x] Retirement calculator: earliest retirement age, invested balance by age, needed vs projected, compared with
  your real numbers; Birth year on the profile
- [ ] Devin: review the Retirement PR and its starting assumptions (7% return, 3% inflation and raises, to 95, no Social Security)
- [x] Merge Retirement (PR #19; Devin asked to ship it with this round, 2026-11-01)
- [ ] Deploy Retirement (with or right after the cold-start loading screen deploy)
- [ ] Devin: add your birth year on the profile so Retirement starts from your real age
- [ ] Next playground: home budgeting (down payment, 401k %, savings), built on the same plumbing
- [ ] Maybe later: Retirement with home equity or cash counted, retirement taxes (Roth vs pre-tax), market swings
- [x] Make double counting loans impossible: rows repeating a profile loan or its property are skipped on import,
  blocked in the snapshot dialog and left out of net worth (Devin picked this over planning-only loans, 2026-11-01)
- [ ] Back burner (Devin, 2026-11-01): import Chase CSV activity (chase.com → Download account activity, ~24 months) to get real transaction dates. Proposed: "Chase CSV" import option, skip transfers/card payments, remembered Chase-category and description rules mapped to our categories, and match sheet lines by amount within the month to set their real date (unmatched rows reviewed in a preview). Overlap approach not decided yet.
- [x] Trends: "Other" ranked by the year shown, listed under the chart and broken down in its tooltip
- [x] Chart tooltips close on a tap outside the chart, on scroll, or on a second tap (phones)
- [x] Popovers close on scroll, and scrolling past a chart no longer pops its tooltip (phones)
- [x] Net worth: Snapshots list fills its box; Over time chart gets a Trend view with a fitted y-axis (Breakdown keeps the stacked view)
- [x] Net worth chart and snapshots changes deployed as Lambda version 15 (2026-11-01)
- [x] Add entry: category icons and tap-to-pick chips, Description first and required with suggestions from past entries; icons on Cash flow, Overview, Settings
- [ ] Maybe: let a category's icon be picked in Settings → Categories (today it's chosen from the name)
