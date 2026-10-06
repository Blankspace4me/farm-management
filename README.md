# Fieldnote Farm Manager

Fieldnote is a small, offline-ready farm management starter app. Each farmer chooses which areas to use and puts them in their own priority order.

## Run locally on Windows

1. Open PowerShell in this folder.
2. Start a local web server:

   ```powershell
   python -m http.server 8000
   ```

3. Open <http://localhost:8000> in a browser.

The first visit opens setup. Select one or more farm areas, use the arrow buttons to order them, and optionally name the farm. The dashboard and navigation follow those choices. Use **Your priorities** to change them later.

## Installing and publishing

The current app is a responsive web app/PWA, not a Flutter mobile app. Serve it over HTTPS to make it available worldwide. It includes 192px and 512px Android-ready icons and asks supported browsers to show **Install app**; on iPhone or iPad, use Safari's **Share → Add to Home Screen**. The PWA uses the same app and on-device data while installed.

The Android Play Store route for this existing app is a Trusted Web Activity (TWA), which opens the HTTPS site in an app-like full-screen Android shell. It is not a self-contained native Flutter port: the site needs to remain online for updates and fresh installs, although the service worker supports previously cached offline use. Publishing a TWA requires a real domain, Android package ID, a signed app bundle, and a `/.well-known/assetlinks.json` file matching the signing certificate. Do not publish the placeholder asset links for a different domain or signing key.

Before Play Store submission:

1. Choose and register the permanent HTTPS domain and Android package ID.
2. Deploy and test the PWA on that domain, including offline startup on Android.
3. Complete Firebase project setup before advertising Google login, cloud sync, or shared team accounts; those features are not connected yet.
4. Generate the signed TWA app bundle using the production domain and signing key, then host the matching Digital Asset Links file.
5. Prepare the store listing, privacy policy, screenshots, support contact, and complete Google Play's current testing and review requirements.

Keep the signing key and Firebase administrator credentials private. An iOS App Store release is a separate project and would need an iOS app wrapper or Flutter port and Apple's review process; iOS users can install the PWA from Safari in the meantime.

## Offline and data storage

The app saves records in browser IndexedDB and caches its app files with a service worker. Existing browser data is migrated from local storage on first launch. Where supported, the app asks the browser to protect its storage from automatic eviction. Open it once from `localhost` or an HTTPS address so the app shell can be cached; it will then reopen offline in that same browser profile.

Records stay on the device and browser where they were entered. From **Your priorities → Backups & device storage**, download a portable JSON backup regularly and store a copy somewhere separate. Restore replaces the current browser's farm data after confirmation; invalid or unsupported backups are rejected without changing the current records. Browser/device storage is not a permanent archive, so do not clear site data until you have a verified backup.

Cloud accounts, Google sign-in, invited team access, and cross-device synchronization are not connected yet. Firebase is the planned provider; it needs a Firebase project, Google provider setup, and access rules before accounts can safely be enabled. Do not treat a browser backup or an unconfigured login as cloud backup.

## Included areas

- **Accounting:** a single-entry cashbook for dated income and expenses, with categories and all-time net cash flow. Amounts use the farm's currency without assuming a currency symbol; keep original receipts and records for accounting and tax purposes.
- **Production & resources:** log quantities produced by a registered animal or crop cycle, resource consumption, stock received, and produce sales. Available stock is calculated from production and received quantities minus consumption and sales, grouped by matching item name and unit. A sale checks stock and creates a matching income entry in Accounting; deleting either side removes both. Record stock purchases and their costs separately in Accounting. Use the same unit for an item consistently; this starter does not convert between units or calculate yields automatically.
- **Animal management:** an animal register with identifying details, species, breed, sex, date of birth, and weight, plus linked health, vaccination, breeding, and care logs. Animal status can be updated as animals leave the herd or flock.
- **Farm-specific choices:** customize animal-type and crop suggestions in **Your priorities**. The built-in examples cover common livestock and crops; suggestions are saved locally, and registration forms still accept types that are not in the lists. Removing a suggestion never removes existing records.
- **Employee management:** an employee register with role, contact details, employment type, and status; dated work-shift and hours logs; and individual payment entries that automatically create matching labor expenses in the farm accounts. Deleting a payment also removes its matching labor entry so the records stay in sync. Employee status, shift hours, and payment amounts are tracking records, not payroll calculations.
- Tasks and reminders
- **Crop management:** a field and crop-cycle register, with field size, planting and expected harvest dates, notes, and status tracking from planning through harvest.

Accounting, animal, crop, and employee records are saved locally along with your farm data and remain available offline. Employee contact details and payment logs stay in this browser on this device; protect your device and its browser profile accordingly. Previous livestock, finance, and crop notes are preserved when using the new registers. This prototype does not provide double-entry accounting, tax filing, animal identification integrations, cloud sync, or automated reminders.
