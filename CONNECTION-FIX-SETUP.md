# Apps Script connection fix (experimental)

This branch changes the frontend to use a small Cloudflare Worker proxy for POST actions. GitHub Pages is static, and browser requests directly to Apps Script can fail because of cross-origin redirects/CORS. The public `getSiteStatus` JSONP check remains direct; order, lookup, admin, and upload actions go through the proxy.

## Files
- `cloudflare-worker.js`: Worker source that forwards POST requests to the existing Apps Script deployment and adds CORS headers.
- `js/common.js`: uses JSONP only for `getSiteStatus`; sends other actions to the configured proxy.
- `js/home.js`: passes the backend-issued upload token when uploading a design file.

## Required setup before testing
1. Open Cloudflare Dashboard → Workers & Pages → create a Worker.
2. Paste the contents of `cloudflare-worker.js`, save, and deploy it.
3. Copy the Worker HTTPS URL (for example, your own `https://...workers.dev` URL).
4. In `js/common.js`, replace `PASTE_YOUR_CLOUDFLARE_WORKER_URL_HERE` in `API_PROXY_URL` with that URL. Do not use the example URL literally.
5. Confirm `APPS_SCRIPT_URL` in `cloudflare-worker.js` matches the currently deployed Apps Script URL.
6. In Apps Script, deploy the backend as a Web app, execute as the script owner, with access set to Anyone. Update the deployment after backend code changes.
7. Test using a harmless test order, then check the Orders sheet and the order lookup page. Test file upload with a small JPG/PNG. SMS requires TextBee Script Properties and a working TextBee device/account.

## Security and limits
- This proxy is a transport bridge, not an authentication replacement. The Apps Script must continue validating public/admin actions and server-held passcodes.
- Never put owner/admin passcodes or TextBee API keys in this file or in frontend code.
- CORS is not an authentication control. If abuse occurs, add server-side rate limiting and/or Cloudflare Turnstile before public deployment.
- Do not merge to `main` until the Worker is deployed and the end-to-end tests pass.
