/**
 * Safely loads assets in Node.js / Vitest test environments.
 * Uses variable-based module specifiers so Vite does not analyze or emit
 * browser compatibility externalization warnings during client bundling.
 */

export async function loadNodeAssetBuffer(relativePath: string): Promise<ArrayBuffer | null> {
  if (typeof process === 'undefined' || !process.versions?.node) {
    return null;
  }

  try {
    const fsMod = 'fs';
    const pathMod = 'path';
    const fs = await import(/* @vite-ignore */ fsMod);
    const path = await import(/* @vite-ignore */ pathMod);

    const cleanPath = relativePath.replace(/^\//, '');
    const candidates = [
      relativePath,
      path.resolve(process.cwd(), cleanPath),
      path.resolve(process.cwd(), 'public', cleanPath),
      path.resolve(__dirname, '../../public', cleanPath),
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const fileBuf = fs.readFileSync(p);
        return fileBuf.buffer.slice(fileBuf.byteOffset, fileBuf.byteOffset + fileBuf.byteLength);
      }
    }
  } catch {
    return null;
  }

  return null;
}

export async function loadNodeAssetText(relativePath: string): Promise<string | null> {
  if (typeof process === 'undefined' || !process.versions?.node) {
    return null;
  }

  try {
    const fsMod = 'fs';
    const pathMod = 'path';
    const fs = await import(/* @vite-ignore */ fsMod);
    const path = await import(/* @vite-ignore */ pathMod);

    const cleanPath = relativePath.replace(/^\//, '');
    const candidates = [
      relativePath,
      path.resolve(process.cwd(), cleanPath),
      path.resolve(process.cwd(), 'public', cleanPath),
      path.resolve(__dirname, '../../public', cleanPath),
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf8');
      }
    }
  } catch {
    return null;
  }

  return null;
}
