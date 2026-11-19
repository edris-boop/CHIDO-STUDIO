import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFurnitureGlb } from './glbGenerator';

test('buildFurnitureGlb produces valid glTF 2.0 binary header and JSON/BIN chunks', () => {
  const glb = buildFurnitureGlb('sofa');
  assert.equal(glb.toString('ascii', 0, 4), 'glTF');
  assert.equal(glb.readUInt32LE(4), 2);
  assert.equal(glb.readUInt32LE(8), glb.length);
  const jsonChunkLen = glb.readUInt32LE(12);
  assert.equal(glb.toString('ascii', 16, 20), 'JSON');
  const jsonText = glb.toString('utf8', 20, 20 + jsonChunkLen).trim();
  const parsed = JSON.parse(jsonText);
  assert.equal(parsed.asset.version, '2.0');
  assert.equal(parsed.meshes.length, 11);
});
