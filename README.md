# Taimaka · ITP Triage (concept prototype)

Front-door triage sieve for the Inpatient Therapeutic Programme. React 19 + Vite + Tailwind v4.
All state is in memory — no database, no patient data stored.

> Clinical note: every vital threshold here is a WHO placeholder and must be validated
> against Taimaka's own protocols and the Nigerian national CMAM/IMCI guidelines before real use.

## Run locally
Needs Node.js 20.19+ or 22.12+.
    npm install
    npm run dev      # opens at http://localhost:5173

## Deploy to GitHub Pages (already wired up)
This project is pre-configured for a repo named **taimaka-itp-triage**:
- vite.config.js has `base: '/taimaka-itp-triage/'`
- package.json has `predeploy` / `deploy` scripts using the gh-pages package

Steps:
1. Create a PUBLIC repo on GitHub named `taimaka-itp-triage` (no README/gitignore/license).
2. Push this folder to it (git init / add / commit / remote add / push).
3. Run `npm run deploy` — this builds and pushes the site to a `gh-pages` branch.
4. Repo Settings -> Pages -> Source: "Deploy from a branch" -> Branch: `gh-pages` -> Save.
5. Live at https://YOUR-USERNAME.github.io/taimaka-itp-triage/

If you pick a different repo name, change `base` in vite.config.js to `/your-repo-name/` and redeploy.

## Folding into the existing Taimaka app
If that app is React: copy src/App.jsx in (rename as you like), `npm install lucide-react`,
ensure Tailwind is set up, and render the component. Tell me what it's built with if not React.
