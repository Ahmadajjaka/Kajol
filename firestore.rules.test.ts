import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Static structural verification of the Dirty Dozen security invariants in firestore.rules
test('firestore.rules enforces Eight Pillars security invariants', () => {
  const rules = fs.readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8');

  // 1. Default deny catch-all
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);

  // 2. Email verification requirement & admin bootstrap
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(rules, /garmarmar293@gmail\.com/);

  // 3. ID Poisoning guard
  assert.match(rules, /function isValidId\(id\)/);
  assert.match(rules, /id\.size\(\) <= 128/);

  // 4. PII isolation subcollection
  assert.match(rules, /match \/private\/\{docId\}/);

  // 5. Subscription & XP anti-escalation
  assert.match(rules, /incoming\(\)\.subscriptionTier == 'free'/);
  assert.match(rules, /incoming\(\)\.xp <= existing\(\)\.xp \+ 500/);

  // 6. Terminal status locking on sessions
  assert.match(rules, /existing\(\)\.status == 'active'/);

  // 7. Temporal integrity
  assert.match(rules, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rules, /incoming\(\)\.updatedAt == request\.time/);
});
