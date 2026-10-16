# Privacy policy

_Last updated: 2026-10-16. Applies to SapuX 3.1.0 and later._

**SapuX does not collect, sell or share any data. There is no SapuX server.**

## What SapuX reads

To work, SapuX uses your logged-in X session in your own browser, exactly like x.com does:

- the list of accounts you follow, with each account's public profile (name, @handle, bio, location field, follower counts, last post and its language);
- for accounts you choose to check, X's public "About this account" data ("Account based in");
- the `ct0` cookie (X's anti-forgery token) and the `twid` cookie (your account ID), which every x.com request needs;
- the `Authorization` header that x.com itself sends (the same public token for every X user).

SapuX never reads your `auth_token` login cookie or your password.

## Where it goes

- **Requests go only to `x.com` and `api.x.com`**, the same servers x.com uses. Profile pictures load from X's image server (`pbs.twimg.com`).
- **Nothing is sent anywhere else**: no analytics, no tracking, no crash reports, no ads, no remote code.

## What is stored, and where

Everything stays in your Chrome profile on your computer:

| Data | Where | How long |
|---|---|---|
| Session token | `chrome.storage.session` (memory only) | Until the browser closes |
| Rules, keep list, scan results, history, queue, location results | `chrome.storage.local` | Until you delete it |
| CSV exports and backups | Your Downloads folder, only when you click export | Until you delete them |

This data is not encrypted by SapuX; it is protected the same way as the rest of your Chrome profile. Anyone who can use your computer and Chrome profile can see it.

**Delete everything:** Rules → "Delete all data", or remove the extension.

## Children

SapuX is not directed at children and follows X's own age requirements.

## Changes

Changes to this policy are listed in the repository history. Questions: open an issue at https://github.com/masterputra169/sapuX/issues.

---

## Ringkasan (Bahasa Indonesia)

SapuX **tidak mengumpulkan, menjual, atau membagikan data apa pun**, dan tidak punya server sendiri. Request hanya dikirim ke `x.com` dan `api.x.com` memakai sesi login kamu sendiri. Cookie `auth_token` dan password tidak pernah dibaca. Semua data (aturan, hasil scan, riwayat, antrean, hasil cek lokasi) disimpan di profil Chrome kamu, dan token sesi hanya di memori sampai browser ditutup. Hapus semuanya lewat Aturan → "Hapus semua data" atau dengan menghapus ekstensinya.
