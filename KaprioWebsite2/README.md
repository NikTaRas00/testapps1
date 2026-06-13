# kapriol.bg

Single-page landing site for **Kapriol** — the exclusive Kapriol workwear / footwear /
PPE distributor in Bulgaria (owned by **ergotrade.bg**).

Plain static **HTML + CSS + vanilla JS**. One optional **PHP** file for the contact
form. No frameworks, no npm, no build step. Deploy by uploading files to cPanel
`public_html` over FTP.

> **This README is for you, not the server. Do NOT upload `README.md` (or the
> `Info hosting/` folder) to `public_html`.** They are local notes only.

---

## 1. What to deploy

Upload exactly these to `public_html/`:

```
index.html
send-mail.php
.htaccess
robots.txt
assets/css/style.css
assets/js/main.js
assets/video/kapriol-hero.mp4
assets/img/poster.jpg
assets/img/products/        (folder; real product photos go here later)
```

Do **not** upload: `README.md`, `Info hosting/`.

---

## 2. Placeholders to replace before launch

Search the project for each token and replace it with the real value.

| Placeholder           | Where it lives                                   | Replace with            |
| --------------------- | ------------------------------------------------ | ----------------------- |
| `PHONE_PLACEHOLDER`   | `index.html` (tel: link) and `COPY.contactPhone` in `assets/js/main.js` | Real phone, e.g. `+359 2 000 0000` |
| `ADDRESS_PLACEHOLDER` | `COPY.contactAddr` in `assets/js/main.js`        | Real street address     |
| `info@kapriol.bg`     | `send-mail.php` (`$TO`), `index.html`, `COPY.contactEmail` | Confirm this is the inbox that should receive enquiries |

> The phone appears twice: once as the visible text (`COPY.contactPhone`) and once
> in the `tel:` href in `index.html`. Update both. For the `tel:` link use digits
> only, e.g. `tel:+35920000000`.

The contact form **emails** `info@kapriol.bg` — that mailbox must exist on the
hosting account (create it in cPanel → Email Accounts).

---

## 3. Editing content — the `COPY` object

**Every visible UI string** lives in one object at the top of
`assets/js/main.js`, so copy edits (and a future Bulgarian switcher) never touch
the HTML. The HTML carries the same English text as a no-JS fallback; on load,
JS overwrites each `[data-copy="key"]` element from `COPY`.

```js
var COPY = {
  heroLabel: "OFFICIAL BULGARIA DISTRIBUTOR",
  heroH1:    "Built for work.\nMade by Kapriol.",   // \n becomes a line break
  heroSub:   "Premium workwear, footwear and PPE. ...",
  // ...every other label, button, message...
};
```

To change a string, edit its value here. To add **Bulgarian** later: copy `COPY`
to `COPY_BG` with the same keys translated, then call `hydrate(COPY_BG)` when the
user picks BG. No markup changes needed.

---

## 4. Editing the catalog — the `PRODUCTS` array

All product cards render from one array in `assets/js/main.js`. Nothing is
hard-coded in the HTML, so swapping real products = editing this array only.

```js
var PRODUCTS = [
  {
    category: "workwear",                         // workwear | footwear | ppe
    name: "Dynamic Stretch Trousers",
    img: "",                                      // "" = grey placeholder card
    description: "Cordura-reinforced work trousers with floating kneepad pockets."
  },
  // ...add as many as you like, in any of the three categories...
];
```

Field reference:

- **`category`** — must be one of `"workwear"`, `"footwear"`, `"ppe"`
  (the three blocks defined in `CATEGORIES`). No hand-tool or safety-tool category.
- **`name`** — product title shown on the card.
- **`img`** — path to a photo, e.g. `"assets/img/products/thunder-s3.jpg"`.
  Leave as `""` to show a clean grey placeholder. If a path 404s, the card falls
  back to the placeholder automatically.
- **`description`** — one short line. No price, no cart (by design).

**To add a real photo:** drop the file in `assets/img/products/`, then set its
path on the matching product's `img`. (Keep the file count sane — see §7.)

---

## 5. The hero video compositing (important)

The hero clip is a **dark-dressed man on a bright white studio background**. To
make the white background dissolve while the man stays visible, the video uses
`mix-blend-mode: multiply` over a soft **light "studio shaft"** behind it (a
radial light column). Multiply only erases white when the backing is light — on a
flat black backing it would crush the whole man to black, so the shaft is required.

Tuning lives in `assets/css/style.css` on `.hero__stage` (and again in the
`max-width: 860px` block for mobile):

