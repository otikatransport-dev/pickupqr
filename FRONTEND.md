# Managing the front end

## Where things live
| What you see | File to edit |
|---|---|
| Colours, app name, logo | Admin Centre → Branding (no code) |
| Colour tokens, buttons, cards, inputs | `src/app/globals.css` (`.btn`, `.btn-primary`, `.btn-secondary`, `.card`, `.field`) |
| Header / navigation bar | `src/app/dashboard/layout.tsx` |
| Admin Centre tiles (add/remove/reorder a page) | `src/lib/admin-nav.ts` |
| Login page | `src/app/login/` |
| Page title, subtitle, notices, empty states | `src/components/ui.tsx` |
| A screen's buttons and forms | the `*-manager.tsx` / `manager.tsx` beside each `page.tsx` |

## Add a page (e.g. Route Optimizer)
1. Create `src/app/dashboard/company-admin/<name>/page.tsx` (copy `route-optimizer/page.tsx`).
2. Add one entry to `src/lib/admin-nav.ts`.
3. Commit to `main`. Vercel builds and publishes automatically.

## Safe workflow
Work on a branch, push it, and Vercel creates a private preview link. Check it, then merge to `main` to publish.
