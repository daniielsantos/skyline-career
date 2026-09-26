# playairframe.com landing

Static marketing page for **Airframe** — cargo career for Microsoft Flight Simulator. Matches the Airframe Career app visual (dark shell, amber accent, Bebas + IBM Plex). Hero uses the same **login lockup** PNG as AuthGate (`assets/airframe-hero-lockup.png`). Served from `sites/playairframe` in the [skyline-career](https://github.com/daniielsantos/skyline-career) repo.

No build step: HTML, CSS, and copied PNG assets only.

## Local preview

From the repo root:

```bash
npx --yes serve sites/playairframe
```

Open the URL printed in the terminal (usually `http://localhost:3000`).

## Cloudflare Pages

1. **Workers & Pages** → **Create** → **Connect to Git** → select `daniielsantos/skyline-career`.
2. **Project name:** `playairframe` (or `airframe-landing`).
3. **Production branch:** `main`.
4. **Root directory:** `sites/playairframe`.
5. **Build command:** leave empty / **None**.
6. **Build output directory:** `/` or `.` (project root is already `sites/playairframe`).
7. **Custom domains:** add `playairframe.com` and `www.playairframe.com`.

**DNS:** Do **not** change DNS for `world.playairframe.com` — that host stays on the game/world stack.

**Note:** The apex (`playairframe.com`) may currently return 500 from the old setup. After Pages is live, point apex/`www` at this project; only the marketing apex/www are replaced, not `world`.
