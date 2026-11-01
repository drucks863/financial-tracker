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
- AWS: DynamoDB, S3, Lambda + CloudFront (Lambda replaced Elastic Beanstalk on 2026-11-01 for cost).
- **Monorepo.** The Vue UI gets bundled into the Spring Boot app (jar locally, Lambda zip on AWS), but must
  also run on its own locally (`npm run dev` in `frontend/`, proxying `/api` to `localhost:8080`).

## Code style

- Descriptive names over abbreviations, including injected services (`financeService: FinanceService`,
  not `svc`) and lambda parameters that do more than a one-liner (Devin, 2026-10-24).
- JSON field names stay as they are in `frontend/src/types.ts` (`ym`, `k401`...) so the API and the
  store keep matching; renaming one means renaming it on both sides.

## AWS

- **No AWS actions of any kind until Devin says so** (Devin, 2026-10-27). Never use his own AWS
  credentials; deploying goes to the company account, set up when he's ready. Code and config in the
  repo are fine; running anything against AWS is not. Plan and commands: `docs/deploy.md`.
- Devin's personal account is the AWS CLI profile `personal` (`aws login --profile personal`, temporary
  browser credentials, only on his computer, so AWS steps run through Remote Control). Always pass
  `--profile personal`; his default profile is the work account and is off limits (2026-11-01).
  The profile must be signed in as an admin IAM user, not the account's root user (Devin, 2026-11-01);
  check with `aws sts get-caller-identity --profile personal` before any change. Don't commit the
  account ID here (public repo).
- Hosting: **AWS Lambda** behind CloudFront's free `*.cloudfront.net` address, no domain for now. Devin wants it
  under $5/month (2026-11-01); Beanstalk dropped because any always-on server is ~$7+ with the IPv4 charge.
  `PUBLIC_URL` sets the Google redirect URI. Steps and settings: `docs/deploy.md`.
- Live in AWS (2026-11-01, us-east-1): DynamoDB table `financial-tracker` (on-demand, PITR, TTL on `expiresAt`),
  IAM role `financial-tracker-lambda`, private bucket `financial-tracker-deploy-<account id>`, Lambda
  `financial-tracker` (alias `live`, public function URL), CloudFront distribution in front (comment
  "financial-tracker"). Google sign-in configured (client in Devin's Google Cloud project, allowed email = his
  Gmail, app in Testing mode). Devin signed in successfully 2026-11-01. Site address: see the CloudFront
  distribution (also in the project thread).
- Deploying an update: build `lambdaZip` from main, upload, update-function-code, publish-version, move `live`
  (`docs/deploy.md` → Updating). Done via Remote Control on Devin's Mac until CI deploys exist.

## Git

- Branch names are short and descriptive (e.g. `initial-backend`), with no `claude/` prefix (Devin, 2026-10-24).

## Repo layout

```
frontend/   Vue 3 + PrimeVue app (TypeScript, Vite)
backend/    Spring Boot 4 + Kotlin API (Gradle module `:backend`)
deploy/     the table's IAM policy
docs/       these notes, the todo list, deploy.md
```

## Backend (started 2026-10-24)

- Spring Boot 4.1, Kotlin 2.3, Java 17 (toolchain, and Gradle itself via `gradle/gradle-daemon-jvm.properties`), Jackson 3, JUnit 5. Gradle wrapper at the repo root,
  backend is the `:backend` module. Package `app.financetracker`.
