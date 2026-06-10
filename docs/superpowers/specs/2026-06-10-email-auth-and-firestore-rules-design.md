# Company-Email Auth + Firestore Lockdown — Design

**Status:** Approved (brainstorming complete) — pending implementation plan.
**Date:** 2026-06-10
**Author:** brainstorming session
**Scope:** replace plaintext-password login with Firebase magic-link auth restricted to `@viettours.com.vn`, then tighten Firestore rules so anonymous/external clients cannot read or write any data.

---

## Problem

Today the app provides **no real security**:

- Repo `viettoursdev/tour-cost-calculator` is public on GitHub. The Firebase config (project ID + API key) is hardcoded in `src/lib/firebase.ts:14-21` and ships in the JS bundle deployed to GitHub Pages.
- No Firestore rules file in the repo. Per `CLAUDE.md`, at least `user_notifications/*` and `dmc_quote_projects/*` are `allow read, write: if true`. The rest is unknown.
- "Login" is purely client-side: `authStore.login()` pulls `viettours/user_accounts` and string-compares the plaintext password in the browser. Anyone with the public config can call the same Firestore SDK directly and read every quote, contract, customer, supplier, and the password list — without ever loading the UI.

Stated requirement: prevent external/anonymous users from viewing any content without authentication, and switch login to company email.

## Goals

1. Only signed-in users with a verified `@viettours.com.vn` email can read or write any data in the `viettours` Firestore database.
2. Login uses Firebase Auth **email-link (magic link)**. No passwords.
3. Existing user records (in `viettours/user_accounts`) are preserved; `username` remains the canonical app-level identifier. Email is added only as a login identifier.
4. Ship in three independently revertible phases so a bad cutover never locks the team out.

## Non-goals

- Role-based enforcement in Firestore rules. Role permissions stay in `src/auth/PERMISSIONS.ts` and `hasPerm(user, perm)`, matching the current architecture. Threat model addressed by this spec: anonymous/external users. Rogue-employee threat model is out of scope.
- Per-document ownership rules (e.g. "Sales can only edit their own quotes").
- 2FA/MFA. Magic-link already binds sign-in to inbox access.
- Cloud Functions of any kind. No `beforeCreate` blocking trigger, no custom claims. Rules + client validation are sufficient at this scale.
- Rate limiting beyond Firebase's built-in quotas.
- Rules unit-testing (would require `@firebase/rules-unit-testing` + emulator install). Verified manually in Phase 3.
- Rotating the Firebase API key, deleting legacy plaintext passwords, removing the `User.p` field. Tracked as Phase 4 cleanup but not designed here.

---

## Architecture

### Auth flow

1. Unauthenticated user opens the app → shown `LoginScreen` (email-only form).
2. User enters email. Client validates `email.trim().toLowerCase().endsWith('@viettours.com.vn')` and rejects locally on mismatch with the message "Vui lòng dùng email công ty (@viettours.com.vn)".
3. `authStore.requestSignInLink(email)` calls `sendSignInLinkToEmail(auth, email, { url: 'https://viettoursdev.github.io/tour-cost-calculator/?mode=auth', handleCodeInApp: true })` and stores the email at `localStorage['vte_pending_signin_email']`.
4. UI swaps to a "Đã gửi link đăng nhập đến {email}" confirmation panel with a 60-second-cooldown "Gửi lại" button and an "Đổi email" reset button.
5. User opens email, clicks the link, browser navigates to the app with `?mode=auth&oobCode=…`.
6. On app boot, `authStore.init()`:
   - If `isSignInWithEmailLink(auth, window.location.href)` is true and the pending email is present in localStorage, call `signInWithEmailLink(auth, pending, window.location.href)`, then `localStorage.removeItem('vte_pending_signin_email')` and `window.history.replaceState({}, '', window.location.pathname)` to strip query params.
   - If `isSignInWithEmailLink` is true but no pending email is in localStorage, enter the **cross-device branch**: show a small "Nhập lại email để xác nhận" form, then call `signInWithEmailLink` with the typed email. This is the standard Firebase phishing mitigation — without it, a link intercepted from the inbox could be used on the attacker's device.
   - Subscribe via `onIdTokenChanged(auth, fbUser => …)`. When a non-null verified `fbUser` arrives, fetch `viettours/user_accounts`, find the entry whose `email` (case-insensitive) matches `fbUser.email`, and set it as `currentUser`. If no entry matches, call `signOut(auth)` and surface "Email chưa được cấp quyền. Liên hệ admin."

