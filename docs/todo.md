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
- [x] Convert the frontend to TypeScript (strict, vue-tsc type-check in the build)
- [x] Remove the Savings entry type (contribution boxes were only a reminder)
- [ ] Devin reviews the preview and sends tweaks

## Next

- [ ] Backend: Spring Boot + Kotlin skeleton in `backend/` with Gradle, JUnit 5
- [ ] Gradle task that runs the frontend build and copies it into the jar's static resources
- [ ] REST API for categories, entries, accounts, snapshots
- [ ] DynamoDB tables and repository layer (local DynamoDB for dev/tests)
- [ ] Login (Cognito or Spring Security; decide)
- [ ] Move import/export parsing server-side (Apache POI) and keep the UI as the front end for it
- [ ] Recurring subscriptions feeding the Subscriptions category automatically
- [ ] Deploy: Elastic Beanstalk + S3 for exports/backups
