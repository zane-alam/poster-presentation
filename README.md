# Citytouch Voice: interactive site

A static website (plain HTML, CSS and JavaScript). No build step, no installs, no external requests.
Fonts and the QR library are bundled in this folder.

## Deploy to Vercel (free)

**Option 1: Vercel CLI (about 1 minute)**
```
npm i -g vercel
cd city-bank-voice-ai-site
vercel          # answer the questions, accept the defaults
vercel --prod   # gives you the final link
```
When it asks for a framework, choose "Other". Build command and output directory stay empty.

**Option 2: GitHub**
Push this folder to a GitHub repository, then import it at https://vercel.com/new. Framework preset: Other.

## Add your QR link later

Open `js/config.js` and paste your final link:

```js
window.SITE_CONFIG = { siteUrl: "https://your-project.vercel.app" };
```

Redeploy. If you leave it empty, the QR code automatically uses the address the page is opened on,
so after deploying it already points to your live site.

## Add more later

- Student ID or extra credits: edit the `<footer>` in `index.html`.
- Colours: the `:root` block at the top of `css/style.css`.
- Simulation scenarios and cost numbers: the top of `js/app.js` (`SCN` and `COST`).

## Notes

The simulation and cost numbers are illustrative, not City Bank's real system. Jev's speed and
price claims are vendor-reported and from unofficial sources.

Licences: fonts (Bricolage Grotesque, IBM Plex Sans, JetBrains Mono, Noto Sans Bengali) are SIL OFL 1.1;
qrcode-generator is MIT.
