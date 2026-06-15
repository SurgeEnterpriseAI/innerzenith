# dotit → Google Play: full deploy runbook (organization account)

Start-to-finish steps to register a **Surge Software Solutions** organization account
and publish dotit. Do them in order. Items marked **[wait]** are out of your hands
(verification) — start them early so they run in the background.

App facts you'll reuse:
- App name: **dotit**  ·  Package: **in.surgesoftware.dotit**  ·  Version 1.0 (code 1)
- Upload file: `android/app/build/outputs/bundle/release/app-release.aab` (rebuild: `npm run aab:release`)
- Privacy policy: **https://innerzenith.vercel.app/privacy**  ·  Terms: `/terms`
- Listing copy + form answers: `PLAY_LISTING.md`
- Icon: `public/icon-512.png`  ·  Feature graphic: `assets/play-feature-graphic.png`
- Upload keystore: `dotit-upload.jks` (password `Dotit-Surge-2026`, alias `dotit`) — **back this up**

---

## PHASE 0 — Gather these before you start (15 min)
- [ ] Company legal name exactly as registered: **Surge Software Solutions Pvt Ltd**
- [ ] Registered business address + phone number
- [ ] A company credit/debit card for the **$25** one-time fee (USD)
- [ ] A company Google account to OWN the developer account (see Phase 2)
- [ ] Your company website URL (innerzenith.vercel.app is fine for now)
- [ ] **D-U-N-S number** (Phase 1 — the slow one; start first)

---

## PHASE 1 — D-U-N-S number  **[start TODAY — can take 1–4 weeks]**
Google requires a D-U-N-S number to verify organizations.
1. **Check if Surge already has one** (many registered Pvt Ltd companies do):
   - Go to https://www.dnb.com/duns/lookup or search D&B; enter the company name + India.
2. **If you have it:** note the 9-digit number, the exact legal name, and address **as D&B has them** — these must match what you type into Play Console **character-for-character**.
3. **If you don't:** request one free at https://www.dnb.com/duns-number/get-a-duns.html
   (D&B India). Free processing ≈ up to ~30 days; expedited (paid) is faster.
4. While waiting, do Phases 2 and the app-side prep — they don't need the D-U-N-S.

> Tip: the #1 cause of org-verification rejection is the business name/address not
> matching the D&B record exactly. Copy them from D&B, don't retype from memory.

---

## PHASE 2 — Company Google account (20 min)
1. Decide the owner identity. **Recommended:** a dedicated company account so it's not
   tied to a personal login (e.g. a Workspace user like `play@surgesoftware.co.in`, or
   `corp@surgesoftware.co.in` if it exists). Avoid a personal Gmail.
2. If you need a new one: create it, turn on **2-Step Verification**, and store the
   recovery info in the company password manager.
3. You'll later add team members in Play Console (Users & permissions) — you don't
   need everyone on this one login.

---

## PHASE 3 — Register the Play Console organization account ($25)  **[verification: a few days]**
1. Go to **https://play.google.com/console/signup** and sign in with the Phase-2 account.
2. Choose **"An organization or business"** (NOT "Yourself"). This is the key choice —
   it **exempts you from the 12-testers / 14-day closed-test gate** that personal
   accounts must pass before Production.
3. Fill the developer profile:
   - Developer/Organization name (shown on Play): **dotit** or **Surge Software Solutions**
   - Legal organization name: **Surge Software Solutions Pvt Ltd** (match D&B)
   - Address, phone, contact email, website.
   - **D-U-N-S number** from Phase 1.
4. Pay the **$25** one-time registration fee.
5. Submit. Google now **[wait]** verifies the organization (typically a few days; they
   may email asking for documents — respond promptly).
6. You may also be asked to verify the **contact phone/email** and complete **identity
   verification** for the account owner — have ID ready.

> You cannot publish until the org is **verified**. Everything in Phases 4–7 can be
> drafted while verification is pending; you just can't roll out to Production until done.

---

## PHASE 4 — Create the app (10 min, after you can access the Console)
1. Play Console → **All apps → Create app**.
2. App name: **dotit** · Default language: English (or your choice) · App or game: **App**
   · Free or paid: **Free**.
