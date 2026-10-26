# Sending plannings through your WhatsApp Business (Cloud API)

The "API key" you hear about is a **System User access token** from Meta. The app uses it
server-side to (1) upload the driver's planning image and (2) send it with an approved
message template. Nothing is sent from the browser.

## What the app does
1. Admin opens **Planning**, pastes/drops the schedule screenshots, the app splits them into one image per driver, matches each to a driver.
2. **Publish in app** → the driver sees it under *My planning*.
3. **Publish + send on WhatsApp** (or *Send* later) → the image goes to the driver's phone from your business number. Status (sent / delivered / read / failed) shows in the admin list via the webhook.
4. A driver only receives WhatsApp if they ticked **WhatsApp OK** (opt-in) in the app, or the admin ticked it for them.

## Step 1 – Database
Supabase → SQL editor → run `supabase/migrations/0002_planning.sql` (after `0001_init.sql`).

## Step 2 – Meta setup (one time)
1. https://developers.facebook.com → **Create app** → type *Business* → add the **WhatsApp** product, and link a Meta business portfolio (verification can take days).
2. Choose the sending number:
   - a **new dedicated number**, or
   - your current WhatsApp Business app number using **coexistence** (keeps the app working alongside the API). Otherwise the number must be removed from the app before registering on the Cloud API. Confirm the current click path in Meta's docs, it changes.
3. In WhatsApp → **API Setup** copy the **Phone number ID** and the **WhatsApp Business Account ID**.
4. Business Settings → Users → **System users** → add one (Admin) → assign your app and WhatsApp account with full control → **Generate token** with permissions `whatsapp_business_messaging` and `whatsapp_business_management`, expiry *Never*. This is your `WHATSAPP_ACCESS_TOKEN`. (The 24-hour token on the API Setup page is only for testing.)
5. App settings → Basic → copy the **App Secret** (`WHATSAPP_APP_SECRET`).

## Step 3 – Message template
WhatsApp → Message templates → Create:
- Name: `driver_planning`, language `English` (or yours; set `WHATSAPP_TEMPLATE_LANG` to match, e.g. `en`, `fr`)
- Category: Utility (Meta may reclassify)
- Header: **Image** (upload a sample)
- Body: `Hello {{1}}, here is your planning for {{2}}.` with sample values (e.g. `John`, `Tuesday, October 27`)
Wait for **Approved**. The app fills `{{1}}` = driver name, `{{2}}` = date.

## Step 4 – Environment variables (Vercel → Project → Settings → Environment Variables, then redeploy)
| Name | Value |
|---|---|
| WHATSAPP_ACCESS_TOKEN | System User token |
| WHATSAPP_PHONE_NUMBER_ID | Phone number ID |
| WHATSAPP_TEMPLATE_NAME | driver_planning |
| WHATSAPP_TEMPLATE_LANG | en |
| WHATSAPP_VERIFY_TOKEN | any long random string you invent |
| WHATSAPP_APP_SECRET | App Secret |
| WHATSAPP_GRAPH_VERSION | optional, default v23.0 |
| SUPABASE_SERVICE_ROLE_KEY | needed by the webhook |

## Step 5 – Webhook (delivery status)
Meta → WhatsApp → Configuration → Webhook: Callback URL `https://YOUR-DOMAIN/api/whatsapp/webhook`, Verify token = `WHATSAPP_VERIFY_TOKEN` → Verify and save → subscribe to the **messages** field.

## Step 6 – Test
Add your own phone as a driver, tick WhatsApp OK, publish a planning and press Send.
Optional raw test (replace values):
```
curl -X POST "https://graph.facebook.com/v23.0/PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","to":"15145551234","type":"template","template":{"name":"driver_planning","language":{"code":"en"},"components":[{"type":"header","parameters":[{"type":"image","image":{"link":"https://example.com/a.jpg"}}]},{"type":"body","parameters":[{"type":"text","text":"John"},{"type":"text","text":"Tuesday"}]}]}}'
```

## Notes
- Messages are billed per message by Meta; check their pricing page for your country.
- Images: JPEG/PNG, max 5 MB. The free-text "note" is shown in the app only, not in WhatsApp.
- Phones: 10-digit numbers are treated as +1; use `+` and country code for others.

## Troubleshooting
| Code / error | Meaning |
|---|---|
| 190 | Token expired/invalid, regenerate the System User token |
| 132000 | Template parameters don't match (body must have exactly 2 variables) |
| 132001 | Template name/language not found or not approved |
| 131026 | Message undeliverable (no WhatsApp on that number, or blocked) |
| `driver_not_opted_in` | Tick WhatsApp OK for the driver |
| `whatsapp_not_configured` | Env vars missing on the server, redeploy after adding |
