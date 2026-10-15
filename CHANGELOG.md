# Changelog

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
