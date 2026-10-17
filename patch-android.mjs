// Adds the camera permission to the generated Android project so the "Take photo" button can open the camera.
// Safe to run more than once. Used by the GitHub Actions workflow; run it yourself after `npx cap add android`.
//   node scripts/patch-android.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const file = 'android/app/src/main/AndroidManifest.xml';
if (!existsSync(file)) {
  console.error(`Missing ${file}. Run "npx cap add android" first.`);
  process.exit(1);
}

let xml = readFileSync(file, 'utf8');
const wanted = [
  ['android.permission.CAMERA', '<uses-permission android:name="android.permission.CAMERA" />'],
  ['android.hardware.camera', '<uses-feature android:name="android.hardware.camera" android:required="false" />'],
];

let changed = false;
for (const [needle, line] of wanted) {
  if (xml.includes(needle)) continue;
  // insert just before </manifest>
  xml = xml.replace('</manifest>', `    ${line}\n</manifest>`);
  changed = true;
}

if (changed) {
  writeFileSync(file, xml);
  console.log('AndroidManifest.xml patched: camera permission added.');
} else {
  console.log('AndroidManifest.xml already has the camera permission.');
}
