/*!
 * FrameLocal - image pipeline
 * Decodes a picked/captured photo (respecting EXIF rotation), downsizes it and re-encodes it
 * as JPEG so posts stay small enough to live in IndexedDB. Pure canvas, no dependencies.
 *
 * Made by Ashraf
 */
(() => {
  'use strict';
  const FL = (window.FL = window.FL || {});

  const MAX_EDGE = 1280;   // longest side of the stored photo
  const PHOTO_QUALITY = 0.82;
  const THUMB_SIZE = 400;  // square crop used by the profile grid
  const THUMB_QUALITY = 0.78;
  const AVATAR_SIZE = 256;

  async function decode(file) {
    if (!file || (file.type && !file.type.startsWith('image/'))) {
      throw new Error('not-an-image');
    }
    if ('createImageBitmap' in window) {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (_) { /* fall through to <img> */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const im = new Image();
      im.src = url;
      await im.decode();
      return im;
    } catch (_) {
      throw new Error('not-an-image');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const sizeOf = (src) => ({ w: src.width || src.naturalWidth, h: src.height || src.naturalHeight });

  function draw(src, dw, dh, sx, sy, sw, sh, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff'; // flatten transparency (PNG) instead of getting black
    ctx.fillRect(0, 0, dw, dh);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, dw, dh);
    return canvas.toDataURL('image/jpeg', quality);
  }

  const squareCrop = (w, h) => {
    const s = Math.min(w, h);
    return { sx: (w - s) / 2, sy: (h - s) / 2, s };
  };

  /** -> { image, thumb, w, h } (image/thumb are JPEG data URLs) */
  async function processPhoto(file) {
    const src = await decode(file);
    try {
      const { w, h } = sizeOf(src);
      if (!w || !h) throw new Error('not-an-image');
      const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      const dw = Math.round(w * scale);
      const dh = Math.round(h * scale);
      const image = draw(src, dw, dh, 0, 0, w, h, PHOTO_QUALITY);
      const { sx, sy, s } = squareCrop(w, h);
      const thumb = draw(src, THUMB_SIZE, THUMB_SIZE, sx, sy, s, s, THUMB_QUALITY);
      return { image, thumb, w: dw, h: dh };
    } finally {
      if (src.close) src.close();
    }
  }

  /** -> JPEG data URL, square, for profile pictures */
  async function processAvatar(file) {
    const src = await decode(file);
    try {
      const { w, h } = sizeOf(src);
      const { sx, sy, s } = squareCrop(w, h);
      return draw(src, AVATAR_SIZE, AVATAR_SIZE, sx, sy, s, s, 0.85);
    } finally {
      if (src.close) src.close();
    }
  }

  FL.img = { processPhoto, processAvatar };
})();
