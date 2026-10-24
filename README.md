# Financial Tracker

A personal finance tracker: cash flow by month and category, monthly and yearly averages,
and net worth over time. It replaces a set of Google Sheets.

Monorepo:

| Folder | What |
|---|---|
| `frontend/` | Vue 3 + PrimeVue app (TypeScript, Vite, npm) |
| `backend/` | Spring Boot 4 + Kotlin API (Gradle, JUnit 5). In-memory sample data for now. |
| `docs/` | Project notes and the todo list |

## Run it

Needs JDK 21 and Node 22.

**One jar (UI + API).** Builds the Vue app, bundles it into the Spring Boot jar, and serves
both on http://localhost:8080:

```sh
./gradlew :backend:bootJar
java -jar backend/build/libs/backend-0.1.0.jar
```

**Separately, for development.** Run the API, then the Vite dev server, which proxies `/api`
to port 8080 and hot-reloads the UI on http://localhost:5173:

```sh
./gradlew :backend:bootRun -PskipFrontend
cd frontend && npm install && npm run dev
```

Without the API running, the frontend still works on its own from bundled data saved in the
browser (that's how the shareable preview runs).

**Tests:** `./gradlew :backend:test -PskipFrontend` and `cd frontend && npm run typecheck`.

The app starts from made-up sample data. To use real data locally, put a file in the same
shape at `frontend/src/data/seed.local.json` (gitignored), or import your sheets from
Import & export on your profile. `bootRun` starts the API from that file when it exists. The API
keeps data in memory for now, so changes last until it restarts.

Other scripts:

- `npm run typecheck` type-checks the app and scripts.
- `npm run build` type-checks and builds for hosting.
- `npm run build:server` is the build Gradle bundles into the jar (always with the sample seed).
- `npm run build:preview` builds one self-contained HTML file for sharing the prototype.
- `npm run sample-seed` regenerates the sample data.

See [docs/project-notes.md](docs/project-notes.md) and [docs/todo.md](docs/todo.md).
