# AGENTS.md

Purpose
-------
This file gives concise guidance to AI coding agents working on this repository. Follow the "link, don't embed" principle: point to existing docs and source files rather than copying large sections.

Quick commands
--------------
- **Frontend (dev):** `cd frontend && npm install && npm run dev`
- **Frontend (build):** `cd frontend && npm run build`
- **Backend (dev):** `cd backend && npm install && npm run dev`
- **Backend (start):** `cd backend && npm start`

Key files (link targets)
------------------------
- `README`: [README.md](README.md)
- Frontend app entry: [frontend/app/login/page.tsx](frontend/app/login/page.tsx)
- Frontend API client: [frontend/lib/api.ts](frontend/lib/api.ts)
- Backend server: [backend/server.js](backend/server.js)
- DB pool & config: [backend/db.js](backend/db.js)
- Database schema: [backend/schema.sql](backend/schema.sql)

Compact folder convention (for this repo)
---------------------------------------
Definition: a `compact/` folder is a minimal, distributable snapshot containing only the runtime artifacts required to run the app (e.g., built frontend static files or a single backend `server.js`). It is not the place for source edits.

Guidelines for agents:
- Do not edit files inside a `compact/` folder directly. Instead, edit source in `frontend/` or `backend/` and regenerate the compact artifact with the appropriate build command.
- For frontend artifacts, use `npm run build` under `frontend` and then copy the output to `compact/frontend` if a compact snapshot is required.
- For backend artifacts, prefer a small `compact/backend` that contains a production `server.js` and a minimal `node_modules` (or use a Docker image). Generate by running your production bundling process (if any) or copying the minimal runtime files.
- If a `compact/` folder does not exist and you need one for a task (packaging, quick deploy, demos), create it at the repo root and document how to regenerate it in `README.md`.

Agent behavior & conventions
---------------------------
- Keep changes minimal and focused; preserve existing project style.
- When proposing structural changes (new routes, middleware extraction, folder refactors), outline a small migration plan and list the files to change.
- Prefer linking to existing docs instead of copying content. If creating new documentation, add short links from `README.md`.
- If touching environment values, prefer `.env` and do not commit secrets.

Notes & pitfalls
---------------
- There is no test suite configured — prioritize small, well-scoped changes.
- The repo uses Next.js (frontend) and Express (backend). Pay attention to CORS and JWT secret handling in `backend/server.js` and DB defaults in `backend/db.js`.

Next suggested customizations
---------------------------
- Add a short `scripts.md` linking dev/build/start commands for quick discovery.
- Add a `compact/README.md` if the team expects repeated compact snapshots.
