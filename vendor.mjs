// Copies third-party runtime assets into www/ so the app works with zero network access.
// Run with:  npm run vendor
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('www/vendor', { recursive: true });
mkdirSync('www/fonts', { recursive: true });

copyFileSync('node_modules/@tailwindcss/browser/dist/index.global.js', 'www/vendor/tailwindcss-browser.js');
copyFileSync('node_modules/@capacitor/core/dist/capacitor.js', 'www/vendor/capacitor.js');
copyFileSync('node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2', 'www/fonts/fraunces-latin-wght-normal.woff2');
copyFileSync('node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-italic.woff2', 'www/fonts/fraunces-latin-wght-italic.woff2');
copyFileSync('node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2', 'www/fonts/manrope-latin-wght-normal.woff2');
console.log('Vendored Tailwind browser build + Capacitor runtime + Fraunces + Manrope into www/');
