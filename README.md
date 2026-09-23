# domo-web

Static frontend for a tiny task board. It's a practice app for learning
Docker build and docker compose — plain HTML/CSS/vanilla JS, zero runtime
and zero npm dependencies, so the only moving parts you need to reason
about are the ones you add yourself.

It talks to the sibling backend repo `domo-api` over the REST contract in
`app.js` (tasks CRUD, `/api/stats`, `/readyz`).

## Commands

```
npm run build                                  # build dist/, same-origin API (API_URL="")
API_URL=http://localhost:3000 npm run build     # build dist/, calling the API directly
npm run serve                                   # serve dist/ locally on :8080 (dev only, not for prod)
npm run clean                                   # remove dist/
```

`npm run serve` is a plain Node static file server for local sanity checks.
It is **not** what runs in the container — that's the nginx stage you'll
write yourself (see below).

## Build-time variables

`scripts/build.js` copies `src/` into `dist/` and substitutes two placeholders
found in the source files:

| Variable        | Default | Effect                                                                 |
|------------------|---------|-------------------------------------------------------------------------|
| `API_URL`        | `""`    | Base URL the frontend calls. Empty means same-origin (`/api/...`, `/readyz`), for use behind a reverse proxy that routes those paths to the API. |
| `BUILD_VERSION`  | `"dev"` | Shown in the page footer, useful for confirming which build is deployed. |

## Your DevOps exercises

This repo intentionally ships with no Dockerfile, no `.dockerignore`, no
nginx config, and no compose file. That's the point — write them yourself:

- Write a **multi-stage Dockerfile**: a `node:20-alpine` build stage that
  runs `npm run build`, and an `nginx:alpine` runtime stage that serves the
  resulting `dist/`.
- Pass `API_URL` and `BUILD_VERSION` into the build stage as `ARG`s (with
  `ENV` if you want them available at build time), so you can choose their
  values at `docker build` time.
- Write a `.dockerignore` (think about `node_modules`, `dist`, `.git`).
- Write an **nginx config** that serves `dist/` as static files and
  reverse-proxies `/api` and `/readyz` to the `domo-api` service. Then
  rebuild with `API_URL` left empty, so the browser calls same-origin paths
  and nginx does the routing.
- Add a `web` service to the compose stack you already have in `domo-api`,
  wired to the `api` service.
- Compare the final image size against a naive single-stage build.
- Add a container `HEALTHCHECK`.
- Think about layer ordering and cache busting: what should you `COPY`
  before `npm install`/`npm run build`, and what should come after, to get
  the most cache reuse across rebuilds?

**CORS note:** if instead you set `API_URL` to point directly at the API
(rather than routing through nginx as a reverse proxy), the browser will
be making cross-origin requests — the API will need to send the right CORS
headers, or those requests will be blocked.
