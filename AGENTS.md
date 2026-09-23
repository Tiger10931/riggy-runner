<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in the
> editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Base44 dev environment

This is a Vite + TanStack Start (React 19) SSR frontend managed with **bun**. There is
no backend, database, or external-service dependency — it runs as a single container.

- Run: `docker compose -f docker-compose.base44.yml up -d`
- Preview: host port 3000 → `bun run dev` (Vite dev server, SSR via TanStack Start).
- The app is "Riggy Runner", an endless-runner game. The React shell (`src/routes/index.tsx`)
  renders an `<iframe src="/riggy/index.html">` that loads the static game from `public/riggy/`.
- Dependencies install at container start via `bun install --frozen-lockfile` (node_modules
  is a named volume so installs don't pollute the host bind-mount).
- No secrets required.