- Packages follow **model / controller / service / repository** (Devin, 2026-10-24):
  - `model/`: data classes grouped by topic, one file each (`Category`, `Entry`, `NetWorth`, `Plan`,
    `Loan`, `Subscription`, `FinanceData`). They mirror `frontend/src/types.ts` field for field, so the
    JSON is what the store already uses. Request bodies and computed results for a topic live in its file.
  - `controller/`: one REST controller per file, thin, all under `/api`.
  - `service/`: `FinanceService` (the rules: category renames cascade to entries, categories and
    subcategories in use can't be removed, saving an entry creates its category), the math
    (`LoanMath`, `PlanCalculator`, `Summaries`) and `CurrentUser`.
  - `repository/`: `FinanceRepository` (plain per-user storage), the in-memory and DynamoDB implementations, and their config.
  - `security/`: the two security setups (no login / Google sign-in) and `GoogleUser`.
- **Storage** (`finance.storage`): `memory` (default; `InMemoryFinanceRepository`, lost on restart) or
  `dynamodb` (`DynamoDbFinanceRepository`, added 2026-10-27). A new user starts from `finance.seed`
  (default: the frontend's `seed.sample.json`, copied into the jar at build time); `bootRun` uses
  `seed.local.json` when it exists.
- **DynamoDB**: one table (`financial-tracker`), `pk` = `USER#<id>`, `sk` = `CATEGORY#id`, `ENTRY#id`,
  `ACCOUNT#id`, `SNAPSHOT#date`, `SUBSCRIPTION#id`, `PLAN`, `META` (the sample flag; a user without it
  gets seeded). `body` holds the model as the same JSON the API sends. Entries are keyed by id only and
  date-filtered after the query (a few thousand per person), so deletes don't need the date.
  Tests run against DynamoDB Local in-process (`com.amazonaws:DynamoDBLocal`, test scope, no Docker).
  With `finance.dynamodb.endpoint` set, the app uses dummy credentials and creates the table itself;
  on AWS the table is created once by hand (`docs/deploy.md`) and reached through the instance role.
- **Sign-in** (`finance.auth.mode`, added 2026-10-27): `none` (default; `LocalUser`, id `"local"`) or
  `google` (Spring Security OAuth2 login, `GoogleUser`, data keyed by the Google `sub`). Only verified
  emails in `finance.auth.allowed-emails` get in; the app won't start in google mode without the list.
  Sessions: container memory by default; `finance.auth.session-store=dynamodb` (the `aws` profile) keeps
  them as `SESSION#<id>` items in the same table (`security/DynamoDbSessionRepository`, Spring Session,
  30-day cookie), since Lambda instances share no memory.
  `/api/**` answers 401 when signed out (the UI then goes to `/oauth2/authorization/google`), pages
  redirect to Google, `/actuator/health` stays open. Session is a server-side cookie; writes need the
  `XSRF-TOKEN` cookie echoed as `X-XSRF-TOKEN` (`lib/api.ts` does this). `GET /api/me` gives name,
  email, photo for the avatar; the profile shows them with a Sign out button.
- **Profiles**: `local-dynamodb` (DynamoDB Local on :8000, `./gradlew :backend:dynamoDbLocal`) and
  `aws` (Lambda: dynamodb storage and sessions, google, public address from `PUBLIC_URL`, disk-space health
  check off since /var/task is read-only; secrets from env vars).
- Behind CloudFront the app does **not** use X-Forwarded-* (`forward-headers-strategy: framework` made every
  Lambda request a 400). `PublicUrlFilter` makes requests look like they reached `PUBLIC_URL` instead.
- **Lambda**: `LambdaHandler` (aws-serverless-java-container-springboot4) starts Spring at class load, which
  SnapStart snapshots. `./gradlew :backend:lambdaZip` packages it. The container answers in the 1.0 response
  shape; `LambdaHandler` rewrites it to 2.0 (all Set-Cookie values into `cookies`), because function URLs drop
  `multiValueHeaders` and the session cookie was being lost (sign-in loop, 2026-11-01). It also sets the
  container's default charset to UTF-8: without it, .js/.css (no charset in Content-Type) were garbled as
  ISO-8859-1 and the UI was a black page. `LambdaHandlerTest` checks both.
- A failed Google sign-in answers with a small "Sign-in didn't work" page and logs the reason, instead of
  redirecting (which looped back to Google).
- Server-side ports of the math, tested: `LoanMath` (amortization, balance by month, property value),
  `PlanCalculator` (budget setup figures), `Summaries` (month totals, net worth series). The frontend
  still computes its own; keep the two in step until it reads these.
- Health check: `/actuator/health` (open even with sign-in on).
- In this sandbox Maven Central rate-limits Gradle; a user-level init script points it at Google's
  Maven mirror. That's environment-only, not in the repo.

### API (all under `/api`, JSON)

| | |
|---|---|
| `GET /data`, `PUT /data`, `POST /data/reset` | whole document (startup load, bulk import, reset to seed) |
| `/categories` | `GET`, `POST`, `PUT /{id}`, `PATCH /{id}` (name, essential; rename cascades), `DELETE /{id}` (409 in use), `POST /{id}/subcategories`, `PUT`/`DELETE /{id}/subcategories?name=` |
| `/entries` | `GET ?year=&month=`, `POST`, `PUT /{id}`, `DELETE /{id}`, `POST /import` (`replaceMonths`) |
| `/net-worth` | `GET`, `GET /series`, `PUT`/`DELETE /accounts/{id}`, `PUT`/`DELETE /snapshots/{date}`, `POST /import` |
| `/subscriptions` | `GET`, `POST`, `PUT /{id}`, `DELETE /{id}` |
| `/plan` | `GET`, `PUT`, `GET /summary`, `GET /loans/{id}/schedule` |
| `/summary/months?year=` | per-month income, expenses, essentials, net |
| `/me` | `GET` who is signed in (`name`, `email`, `pictureUrl`, `signInRequired`) |

PUT is an upsert by the client's id, so the UI can save optimistically with ids it generates.

### Frontend ↔ API

- `frontend/src/lib/api.ts`. At startup `initStore()` tries `GET /api/data` (3 s timeout). If it answers,
  the store loads from it and every store mutation sends its change (queued, in order). If not, the
  app runs exactly like the prototype from the bundled seed and localStorage (preview, dev without API).
- The budget setup form edits `state.plan` in place; a debounced watcher PUTs `/plan`.
- Imports run inside `bulkChange()` and save the whole document with one `PUT /data`.
- A failed save shows a banner in the app shell. There is no sample-data banner (removed at Devin's ask, 2026-11-01).
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
- Older years exist as separate files: Cash Flow '22, '23, '24, '25. **2026 is the standard layout going
  forward** (Devin, 2026-11-01); the older files only matter for their data.

### Older layouts and the import (checked against the real files, 2026-11-01)

- **'25, '26**: the standard layout above. '25 still says `Home › Improvements` and `Subscriptions › YouTube TV`.
- **'24**: Expenses and Income tabs like '26 (but `Insurance` and `Misc` categories), month tabs January to
  September in the old layout, October to December in the new one.
- **'22 (November and December only), '23**: no Expenses/Income tabs. Month tabs named `November 22`. Each has
  "Expenses (Recurring)" (name, amount, Bank/Card, when) ending at Total; an "Expenses" title over a row of
  column-pair headings (Groceries / Food, Household, Clothing, Truck, Entertainment, Dog, Other) with
  description/amount lines down to each column's Total; "Income (Recurring)" (Job) and "Income (Other)"
  (gifts and the like); "Savings (Recurring)" and "Result" are skipped. In '22 November the itemized block
  sits beside the recurring list instead of below it.
- The Cash Flow workbook import (`frontend/src/lib/sheet-import.ts`) reads all of these and **maps everything
  to the 2026 names**: recurring bills by name (Rent, Water, Electric, TV, Gym, Music, Amazon, Renters
  Insurance → Insurance/Taxes › Home...), column headings to categories (Household → Home › Other, Truck →
  Vehicle, Dog → Pets, Other → Everyday › Other), plus item rules (known restaurants → Food › Restaurants, Gas
  → Fuel, Sunpass, vet/food/toys/supplies for pets, hospital/doctor/pharmacy → Health/medical, gifts → Gifts).
  Renames: Insurance → Insurance/Taxes, Misc → Everyday › Other, Improvements → Projects, YouTube TV → TV.
- Where a workbook has an Expenses tab ('24 on), its totals win: older-layout lines are only kept when they
  fit a subcategory total; the rest is a "Monthly total" entry. When a new-layout month tab's lines come to
  *more* than the Expenses tab (a SUM range that stops short), the lines are kept and the preview says so.
- Rental security deposits in the old "Other" column (e.g. October '23's "New Deposit") are skipped: the money
  comes back, so it isn't spending (Devin, 2026-11-01). A pet deposit under Dog still counts.
- Which years to import (Devin, 2026-11-01): '24 fully real; '23 worth it but its bills were copied forward
  (Water/Electric are estimates) and income is the fixed "Job (30 days)" figure plus monthly gifts; '22 is only
  Nov–Dec right after moving in (mostly furniture), suggested to skip.
- Net worth: "Net worth tracker" import reads the `Net Worth Tracker` tab of "Net Worth / Retirement Calculator"
  (month-end date headings like `Oct-31-2024`, accounts in column C under Cash / Investment Accounts / Other
  Assets / Debt or Liabilities headings in column B; subtotal and net worth rows skipped). The Retirement
  Calculator and Misc tabs are ignored. Loans live on the financial profile, so don't also type them into the
  sheet's debt rows before importing (they'd count twice).
- The year comes from the file name (`Cash Flow '23.xlsx` → 2023), or the tab name for '22/'23.
- Known differences from the sheets, where the import is right and the sheet isn't: November '22's own
  "Total Expenses" leaves out the recurring bills; October '23 has a line typed with a decimal comma ("12,34" as text, so the
  sheet's SUM skips it; the import reads it as 12.34); October '26 Restaurants SUM stops at row 58, missing
  the last three lines. Every other month of every year matches the sheet to the cent.
- `npm test` (in `frontend/`, Node's built-in runner) covers each layout with made-up numbers. To check real
  files, keep them outside the repo (Devin's are in `~/Desktop/FinanceFiles`).

## Financial profile (plan)

- Opened from the user's avatar at the bottom of the sidebar (last tab on phones), like an
  account page; it is not in the main nav. Renamed from "My numbers" (Devin, 2026-10-24).
- With Google sign-in on, the avatar is the Google photo and the name the Google account name, with a
  Sign out button on the profile. Without sign-in (local runs, preview) the name is typed at the top of
  the page and the avatar shows initials.
- The profile is tabbed: Budget setup (the plan; was "Pay & bills"), Categories, Subscriptions, Import & export
  (also the prototype reset). There is no separate Data page; `#data` links open Import & export.
- Fields other screens read carry a small link marker (`components/UsedBy.vue`); hover or tap
  lists where they're used. The lists live in `USES` in PlanView; keep them in step when a
  screen starts or stops reading a profile value. The marker is a `span role="button"`, not a
  `<button>`: it sits inside field labels, and a label forwards taps on its text (or on a Select)
  to its first labelable child, which made "Paid" open the popover instead of the dropdown.

- The app does the math. Inputs: yearly salary, pay frequency (weekly, every two weeks, twice
  a month, monthly), effective tax rate, your 401k % and company 401k %, other paycheck
  deductions as amounts per paycheck (HSA...), optional actual take-home per paycheck.
- Rent and bills: a list of items, each with its monthly cost and your share %. Solo = 100%.
  No separate solo/split switch and no "everyday spending" section (Devin, 2026-10-24).
- Stored as `plan` on the data (`types.ts` `Plan`); derived figures in `store/plan.ts` (`planned`).
  Other screens should read `planned`, not recompute. Used by: Overview "Plan check" widget,
  Net worth "Expected each month", Add entry amount prefill (matched by subcategory name),
  Trends planned lines.
- Overview plan check, Rent and bills row (2026-11-01): the spent side counts only entries whose
  subcategory (then category) matches a Rent and bills item or an active loan by name
  (`lib/plan-match.ts`), and the row lists what it counted. It used to count every Essential
  category, so editing Rent and bills only moved the target and Devin thought it ignored them.
  "Everything else" is all other spending. Short names (under 4 letters) only match exactly, so
  insurance "Car" doesn't count as "Car loan".
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
- Month strip bars (Cash flow tab): 84px zone, one shared scale, and the baseline moves to fit the
  data (bottom when every month saved), so small months stay readable. Devin found the old 46px
  split-in-half version too flat (2026-11-01).
- Data colors in charts (income blue, expense orange, etc.) are separate from the UI chrome.

### App icon and favicon (Devin picked "trend line", 2026-11-01)

- A silver line ticking upward to a green dot (`#5fbf8f`) over a faint baseline, on the app's `#131312`
  panel color. Picked over "rising bars" and "budget ring".
- Sources: `frontend/icons/app-icon.svg` (full square; iOS/Android round the corners),
  `frontend/icons/app-icon-maskable.svg` (mark shrunk into Android's safe circle) and
  `frontend/public/favicon.svg` (rounded tile, no baseline, heavier line for 16px).
- PNGs in `frontend/public/` (`apple-touch-icon.png` 180, `icon-192/512.png`, `icon-maskable-512.png`,
  `favicon-32.png`) are generated: `NODE_PATH=$(npm root -g) node scripts/make-icons.ts` with a global
  Playwright. Commit the PNGs; the build just copies `public/`.
- `public/site.webmanifest`: name "Financial Tracker", home-screen label "Finances", standalone, dark theme color.
- These files are open before sign-in (`PUBLIC_ICON_PATHS` in `SecurityConfig.kt`): the manifest is fetched
  without cookies, and a phone may fetch icons before anyone signs in. Add new icon files to that list.

## Code conventions

- Prefer long, descriptive variable names over short abbreviations, including for services
  (`financeService: FinanceService`, not `fs`). Devin, 2026-10-24. Apply to new and touched code.
- Branch names are plain and descriptive (`ui-review-fixes`), never `claude/...`.
- No pull requests: push finished work straight to main (Devin, 2026-10-27).
