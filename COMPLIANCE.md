# dotit — DPDP Act 2023 Compliance (Stage 12)

dotit collects personal data — name, birth date, birth time, birth location,
current location, gender — solely to compute the user's chart and personalise
their session context. Nothing is collected for analytics, advertising, or
third-party sharing.

## Requirements & where they are met

| DPDP requirement | Implementation |
|------------------|----------------|
| **Explicit consent** | Dot 7 of onboarding — the Terms checkbox must be ticked before the profile becomes active. Copy states what is collected and why. |
| **Purpose limitation** | Data is used only for chart calculation + session context. No analytics/ads/sharing. The Python engine receives only what a chart needs. |
| **Data principal rights** | Profile → "Edit birth details" (correct) and "Delete my data" (erase). On birth-detail edit, the user sees the recalculation disclaimer before any overwrite. |
| **Data localisation** | For Indian users, birth + chart data should be stored in an India region. Supabase project region should be Mumbai (or India-equivalent) once persistence is reconnected (Phase 7b). |
| **Gender retention** | Required for BaZi luck-pillar direction and Zi Wei palace placement — removing it breaks two systems. DPDP requires protecting how it is stored/used, not removing it. |

## Recalculation rule (Stage 6.3)

When birth details are edited, show this disclaimer and require confirmation:

> "Updating your birth details will recalculate your entire chart. Your past
> conversations will remain in History but future sessions — including any you
> continue from History — will use your new chart. Facts you have shared with
> us are kept. Your chart memory is reset."

Past History sessions are preserved exactly. Any session continued after a
recalculation uses the new chart from that point forward.

## Outstanding before public launch

- [ ] Move Supabase project to an India region (or confirm adequacy equivalence).
- [ ] Wire the recalculation disclaimer modal to the Profile → Edit flow.
- [ ] Publish Terms of Use + Privacy Policy pages (currently linked, not authored).
- [ ] Confirm account deletion removes all rows server-side (Supabase cascade).
