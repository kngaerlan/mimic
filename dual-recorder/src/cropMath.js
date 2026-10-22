// Pure geometry helpers, kept free of DOM APIs so they can be unit tested.

/**
 * Returns the source rectangle to crop from a video frame so that it fills a
 * destination of the given aspect ratio ("cover" fit, centered).
 *
 * @param {number} srcW  source width in pixels
 * @param {number} srcH  source height in pixels
 * @param {number} dstW  destination width in pixels
 * @param {number} dstH  destination height in pixels
 * @returns {{sx:number, sy:number, sw:number, sh:number}}
 */
export function coverCrop(srcW, srcH, dstW, dstH) {
  if (!(srcW > 0 && srcH > 0 && dstW > 0 && dstH > 0)) {
    throw new RangeError('all dimensions must be positive');
  }
  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;

  if (srcAspect > dstAspect) {
    // Source is wider than destination: crop left and right.
    const sw = srcH * dstAspect;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }
  // Source is taller (or equal): crop top and bottom.
  const sh = srcW / dstAspect;
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh };
}

/** Output sizes for the two simultaneous recordings. */
export const ORIENTATIONS = {
  landscape: { width: 1920, height: 1080, label: 'Landscape 16:9' },
  portrait: { width: 1080, height: 1920, label: 'Portrait 9:16' },
};
