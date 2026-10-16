# Changelog

## 2.7.0

- Smarter location guesses (no extra requests): flags and country words in the display name, demonyms and places in the bio ("Indonesian", "Proud Indian"), scripts (Devanagari, Thai, Hangul, Kana, Vietnamese…), everyday words in the bio and last post (Indonesian, Hindi/Urdu in Latin letters, Filipino, Nigerian Pidgin), plus the post language.
- Every guess has a confidence level (high, medium, low). Signals that agree raise it; signals that point elsewhere lower it. The tooltip lists the signals used.
- Low-confidence tags are shown faded. Guesses still protect accounts at any confidence; only high-confidence guesses can set priority (and only when "Only use X's official data" is off).
- Accuracy check: once some accounts are checked with X, Rules shows how often the guesses matched X's data, overall and per confidence level.
- Rescan once to load names' and bios' new signals.

## 2.6.1

- Fix: no "Cannot read properties of undefined (reading 'onChanged')" error when an X tab loads while the extension is being reloaded or updated. The panel now stays out of the way until the page is refreshed.

## 2.6.0

- New Location option, on by default: "Only use X's official data for unfollow first". Guesses from bio or post language still protect accounts but never move them to the front of the queue.
- The X check now looks at accounts that probably match your priority places first.

## 2.5.0

- Official location from X: Rules → Location → "Check N with X" reads "Account based in" from each candidate's About page.
  - Only candidates (plus accounts kept by a guessed location) are checked, one request at a time with random pauses; SapuX reads X's rate-limit headers and waits when the limit runs low.
  - Results are saved per account and re-checked after 90 days at most; Stop keeps progress.
  - X's data replaces the bio/language guess. Accounts X marks as possibly inaccurate (VPN or proxy) still count for "keep" but never for "unfollow first".
  - When X changes the request ID, SapuX learns the new one the next time you open any profile's About page.
- Location tags show a check mark for X's data and a warning sign when X flags it.

## 2.4.0

- Location rules: SapuX guesses where an account is based from its bio location (city, country name or flag emoji) and the language of its last post, with no extra requests.
  - Keep accounts from chosen countries or regions (new "kept" reason).
  - Put chosen countries or regions at the front of the unfollow queue, optionally pre-selecting only those.
  - Location never makes an account a candidate by itself.
- Location tag on each row with the source in its tooltip; search matches bio location and country; CSV gains location columns.
- README screenshots refreshed.

## 2.3.0

- Custom confirmation dialog inside the panel replaces the browser's native pop-up (start, resume and delete-all). Shows what will happen at a glance: accounts now, accounts going to the queue, estimated time, the mix of groups and any warnings.
- Live runs open with focus on Cancel, so a stray Enter never starts unfollowing. Esc or clicking outside cancels; focus stays inside the dialog.

## 2.2.0

- Follow-back filter chips in Review (All / Follows you / Doesn't follow) with counts. They only narrow the current view, like search; Select all and Clear act on the filtered rows.

## 2.1.0

- One-way filter: optionally unfollow accounts that don't follow you back, even if active.
- Quiet activity detection: an account whose following count changed between scans counts as active.
- Queue: leftover accounts from a live run (daily limit, Stop, closed tab) are saved; resume or discard from a card in Review.
- Desktop notifications when a live run finishes or stops (toggle in Rules).
- Backup and restore rules + keep list as JSON.
- CSV export gains an `active_quietly` column.
- Legend wraps into two rows when six groups are shown.
- Fix: long lists no longer squash the search field.

## 2.0.1

- Refresh button in the header; every tab now updates live from storage (including changes made in another X tab).

## 2.0.0

- New interface: English by default with Bahasa Indonesia switch, logo, light/dark theme that follows X, bundled Geist font and Phosphor icons.
- Search, one-click Keep / Release, row click to select.
- Small accounts filter.
- Reload screen when the extension is updated while an X tab is open.

## 1.x

- Inactivity scan, keep list, mutual and big-account protection, simulation mode, daily limit with random pauses, history with Follow again, CSV export.
