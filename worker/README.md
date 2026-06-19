# Local Lift Assistant — Cloudflare Worker

This Worker powers the Local Lift chatbot using **Cloudflare Workers AI** (Meta
Llama 3.3 70B). Inference runs on Cloudflare's network through the `AI` binding,
so there is **no API key or billing to set up** — just a free Cloudflare account.

## One-time setup

1. **Create a free Cloudflare account** at https://dash.cloudflare.com/sign-up
   (no credit card required; Workers AI has a free daily allowance).

2. From this `worker/` folder, install the dev dependency (wrangler):

   ```sh
   cd worker
   npm install
   ```

3. **Log in to Cloudflare** (opens a browser):

   ```sh
   npx wrangler login
   ```

4. **Deploy:**

   ```sh
   npx wrangler deploy
   ```

   Wrangler prints your Worker URL, e.g.
   `https://bizwiz-assistant.<your-subdomain>.workers.dev`.

5. Put that URL into the website: open `js/chatbot.js`, set
   `CHATBOT_PROXY_URL` to your Worker URL, then redeploy the site
   (`firebase deploy --only hosting`).

## Notes

- The model, token cap, and message limits are constants at the top of
  `src/index.js`. To try a smaller/faster model, change `MODEL_ID` to
  `@cf/meta/llama-3.1-8b-instruct`.
- Allowed browser origins are in `src/index.js` (`ALLOWED_ORIGINS`). Add your
  custom domain there if you use one.
- Workers AI free tier has a daily request allowance; if it's exceeded the
  chatbot falls back to canned answers in the browser until it resets.
- To run locally for testing: `npx wrangler dev` (the AI binding works in dev
  against your Cloudflare account).
