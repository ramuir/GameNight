# GameNight

Multi-game UI workspace built with React and Vite.

## Run

From `src/gamenight-ui`:

```bash
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/`.

## Test

From `src/gamenight-ui`:

```bash
npm test
npm run test:e2e:liverpool
```

Run a focused Liverpool cut preview check:

```bash
npm run test:e2e:liverpool -- --grep "cut-preview|round five cut|cut control"
```

## Notes

- Liverpool includes a dev cut-preview fixture in the live app via `?game=liverpool&fixture=cut-preview`.
- Rulebooks live in `rulebook/`.
