// Generates the app icons + splash screens from one vector mark.
// Run with:  node scripts/make-assets.mjs     (then `npm run icons` to fan them out for Android)
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('assets', { recursive: true });
mkdirSync('www/icons', { recursive: true });

const GOLD = '#d0ae5e';
const GOLD_LIGHT = '#8d6a14';
const BLACK = '#060606';
const PAPER = '#f6f6f5';

// The FrameLocal mark: four corner brackets and a centre dot, on a 24-unit grid.
const mark = (color, scale) => `
  <g transform="translate(512 512) scale(${scale}) translate(-12 -12)" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 9V6.5A2.5 2.5 0 0 1 6.5 4H9M15 4h2.5A2.5 2.5 0 0 1 20 6.5V9M20 15v2.5a2.5 2.5 0 0 1-2.5 2.5H15M9 20H6.5A2.5 2.5 0 0 1 4 17.5V15"/>
    <circle cx="12" cy="12" r="1.7" fill="${color}" stroke="none"/>
  </g>`;

const svg = (inner, { size = 1024, bg = null, radius = 0 } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${
    bg ? `<rect width="1024" height="1024" rx="${radius}" fill="${bg}"/>` : ''
  }${inner}</svg>`;

const png = (markup, out, size) => sharp(Buffer.from(markup)).resize(size, size).png().toFile(out);

// Web / PWA icons
writeFileSync('www/icons/icon.svg', svg(mark(GOLD, 30), { bg: BLACK, radius: 224 }));
await png(svg(mark(GOLD, 30), { bg: BLACK, radius: 224 }), 'www/icons/icon-192.png', 192);
await png(svg(mark(GOLD, 30), { bg: BLACK, radius: 224 }), 'www/icons/icon-512.png', 512);
await png(svg(mark(GOLD, 26), { bg: BLACK }), 'www/icons/icon-maskable-512.png', 512);

// Android launcher (used by @capacitor/assets)
await png(svg(mark(GOLD, 30), { bg: BLACK }), 'assets/icon-only.png', 1024);
await png(svg(mark(GOLD, 30)), 'assets/icon-foreground.png', 1024);
await png(svg('', { bg: BLACK }), 'assets/icon-background.png', 1024);

// Splash screens (light + dark): the mark, centred, on a flat field
const splash = (bg, color) => svg(mark(color, 12), { bg, size: 2732 }).replace('viewBox="0 0 1024 1024"', 'viewBox="0 0 1024 1024" preserveAspectRatio="xMidYMid slice"');
await png(splash(PAPER, GOLD_LIGHT), 'assets/splash.png', 2732);
await png(splash(BLACK, GOLD), 'assets/splash-dark.png', 2732);

console.log('Icons and splash screens written to www/icons and assets/');
