// Pure Node.js binary glTF 2.0 (.glb) generator for multi-part furniture models.
// Produces valid GLB 2.0 files on disk so Three.js GLTFLoader previews real binary assets.

interface BoxPart {
  name: string;
  size: [number, number, number];
  position: [number, number, number];
  color: [number, number, number];
  roughness: number;
  metalness: number;
}

function createBoxGeometryData(w: number, h: number, d: number) {
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;

  const faces: Array<{
    normal: [number, number, number];
    verts: Array<[number, number, number]>;
  }> = [
    // +Z front
    { normal: [0, 0, 1], verts: [[-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]] },
    // -Z back
    { normal: [0, 0, -1], verts: [[hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd]] },
    // +X right
    { normal: [1, 0, 0], verts: [[hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd]] },
    // -X left
    { normal: [-1, 0, 0], verts: [[-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd]] },
    // +Y top
    { normal: [0, 1, 0], verts: [[-hw, hh, hd], [hw, hh, hd], [hw, hh, -hd], [-hw, hh, -hd]] },
    // -Y bottom
    { normal: [0, -1, 0], verts: [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd]] },
  ];

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  faces.forEach((face, fIdx) => {
    const base = fIdx * 4;
    for (const v of face.verts) {
      positions.push(v[0], v[1], v[2]);
      normals.push(face.normal[0], face.normal[1], face.normal[2]);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
    min: [-hw, -hh, -hd] as [number, number, number],
    max: [hw, hh, hd] as [number, number, number],
  };
}

export function buildFurnitureGlb(preset: 'sofa' | 'armchair' | 'table' | 'lamp'): Buffer {
  const partsByPreset: Record<'sofa' | 'armchair' | 'table' | 'lamp', BoxPart[]> = {
    sofa: [
      { name: 'WalnutBaseFrame', size: [2.16, 0.1, 0.88], position: [0, 0.21, 0], color: [0.28, 0.16, 0.09], roughness: 0.45, metalness: 0.05 },
      { name: 'LegFrontLeft', size: [0.06, 0.16, 0.06], position: [-1.0, 0.08, 0.36], color: [0.24, 0.13, 0.07], roughness: 0.4, metalness: 0.05 },
      { name: 'LegFrontRight', size: [0.06, 0.16, 0.06], position: [1.0, 0.08, 0.36], color: [0.24, 0.13, 0.07], roughness: 0.4, metalness: 0.05 },
      { name: 'LegBackLeft', size: [0.06, 0.16, 0.06], position: [-1.0, 0.08, -0.36], color: [0.24, 0.13, 0.07], roughness: 0.4, metalness: 0.05 },
      { name: 'LegBackRight', size: [0.06, 0.16, 0.06], position: [1.0, 0.08, -0.36], color: [0.24, 0.13, 0.07], roughness: 0.4, metalness: 0.05 },
      { name: 'SeatCushionLeft', size: [0.64, 0.18, 0.78], position: [-0.66, 0.35, 0.03], color: [0.82, 0.76, 0.67], roughness: 0.88, metalness: 0.0 },
      { name: 'SeatCushionCenter', size: [0.64, 0.18, 0.78], position: [0.0, 0.35, 0.03], color: [0.83, 0.77, 0.68], roughness: 0.88, metalness: 0.0 },
      { name: 'SeatCushionRight', size: [0.64, 0.18, 0.78], position: [0.66, 0.35, 0.03], color: [0.82, 0.76, 0.67], roughness: 0.88, metalness: 0.0 },
      { name: 'BackrestShell', size: [2.16, 0.56, 0.16], position: [0, 0.54, -0.36], color: [0.78, 0.71, 0.62], roughness: 0.9, metalness: 0.0 },
      { name: 'ArmrestLeft', size: [0.16, 0.42, 0.86], position: [-1.02, 0.47, 0], color: [0.79, 0.72, 0.63], roughness: 0.9, metalness: 0.0 },
      { name: 'ArmrestRight', size: [0.16, 0.42, 0.86], position: [1.02, 0.47, 0], color: [0.79, 0.72, 0.63], roughness: 0.9, metalness: 0.0 },
    ],
    armchair: [
      { name: 'SeatDeck', size: [0.72, 0.16, 0.74], position: [0, 0.32, 0], color: [0.76, 0.69, 0.58], roughness: 0.85, metalness: 0.0 },
      { name: 'BackCushion', size: [0.68, 0.48, 0.16], position: [0, 0.62, -0.28], color: [0.78, 0.71, 0.61], roughness: 0.88, metalness: 0.0 },
      { name: 'WalnutArmLeft', size: [0.07, 0.58, 0.78], position: [-0.39, 0.31, 0], color: [0.3, 0.17, 0.09], roughness: 0.42, metalness: 0.04 },
      { name: 'WalnutArmRight', size: [0.07, 0.58, 0.78], position: [0.39, 0.31, 0], color: [0.3, 0.17, 0.09], roughness: 0.42, metalness: 0.04 },
      { name: 'RearCrossbar', size: [0.74, 0.08, 0.06], position: [0, 0.22, -0.34], color: [0.28, 0.15, 0.08], roughness: 0.44, metalness: 0.04 },
    ],
    table: [
      { name: 'WalnutTableTop', size: [2.2, 0.06, 1.05], position: [0, 0.75, 0], color: [0.34, 0.2, 0.11], roughness: 0.38, metalness: 0.05 },
      { name: 'ApronFrame', size: [1.95, 0.05, 0.82], position: [0, 0.695, 0], color: [0.28, 0.16, 0.09], roughness: 0.45, metalness: 0.05 },
      { name: 'FlutedPedestalLeft', size: [0.36, 0.72, 0.54], position: [-0.62, 0.36, 0], color: [0.31, 0.18, 0.1], roughness: 0.42, metalness: 0.05 },
      { name: 'FlutedPedestalRight', size: [0.36, 0.72, 0.54], position: [0.62, 0.36, 0], color: [0.31, 0.18, 0.1], roughness: 0.42, metalness: 0.05 },
    ],
    lamp: [
      { name: 'BrassBaseDisc', size: [0.34, 0.03, 0.34], position: [0, 0.015, 0], color: [0.78, 0.63, 0.32], roughness: 0.24, metalness: 0.92 },
      { name: 'BrassStem', size: [0.035, 1.48, 0.035], position: [0, 0.76, 0], color: [0.8, 0.65, 0.34], roughness: 0.22, metalness: 0.94 },
      { name: 'AlabasterDome', size: [0.42, 0.22, 0.42], position: [0, 1.54, 0], color: [0.95, 0.91, 0.84], roughness: 0.35, metalness: 0.02 },
      { name: 'BrassArchRim', size: [0.46, 0.04, 0.04], position: [0, 1.66, 0], color: [0.82, 0.67, 0.35], roughness: 0.2, metalness: 0.95 },
    ],
  };

  const parts = partsByPreset[preset];
  const binaryChunks: Buffer[] = [];
  let byteOffset = 0;

  const bufferViews: Array<Record<string, unknown>> = [];
  const accessors: Array<Record<string, unknown>> = [];
  const materials: Array<Record<string, unknown>> = [];
  const meshes: Array<Record<string, unknown>> = [];
  const nodes: Array<Record<string, unknown>> = [];

  parts.forEach((part, idx) => {
    const geom = createBoxGeometryData(part.size[0], part.size[1], part.size[2]);

    const posBuf = Buffer.from(geom.positions.buffer, geom.positions.byteOffset, geom.positions.byteLength);
    const normBuf = Buffer.from(geom.normals.buffer, geom.normals.byteOffset, geom.normals.byteLength);
    const idxBuf = Buffer.from(geom.indices.buffer, geom.indices.byteOffset, geom.indices.byteLength);

    // Pad index buffer to 4-byte boundary
    const idxPad = (4 - (idxBuf.length % 4)) % 4;
    const idxBufPadded = idxPad ? Buffer.concat([idxBuf, Buffer.alloc(idxPad)]) : idxBuf;

    const posViewIndex = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: posBuf.length, target: 34962 });
    byteOffset += posBuf.length;
    binaryChunks.push(posBuf);

    const normViewIndex = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: normBuf.length, target: 34962 });
    byteOffset += normBuf.length;
    binaryChunks.push(normBuf);

    const idxViewIndex = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: idxBuf.length, target: 34963 });
    byteOffset += idxBufPadded.length;
    binaryChunks.push(idxBufPadded);

    const posAccIndex = accessors.length;
    accessors.push({
      bufferView: posViewIndex,
      componentType: 5126, // FLOAT
      count: geom.positions.length / 3,
      type: 'VEC3',
      min: geom.min,
      max: geom.max,
    });

    const normAccIndex = accessors.length;
    accessors.push({
      bufferView: normViewIndex,
      componentType: 5126,
      count: geom.normals.length / 3,
      type: 'VEC3',
    });

    const idxAccIndex = accessors.length;
    accessors.push({
      bufferView: idxViewIndex,
      componentType: 5123, // UNSIGNED_SHORT
      count: geom.indices.length,
      type: 'SCALAR',
    });

    materials.push({
      name: `${part.name}Mat`,
      pbrMetallicRoughness: {
        baseColorFactor: [part.color[0], part.color[1], part.color[2], 1.0],
        metallicFactor: part.metalness,
        roughnessFactor: part.roughness,
      },
    });

    meshes.push({
      name: part.name,
      primitives: [
        {
          attributes: {
            POSITION: posAccIndex,
            NORMAL: normAccIndex,
          },
          indices: idxAccIndex,
          material: idx,
        },
      ],
    });

    nodes.push({
      name: part.name,
      mesh: idx,
      translation: part.position,
    });
  });

  const binBuffer = Buffer.concat(binaryChunks);

  const gltfJson = {
    asset: {
      version: '2.0',
      generator: 'CHIDO Studio Asset Pipeline',
    },
    scene: 0,
    scenes: [
      {
        name: `CHIDO_${preset}`,
        nodes: nodes.map((_, i) => i),
      },
    ],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [
      {
        byteLength: binBuffer.length,
      },
    ],
  };

  let jsonBuf = Buffer.from(JSON.stringify(gltfJson), 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  if (jsonPad) {
    jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
  }

  const totalLength = 12 + 8 + jsonBuf.length + 8 + binBuffer.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4); // version 2
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binBuffer.length, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  return Buffer.concat([header, jsonChunkHeader, jsonBuf, binChunkHeader, binBuffer]);
}
