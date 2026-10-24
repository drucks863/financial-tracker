# Project notes

Things to remember between work sessions. Keep this current; newest decisions win.

## Goal

A personal web app that replaces the "Cash Flow 'YY" Google Sheets and the net worth tab of
"Net Worth / Retirement Calculator". One place to see current and historical cash flow,
monthly and yearly averages, and net worth.

## Requirements (from Devin, 2026-10-24)

- Amounts are entered manually.
- Same categories/subcategories as the sheets, and adding more must be easy.
- Lots of charts and visuals.
- Import past data; export to CSV and XLSX.
- Behind a login (not needed for the prototype).
- Mobile first.

## Stack

- Backend: Spring Boot, Kotlin, JUnit tests, Gradle.
- Frontend: Vue 3 + PrimeVue, **TypeScript**, Vite, npm. Strict mode; `npm run typecheck` runs vue-tsc.
  Domain types live in `frontend/src/types.ts`.
- AWS: DynamoDB, S3, Elastic Beanstalk (and whatever else fits).
- **Monorepo.** The Vue UI gets bundled into the Spring Boot jar for deployment, but must
  also run on its own locally (`npm run dev` in `frontend/`, proxying `/api` to `localhost:8080`).

## Git

- Branch names are short and descriptive (e.g. `initial-backend`), with no `claude/` prefix (Devin, 2026-10-24).

## Repo layout

```
frontend/   Vue 3 + PrimeVue app (TypeScript, Vite)
backend/    Spring Boot 4 + Kotlin API (Gradle module `:backend`)
docs/       these notes, the todo list, architecture
```

## Backend (started 2026-10-24)

- Spring Boot 4.1, Kotlin 2.3, Java 21, Jackson 3, JUnit 5. Gradle wrapper at the repo root,
  backend is the `:backend` module. Package `app.financetracker`.
