# Deployment Guide

This project has two independent deployment paths:

1. **Publishing the plugin to npm** — the package consumers `npm install`.
2. **Deploying the examples site to GitHub Pages** — the interactive demo site.

---

## 1. Publishing the plugin to npm

Publishing is fully automated via GitHub Actions using **OIDC Trusted Publishing**
(`.github/workflows/publish.yml`). You never run `npm publish` or `npm login`
locally — there are no tokens, one-time passwords, or passkeys involved. GitHub's
runner proves its identity to npm and receives short-lived publish rights.

### Cutting a release

```bash
# 1. Bump the version — edits package.json and creates a commit + git tag
npm version patch        # or `minor` / `major`

# 2. Push the commit and the tag
git push origin main --follow-tags

# 3. Create the GitHub Release for that tag — this triggers publishing
gh release create v1.2.3 --title "v1.2.3" --generate-notes
```

Publishing the GitHub Release fires the workflow (`on: release: published`), which:

1. Builds the plugin (`npm run build`)
2. Runs the unit tests
3. Verifies the release tag matches the `package.json` version (guards against drift)
4. Runs `npm publish --provenance` — authenticated by the workflow's OIDC identity,
   and attaching a signed provenance attestation

Watch progress under **Actions → Publish to npm**, then confirm:

```bash
npm view maplibre-transition version
```

A run can also be triggered manually (**Actions → Publish to npm → Run workflow**,
or `gh workflow run publish.yml --ref main`). A manual run skips the tag-vs-version
check and publishes whatever is currently in `package.json`.

### One-time npm setup (already configured)

Trusted publishing is registered once on npmjs.com and does not need repeating:
**Package → Settings → Trusted Publisher → GitHub Actions**

| Field | Value |
|---|---|
| Organization or user | `popkinj` (must be lowercase — it matches the OIDC `repository_owner` claim) |
| Repository | `maplibre-transition` |
| Workflow filename | `publish.yml` |
| Environment | *(blank)* |

### Gotchas (learned the hard way)

- **Do not add `registry-url:` to `actions/setup-node`.** It writes an `.npmrc`
  with a placeholder `_authToken` (`NODE_AUTH_TOKEN=XXXXX-…`) that shadows OIDC and
  makes `npm publish` fail with `E404`.
- The trusted-publisher **org/user field must be lowercase**. A capitalized value
  produces `OIDC token exchange error - package not found`, surfaced as `ENEEDAUTH`.
- Trusted publishing requires **npm ≥ 11.5.1**. The Node 22 runner ships npm 10.x,
  so the workflow runs `npm install -g npm@latest` before publishing.
- To debug a failing exchange, publish with `npm publish --loglevel verbose` and look
  for the `POST …/-/npm/v1/oidc/token/exchange/…` request and its response.

---

## 2. Deploying the examples site to GitHub Pages

### Quick start

```bash
# Serve examples locally
npm run serve:examples

# Deploy to GitHub Pages (popkinj.github.io/maplibre-transition/)
npm run deploy:examples
```

### What gets deployed

- A landing page (with a live map hero) linking every example
- 6 interactive example pages
- Shared CSS tokens and JS modules (theme, basemap, chrome, frame meter)
- The built plugin files (`dist/`)

Every page that ships must be listed in `build.rollupOptions.input` in
`vite.examples.config.js`. A page that is missing from that list **silently never
deploys**; a stale entry pointing at a deleted file is a **hard build failure**.
`_test-harness.html` is deliberately excluded — it is a dev-server-only rig for the
e2e suite.

### Deployment process

When you run `npm run deploy:examples`:

1. **Build plugin** — `npm run build` creates `dist/index.esm.js`
2. **Build examples** — Vite builds the `examples/` directory
3. **Deploy** — the `gh-pages` package pushes `examples-dist/` to the `gh-pages` branch

### GitHub Pages configuration

After the first deployment, configure Pages once:

1. Repository **Settings → Pages**
2. Set source to the `gh-pages` branch
3. The site is served at `https://popkinj.github.io/maplibre-transition/`

### Directory structure

```
examples/
├── index.html                 # Landing page (live map hero)
├── playground.html            # The six demo pages
├── color.html
├── hover-effects.html
├── chained-transitions.html
├── stress.html
├── rising-city.html
├── _test-harness.html         # e2e rig — NOT built, NOT linked
├── scripts/
│   ├── theme.js               # light/dark state + "themechange" event
│   ├── basemap.js             # CARTO Positron/Dark Matter, swapped via setStyle({diff:true})
│   ├── chrome.js              # shared header/footer/theme toggle/frame rail
│   └── perf.js                # frame meter + frame-budget rail
├── styles/
│   └── shared.css             # design tokens, light + dark
├── data/                      # canadian-cities.js (bundled)
├── public/data/               # canada-provinces.json, vancouver-buildings.geojson (copied verbatim)
├── .nojekyll                  # Tells GitHub Pages not to use Jekyll
└── README.md
```

### NPM scripts

- `npm run serve:examples` — start local dev server (hot reload)
- `npm run build:examples` — build examples for production
- `npm run deploy:examples` — build and deploy to GitHub Pages

### Customization

#### Base URL

The base URL is configured in `vite.examples.config.js`:

```javascript
base: '/maplibre-transition/'
```

Change this if deploying to a different URL.

#### Adding an example

1. Create the HTML file in `examples/`
2. Add it to `vite.examples.config.js` under `rollupOptions.input`
3. Add a feature card to `examples/index.html`

### Troubleshooting

**Styles not loading**
- Ensure the `base` path in `vite.examples.config.js` matches your Pages URL
- Check that `.nojekyll` exists in the examples directory

**Plugin not found**
- Run `npm run build` before deploying; verify `dist/index.esm.js` exists

**`gh-pages` command fails**
- Ensure you have push permissions to the repository
- Verify the package is installed: `npm install --save-dev gh-pages`