3. Tick the declarations (Developer Program Policies, US export laws).
4. Create. You land on the app **Dashboard** with a setup checklist.

---

## PHASE 5 — "Set up your app" (policy tasks) (45–60 min)
Work down the Dashboard checklist. Answers for dotit are in `PLAY_LISTING.md`.
1. **App access** — choose "All functionality available without special access"
   (dotit's core works without login; sign-in is optional sync). If they push back,
   add a test email and the magic-link note.
2. **Ads** — "No, my app does not contain ads."
3. **Content rating** — start the questionnaire: category **Reference/Education or
   Lifestyle**; answer No to violence/sexual/profanity/drugs/gambling; if asked about
   "fortune telling/astrology," answer truthfully (low rating). Submit → get the IARC rating.
4. **Target audience and content** — target age **18+**. Do NOT include children.
5. **Data safety** — declare: collect Name, Email, Gender, birth date/time/place,
   approximate location, in-app messages; purposes = App functionality, Account
   management, Personalization (NOT ads); **not shared** for third parties' own use;
   encrypted in transit = Yes; users can request deletion = Yes (in-app + email).
   (Exact entries in `PLAY_LISTING.md`.)
6. **Privacy policy** — paste **https://innerzenith.vercel.app/privacy**.
7. **Government apps / Financial features / Health** — No to each.
8. **News app** — No.

---

## PHASE 6 — Main store listing (20 min)
Play Console → **Grow → Store presence → Main store listing**. From `PLAY_LISTING.md`:
1. **App name:** dotit
2. **Short description** (≤80 chars) — paste.
3. **Full description** (≤4000 chars) — paste.
4. **App icon:** upload `public/icon-512.png` (512×512).
5. **Feature graphic:** upload `assets/play-feature-graphic.png` (1024×500).
6. **Phone screenshots:** upload **2–8** (1080×1920-ish, PNG/JPG). Capture from dotit on
   your phone (onboarding, a reading with the four headings, Ask Now, Profile). Ask me
   and I'll capture a set from the live app at phone size.
7. Save.

---

## PHASE 7 — Create the release + upload the AAB (20 min)
1. Play Console → **Testing → Internal testing → Create new release**.
2. **Play App Signing:** when prompted, **let Google generate & manage the app signing
   key** (default). Your `dotit-upload.jks` then acts as the **upload key**.
3. **Upload** `app-release.aab`.
4. Release name (e.g. `1.0 (1)`), release notes (e.g. "First release of dotit.").
5. **Save → Review release → Start rollout to Internal testing.**
6. **Internal testers:** Testing → Internal testing → Testers → create an email list →
   add testers → copy the **opt-in link**, open it on a phone, accept, install from Play.
   (Internal testing has **no review wait** — installs almost immediately.)

---

## PHASE 8 — Verify on real devices (30 min)
- Install via the opt-in link on 1–2 phones. Check: splash → onboarding → a reading →
  Ask Now → read-aloud → Profile (Privacy/Terms open, "Delete my data" works).
- Fix anything, `npm run aab:release`, upload a new release (bump `versionCode` to 2 in
  `android/app/build.gradle` for each new upload).

---

## PHASE 9 — Promote to Production (15 min + Google review)
1. **Organization account → no closed-testing gate.** Go to **Production → Create new
   release**, reuse the same AAB (or promote the internal release).
2. Choose countries (e.g. India + worldwide), release notes, **Start rollout to Production**.
3. Google reviews (a few hours to a few days for a first app). On approval, **dotit is
   live on the Play Store.**

---

## PHASE 10 — After launch
- Add team members: **Users & permissions** (so it's not one login).
- Each update: bump `versionCode`, `npm run aab:release`, upload a new Production release.
- Watch **Policy status** and **Pre-launch report** (automated device testing) for issues.

---

## Common rejection causes (avoid)
- Privacy policy URL not reachable → ours is live, keep it up.
- Org name/address ≠ D&B record → copy exactly from D&B.
- Data safety form doesn't match actual behavior → use `PLAY_LISTING.md` answers.
- Screenshots that are mockups, not the real app.
- App requires login but reviewers can't get in → ours works without login; state that.
