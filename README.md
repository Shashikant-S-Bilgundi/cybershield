# Cybershield (ShieldOps) web, Phase 1

In-house monitoring and security console. Frontend only; the backend is built next against `src/api/contract.ts`.

Built on the Vite `react-ts` template: React 19, Vite 8, TypeScript 6, ESLint, Tailwind CSS 3.

## Run

```bash
npm install
cp .env.example .env      # VITE_USE_MOCKS=true runs without a backend
npm run dev               # http://localhost:5173
```

Demo login (mock mode): `demo@shieldops.local` / `ShieldOps!2026`, then any 6-digit code except `000000`.

- Reset demo data: clear the site's localStorage.
- Try first-time setup: add `VITE_MOCK_FRESH=true` to `.env` and clear localStorage.
- Real backend: set `VITE_USE_MOCKS=false` and `VITE_API_URL`.

## Checks

```bash
npm run typecheck
npm run lint
npm run build             # output in dist/; public/_redirects handles page routes on Cloudflare Pages
```

Tailwind is version 3 (configured by `tailwind.config.js` and `postcss.config.js`). Don't follow the Tailwind 4 install guide.

## Backend contract

- Every call is in `src/api/contract.ts`; the REST paths are in `src/api/http.ts`.
- Cookies carry the session (`credentials: 'include'`).
- Errors: `{ "error": { "code": "...", "message": "..." } }`.
- Critical actions return `403` with code `REAUTH_REQUIRED` when the 10-minute window from `POST /auth/reauth` has expired. The UI asks the user to confirm and retries once.
- `src/api/mock/index.ts` is a working reference implementation of every rule (last active user, self-disable, allowlist check, duplicate assets).

## Structure

```
src/
  api/            contract, HTTP client, errors, mock backend
  components/
    layout/       app shell, sidebar, top bar, navigation config
    security/     re-authentication provider and hook, typed confirm dialog
    ui/           buttons, fields, modal, badges, health ribbon, toasts
  pages/
    auth/         login, MFA, first-time setup, accept invite
    applications/ list, create/edit, detail with tabs
    assets/       list, add, verify, approve
    Dashboard, Team, Audit logs, Settings, Coming soon
  store/          session and preferences (zustand)
  lib/            formatting, network validation, asset helpers
```