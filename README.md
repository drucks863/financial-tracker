# Financial Tracker

A personal finance tracker: cash flow by month and category, monthly and yearly averages,
and net worth over time. It replaces a set of Google Sheets.

Monorepo:

| Folder | What |
|---|---|
| `frontend/` | Vue 3 + PrimeVue app (TypeScript, Vite, npm) |
| `backend/` | Spring Boot + Kotlin API (Gradle). Not started yet. |
| `docs/` | Project notes and the todo list |

## Run the frontend

```sh
cd frontend
npm install
npm run dev
```

The app starts from made-up sample data. To use real data locally, put a file in the same
shape at `frontend/src/data/seed.local.json` (gitignored), or import your sheets from the
Data tab.

Other scripts:

- `npm run typecheck` type-checks the app and scripts.
- `npm run build` type-checks and builds for hosting (this is what will be bundled into the Spring Boot jar).
- `npm run build:preview` builds one self-contained HTML file for sharing the prototype.
- `npm run sample-seed` regenerates the sample data.

See [docs/project-notes.md](docs/project-notes.md) and [docs/todo.md](docs/todo.md).
