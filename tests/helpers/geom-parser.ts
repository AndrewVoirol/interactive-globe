/**
 * GEOM v1 Binary Buffer Parser & Validator
 * Conforms to PROJECT.md § Binary Buffer Contract (0x47454F4D)
 */

export const GEOM_MAGIC = 0x47454F4D; // "GEOM" in ASCII
export const GEOM_VERSION = 1;
export const GEOM_HEADER_BYTES = 32;

export interface ParsedGeomBuffer {
  magic: number;
  version: number;
  pointCount: number;
  indexCount: number;
  points: Float32Array; // 3 * N elements (x, y, z)
  target2D: Float32Array; // 2 * N elements (u, v)
  types: Float32Array; // N elements (1.0 = land, 0.0 = ocean)
  indices: Uint32Array; // indexCount elements (line vertex index pairs)
}

/**
 * Parses an ArrayBuffer containing GEOM binary data
 */
export function parseGeomBuffer(buffer: ArrayBuffer | Uint8Array): ParsedGeomBuffer {
  const arrayBuffer = buffer instanceof Uint8Array ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) : buffer;
  const dataView = new DataView(arrayBuffer);

  if (arrayBuffer.byteLength < GEOM_HEADER_BYTES) {
    throw new Error(`Buffer too small for GEOM header: ${arrayBuffer.byteLength} < ${GEOM_HEADER_BYTES} bytes`);
  }

  const magic = dataView.getUint32(0, true);
  const version = dataView.getUint32(4, true);
  const pointCount = dataView.getUint32(8, true);
  const indexCount = dataView.getUint32(12, true);

  if (magic !== GEOM_MAGIC) {
    throw new Error(`Invalid GEOM magic: 0x${magic.toString(16).toUpperCase()} (expected 0x${GEOM_MAGIC.toString(16).toUpperCase()})`);
  }
  if (version !== GEOM_VERSION) {
    throw new Error(`Unsupported GEOM version: ${version} (expected ${GEOM_VERSION})`);
  }

  const pointsByteLen = pointCount * 3 * 4;
  const target2DByteLen = pointCount * 2 * 4;
  const typesByteLen = pointCount * 4;

  const pOffset = dataView.byteLength >= 32 && dataView.getUint32(16, true) > 0 ? dataView.getUint32(16, true) : GEOM_HEADER_BYTES;
  const tOffset = dataView.byteLength >= 32 && dataView.getUint32(20, true) > 0 ? dataView.getUint32(20, true) : (pOffset + pointsByteLen);
  const typOffset = dataView.byteLength >= 32 && dataView.getUint32(24, true) > 0 ? dataView.getUint32(24, true) : (tOffset + target2DByteLen);
  const iOffset = dataView.byteLength >= 32 && dataView.getUint32(28, true) > 0 ? dataView.getUint32(28, true) : (typOffset + typesByteLen);

  const points = new Float32Array(arrayBuffer, pOffset, pointCount * 3);
  const target2D = new Float32Array(arrayBuffer, tOffset, pointCount * 2);
  const types = new Float32Array(arrayBuffer, typOffset, pointCount);
  const indices = new Uint32Array(arrayBuffer, iOffset, indexCount);

  return {
    magic,
    version,
    pointCount,
    indexCount,
    points,
    target2D,
    types,
    indices,
  };
}

/**
 * Serializes points, target2D, types, and line indices into GEOM v1 binary buffer
 */
export function serializeGeomBuffer(
  points: Float32Array,
  target2D: Float32Array,
  types: Float32Array,
  indices: Uint32Array
): Uint8Array {
  const pointCount = types.length;
  const indexCount = indices.length;

  const totalBytes = GEOM_HEADER_BYTES +
    pointCount * 3 * 4 +
    pointCount * 2 * 4 +
    pointCount * 4 +
    indexCount * 4;

  const buffer = new ArrayBuffer(totalBytes);
  const dataView = new DataView(buffer);

  // Write 32-byte header
  dataView.setUint32(0, GEOM_MAGIC, true);
  dataView.setUint32(4, GEOM_VERSION, true);
  dataView.setUint32(8, pointCount, true);
  dataView.setUint32(12, indexCount, true);
  dataView.setUint32(16, GEOM_HEADER_BYTES, true); // pointsOffset
  dataView.setUint32(20, GEOM_HEADER_BYTES + pointCount * 12, true); // target2DOffset
  dataView.setUint32(24, GEOM_HEADER_BYTES + pointCount * 20, true); // typesOffset
  dataView.setUint32(28, GEOM_HEADER_BYTES + pointCount * 24, true); // indicesOffset

  let offset = GEOM_HEADER_BYTES;
  new Float32Array(buffer, offset, pointCount * 3).set(points);
  offset += pointCount * 3 * 4;

  new Float32Array(buffer, offset, pointCount * 2).set(target2D);
  offset += pointCount * 2 * 4;

  new Float32Array(buffer, offset, pointCount).set(types);
  offset += pointCount * 4;

  new Uint32Array(buffer, offset, indexCount).set(indices);

  return new Uint8Array(buffer);
}