- Layers: `domain/Models.kt` (data classes that mirror `frontend/src/types.ts` field for field, so the
  JSON is what the store already uses), `repo/FinanceRepository` (plain per-user storage),
  `service/FinanceService` (the rules: category renames cascade to entries, categories and
  subcategories in use can't be removed, saving an entry creates its category), `web/Controllers.kt`.
- **Storage is mocked**: `InMemoryFinanceRepository`, seeded per user from `finance.seed`
  (default: the frontend's `seed.sample.json`, copied into the jar at build time). `bootRun` uses
  `seed.local.json` when it exists. Data is lost on restart. DynamoDB replaces the repository bean in
  `RepositoryConfig`; the interface is shaped for one table (PK user, SK kind#id).
- **Auth seam**: `user/CurrentUser`. Every call is keyed by its id; `LocalUser` returns `"local"`.
  Google SSO replaces that one bean (use the OIDC `sub`).
- Server-side ports of the math, tested: `LoanMath` (amortization, balance by month, property value),
  `PlanCalculator` (budget setup figures), `Summaries` (month totals, net worth series). The frontend
  still computes its own; keep the two in step until it reads these.
- Health check for Beanstalk: `/actuator/health`.
- In this sandbox Maven Central rate-limits Gradle; a user-level init script points it at Google's
  Maven mirror. That's environment-only, not in the repo.

### API (all under `/api`, JSON)

| | |
|---|---|
| `GET /data`, `PUT /data`, `POST /data/reset` | whole document (startup load, bulk import, reset to seed) |
| `/categories` | `GET`, `POST`, `PUT /{id}`, `PATCH /{id}` (name, essential; rename cascades), `DELETE /{id}` (409 in use), `POST /{id}/subcategories`, `PUT`/`DELETE /{id}/subcategories/{name}` |
| `/entries` | `GET ?year=&month=`, `POST`, `PUT /{id}`, `DELETE /{id}`, `POST /import` (`replaceMonths`) |
| `/net-worth` | `GET`, `GET /series`, `PUT`/`DELETE /accounts/{id}`, `PUT`/`DELETE /snapshots/{date}`, `POST /import` |
| `/subscriptions` | `GET`, `POST`, `PUT /{id}`, `DELETE /{id}` |
| `/plan` | `GET`, `PUT`, `GET /summary`, `GET /loans/{id}/schedule` |
| `/summary/months?year=` | per-month income, expenses, essentials, net |

PUT is an upsert by the client's id, so the UI can save optimistically with ids it generates.

### Frontend ↔ API

- `frontend/src/lib/api.ts`. At startup `initStore()` tries `GET /api/data` (3 s timeout). If it answers,
  the store loads from it and every store mutation sends its change (queued, in order). If not, the
  app runs exactly like the prototype from the bundled seed and localStorage (preview, dev without API).
- The budget setup form edits `state.plan` in place; a debounced watcher PUTs `/plan`.
- Imports run inside `bulkChange()` and save the whole document with one `PUT /data`.
- A failed save shows a banner in the app shell.
- Subscriptions now have ids (older data gets `s1`, `s2`...).
- The jar's UI build (`npm run build:server`) always bundles the sample seed, never `seed.local.json`.

## Data model (mirrors the DynamoDB items to come)

- **Category**: `type` income | expense, `name`, `subcategories[]`, `essential` (expenses).
- **Entry**: `date`, `type`, `category`, `subcategory`, `description`, `amount`.
- **Account**: `name`, `group` Cash | Investments | Other assets | Debt.
- **Snapshot**: month-end `date` + balance per account.

## How the sheets work (so the app matches them)

- Expenses tab: categories with subcategory rows, Jan–Dec, Total, Average.
- Income tab: Wages (Paycheck, Other) and Other (Gifts, Refunds, Other).
- Month tabs: top block has expense totals per category, income, "Disposable income",
  Auto withdrawals (Roth 401k, HSA, taken from the paycheck) and Savings (Roth IRA, HYSA).
  Below that, each category has subcategory columns with itemized lines (description + amount).
- The Auto withdrawals / Savings boxes on the month tabs are only Devin's reminder of monthly
  contributions. **Not tracked in the app** (decided 2026-10-24); the import skips them.
- Summary tab: Income, Expenses, Expenses (Discretionary), Net savings, Ending balance per month.
- **Essentials** = Rent/Mortgage + Utilities. Discretionary = everything else.
- **Averages skip zero months** (the sheet's Average column does this). The app does the same.
- Subscriptions tab: service, price, category (Essential/Discretionary), frequency, when, paid from.
- Net worth tab: month-end columns; rows for Checking, Savings, HYSA (cash) and Taxable,
  Roth IRA, 401k, HSA, REIT (investments); Other assets and Debt sections are empty so far.
- Older years exist as separate files: Cash Flow '22, '23, '24, '25.

## Financial profile (plan)

- Opened from the user's avatar at the bottom of the sidebar (last tab on phones), like an
  account page; it is not in the main nav. Renamed from "My numbers" (Devin, 2026-10-24).
- Google SSO is planned: the avatar will be the Google photo and the name the Google account
  name. Until then the name is typed at the top of the page and the avatar shows initials.
- The profile is tabbed: Budget setup (the plan; was "Pay & bills"), Categories, Subscriptions, Import & export
  (also the prototype reset). There is no separate Data page; `#data` links open Import & export.
- Fields other screens read carry a small link marker (`components/UsedBy.vue`); hover or tap
  lists where they're used. The lists live in `USES` in PlanView; keep them in step when a
  screen starts or stops reading a profile value.

- The app does the math. Inputs: yearly salary, pay frequency (weekly, every two weeks, twice
  a month, monthly), effective tax rate, your 401k % and company 401k %, other paycheck
  deductions as amounts per paycheck (HSA...), optional actual take-home per paycheck.
- Rent and bills: a list of items, each with its monthly cost and your share %. Solo = 100%.
  No separate solo/split switch and no "everyday spending" section (Devin, 2026-10-24).
- Stored as `plan` on the data (`types.ts` `Plan`); derived figures in `store/plan.ts` (`planned`).
  Other screens should read `planned`, not recompute. Used by: Overview "Plan check" widget,
  Net worth "Expected each month", Add entry amount prefill (matched by subcategory name),
  Trends planned lines.
- Loans (amount, rate, term, first payment month, extra/month) live on the financial profile;
  `lib/loan.ts` amortizes them. Net worth adds each loan's balance as debt for every snapshot
  month (owed from the month before the first payment), so loans are never typed into snapshots.
- A loan can carry the property it bought (name, conservative market value, valued-as-of month,
  yearly change). Net worth counts it under Other assets every month (value grown/shrunk from the
  valuation month; zero before the loan closed) and shows equity = value − balance. Devin wants
  this value kept conservative; there's no live price lookup, he updates it himself.
- Debt accounts typed into snapshots count as owed whichever sign is entered.

## The Google Sheets are reference only

The workbooks (Cash Flow '26, Net Worth / Retirement Calculator) were shared to get the
structure right. If this app works out, Devin stops using them. So: the app is the source of
truth; the sheet importers are a one-time migration path, not an ongoing sync. Don't design
features around keeping the sheets updated.

## Privacy

The GitHub repo is **public**. Never commit real figures.
`frontend/src/data/seed.local.json` holds the real data for local runs and the private
preview; it is gitignored. The repo carries `seed.sample.json`, generated by
`npm run sample-seed` with made-up numbers.

## Prototype preview

`npm run build:preview` makes one self-contained HTML file (`dist-preview/artifact.html`)
that is published as a private claude.ai artifact for review. In that preview, data is
saved in the browser only.

## Look and feel

- "Command center, but not messy" (Devin, 2026-10-24). Near-black neutral surfaces with a monochrome
  silver accent (`frontend/src/theme.ts`, tokens in `style.css`). **No yellow/brass accent** (dropped 2026-10-24). **No navy / blue-black backgrounds**
  ("that screams AI"), and not stark white-on-black either.
- Important numbers up front (KPI cards); secondary things go behind menus, dropdowns and
  "show all" buttons. Desktop nav is a narrow rail with icon + text labels (icons alone were unclear).
- Overview: Monthly/Yearly toggle, period picker, Download menu, KPI row, then draggable widgets
  (chart with a chart-type dropdown, recent activity, spending mix). Widget order is per browser.
- Dark by default; light only when `data-theme="light"` is set on `<html>`.
- The year select sits above the month scroller on every screen size.
- Data colors in charts (income blue, expense orange, etc.) are separate from the UI chrome.
