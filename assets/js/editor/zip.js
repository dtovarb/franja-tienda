/**
 * Utilidades binarias sin dependencias:
 *  - crc32
 *  - setPngDpi: inserta el chunk pHYs para que el PNG declare su DPI
 *  - makeZip: ZIP sin compresión (método "store"), suficiente para empaquetar
 *    archivos ya comprimidos (PNG/JPG) y mantener los originales byte a byte.
 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes, crc = 0xffffffff) {
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Devuelve un nuevo Blob PNG con resolución declarada (pHYs) en DPI. */
export async function setPngDpi(pngBlob, dpi) {
  const src = new Uint8Array(await pngBlob.arrayBuffer());
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  chunk[16] = 1; // unidad: metro
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  // Firma (8) + IHDR (4 len + 4 tipo + 13 datos + 4 crc = 25) → insertar en 33
  const out = new Uint8Array(src.length + chunk.length);
  out.set(src.subarray(0, 33), 0);
  out.set(chunk, 33);
  out.set(src.subarray(33), 33 + chunk.length);
  return new Blob([out], { type: "image/png" });
}

/** Lee el DPI declarado en un PNG (para pruebas). */
export function readPngDpi(bytes) {
  let p = 8;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (p < bytes.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(...bytes.subarray(p + 4, p + 8));
    if (type === "pHYs") return Math.round(dv.getUint32(p + 8) * 0.0254);
    if (type === "IDAT") return null;
    p += 12 + len;
  }
  return null;
}

/**
 * @param files Array<{ name: string, data: Blob|Uint8Array|string }>
 * @returns Blob (application/zip)
 */
export async function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const f of files) {
    const data =
      typeof f.data === "string" ? enc.encode(f.data) : f.data instanceof Uint8Array ? f.data : new Uint8Array(await f.data.arrayBuffer());
    const name = enc.encode(f.name);
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // nombres UTF-8
    lv.setUint16(8, 0, true); // store
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    parts.push(local, data);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    central.push(cd);
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}
