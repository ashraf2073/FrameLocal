# FrameLocal

A minimalist photo feed that lives entirely on your device. No account, no server, no network needed.
Built with vanilla HTML, Tailwind CSS and modern JavaScript, and ready to wrap with Capacitor into an Android APK.

**Made by Ashraf.**

## What it does

- **Feed**: framed photo cards with avatar, username, time, caption and a live like counter. Double-tap a photo to like it. Edit a caption or delete a post from the menu on each card.
- **Create**: take a photo or pick one, write a caption, tap *Publish to Feed*. The post is saved to IndexedDB and shows up on the Feed and Profile straight away.
- **Profile**: avatar, username, bio, post and like totals, and a grid of your photos. Tap a photo to open it full size with its caption.
- **Light and dark mode**: follows your device, or switch from the sun/moon button or Settings.
- **Backup and sharing**: export the whole feed to one JSON file, and import it on another phone. Import it as "someone else's posts" to share frames with a friend, or restore it as your own account when you change phones. No server involved.

## How data is stored

| What | Where |
| --- | --- |
| Post details and a small square thumbnail | IndexedDB `posts` store |
| Full photo (base64 JPEG, longest side 1280 px) | IndexedDB `photos` store, loaded when a card is shown |
| Profile | IndexedDB `meta` store |
| Theme choice | `localStorage` (so there is no flash on start) |

Photos are resized and re-encoded in the browser before saving, so a post is usually 100 to 400 KB. If IndexedDB is unavailable the app falls back to `localStorage`, and as a last resort to memory (it warns you in that case).

## Run it in a browser

```bash
npm install
npm run serve        # http://localhost:5173
```

Any static file server works, the app is just the `www/` folder. Open it with your phone's browser or Chrome's device toolbar to see the mobile layout.

Add `?sw=1` to the URL on localhost to turn on the service worker and test offline use. On a real host it registers automatically.

## Build the Android APK with GitHub Actions

1. Create a GitHub repository and push this folder to it (the `main` or `master` branch).
2. Open the **Actions** tab. The **Build Android APK** workflow runs on every push, or run it by hand with *Run workflow*.
3. When it finishes, open the run and download the **FrameLocal-debug-apk** artifact. Unzip it and install `app-debug.apk` on your phone (allow "install unknown apps" when asked).

The workflow installs Node 22 and Java 21, creates the `android/` project, generates the launcher icons and splash screens from `assets/`, adds the camera permission, copies `www/` into the app and runs Gradle. The `android/` folder is generated on the runner, so it is not stored in the repository.

### Build it on your own computer instead

You need Node 22+, JDK 21 and the Android SDK (Android Studio installs it).

```bash
npm install
npx cap add android          # first time only
npm run icons                # launcher icons + splash
node scripts/patch-android.mjs   # adds the camera permission
npx cap sync android
npm run android:open         # opens Android Studio, press Run
# or, from the terminal:
npm run android:debug        # APK at android/app/build/outputs/apk/debug/app-debug.apk
```

After you change anything in `www/`, run `npx cap sync android` again.

### Release builds

The workflow produces a **debug** APK, signed with Android's debug key. That is fine for installing on your own devices. To publish on Google Play you need a release build signed with your own keystore: create one in Android Studio (*Build > Generate Signed Bundle / APK*) and keep the `.keystore` file safe, since it cannot be recovered.

## Make it yours

- **App name and id**: edit `appId` and `appName` in `capacitor.config.json` (the id must be unique, for example `com.yourname.framelocal`).
- **Icon and splash**: edit the vector mark in `scripts/make-assets.mjs`, run `node scripts/make-assets.mjs`, then `npm run icons`.
- **Colours**: the design tokens are at the top of `www/css/app.css` (`--c-*` variables, one set for light and one for dark).
- **Fonts**: Manrope and Fraunces are bundled in `www/fonts/`, so the app looks the same offline.

## Project layout

```
www/                    the app (this is what Capacitor packages)
  index.html            shell, tab bar, Tailwind setup
  css/app.css           design tokens, components, motion
  js/utils.js           helpers + icons
  js/db.js              IndexedDB storage (localStorage + memory fallbacks)
  js/image.js           photo resize / thumbnail / avatar
  js/native.js          Capacitor helpers (share sheet, status bar)
  js/app.js             Feed, Create, Profile, sheets, backup
  vendor/               Tailwind browser build + Capacitor runtime (bundled for offline use)
  sw.js, manifest.webmanifest   browser/PWA install + offline
assets/                 icon and splash sources for Android
scripts/                vendor, make-assets, patch-android
.github/workflows/      build-apk.yml
capacitor.config.json
```

## Notes

- **Tailwind**: the page loads the Tailwind browser build from `www/vendor/` so it works offline and inside the APK. If that file is missing it falls back to the jsDelivr CDN. The browser build compiles styles at startup, which is fast enough here, but if you outgrow it you can replace it with a compiled stylesheet from the Tailwind CLI.
- **Camera**: the *Take photo* button uses the system camera through a file input. The workflow adds the `CAMERA` permission to the Android manifest for you.
- **Privacy**: nothing leaves the device unless you export a backup and send it yourself.
- **Uninstalling the app deletes its data.** Export a backup first if you want to keep your frames.

## License

MIT. See `LICENSE`. Credit: Ashraf.
