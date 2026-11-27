# Bench Marx

[Open the live training log](https://marxprogramming.github.io/bench-marx/)

**Workout** tracks 17 exercises across cable, weights, plyometrics and mobility. Tap once for done, twice for heavy, and a third time to enter a PR result and rep count.

**Gymnastics** gives each of the five main skills five rep boxes. Tap once for achieved, again for great and once more to clear. The three optional basics are tracked separately from the 25-rep session target. Both logs open on the current local date.

Use **Untick** beside an exercise or below a marked rep to clear it directly. The weekly chart also has an untick mode. Five flight paths visualise the main gymnastics skills, with each marked rep lighting a point.

**Insights** shows workout coverage, intensity, missed movements, gymnastics rep quality, full sets, skill histories and cross-session patterns over 7, 28 or 90 days. **History** includes a combined calendar, editable workout chart and PR book.

Signed-in journals sync to Supabase when the training project is connected. Otherwise entries are stored in the current browser. Use the settings button to export or merge a JSON backup, enable optional chimes or reduce animations. **Start fresh** stores a restorable journal on this device before clearing the active logs. Restoring fills missing entries and keeps newer marks. Existing Formlog and Bench Marx workout backups, including historical Pallof presses, remain readable.

## Hosting

Serve this directory as a static website, or publish the root of the main branch using GitHub Pages. After the service worker has installed over HTTPS, both logs and their assets are available offline.

## Bench Dan

[Open Bench Dan](https://marxprogramming.github.io/bench-marx/dan.html)

Bench Dan uses this repository with its own home screen, catalogue, backups and calorie journal. Both apps let you add custom exercises and log body weight. Bench Dan lets you enter calories for each food or drink and review the previous seven days. Use **Log same as yesterday** to copy the previous log date’s food and calorie entries. The shortcut skips entries already matched and offers Undo.

## Supabase connection

Both live apps are connected to the dedicated Bench Training project. Sign in from **Cloud sync** on each device. When the status reads **Saved to cloud**, the latest entries are on the server. Use **Upload device data** at the bottom of each app to copy existing local entries into the signed-in account. Entries already present in the cloud take priority.

For a new project, run `supabase.sql` in its SQL Editor, configure the project's HTTPS URL and publishable key in `cloud.js` and provision each person’s confirmed email and password through Supabase Auth.

Changes sync automatically and retry when the app is open and connected. Account ownership is enforced by Supabase row-level security. The app name is also part of each journal key, so using the same sign-in in both apps still keeps the two journals separate. Journal types include workout marks, PRs, catalogue edits, daily weights, gymnastics reps and food entries as applicable. The browser holds a separate account cache and pending offline changes. Sign-out closes the account journal on that browser.

### Food photos and receipts

In Bench Dan, open **Calories**, then **Add food**. Take or choose a food photo to check common foods with YOLOS Tiny. If the first pass is uncertain, you can run a separate prepared-dish check. Both return editable suggestions, and the photo stays in the browser. Scan a receipt or label to read printed item names and explicit calorie values. Confirm the portion in the form before saving. A price is never used as a calorie value. The image is processed in the browser. The prepared-dish scan downloads a separate model of roughly 60 MB. The receipt scanner also loads its text recognition files when used. Fruit portion shortcuts use the FDA raw fruit reference chart.

### Workout categories

Use **Add category** below the workout list. Use **Rename** beside a category to change its name or remove it. Swipe left on an exercise on a touchscreen or use **Edit** to rename or remove it. Confirm removal to hide the item from the workout list. Historical marks remain in History, and removed items can be restored from Settings.

### Training reminders

The workout list highlights exercises after three days and two missed workouts, after seven days since the last mark, or after three workouts in its own category if an exercise has never been marked. Both apps flag two consecutive Heavy or PR days on the same exercise and ask you to confirm before logging a third. Bench Marx also shows previously heavy exercises with a gap of at least 14 days. Open **Needs attention** for the flagged exercises or switch off **Training reminders** in Settings. Insights opens with a seven-day view.