```css
.hero__stage {
  --shaft-x: 75%;   /* horizontal centre of the man */
  --shaft-w: 23%;   /* half-width of the bright column */
  --shaft-h: 86%;   /* half-height of the bright column */
}
```

If you later supply a video that is **already cut out** (alpha WebM/HEVC) or shot
on a **black** background, you can drop the shaft and switch the blend mode:
black-bg footage on a dark page wants `mix-blend-mode: screen` instead of
`multiply`, with `.hero__stage` background set to flat `var(--bg)`.

**The shipped `kapriol-hero.mp4` is scrub-optimized.** It was re-encoded **all-intra**
(every frame is a keyframe) with **faststart** and no audio track, so seeking to any
scroll position decodes a single frame and is effectively instant. That is the real
cure for "the scroll outruns the video." It's 3.26MB (up from 1.49MB) and loads once.
The pre-optimization original is kept at the project root as
`kapriol-hero-ORIGINAL.mp4` (local backup, **do not upload**). If you ever replace
the clip with a fresh export, re-apply the optimization with:
`ffmpeg -i new.mp4 -an -c:v libx264 -preset slow -crf 20 -g 1 -pix_fmt yuv420p -movflags +faststart kapriol-hero.mp4`

**Blob preload + exit gate (belt and suspenders).** `main.js` still fetches the whole
clip and seeks it from memory (so the full timeline is reachable on any host even if a
future clip isn't faststart), and it holds the scroll at the end of the hero until the
man is fully transformed so a fast flick can't skip past a half-finished clip. The hold
never lasts longer than 2 seconds, and clicking any nav link jumps straight there. With
the all-intra video the gate rarely needs to engage. The video never autoplays; it only
moves with scroll.

**Fallback:** if the video has no readable duration, the poster image shows and
scroll-scrubbing is skipped automatically.

> **Updating CSS/JS after launch:** assets are cached for 1 year (immutable). When
> you change `style.css` or `main.js`, bump the version query in `index.html`
> (e.g. `assets/js/main.js?v=2`) so browsers fetch the new file. For local testing,
> just hard-refresh (Ctrl/Cmd + Shift + R).

---

## 6. cPanel upload (SuperHosting.bg) — step by step

**Option A — cPanel File Manager (no FTP client):**

1. Log in to cPanel (SuperHosting.bg control panel → Hosting accounts → cPanel).
2. Open **File Manager** → enter `public_html`.
3. **Upload** `index.html`, `send-mail.php`, `.htaccess`, `robots.txt`.
   - If `.htaccess` is hidden, enable *Settings → Show Hidden Files (dotfiles)*.
4. Recreate the `assets/` tree: create folders `assets/css`, `assets/js`,
   `assets/img`, `assets/img/products`, `assets/video`, then upload each file into
   the matching folder. (The big `kapriol-hero.mp4` may take a while.)
5. In cPanel → **Email Accounts**, make sure `info@kapriol.bg` exists.
6. Visit `https://kapriol.bg` and hard-refresh (Ctrl/Cmd + Shift + R).

**Option B — FTP client (FileZilla):**

1. Get FTP credentials from cPanel → **FTP Accounts**.
2. Connect to the host (port 21, or SFTP if offered). Remote path: `public_html`.
3. Drag the deploy files/folders from §1 into `public_html`, preserving the
   `assets/...` structure. **Skip `README.md` and `Info hosting/`.**
4. Confirm `.htaccess` transferred (toggle "show hidden files" in FileZilla).
5. Verify the site over HTTPS and test the contact form.

**After upload, check:**

- HTTP redirects to HTTPS, and `www.` redirects to the bare domain.
- The contact form sends and `info@kapriol.bg` receives the mail
  (check spam the first time; deliverability improves with SPF/DKIM set in cPanel).
- The hero video scrubs as you scroll.

---

## 7. The inode / file-count limit (why this stays small)

The hosting account is near its inode (file-count) ceiling, so **keep the total
number of files low** — the whole site is intentionally a handful of files.
When adding product photos, prefer a modest number of optimized images
(compress JPEGs/WebP) rather than dozens of large files. Don't add build tools,
`node_modules`, or framework bundles to this account.

---

## 8. Local preview

Because the contact form posts to a PHP endpoint, preview with a PHP server:

```bash
php -S localhost:8000
```

Then open `http://localhost:8000`. Opening `index.html` directly as a `file://`
works for everything except the form submission (which needs PHP).
