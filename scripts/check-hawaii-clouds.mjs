import fs from 'fs';

// Check public/data/gfs-cloud-low-latest.bin (1440x721 float16)
const gfsBuf = fs.readFileSync('public/data/gfs-cloud-low-latest.bin');
console.log('GFS buf length:', gfsBuf.length, 'expected 1440*721*2 =', 1440*721*2);

// Decode float16 function
function decodeFloat16(b1, b2) {
  const u16 = (b2 << 8) | b1;
  const sign = (u16 >> 15) & 0x1;
  const exp = (u16 >> 10) & 0x1f;
  const frac = u16 & 0x3ff;
  if (exp === 0) return (sign ? -1 : 1) * Math.pow(2, -14) * (frac / 1024);
  if (exp === 31) return frac ? NaN : (sign ? -Infinity : Infinity);
  return (sign ? -1 : 1) * Math.pow(2, exp - 15) * (1 + frac / 1024);
}

// Sample at u = 0.066, v = 0.385
const x = Math.floor(0.066 * 1440);
const y = Math.floor(0.385 * 721);
const offset = (y * 1440 + x) * 2;
const val = decodeFloat16(gfsBuf[offset], gfsBuf[offset + 1]);
console.log(`GFS low cloud at (${x}, ${y}) [Hawaii]:`, val);

// Let's also check WeatherNext low cloud:
const wnBuf = fs.readFileSync('public/data/weathernext/low_cloud_cover_mean-0.bin');
console.log('WN buf length:', wnBuf.length);
// WeatherNext is 3600 x 1801 Float16 with 256-byte row pitch
// Row pitch = ceil(3600 * 2 / 256) * 256 = ceil(7200 / 256) * 256 = 29 * 256 = 7424
const wnPitch = 7424;
const wnX = Math.floor(0.066 * 3600);
const wnY = Math.floor(0.385 * 1801);
const wnOffset = wnY * wnPitch + wnX * 2;
const wnVal = decodeFloat16(wnBuf[wnOffset], wnBuf[wnOffset + 1]);
console.log(`WeatherNext low cloud at (${wnX}, ${wnY}) [Hawaii]:`, wnVal);