### Persistence & session

- Firebase Auth persists the ID token in IndexedDB and refreshes automatically. The session survives browser restarts until explicit sign-out, password reset on the account (not applicable here), or refresh-token revocation.
- Delete the `vte_s` sessionStorage logic in `authStore.ts` and the module-load session-restore block (current `authStore.ts:99-108`). Firebase Auth replaces it.
- `localStorage['vte_pending_signin_email']` is the only new client-side storage key. It lives only between "request link" and "click link"; cleared after successful sign-in.

### Firestore rules

A new `firestore.rules` file at the repo root, deployed via `firebase deploy --only firestore:rules` (or pasted into the Firebase Console for the initial rollout). A `firebase.json` is also added so the CLI knows where to find the rules.

```
rules_version = '2';
service cloud.firestore {
  // The {database} placeholder is required by the rules syntax. Database
  // scoping to `viettours` is configured in firebase.json (see below), not
  // here — there's only one rules file per database.
  match /databases/{database}/documents {

    function isEmployee() {
      return request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.token.email.lower().matches('.*@viettours[.]com[.]vn$');
    }

    match /viettours/{docId}             { allow read, write: if isEmployee(); }
    match /quote_projects/{id}           { allow read, write: if isEmployee(); }
    match /dmc_quote_projects/{id}       { allow read, write: if isEmployee(); }
    match /user_notifications/{username} { allow read, write: if isEmployee(); }

    match /{document=**} { allow read, write: if false; }
  }
}
```

Properties:

- `isEmployee()` is the single chokepoint. Every domain rule routes through it.
- `email_verified` is `true` for email-link sign-ins (Firebase sets it on link click). Future providers (if added) would have to set it too.
- `email.lower()` defends against case variation (`User@Viettours.COM.VN`).
- The regex pins `@viettours.com.vn` literally with escaped dots, anchored to end. Blocks `attacker@viettours.com.vn.evil.com`.
- The final `match /{document=**}` denies any new collection by default. New collections must be added explicitly to the rules to be reachable.

### Components changed

| Component | Change |
|-----------|--------|
| `src/lib/firebase.ts` | Add `getAuth(app)` export; add wrappers `fbSendSignInLink`, `fbCompleteSignInLink`, `fbSignOut`, `fbOnIdTokenChanged` so callers don't import directly from `firebase/auth`. |
| `src/stores/authStore.ts` | Remove password login. New actions: `requestSignInLink(email)`, `completeCrossDeviceSignIn(email)`, `signOut()`. `init()` rewritten as described above. `User.p` becomes optional (read-only legacy) and is no longer written. |
| `src/components/shell/LoginScreen.tsx` | Replace username+password form with email-only flow + confirmation panel + cross-device branch. |
| `src/components/admin/*` (user management) | Add required `email` field to user add/edit dialogs. Validate `@viettours.com.vn`. Mark users without `email` as "Chưa có email — không thể đăng nhập". Remove password field. |
| `src/types/User` | Add `email: string`. Mark `p` as `p?: string` (legacy). |
| `firestore.rules` (new) | As above. |
| `firebase.json` (new) | `{ "firestore": [{ "database": "viettours", "rules": "firestore.rules" }] }` — array form is required because `viettours` is a non-default database. |
| `firestore.rules.previous` (new, Phase 3 only) | Snapshot of pre-tightening rules for rollback. Committed alongside the new rules. |
| `docs/firebase-setup.md` (new) | One-time Console steps: enable email-link sign-in, add authorized domain `viettoursdev.github.io`, customize Vietnamese email template. |
| `CLAUDE.md` | Update "Open rules required" section (the two `allow … if true` paths go away) and the "No Firebase Auth" key-design-decision bullet (becomes "Firebase Auth, email-link only, restricted to @viettours.com.vn"). |

### One-time Firebase Console steps (documented in `docs/firebase-setup.md`)

1. Authentication → Sign-in method → enable **Email link (passwordless sign-in)**.
2. Authentication → Settings → Authorized domains → add `viettoursdev.github.io`.
3. Authentication → Templates → customize the sign-in email (Vietnamese subject + body, Viettours branding).

---

## Rollout — three phases

Each phase is an independent merge to `main` with its own revert path.

### Phase 1 — Add the email field (safe, no behavior change)

