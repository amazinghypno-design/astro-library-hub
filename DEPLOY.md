# Deploying Astro Library Hub (free tier, no domain purchase)

Two pieces, two free services, both connected to one GitHub repo so future
`git push`es auto-deploy:

- **Client** (React/Vite static site) → **Vercel**
- **Server** (Express/tRPC API) → **Render** (free web service)
- Database (Supabase) and file storage (Cloudflare R2) stay exactly as they are — no change needed.

## 0. Push this repo to GitHub

**If you're new to GitHub, the easiest way — no terminal commands, no typing passwords/tokens anywhere:**

1. [github.com](https://github.com) → **Sign up** (free — email + a username, no card).
2. [desktop.github.com](https://desktop.github.com) → download **GitHub Desktop** → open it → sign in with the account from step 1 (opens your browser, you approve, done).
3. In GitHub Desktop: **File → Add Local Repository** → pick this project's folder (`Astro-Library-Hub`) — it already has git set up.
4. Click **Publish repository**. Keep **"Keep this code private"** checked. Click **Publish**.

That's it — the code is now on GitHub, ready for Vercel and Render to connect to in the next steps.

<details>
<summary>Prefer the terminal instead?</summary>

```bash
git remote add origin <your-repo-url>
git branch -M main
git push -u origin main
```
</details>

## 1. Deploy the server on Render

1. [render.com](https://render.com) → sign up free (GitHub login is easiest, no card needed for the free plan).
2. **New +** → **Blueprint** → connect this GitHub repo. Render reads `render.yaml` at the repo root automatically and proposes one web service (`astro-library-hub-server`).
3. It will prompt you to fill in the env vars marked "sync: false" in `render.yaml` — copy each value straight from your local `.env` file:
   `CLIENT_ORIGIN` *(leave blank for now — come back and fill this in after step 2)*, `DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `AI_PROVIDER`, `GROQ_API_KEY`.
   (`SESSION_SECRET` is generated for you automatically — don't fill that one in.)
4. Deploy. Once live, copy the service URL Render gives you — looks like `https://astro-library-hub-server.onrender.com`.

**Free-tier trade-off:** if nobody visits for a while, the server "sleeps" — the first request after that takes ~30–50 seconds to wake up, then it's normal speed. Fine for a personal single-user site.

## 2. Deploy the client on Vercel

1. [vercel.com](https://vercel.com) → sign up free (GitHub login, no card needed).
2. **Add New** → **Project** → import this same GitHub repo.
3. Vercel will pick up `vercel.json` at the repo root automatically (it defines the build/output for the `client` workspace) — leave Root Directory as the repo root, don't change it.
4. Before deploying, add one environment variable:
   `VITE_API_URL` = the Render URL from step 1 (e.g. `https://astro-library-hub-server.onrender.com`) — **no trailing slash**.
5. Deploy. You'll get a URL like `https://astro-library-hub.vercel.app` — that's the site, free, shareable, opens fine on a phone browser. No domain purchase needed.

## 3. Connect the two

Go back to Render → your service → Environment → set `CLIENT_ORIGIN` to the exact Vercel URL from step 2 (e.g. `https://astro-library-hub.vercel.app`, no trailing slash) → save (Render redeploys automatically).

## 4. Verify

- Open the Vercel URL. The homepage should load and show the library.
- Log in at `/admin/login` with the admin account — this is the part that would break if `CLIENT_ORIGIN`/env vars are wrong, so it's the one thing worth checking by hand.
- Try opening a file, downloading it, and (if logged in) editing a title — confirms the API, storage, and database are all correctly wired.

## Notes

- `ADMIN_TEST_PASSWORD` in some `server/scripts/*.ts` dev scripts is only needed if you run those specific scripts locally — never set it in Render/Vercel.
- Custom domain later: buy one anytime, point it at Vercel (client) via their dashboard — no code changes needed, and the free `*.vercel.app` URL keeps working alongside it.
