# EXPERIMENTAL — Jueh Tailoring security and order-flow patch

> This branch is a sandbox for testing. It does not change `main` by itself. Do not merge or use as the live site until the Apps Script backend, Cloudflare Worker URL, and order submission/lookup flow have been configured and tested.

This branch contains coordinated frontend, Apps Script backend, and Cloudflare Worker changes. **Do not merge until you finish setup and replace the API proxy placeholder**, or API calls will fail.

## Fixed in this patch

- Removes hardcoded OWNER/ADMIN passcodes from public JavaScript; the server reads secrets from Apps Script Script Properties.
- Sends credentials and customer data in POST bodies, not URL query strings.
- Uses unpredictable order IDs and a single-use upload token (only its SHA-256 hash is stored in the sheet).
- Checks the site-open flag server-side, validates fields and allowed order statuses, and limits design uploads to JPG/PNG/WEBP/PDF up to 5 MB with magic-byte verification.
- Keeps newly uploaded design files private and removes file links from public lookup responses.
- Includes a cleanup function for older files that may already have “anyone with link” sharing.
- Stops adding customer contact details to lookup URLs.
- Uses a small Worker proxy because a static GitHub Pages page cannot reliably read Apps Script ContentService responses cross-origin.

## 1. Update Apps Script

1. Open the existing Google Sheet, then Extensions → Apps Script.
2. Back up the current code.
3. Replace it with `backend/Code.gs` from this branch.
4. In Project Settings → Script Properties, add:
   - `OWNER_PASSCODE`: new unique password of at least 20 characters.
   - `ADMIN_PASSCODE`: a different unique password of at least 20 characters.
   - `SEMAPHORE_API_KEY`: optional; omit it to disable SMS.
   - `SEMAPHORE_SENDER`: optional; defaults to `JuehTailor`.
5. Do not keep/reuse the old OWNER and ADMIN values; they were present in the old submitted source and should be considered exposed.
6. Save, then Deploy → Manage deployments → Edit → New version. Execute as Me; Who has access: Anyone. Public access is needed for customer orders/lookups, while administrative actions still require a server-side passcode.
7. In Apps Script, select and run `lockDownDesignFiles` once and approve permissions. This privatizes files uploaded under the older code as well as the folder. Verify the old files' sharing after it runs.

The current Orders sheet is preserved. The script adds hidden column N, `Upload Token Hash`, when missing. Older orders still work, but uploads are authorized only for new orders created after the patch.

## 2. Deploy the Cloudflare Worker

1. Create a Cloudflare account and a Worker (the free tier is sufficient for a small shop).
2. Paste `worker/jueh-tailor-api.js` into its editor and deploy.
3. Add Worker variables:
   - `SCRIPT_URL`: the deployed Apps Script URL ending in `/exec`.
   - `ALLOWED_ORIGIN`: exactly `https://ahnwars.github.io` (no path).
4. Copy the Worker URL, for example `https://jueh-tailor-api.<your-subdomain>.workers.dev`.

The Worker is restricted to one configured Apps Script endpoint. Its Origin check is not authentication; Apps Script passcodes and upload-token validation remain the real authorization controls.

## 3. Set the frontend endpoint

In `js/common.js`, replace:

```js
const API_PROXY_URL = 'https://YOUR-WORKER-SUBDOMAIN.workers.dev';
```

with your actual Worker URL. Do not change `SHEETS_WEBAPP_URL`; the design-upload HTML form uses the direct Apps Script URL and does not need to read its response. Commit the one-line URL change on this branch, then merge the pull request to main.

## 4. Test before reopening orders

- New order without a file; verify it is in the sheet and lookup works.
- New order with a valid file under 5 MB; verify it is attached and not public.
- Try invalid file types, files over 5 MB, and an upload without the matching token; they must fail.
- Owner sign-in, status/note save, and Done notification.
- Admin sign-in and site open/close toggle.
- Verify customer contact is absent from the lookup URL.
- Verify the Google Sheet is accessible only to trusted staff and Apps Script editor access is not shared with customers.

## Remaining limits

A public order form can still be spammed. Add CAPTCHA and/or a server-side per-IP rate limit if abuse becomes a problem. This patch is security hardening, not a formal security audit.
