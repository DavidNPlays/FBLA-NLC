# BizWiz Assistant — Cloudflare Worker proxy

This Worker keeps your Anthropic API key secret. The browser talks to this
Worker; the Worker talks to the Claude API. The key is stored as a Cloudflare
secret and is never exposed to the website.

## One-time setup

1. **Create a free Cloudflare account** at https://dash.cloudflare.com/sign-up
   (no credit card required for the Workers free tier).

2. **Get an Anthropic API key** at https://console.anthropic.com → API Keys,
   and make sure billing is enabled.

3. From this `worker/` folder, install dependencies:

   ```sh
   cd worker
   npm install @anthropic-ai/sdk@latest
   npm install -D wrangler@latest
   ```

4. **Log in to Cloudflare** (opens a browser):

   ```sh
   npx wrangler login
   ```

5. **Store your Anthropic key as a secret** (you'll paste the key when prompted):

   ```sh
   npx wrangler secret put ANTHROPIC_API_KEY
   ```

6. **Deploy:**

   ```sh
   npx wrangler deploy
   ```

   Wrangler prints your Worker URL, e.g.
   `https://bizwiz-assistant.<your-subdomain>.workers.dev`.

7. Put that URL into the website: open `js/chatbot.js` and set
   `CHATBOT_PROXY_URL` to your Worker URL, then redeploy the site
   (`firebase deploy --only hosting`).

## Notes

- The list of allowed browser origins is in `src/index.js` (`ALLOWED_ORIGINS`).
  Add your custom domain there if you use one.
- Model, token caps, and message limits are constants at the top of
  `src/index.js`.
- To run locally for testing: `npx wrangler dev` (put the key in a `.dev.vars`
  file as `ANTHROPIC_API_KEY=sk-ant-...`, which is gitignored).
