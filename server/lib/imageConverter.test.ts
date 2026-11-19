import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertPngBufferToJpg,
  createSampleTransparentPng,
  parseHexRgb,
} from './imageConverter';

test('parseHexRgb parses 6-digit hex and falls back to white', () => {
  assert.deepEqual(parseHexRgb('#1e293b'), [30, 41, 59]);
  assert.deepEqual(parseHexRgb('invalid'), [255, 255, 255]);
});

test('convertPngBufferToJpg converts PNG preserving resolution and writing valid JPEG SOI marker', () => {
  const samplePng = createSampleTransparentPng(96, 64);
  const result = convertPngBufferToJpg(samplePng, {
    quality: 92,
    transparentBgHex: '#F8FAFC',
  });

  assert.equal(result.width, 96);
  assert.equal(result.height, 64);
  assert.equal(result.qualityUsed, 92);
  assert.equal(result.targetSizeMet, true);
  assert.equal(result.warning, null);
  // JPEG magic bytes FF D8 FF
  assert.equal(result.buffer[0], 0xff);
  assert.equal(result.buffer[1], 0xd8);
  assert.equal(result.buffer[2], 0xff);
});

test('convertPngBufferToJpg reports warning when maxSizeKb cannot be met without dropping below floor', () => {
  const samplePng = createSampleTransparentPng(160, 160);
  const result = convertPngBufferToJpg(samplePng, {
    quality: 92,
    maxSizeKb: 0.2, // impossibly small 200 bytes
  });

  assert.equal(result.targetSizeMet, false);
  assert.ok(result.warning && result.warning.length > 10);
  assert.equal(result.qualityUsed, 35);
});
