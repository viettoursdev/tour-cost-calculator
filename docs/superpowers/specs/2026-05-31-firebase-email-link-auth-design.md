# Firebase Email Link Auth — Design Spec

**Date:** 2026-05-31
**Status:** Approved

---

## Overview

Replace the current custom username/password login system with Firebase Email Link (passwordless/magic link) authentication. Only `@viettours.com.vn` emails are accepted. `developer@viettours.com.vn` is hardcoded as super admin. New users go through an approval queue before gaining access.

**Approach:** Firebase Auth handles identity only. Firestore `viettours/user_accounts` continues to store roles, display names, and approval status — now keyed by email instead of username. Firestore security rules remain open (`allow read, write: if true`) — no change.

---

## Auth Flow

```
[Login screen]
  User types email
  → validate ends with @viettours.com.vn (client-side, reject otherwise)
  → sendSignInLinkToEmail(auth, email, actionCodeSettings)
  → save email to localStorage("emailForSignIn")
  → show "Check your email" screen

[User clicks link in email]
  → App load: isSignInWithEmailLink(auth, window.location.href) === true
  → retrieve email from localStorage (prompt user to re-enter if missing)
  → signInWithEmailLink(auth, email, window.location.href)
  → Firebase Auth session established
  → lookup currentUser.email in viettours/user_accounts

  Case: developer@viettours.com.vn
    → hardcoded super admin, skip Firestore lookup, enter app as CEO

  Case: email not found in Firestore
    → create { email, status: "pending", role: null, displayName: null, createdAt }
    → show "Awaiting approval" screen

  Case: status === "pending"
    → show "Awaiting approval" screen

  Case: status === "active"
    → load role + permissions → enter app
```

**Session persistence:** `onAuthStateChanged` drives top-level render state. Firebase Auth handles session natively — `vte_s` sessionStorage is removed entirely.

**Top-level render states:** `loading | link-sent | awaiting-approval | active | signed-out`

---

## Firestore Schema

### `viettours/user_accounts` — document containing `users[]` array

**Old schema (removed):**
```js
{ u: "nguyenvana", p: "plaintext123", role: "Sales", name: "Nguyễn Văn A" }
```

**New schema:**
```js
{
  email: "nguyenvana@viettours.com.vn",  // primary key, replaces u
  role: "Sales",                          // null if pending
  displayName: "Nguyễn Văn A",           // null if pending
  status: "active",                       // "active" | "pending"
  createdAt: Timestamp
}
```

- `p` (password) field is dropped from all documents
- `email` replaces `u` as the lookup key throughout the codebase
- Existing users get `status: "active"` during migration
- `developer@viettours.com.vn` gets `role: "CEO", status: "active"` for consistency

---

## One-Time Migration

Function `migrateUserAccounts()`:
- Gated: only runs when `currentUser.email === "developer@viettours.com.vn"`
- Reads existing `viettours/user_accounts` array
- For each entry: maps `u` → `email` (appends `@viettours.com.vn` if no `@` present), drops `p`, sets `status: "active"`, sets `createdAt: now`
- Writes updated array back to Firestore
- Idempotent: skips entries that already have `email` field

---

## UI Changes

### Login Screen
```
[ your@viettours.com.vn        ]
[ Gửi link đăng nhập           ]

→ After sending:
  "Chúng tôi đã gửi link đăng nhập đến your@viettours.com.vn"
  [ Gửi lại ]
```

### Awaiting Approval Screen
```
Tài khoản của bạn đang chờ phê duyệt.
Vui lòng liên hệ quản lý hoặc developer@viettours.com.vn
[ Đăng xuất ]
```

### User Management Modal — two tabs
- **Người dùng** (existing): active users list, edit role + displayName, no password field
- **Chờ duyệt** (new): pending users list, each row has role selector + Approve button + Delete button

Pending tab visible to: CEO, Trưởng Phòng, `developer@viettours.com.vn`.

Approve action: writes `status: "active"`, `role`, `displayName` to Firestore.

---

## Code Changes in `index.html`

### Firebase module script (lines 15–41)
Add imports: `getAuth`, `sendSignInLinkToEmail`, `signInWithEmailLink`, `isSignInWithEmailLink`, `onAuthStateChanged`, `signOut`.

Expose globals:
```js
window.fbAuth = getAuth(app)
window.fbSendMagicLink = async (email) => { ... }
window.fbSignOut = () => signOut(window.fbAuth)
window.fbApproveUser = async (email, role, displayName) => { ... }
window.fbDeletePendingUser = async (email) => { ... }
```

### App root component
- On mount: check `isSignInWithEmailLink` → call `completeSignIn()` if true
- `onAuthStateChanged` drives `appState` (replaces current session check)
- `completeSignIn()`: calls `signInWithEmailLink`, then resolves Firestore account

### Removed
- `doLogin()` function
- `ldUsers()` credential check
- All `vte_s` sessionStorage reads/writes
- Password field from `UserManagementModal` create/edit form
- Password field from all Firestore user documents (via migration)

### Added
- `sendMagicLink(email)`: validates `@viettours.com.vn` domain, calls `sendSignInLinkToEmail`
- `completeSignIn()`: completes email link flow, resolves account state
- `migrateUserAccounts()`: one-shot migration, developer only
- Pending tab in `UserManagementModal`

### `syncUsersFromCloud()`
Change user lookup from `u === username` match to `email === currentUser.email` match.

---

## Firebase Auth Configuration (manual steps in Firebase Console)

1. Enable **Email/Password** provider → enable **Email link (passwordless sign-in)**
2. Add authorized domain: `viettoursdev.github.io`
3. Set `actionCodeSettings.url` to `https://viettoursdev.github.io/tour-cost-calculator/`

---

## Error Cases

| Situation | Handling |
|-----------|----------|
| Email not `@viettours.com.vn` | Client-side rejection before sending link |
| Link expired or already used | Firebase throws `auth/invalid-action-code` → show "Link đã hết hạn, vui lòng thử lại" |
| localStorage email missing when completing link | Prompt user to re-enter email |
| Firestore lookup fails | Show error, allow sign out |
| Pending user polls for approval | `onSnapshot` on user_accounts → auto-enters app when status flips to active |

---

## Out of Scope

- Firestore security rules using `request.auth` (no change to open rules)
- Email notifications to approvers when new user signs up (can be added later)
- Role changes triggering re-auth
