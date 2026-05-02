# Study Buddy

> Track time elapsed vs syllabus completed — know if you're ahead or behind, at a glance.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start)

---

## Features

- **Dual progress bars** — time elapsed vs chapters done
- **Subject-level control** — tick/untick subjects to include or exclude from the % calculation
- **Pre-loaded syllabi** — Bangladesh HSC (Science & Commerce), India CBSE, UK A-Levels, IB Diploma
- **Chapter notes** — attach quick notes to any chapter
- **Cloud sync** — progress saved across all your devices
- **Export CSV** — download your progress anytime
- **Fully responsive** — works on mobile, tablet, and desktop

---

## Deploying (for developers / self-hosters)

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project
2. In **SQL Editor**, run the schema from [`sql/schema.sql`](sql/schema.sql)
3. Copy your **Project URL** and **anon key** from Settings → API

### 2. Deploy to Netlify

1. Fork this repo and connect it to Netlify
2. Set these **Environment Variables** in Netlify → Site config:
   - `SB_URL` = your Supabase Project URL (e.g. `https://xxxx.supabase.co`)
   - `SB_KEY` = your Supabase anon (public) key
3. Set **Build command** to `node build-env.js` and **Publish directory** to `.`
4. Deploy — done. Users never see or interact with Supabase.

### How the credentials work

`build-env.js` runs at Netlify build time and injects `SB_URL` + `SB_KEY` into `_env.js`. Users only ever enter their **email address** to identify their data — the backend is completely transparent to them.

---

## Local development

```bash
# Clone the repo
git clone https://github.com/hello2himel/study-buddy

# Edit _env.js directly (do NOT commit this file with real keys)
# Set SB_URL and SB_KEY in _env.js temporarily

# Serve with any static server, e.g.:
npx serve .
# or
python3 -m http.server 8080
```

---

## Folder structure

```
study-buddy/
├── index.html          Dashboard
├── setup.html          Onboarding wizard
├── settings.html       Settings page
├── _env.js             Env stub (generated at build)
├── build-env.js        Netlify build script
├── netlify.toml        Netlify config
├── config/             Syllabus JSON files
├── script/
│   ├── supabase.js     Internal cloud client
│   ├── db.js           Data layer
│   ├── app.js          Dashboard logic
│   ├── setup.js        Onboarding logic
│   └── settings.js     Settings logic
├── style/
│   ├── main.css        Design system + dashboard
│   ├── setup.css       Wizard styles
│   └── settings.css    Settings styles
└── sql/
    └── schema.sql      Supabase table schema
```

---

## License

MIT — free to use, fork, and modify.

---

Made with ❤️ by [@hello2himel](https://github.com/hello2himel) from 🇧🇩  
This is open source software — [View Source Code](https://github.com/hello2himel/study-buddy)