- Add `email` to `User` type + admin UI + validator.
- Old password login still works. No Firestore rule change.
- CEO sets a `@viettours.com.vn` email for every existing user via the user-management UI.
- Gate before Phase 2: every active user has an email set. Verified by a one-off check in the admin UI (a banner reads "X / Y users have email" or similar) — Phase 2 doesn't ship until X == Y.
- **Revert:** revert the PR. The unused `email` field on stored user docs is harmless.

### Phase 2 — Switch login to magic-link

- Ship new `LoginScreen` + new `authStore.init()` + removal of password-login code.
- Complete the one-time Firebase Console steps above.
- CEO logs in once via magic link as the smoke test. If green, rest of team transitions.
- Rules still open. Security is no worse than before; this phase isolates "login changed" from "rules changed" for easier debugging.
- **Revert:** revert the PR. Users return to password login (Phase 4 cleanup hasn't deleted passwords yet, so they still work).

### Phase 3 — Tighten Firestore rules

- Add `firestore.rules` + `firebase.json` + `firestore.rules.previous` (current open rules, snapshotted for rollback) to the repo.
- Deploy via `firebase deploy --only firestore:rules` or paste into Console.
- **Required post-deploy verification:** open the deployed app in an incognito window with no auth. Confirm any Firestore read returns `FirebaseError: Missing or insufficient permissions`. This is the moment "external/anonymous users cannot view content" becomes true. Do not skip.
- **Revert:** re-deploy `firestore.rules.previous` from the same PR. This is the only phase with a real rollback risk — that's why the snapshot is mandatory.

### Phase 4 — Cleanup (follow-up, not in this spec)

- Rotate the Firebase API key.
- Remove `User.p` from the type and from the live `viettours/user_accounts` document.
- Drop the legacy session-restore code paths once telemetry shows no users on old clients.

---

## Testing

Unit tests added in the same PRs that ship the corresponding code, following the existing Vitest pattern:

- `authStore.test.ts` (extend):
  - `requestSignInLink(email)` writes pending email to localStorage and calls `fbSendSignInLink` once with the email.
  - `init()` on a magic-link URL with a pending email: calls `signInWithEmailLink`, clears pending email, strips URL params.
  - `init()` on a magic-link URL with no pending email: enters cross-device flow (sets `pendingCrossDeviceSignIn` state, does not sign in).
  - `completeCrossDeviceSignIn(email)` calls `signInWithEmailLink` with the typed email.
  - `onIdTokenChanged` with a verified email **not** in `user_accounts`: calls `signOut`, surfaces error, leaves `currentUser` null.
  - `onIdTokenChanged` with a match: populates `currentUser` with the matched user record.
  - `onIdTokenChanged` with null: clears `currentUser`.
- `firebaseStub.ts` (extend): add `vi.fn()` stubs for `getAuth`, `sendSignInLinkToEmail`, `isSignInWithEmailLink`, `signInWithEmailLink`, `onIdTokenChanged`, `signOut`.
- **Not tested via Vitest** (manual smoke during cutover): real email delivery, Firebase Console domain whitelist, real Firestore rule enforcement. Captured in the Phase 3 verification checklist.

---

## Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Phase 3 deploy locks out users still on old clients caching the password path | Phase 2 already removed the password code path; cache-busting via Vite's hashed asset names ensures users get the new bundle on next page load. |
| Cross-device link click signs in the wrong account | Cross-device branch requires the user to re-enter their email before completing sign-in. This is Firebase's standard phishing mitigation. |
| User signs in with a verified `@viettours.com.vn` email that isn't in `user_accounts` (e.g. ex-employee whose email still works) | `onIdTokenChanged` handler signs them out immediately and surfaces "Email chưa được cấp quyền". Rules also fail closed because no domain doc allows them to do anything useful. |
| Admin forgets to add `viettoursdev.github.io` to Authorized Domains → magic links land on a page that rejects them | `docs/firebase-setup.md` lists this as a Phase 2 gate. CEO smoke test in Phase 2 catches it before broad rollout. |
| Rules deploy succeeds but client caches stale data and shows it | Cached reads in Firestore SDK are scoped to the open snapshot subscriptions; on token change (sign-out or expiry) the SDK re-evaluates rules. Manual incognito verification confirms rules independently of any cached state. |
| Public API key still leaks all auth-domain metadata | Rules enforce access regardless of API key. Rotation in Phase 4 is hygiene, not a security gate. |

---

## Open questions

None. All decisions captured above.
