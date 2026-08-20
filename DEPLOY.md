# Deploying Astro Library Hub (free tier, no domain purchase)

Two pieces, two free services, both connected to one GitHub repo so future
`git push`es auto-deploy:

- **Client** (React/Vite static site) → **Vercel**
- **Server** (Express/tRPC API) → **Render** (free web service)
- Database (Supabase) and file storage (Cloudflare R2) stay exactly as they are — no change needed.

## This deployment's actual URLs

Recorded here because they live nowhere else in the repo — the names ended up
crossed over, which makes them easy to mix up:

| What | URL |
|---|---|
| Site (Vercel) | https://astro-library-hub-server.vercel.app |
| API (Render) | https://astro-library-hub.onrender.com |
| Keep-alive ping target (step 5) | https://astro-library-hub.onrender.com/health |

Note the site carries `-server` in its name and the API does not — the reverse of
what you would expect.

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

**Free-tier trade-off:** if nobody visits for a while, the server "sleeps" — the first request after that takes ~30–50 seconds to wake up, then it's normal speed. Step 5 below removes this with a free uptime pinger; do it, because a 30-second blank homepage is the single worst thing about this setup.

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

## 5. Keep the server awake (free, ~2 minutes)

Render's free plan shuts the instance down after ~15 minutes with no traffic, and
the next visitor waits for a cold boot. A scheduled ping to `/health` keeps it
running. Any free uptime pinger works; [cron-job.org](https://cron-job.org) is
the simplest:

1. Sign up free (email only, no card).
2. **Create cronjob** → **URL**: `https://astro-library-hub.onrender.com/health`
3. **Schedule**: every 10 minutes.
4. Save, then hit **Test run** once — expect `{"ok":true}` back.

[UptimeRobot](https://uptimerobot.com) does the same thing with a 5-minute
minimum interval if you prefer it.

**Watch the quota.** A free Render account gets 750 instance-hours a month, and
an instance that never sleeps burns ~730 of them — it fits, but only while this
is your one free service. If you deploy a second one, restrict the ping to a
daily window (cron-job.org lets you pick hours) instead of running it 24/7.

**Why not GitHub Actions?** A scheduled workflow looks free, but private repos
only get 2,000 Actions-minutes a month and every run bills a minimum of one
minute — pinging every 10 minutes needs ~4,300. It also silently disables
scheduled workflows in repos with no commits for 60 days. An external pinger
avoids both traps.

## Notes

- `ADMIN_TEST_PASSWORD` in some `server/scripts/*.ts` dev scripts is only needed if you run those specific scripts locally — never set it in Render/Vercel.
- Custom domain later: buy one anytime, point it at Vercel (client) via their dashboard — no code changes needed, and the free `*.vercel.app` URL keeps working alongside it.
