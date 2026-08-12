
## macOS signing, notarization & auto-update (release workflow)

The release workflow signs + notarizes the DMG automatically when these repo
secrets exist (Settings → Secrets → Actions, or `gh secret set`):

| Secret | What it is |
|---|---|
| `MAC_CERT_P12` | Developer ID Application certificate, exported as .p12, base64-encoded (`base64 -i cert.p12`) |
| `MAC_CERT_PASSWORD` | The password chosen when exporting the .p12 |
| `MAC_API_KEY_P8` | App Store Connect API key file contents (.p8) — for notarization |
| `MAC_API_KEY_ID` | The API key's Key ID |
| `MAC_API_ISSUER` | The API key's Issuer ID |

Getting them (needs a Mac + the Apple Developer account):
1. Xcode → Settings → Accounts → Manage Certificates → “+” → **Developer ID Application**.
2. Keychain Access → My Certificates → right-click the cert → Export → .p12 with a password.
3. appstoreconnect.apple.com → Users and Access → Integrations → App Store Connect API →
   generate a **Team key** with Developer access; note Key ID + Issuer ID, download the .p8 (one-time download).

Without the secrets, releases still build — unsigned (right-click → Open on first
launch) and without auto-update, since Squirrel.Mac requires signed builds.
`electron-updater` is wired in `electron/main.ts` (packaged builds only) and reads
the `latest-mac.yml` feed that tagged releases publish.
