/**
 * Génère un modèle 3D GLB minimal de navire à l'exécution.
 * Forme : coque en flèche (5 sommets, 3 triangles) + superstructure (cube).
 * Retourne un Blob URL utilisable par Cesium.ModelGraphics.
 *
 * Avantage : zéro dépendance fichier externe, < 1 Ko.
 */
export function createShipModelBlobUrl(): string {
  // ─── Géométrie de la coque (Y-up, proue vers -Z) ───
  const hullPositions = new Float32Array([
    // v0 : proue
     0.0,  0.3, -3.0,
    // v1 : bâbord
    -1.2,  0.3,  0.5,
    // v2 : tribord
     1.2,  0.3,  0.5,
    // v3 : bâbord poupe
    -0.9,  0.3,  2.0,
    // v4 : tribord poupe
     0.9,  0.3,  2.0,
  ]);
  const hullIndices = new Uint16Array([
    0, 2, 1,
    1, 2, 4,
    1, 4, 3,
  ]);

  // ─── Géométrie de la passerelle (cube simplifié) ───
  const bx = 0.5, by = 0.8, bz = 0.6;
  const bOz = 1.0; // décalage Z poupe
  const bOy = 0.3; // base Y
  const bridgePositions = new Float32Array([
    -bx, bOy,      bOz - bz,
     bx, bOy,      bOz - bz,
     bx, bOy,      bOz + bz,
    -bx, bOy,      bOz + bz,
    -bx, bOy + by, bOz - bz,
     bx, bOy + by, bOz - bz,
     bx, bOy + by, bOz + bz,
    -bx, bOy + by, bOz + bz,
  ]);
  const bridgeIndices = new Uint16Array([
    // bottom
    0, 2, 1,  0, 3, 2,
    // top
    4, 5, 6,  4, 6, 7,
    // front
    0, 1, 5,  0, 5, 4,
    // back
    2, 3, 7,  2, 7, 6,
    // left
    0, 4, 7,  0, 7, 3,
    // right
    1, 2, 6,  1, 6, 5,
  ]);

  // Décaler les indices de la passerelle de 5 (nombre de sommets coque)
  const bridgeIdxOffset = 5;
  const offsetBridgeIndices = new Uint16Array(bridgeIndices.length);
  for (let i = 0; i < bridgeIndices.length; i++) {
    offsetBridgeIndices[i] = bridgeIndices[i] + bridgeIdxOffset;
  }

  // ─── Assemblage du buffer binaire ───
  const allPositions = mergeFloat32(hullPositions, bridgePositions);
  const allIndices = mergeUint16(hullIndices, offsetBridgeIndices);

  const posBytes = allPositions.byteLength;       // 13 vertices × 12 = 156
  const idxBytes = allIndices.byteLength;          // 45 indices  × 2  = 90
  // Padding pour alignement 4 bytes
  const idxBytesPadded = alignTo4(idxBytes);
  const totalBinSize = posBytes + idxBytesPadded;

  const binBuffer = new ArrayBuffer(totalBinSize);
  const binView = new Uint8Array(binBuffer);
  binView.set(new Uint8Array(allPositions.buffer), 0);
  binView.set(new Uint8Array(allIndices.buffer), posBytes);

  // ─── Calcul des bornes (min/max) ───
  const posMin = [Infinity, Infinity, Infinity];
  const posMax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < allPositions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      posMin[c] = Math.min(posMin[c], allPositions[i + c]);
      posMax[c] = Math.max(posMax[c], allPositions[i + c]);
    }
  }

  const vertexCount = allPositions.length / 3;
  const indexCount = allIndices.length;

  // ─── Construction du JSON glTF ───
  const gltfJson = {
    asset: { version: '2.0', generator: 'digital-twin-drone/ShipModelFactory' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0 },
        indices: 1,
        material: 0,
      }],
    }],
    materials: [{
      pbrMetallicRoughness: {
        baseColorFactor: [0.15, 0.55, 0.65, 1.0],
        metallicFactor: 0.3,
        roughnessFactor: 0.7,
      },
    }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126, // FLOAT
        count: vertexCount,
        type: 'VEC3',
        max: posMax,
        min: posMin,
      },
      {
        bufferView: 1,
        componentType: 5123, // UNSIGNED_SHORT
        count: indexCount,
        type: 'SCALAR',
        max: [vertexCount - 1],
        min: [0],
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes, byteLength: idxBytes, target: 34963 },
    ],
    buffers: [{ byteLength: totalBinSize }],
  };

  // ─── Encodage GLB ───
  const jsonStr = JSON.stringify(gltfJson);
  const jsonPadded = padString(jsonStr, 4, 0x20); // pad with spaces
  const jsonBytes = new TextEncoder().encode(jsonPadded);

  const headerSize = 12;
  const jsonChunkHeaderSize = 8;
  const binChunkHeaderSize = 8;
  const totalSize = headerSize + jsonChunkHeaderSize + jsonBytes.byteLength + binChunkHeaderSize + totalBinSize;

  const glb = new ArrayBuffer(totalSize);
  const view = new DataView(glb);
  let offset = 0;

  // Header
  view.setUint32(offset, 0x46546C67, true); offset += 4; // magic "glTF"
  view.setUint32(offset, 2, true);          offset += 4; // version
  view.setUint32(offset, totalSize, true);  offset += 4; // total length

  // JSON chunk
  view.setUint32(offset, jsonBytes.byteLength, true); offset += 4;
  view.setUint32(offset, 0x4E4F534A, true);           offset += 4; // "JSON"
  new Uint8Array(glb).set(jsonBytes, offset);          offset += jsonBytes.byteLength;

  // BIN chunk
  view.setUint32(offset, totalBinSize, true); offset += 4;
  view.setUint32(offset, 0x004E4942, true);   offset += 4; // "BIN\0"
  new Uint8Array(glb).set(binView, offset);

  const blob = new Blob([glb], { type: 'model/gltf-binary' });
  return URL.createObjectURL(blob);
}

// ─── Helpers ─────────────────────────────────────────────

function mergeFloat32(a: Float32Array, b: Float32Array): Float32Array {
  const result = new Float32Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

function mergeUint16(a: Uint16Array, b: Uint16Array): Uint16Array {
  const result = new Uint16Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

function alignTo4(n: number): number {
  return (n + 3) & ~3;
}

function padString(str: string, alignment: number, padChar: number): string {
  const remainder = str.length % alignment;
  if (remainder === 0) return str;
  return str + String.fromCharCode(padChar).repeat(alignment - remainder);
}
