# GameNight

GameNight is a test project for building several common household games in one app.
The first game scaffold is Kings in the Corner.

## Software Used

- C# / .NET 10 (ASP.NET Core API)
- React + Vite (game UI)
- Node.js + npm

## Quick Start

From the repository root:

```bash
dotnet restore
cd src/gamenight-ui
npm install
npm run dev -- --host 127.0.0.1
```

Open the UI at:
- http://127.0.0.1:5173/

## Common Commands

Install dependencies:

```bash
dotnet restore
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
