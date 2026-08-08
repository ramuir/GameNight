# GameNight

GameNight is a test project for building several common household games in one app.
The first game scaffold is Kings in the Corner.

GameNight is a lightweight UI app and is intended to be easy to host on Vercel or Netlify.

## Software Used

- React + Vite (game UI)
- Node.js + npm

## Quick Start

From the repository root:

```bash
cd src/gamenight-ui
npm install
npm run dev -- --host 127.0.0.1
```

Open the UI at:
- http://127.0.0.1:5173/

## Common Commands

Install dependencies:

```bash
cd src/gamenight-ui && npm install
```

Start UI:

```bash
cd src/gamenight-ui
npm run dev -- --host 127.0.0.1
```

Stop UI when finished:

- Press Ctrl+C in the terminal running the UI.
- If needed, close the terminal tab.

Security checks:

```bash
cd src/gamenight-ui
npm run security:check
```

Dependency audit only:

```bash
cd src/gamenight-ui
npm run audit:check
```

## Rulebook

- Kings In The Corner implementation rules: `rulebook/kings-in-the-corner-rulebook.md`
- Legacy prompt notes are kept in `KingsInTheCorner.md` as non-authoritative draft context.

## Secure Change Standards

- Do not commit secrets, tokens, passwords, connection strings, or personal data.
- Keep local-only environment and override files untracked; use ignored `.env.*` or `*.local` files for local configuration.
- Run `npm run security:check` before merging dependency or configuration changes.
- Keep security and dependency remediation isolated from unrelated gameplay or UI changes when possible.
- Prefer local or offline assets over introducing remote dependencies for security-sensitive surfaces.
