import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverCrop } from '../src/cropMath.js';

test('wide 16:9 source cropped to portrait keeps full height and centers horizontally', () => {
  const c = coverCrop(1920, 1080, 1080, 1920);
  assert.equal(c.sy, 0);
  assert.equal(c.sh, 1080);
  assert.ok(Math.abs(c.sw - 1080 * (1080 / 1920)) < 1e-9);
  assert.ok(Math.abs(c.sx - (1920 - c.sw) / 2) < 1e-9);
});

test('16:9 source to 16:9 destination is an identity crop', () => {
  assert.deepEqual(coverCrop(1920, 1080, 1920, 1080), { sx: 0, sy: 0, sw: 1920, sh: 1080 });
});

test('tall source cropped to landscape crops top and bottom', () => {
  const c = coverCrop(1080, 1920, 1920, 1080);
  assert.equal(c.sx, 0);
  assert.equal(c.sw, 1080);
  assert.ok(Math.abs(c.sy - (1920 - c.sh) / 2) < 1e-9);
});

test('crop never exceeds source bounds', () => {
  for (const [sw, sh] of [[640, 480], [1280, 720], [720, 1280], [3840, 2160]]) {
    for (const [dw, dh] of [[1920, 1080], [1080, 1920]]) {
      const c = coverCrop(sw, sh, dw, dh);
      assert.ok(c.sx >= 0 && c.sy >= 0);
      assert.ok(c.sx + c.sw <= sw + 1e-9);
      assert.ok(c.sy + c.sh <= sh + 1e-9);
      assert.ok(Math.abs(c.sw / c.sh - dw / dh) < 1e-9);
    }
  }
});

test('invalid dimensions throw', () => {
  assert.throws(() => coverCrop(0, 480, 1920, 1080), RangeError);
});
