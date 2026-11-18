# Security Specification — MAMO CLINICAL SIMULATOR AI

## 1. Data Invariants

1. **Identity Integrity**: No user may create or read another user's `sessions`, `private/info`, or `error_reports`. All `userId` and `uid` fields must equal `request.auth.uid` unless `isAdmin()`.
2. **Role & Subscription Escalation Guard**: Standard users cannot create `/admins/{uid}` documents, cannot set `subscriptionTier: 'pro'` on `/users/{uid}` during creation or update, and cannot inject arbitrary XP jumps (`xp` increment bounded to `<= 500` per session update).
3. **PII Isolation**: Emails are strictly isolated under `/users/{userId}/private/info` and readable/writable only by the owner (`request.auth.uid == userId`) or verified Admin (`isAdmin()`).
4. **Published Content Gate**: Non-admin users can only `get` or `list` `/clinical_cases/{caseId}` where `resource.data.isPublished == true`. Unpublished drafts remain invisible to non-admins.
5. **Terminal State Locking**: Once a `SimulationSession` reaches `status == 'completed'`, non-admins cannot mutate `scoreBreakdown`, `totalScore`, `finalDiagnosis`, or `status`.
6. **Temporal Integrity & Path Hardening**: Every `create` validates `createdAt == request.time`, every `update` validates `updatedAt == request.time`, and every single-document path variable validates `isValidId(id)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars).

## 2. "Dirty Dozen" Adversarial Payloads

1. **Shadow Field Injection on User Create**: `{ uid, displayName, ..., isAdmin: true }` -> Rejected by `data.keys().hasOnly(...)`.
2. **Self-Assigned Pro Tier on Signup**: `{ uid, ..., subscriptionTier: "pro" }` -> Rejected because create mandates `subscriptionTier == "free"`.
3. **Spoofed Admin Email Without Verification**: `auth.token.email == "garmarmar293@gmail.com"`, `email_verified == false` -> Rejected by `email_verified == true` check.
4. **Cross-User PII Read**: User A reads `/users/userB/private/info` -> Rejected by `isOwner(userId)`.
5. **Cross-User Session List Scraping**: User A lists `/sessions` without `where('userId', '==', uid)` -> Rejected by `allow list: if resource.data.userId == request.auth.uid || isAdmin()`.
6. **Unpublished Case Leak**: Learner lists `/clinical_cases` without `where('isPublished', '==', true)` -> Rejected by `resource.data.isPublished == true`.
7. **Post-Completion Score Tampering**: Learner updates `/sessions/{id}` where `existing().status == 'completed'` to change `totalScore: 100` -> Rejected by terminal lock.
8. **XP Inflation Attack**: Learner updates `/users/{uid}` setting `xp: existing().xp + 50000` -> Rejected by bounded progression guard (`<= existing().xp + 500`).
9. **ID Poisoning Attack**: Document ID of 1,500 characters or containing `/` or spaces -> Rejected by `isValidId()`.
10. **Client-Forged Timestamps**: `createdAt: "2020-01-01T00:00:00Z"` instead of `serverTimestamp()` -> Rejected by `incoming().createdAt == request.time`.
11. **Unverified User Write**: Email/password user with `email_verified == false` creates a session -> Rejected by `isVerifiedUser()`.
12. **Non-Admin Platform Settings Tampering**: Standard user writes `/platform_settings/global` -> Rejected by `isAdmin()`.
