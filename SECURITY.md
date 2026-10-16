# Security

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private report instead:
**Security → Report a vulnerability** on https://github.com/masterputra169/sapuX/security/advisories/new

Include what you found, how to reproduce it, and which SapuX version you used. You will get a reply as soon as possible, and a fix will be released before details are made public.

## Get SapuX only from here

- **Releases:** https://github.com/masterputra169/sapuX/releases (built by GitHub Actions from the tagged source)
- **Source:** https://github.com/masterputra169/sapuX

Copies from anywhere else (Telegram, Discord, file-sharing sites, "premium" versions) may be modified to steal your X session. SapuX is free and has no paid version.

### Verify a download

Each release ZIP comes with a `.sha256` file and a signed build-provenance attestation.

```bash
sha256sum -c sapux-3.1.0.zip.sha256                               # checksum matches
gh attestation verify sapux-3.1.0.zip --repo masterputra169/sapuX # built by this repo's CI
```

## Design

- No remote code, no dependencies, no third-party servers; requests go only to `x.com` / `api.x.com`.
- Minimal permissions: `storage`, `webRequest` (read-only header capture on X), `notifications`.
- The X session token is kept in memory only; the `auth_token` login cookie is never read.
- Text from other accounts is rendered with `textContent` inside a closed Shadow DOM (no `innerHTML`).
- Strict extension CSP: `script-src 'self'; object-src 'none'; base-uri 'none'`.
- Imported backups are validated and clamped to safe limits; CSV exports escape spreadsheet formulas.
