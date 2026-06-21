# Prompt seed files

Source of truth for bulk-managed prompts. The app's Firestore
collections are the runtime truth; these JSON files are the *staging
area* — edit them, run a script, the new prompts land in Firestore.

## Workflow

1. **Refresh local view of what's already in Firestore:**
   ```
   node scripts/exportPrompts.js
   ```
   Overwrites `game.json` and `snapple.json` with the current Firestore
   contents. Run periodically so you don't try to add duplicates.

2. **Add new prompts** — edit `game.json` or `snapple.json` directly.
   - `game.json` is an array of strings (or `{ text, category? }`)
   - `snapple.json` is an array of `{ text, category }`

3. **Push new prompts to Firestore (additive — safest):**
   ```
   node scripts/seedPrompts.js
   ```
   Dedupes against existing docs (by normalized text key) so re-running
   never creates duplicates. Only new entries get written. Does NOT
   delete anything.

4. **Replace ALL prompts to match the JSON exactly (destructive):**
   ```
   node scripts/syncPrompts.js            # dry-run: shows the diff
   node scripts/syncPrompts.js --apply    # actually mutates Firestore
   ```
   Anything in the JSON but not Firestore gets ADDED. Anything in
   Firestore but not in the JSON gets DELETED. Use after a big
   rewrite when you want Firestore to mirror the file.
   Scope to one collection: `--only game` or `--only snapple`.

## Collections

- `game.json` → Firestore `gamePrompts` (dealt to rounds during gameplay)
- `snapple.json` → Firestore `promptPool` (rotated into `activePrompts`
  for users to record snapples against)

## Auth

Both scripts use Firebase Admin via gcloud Application Default
Credentials. Run `gcloud auth application-default login` once if you
get an auth error.
