/* Mister VPN — Telegram Mini App.
 * Vanilla JS on purpose: no build step, no runtime deps, one file to serve. */

/* ── QR (byte mode, versions 1–20) ──────────────────────────────────────────
 * Rendered locally so a subscription key never leaves the device for a
 * third-party image API. Cross-checked module-for-module against the Python
 * `qrcode` reference implementation. */
const QR = (() => {
  const ECC_PER_BLOCK = [
    [-1,7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
    [-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
    [-1,13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
    [-1,17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
  ];
  const ECC_BLOCKS = [
    [-1,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
    [-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
    [-1,1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
    [-1,1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,57,60,63,66,70,74,77,81,85],
  ];
  const FORMAT_BITS = [1, 0, 3, 2]; // L, M, Q, H

  function rawModules(ver) {
    let result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const align = Math.floor(ver / 7) + 2;
      result -= (25 * align - 10) * align - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  function dataCodewords(ver, ecl) {
    return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * ECC_BLOCKS[ecl][ver];
  }

  function alignPositions(ver) {
    if (ver === 1) return [];
    const count = Math.floor(ver / 7) + 2;
    const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (count * 2 - 2)) * 2;
    const result = [6];
    for (let pos = ver * 4 + 10; result.length < count; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  // GF(256) arithmetic for Reed–Solomon error correction.
  function gfMul(a, b) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = ((z << 1) ^ ((z >>> 7) * 0x11d)) & 0xff;
      z ^= ((b >>> i) & 1) * a;
    }
    return z;
  }

  function rsDivisor(degree) {
    const result = new Uint8Array(degree);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) {
        result[j] = gfMul(result[j], root);
        if (j + 1 < degree) result[j] ^= result[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return result;
  }

  function rsRemainder(data, divisor) {
    const result = new Uint8Array(divisor.length);
    for (const b of data) {
      const factor = b ^ result[0];
      result.copyWithin(0, 1);
      result[result.length - 1] = 0;
      for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], factor);
    }
    return result;
  }

  function encode(text, { ecl = 0, maxVersion = 20 } = {}) {
    const bytes = new TextEncoder().encode(text);
    let version = 1;
    for (; ; version++) {
      if (version > maxVersion) throw new Error('QR: строка слишком длинная');
      const countBits = version < 10 ? 8 : 16;
      if (4 + countBits + bytes.length * 8 <= dataCodewords(version, ecl) * 8) break;
    }

    const bits = [];
    const push = (value, length) => {
      for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    };
    push(0b0100, 4);
    push(bytes.length, version < 10 ? 8 : 16);
    for (const b of bytes) push(b, 8);

    const capacity = dataCodewords(version, ecl) * 8;
    push(0, Math.min(4, capacity - bits.length));
    push(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);

    const data = new Uint8Array(bits.length / 8);
    bits.forEach((bit, i) => { data[i >>> 3] |= bit << (7 - (i & 7)); });

    const blockCount = ECC_BLOCKS[ecl][version];
    const eccLen = ECC_PER_BLOCK[ecl][version];
    const rawCount = Math.floor(rawModules(version) / 8);
    const shortLen = Math.floor(rawCount / blockCount) - eccLen;
    const longBlocks = rawCount % blockCount;
    const divisor = rsDivisor(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < blockCount; i++) {
      const len = shortLen + (i >= blockCount - longBlocks ? 1 : 0);
      const dat = data.slice(k, k + len);
      k += len;
      const block = Array.from(dat);
      // Short blocks carry a dummy byte so every block is the same length; it
      // is skipped again while interleaving.
      if (i < blockCount - longBlocks) block.push(0);
      rsRemainder(dat, divisor).forEach(b => block.push(b));
      blocks.push(block);
    }
    const codewords = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((block, j) => {
        if (i === shortLen && j < blockCount - longBlocks) return;
        codewords.push(block[i]);
      });
    }
    return draw(version, ecl, codewords.slice(0, rawCount));
  }

  function draw(version, ecl, codewords) {
    const size = version * 4 + 17;
    const modules = Array.from({ length: size }, () => new Array(size).fill(false));
    const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      modules[y][x] = dark;
      reserved[y][x] = true;
    };

    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const dist = Math.max(Math.abs(dx), Math.abs(dy));
          set(cx + dx, cy + dy, dist !== 2 && dist !== 4);
        }
      }
    }
    const positions = alignPositions(version);
    const last = positions.length - 1;
    positions.forEach((ax, i) => positions.forEach((ay, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }));
    for (let i = 0; i < 8; i++) {
      reserved[8][i] = true; reserved[i][8] = true;
      reserved[size - 1 - i][8] = true; reserved[8][size - 1 - i] = true;
    }
    reserved[8][8] = true;
    modules[size - 8][8] = true;
    if (version >= 7) {
      let rem = version;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const vbits = (version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const dark = ((vbits >>> i) & 1) !== 0;
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        set(a, b, dark); set(b, a, dark);
      }
    }

    let bitIndex = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
          if (reserved[y][x]) continue;
          modules[y][x] = bitIndex < codewords.length * 8
            && ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
          bitIndex++;
        }
      }
    }

    let best = null;
    for (let mask = 0; mask < 8; mask++) {
      const candidate = modules.map(row => row.slice());
      applyMask(candidate, reserved, mask, size);
      drawFormat(candidate, ecl, mask, size);
      const score = penalty(candidate, size);
      if (!best || score < best.score) best = { score, modules: candidate };
    }
    return best.modules;
  }

  const MASK_RULES = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];

  function applyMask(modules, reserved, mask, size) {
    const rule = MASK_RULES[mask];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!reserved[y][x] && rule(x, y)) modules[y][x] = !modules[y][x];
      }
    }
  }

  function drawFormat(modules, ecl, mask, size) {
    const data = (FORMAT_BITS[ecl] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = i => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) modules[i][8] = bit(i);
    modules[7][8] = bit(6);
    modules[8][8] = bit(7);
    modules[8][7] = bit(8);
    for (let i = 9; i < 15; i++) modules[8][14 - i] = bit(i);
    for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = bit(i);
    for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = bit(i);
    modules[size - 8][8] = true;
  }

  const FINDER = [true, false, true, true, true, false, true];

  function penalty(modules, size) {
    let result = 0;
    const runScore = run => (run >= 5 ? 3 + (run - 5) : 0);
    for (let y = 0; y < size; y++) {
      let run = 1;
      for (let x = 1; x < size; x++) {
        if (modules[y][x] === modules[y][x - 1]) run++;
        else { result += runScore(run); run = 1; }
      }
      result += runScore(run);
    }
    for (let x = 0; x < size; x++) {
      let run = 1;
      for (let y = 1; y < size; y++) {
        if (modules[y][x] === modules[y - 1][x]) run++;
        else { result += runScore(run); run = 1; }
      }
      result += runScore(run);
    }
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = modules[y][x];
        if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) result += 3;
      }
    }
    // Finder-lookalike: 1:1:3:1:1 with a four-module light margin on a side.
    const matches = (get, i) => {
      for (let k = 0; k < 7; k++) if (get(i + k) !== FINDER[k]) return false;
      let before = true, after = true;
      for (let k = 1; k <= 4; k++) { if (get(i - k)) before = false; if (get(i + 6 + k)) after = false; }
      return before || after;
    };
    for (let y = 0; y < size; y++) {
      const get = i => (i < 0 || i >= size ? false : modules[y][i]);
      for (let x = 0; x <= size - 7; x++) if (matches(get, x)) result += 40;
    }
    for (let x = 0; x < size; x++) {
      const get = i => (i < 0 || i >= size ? false : modules[i][x]);
      for (let y = 0; y <= size - 7; y++) if (matches(get, y)) result += 40;
    }
    let dark = 0;
    for (const row of modules) for (const cell of row) if (cell) dark++;
    const total = size * size;
    result += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
    return result;
  }

  return { encode };
})();

function qrSvg(text, size = 216) {
  let modules;
  try { modules = QR.encode(text, { ecl: 0 }); }
  catch (_) { return ''; }
  const n = modules.length;
  const quiet = 2;
  const box = n + quiet * 2;
  let path = '';
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (!modules[y][x]) { x++; continue; }
      let run = 1;
      while (x + run < n && modules[y][x + run]) run++;
      path += `M${x + quiet} ${y + quiet}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return `<svg viewBox="0 0 ${box} ${box}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR-код подписки" style="display:block;margin:0 auto 14px;border-radius:14px;background:#fff;padding:6px;box-sizing:content-box"><path d="${path}" fill="#000"/></svg>`;
}

/* ── Icons ────────────────────────────────────────────────────────────────── */
const ICONS = {
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 20 6v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>',
  devices: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="13" height="10" rx="2"/><path d="M8 19h11a2 2 0 0 0 2-2V9M8 14v5m-3 0h6"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8m-3 3 3 3m-6 0 3 3"/></svg>',
  snow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 2v20M4.2 6.5l15.6 11M4.2 17.5l15.6-11M9 4l3 3 3-3M9 20l3-3 3 3"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h14a2 2 0 0 1 2 2v11H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12"/><path d="M15 11h6v4h-6a2 2 0 1 1 0-4Z"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6"/></svg>',
  monitor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 13 13 20 4 11V4h7l9 9Z"/><circle cx="8.5" cy="8.5" r="1"/></svg>',
  support: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 13a8 8 0 0 1 16 0v5a2 2 0 0 1-2 2h-3v-7h5M4 13h5v7H6a2 2 0 0 1-2-2v-5Z"/><path d="M15 20c0 1-1.3 2-3 2"/></svg>',
  admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 20 6v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6l8-3Z"/><path d="M9 15v-1a3 3 0 0 1 6 0v1M12 11a2 2 0 1 0 0-4"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h4l2-7 4 14 2-7h6"/></svg>',
  arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4L19 6"/></svg>',
  card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/></svg>',
  crypto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9 7h4a3 3 0 0 1 0 6H9m0 0h5a3 3 0 0 1 0 6H9V5m4 0v2m0 12v2"/></svg>',
  power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 2v10M6.3 5.7a8 8 0 1 0 11.4 0"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM20 14v3m-3 3h4M14 20h1"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 3 10.5 13.5M21 3l-6.8 18-3.7-7.5L3 9.8 21 3Z"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.6"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5.2a3.6 3.6 0 0 1 0 6.9M18 14.5a6.4 6.4 0 0 1 3.5 5.5"/></svg>',
  orders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><path d="M8 10h8M8 14h6"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10m5 10V4m5 16v-7m5 7V8"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m14.5 6.5 3 3"/></svg>',
  ban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/></svg>',
  message: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1Z"/><path d="M8 10h8M8 13h5"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7M12 8v13"/><path d="M12 8S10.5 3.5 8 4.2C6.2 4.7 6.3 8 12 8Zm0 0s1.5-4.5 4-3.8C17.8 4.7 17.7 8 12 8Z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12m0 0 5-5m-5 5-5-5"/><path d="M4 19h16"/></svg>',
};

/* ── One-tap client hand-off ──────────────────────────────────────────────── */
const CLIENTS = [
  { id: 'happ', name: 'Happ', mark: 'H', hint: 'iOS · Android · Desktop', link: url => `happ://add/${url}` },
  { id: 'v2raytun', name: 'v2RayTun', mark: 'V2', hint: 'iOS · Android', link: url => `v2raytun://import/${url}` },
  { id: 'karing', name: 'Karing', mark: 'K', hint: 'iOS · Android · Windows', link: url => `karing://install-config?url=${encodeURIComponent(url)}` },
  { id: 'hiddify', name: 'Hiddify', mark: 'Hi', hint: 'Все платформы', link: url => `hiddify://import/${url}` },
  { id: 'streisand', name: 'Streisand', mark: 'S', hint: 'iOS · macOS', link: url => `streisand://import/${url}` },
  { id: 'manual', name: 'Скопировать', mark: '↗', hint: 'Любой клиент', link: null },
];

const PAYMENT_METHODS = [
  { id: 'balance', label: 'С баланса', icon: 'wallet', hint: 'Мгновенно' },
  { id: 'card', label: 'Карта', icon: 'card', hint: 'Visa · MIR · UnionPay' },
  { id: 'sbp', label: 'СБП', icon: 'phone', hint: 'По номеру телефона' },
  { id: 'crypto', label: 'Криптовалюта', icon: 'crypto', hint: 'USDT · TON · BTC' },
  { id: 'xrocket', label: 'xRocket', icon: 'crypto', hint: 'Telegram-кошелёк' },
  { id: 'cryptobot', label: 'CryptoBot', icon: 'crypto', hint: 'Telegram-кошелёк' },
];

/* ── DOM + state ──────────────────────────────────────────────────────────── */
const tg = window.Telegram?.WebApp;
const app = document.getElementById('app');
const screen = document.getElementById('screen');
const nav = document.getElementById('bottomNav');
const navSelection = document.getElementById('navSelection');
const sheet = document.getElementById('sheet');
const sheetContent = document.getElementById('sheetContent');
const backdrop = document.getElementById('sheetBackdrop');
const toastNode = document.getElementById('toast');
const notificationBadge = document.getElementById('notificationBadge');

const TABS = ['home', 'plans', 'devices', 'profile'];

const state = {
  data: null,
  tab: 'home',
  planPeriod: 'all',
  deviceView: 'devices',
  connections: { items: [], page: 0, hasMore: false, loading: false },
  adminMode: false,
  adminTab: 'pulse',
  admin: {
    overview: null,
    users: null,
    orders: null,
    promos: null,
    plans: null,
    selectedUser: null,
    broadcast: null,
    search: null,
    health: null,
    audit: null,
    tasks: null,
    campaigns: null,
    templates: null,
    usersMeta: { total: 0, offset: 0, hasMore: false },
    ordersMeta: { total: 0, offset: 0, hasMore: false },
  },
  adminUserQuery: '',
  adminUserSegment: 'all',
  adminOrderStatus: 'all',
  adminChart: 'signups',
  busy: false,
};

let renderTicket = 0;
let navSlideState = null;
let suppressNavClick = false;
let sheetCloseTimer = null;
let sheetLastFocus = null;
let paymentPoll = null;
let broadcastPoll = null;
let ptrNode = null;
let successMomentTimer = null;

/* ── Utilities ────────────────────────────────────────────────────────────── */
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
function calmMode() { return Boolean(reducedMotion?.matches); }

function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(node => {
    const name = node.dataset.icon;
    if (ICONS[name]) node.innerHTML = ICONS[name];
  });
}

function tgSupports(version) {
  try { return Boolean(tg?.isVersionAtLeast?.(version)); } catch (_) { return false; }
}

function haptic(style = 'light') {
  if (!tgSupports('6.1')) return;
  try { tg?.HapticFeedback?.impactOccurred(style); } catch (_) {}
}

function notify(type = 'success') {
  if (!tgSupports('6.1')) return;
  try { tg?.HapticFeedback?.notificationOccurred(type); } catch (_) {}
}

function selectionHaptic() {
  if (!tgSupports('6.1')) return;
  try { tg?.HapticFeedback?.selectionChanged(); } catch (_) {}
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function formatMoney(value, currency = 'RUB') {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: amount % 1 ? 2 : 0,
    style: 'currency', currency: currency || 'RUB'
  }).format(amount);
}

function toDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value; // epoch seconds or milliseconds
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 1e8) {
      const ms = num < 1e12 ? num * 1000 : num;
      const date = new Date(ms);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value, withTime = false) {
  const date = toDate(value);
  if (!date) return value ? String(value) : '—';
  return new Intl.DateTimeFormat('ru-RU', withTime
    ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' }
  ).format(date);
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return '0 ГБ';
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(1)} ТБ`;
  if (bytes < 1024 ** 3) return `${Math.max(1, Math.round(bytes / 1024 ** 2))} МБ`;
  return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} ГБ`;
}

function ago(value) {
  if (!value) return 'недавно';
  const date = toDate(value);
  if (!date) return String(value);
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'сейчас';
  if (minutes < 60) return `${minutes} мин назад`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} ч назад`;
  return `${Math.floor(minutes / 1440)} дн назад`;
}

function pluralRu(value, one, few, many) {
  const n = Math.abs(Math.trunc(Number(value) || 0)) % 100;
  if (n > 10 && n < 20) return many;
  const last = n % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function formatCount(value, one, few, many) {
  return `${value} ${pluralRu(value, one, few, many)}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function icon(name) { return `<span data-icon="${name}"></span>`; }

/* Numbers animate from zero so a dashboard feels alive without a chart lib.
 * `data-count` holds the target; the node's text is the already-formatted
 * value, so we only interpolate the numeric part and keep the suffix. */
function hydrateCounters(root = document) {
  root.querySelectorAll('[data-count]').forEach(node => {
    const target = Number(node.dataset.count);
    if (!Number.isFinite(target) || target === 0) return;
    const final = node.textContent;
    if (calmMode()) return;
    const decimals = Number(node.dataset.countDecimals || 0);
    const prefix = node.dataset.countPrefix || '';
    const suffix = node.dataset.countSuffix || '';
    const currency = node.dataset.countCurrency || '';
    const duration = Math.min(900, 320 + Math.abs(target) * 4);
    const start = performance.now();
    const format = value => currency
      ? new Intl.NumberFormat('ru-RU', {
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals,
        style: 'currency',
        currency,
      }).format(value)
      : `${prefix}${value.toLocaleString('ru-RU', {
        minimumFractionDigits: decimals, maximumFractionDigits: decimals,
      })}${suffix}`;
    const step = now => {
      if (calmMode()) { node.textContent = final; return; }
      const t = clamp((now - start) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      if (t >= 1) { node.textContent = final; return; }
      node.textContent = format(target * eased);
      requestAnimationFrame(step);
    };
    node.textContent = format(0);
    requestAnimationFrame(step);
  });
}

function hydrateProgress(root = document) {
  if (calmMode()) return;

  root.querySelectorAll('.progress > i').forEach(bar => {
    const target = clamp(Number.parseFloat(bar.style.width) || 0, 0, 100);
    if (target <= 0) return;
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!bar.isConnected) return;
      bar.style.removeProperty('transition');
      bar.style.width = `${target}%`;
    }));
  });

  root.querySelectorAll('.day-ring').forEach(ring => {
    const target = clamp(Number.parseFloat(ring.style.getPropertyValue('--ring')) || 0, 0, 100);
    if (target <= 0) return;
    ring.style.setProperty('--ring', '0');
    const start = performance.now();
    const step = now => {
      if (!ring.isConnected) return;
      if (calmMode()) { ring.style.setProperty('--ring', String(target)); return; }
      const progress = clamp((now - start) / 900, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      ring.style.setProperty('--ring', String(target * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function hydrateStatuses(root = document) {
  if (calmMode()) return;
  root.querySelectorAll('.status-pill, .order-status').forEach(node => {
    node.classList.add('is-arriving');
    setTimeout(() => node.classList.remove('is-arriving'), 520);
  });
}

function hydrateMotion(root = document) {
  hydrateCounters(root);
  hydrateProgress(root);
  hydrateStatuses(root);
}

function toastMessage(error) {
  const text = String(error?.message || error || '').trim();
  return text || 'Что-то пошло не так';
}

let toastTimer;
function toast(message, type = '') {
  clearTimeout(toastTimer);
  toastNode.textContent = message;
  toastNode.className = `toast show ${type}`;
  toastTimer = setTimeout(() => { toastNode.className = 'toast'; }, 2600);
}

function showSuccessMoment(title, detail = '') {
  notify('success');
  const message = detail ? `${title}. ${detail}` : title;
  if (calmMode()) { toast(message, 'success'); return; }

  clearTimeout(successMomentTimer);
  document.getElementById('successMoment')?.remove();
  const node = document.createElement('div');
  node.id = 'successMoment';
  node.className = 'success-moment';
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'assertive');
  node.innerHTML = `<div class="success-moment-content">
    <span class="success-moment-icon">${icon('check')}</span>
    <strong>${escapeHtml(title)}</strong>
    ${detail ? `<small>${escapeHtml(detail)}</small>` : ''}
  </div>`;
  document.body.appendChild(node);
  hydrateIcons(node);
  requestAnimationFrame(() => node.classList.add('show'));
  successMomentTimer = setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 240);
  }, 1350);
}

function updateNotificationBadge() {
  if (!notificationBadge) return;
  const unread = Number(state.data?.notification_unread || 0);
  notificationBadge.hidden = unread <= 0;
  notificationBadge.textContent = unread > 9 ? '9+' : String(unread);
}

function openExternal(url) {
  try { if (tg?.openLink) tg.openLink(url); else window.open(url, '_blank', 'noopener'); }
  catch (_) { window.location.href = url; }
}

/* Custom URL schemes (happ://, v2raytun://…) must not go through openLink —
 * Telegram only accepts http(s) there. */
function openScheme(url) {
  try { window.location.href = url; }
  catch (_) { toast('Не удалось открыть приложение', 'error'); }
}

async function copyText(value, message = 'Скопировано') {
  try {
    await navigator.clipboard.writeText(value);
    notify('success');
    toast(message, 'success');
    return true;
  } catch (_) {
    openSheet(`<h2>Скопируйте вручную</h2><div class="key-box"><code>${escapeHtml(value)}</code></div>`);
    return false;
  }
}

function setBusy(node, busy) {
  if (!node) return;
  node.classList.toggle('is-busy', busy);
  if (node.tagName === 'BUTTON') node.disabled = busy;
}

/* ── Transport ────────────────────────────────────────────────────────────── */
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (tg?.initData) headers.Authorization = `tma ${tg.initData}`;
  const response = await fetch(`/miniapp/api${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(payload.detail)
      ? payload.detail.map(item => item.msg).join(', ')
      : payload.detail;
    throw new Error(detail || `Ошибка ${response.status}`);
  }
  return payload;
}

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

async function loadBootstrap({ quiet = false } = {}) {
  if (!quiet) {
    app.classList.add('is-loading');
    commitScreen(bootMarkup('Открываем защищённый кабинет'), 0, { quiet: true });
  }
  try {
    state.data = await api('/bootstrap');
    app.classList.remove('is-loading');
    const user = state.data.user;
    document.getElementById('avatarInitial').textContent = (user.first_name || 'M').slice(0, 1).toUpperCase();
    const dot = document.getElementById('onlineDot');
    if (dot) dot.classList.toggle('is-off', state.data.service?.online === false);
    updateNotificationBadge();
    render({ quiet });
    return true;
  } catch (error) {
    app.classList.remove('is-loading');
    if (quiet && state.data) {
      toast(toastMessage(error), 'error');
      return false;
    }
    commitScreen(errorMarkup(toastMessage(error)), 0, { quiet: true });
    return false;
  }
}

function bootMarkup(text) {
  return `<section class="boot-screen"><div class="boot-seal"><span></span></div><p class="eyebrow">SECURE SESSION</p><h1>${escapeHtml(text)}</h1><div class="boot-line"><i></i></div></section>`;
}

function errorMarkup(message) {
  return `<section class="empty-state error-state">
    <div class="icon-box danger">${icon('power')}</div>
    <h2>Кабинет недоступен</h2>
    <p>${escapeHtml(message)}</p>
    <button class="button button-primary" data-action="reload" type="button">${icon('refresh')}<span>Повторить</span></button>
  </section>`;
}

/* ── Screen switching ─────────────────────────────────────────────────────── */
function render({ quiet = false } = {}) {
  if (!state.data) return;
  const markup = state.adminMode ? renderAdmin() : {
    home: renderHome,
    plans: renderPlans,
    devices: renderDevices,
    profile: renderProfile,
  }[state.tab]();
  commitScreen(markup, 0, { quiet });
  updateNav();
  syncTelegramBackButton();
}

/* Forward navigation slides content in from the right, back from the left;
 * `--slide-from` drives both the outgoing and the incoming keyframes. */
function commitScreen(markup, slideFrom = 0, { quiet = false } = {}) {
  const ticket = ++renderTicket;
  const currentHeight = screen.getBoundingClientRect().height;
  if (currentHeight > 0) screen.style.minHeight = `${Math.ceil(currentHeight)}px`;
  const paint = () => {
    if (ticket !== renderTicket) return;
    screen.style.setProperty('--slide-from', `${slideFrom}px`);
    screen.classList.toggle('from-right', slideFrom > 0);
    screen.classList.toggle('from-left', slideFrom < 0);
    screen.classList.toggle('is-quiet', quiet);
    screen.innerHTML = markup;
    screen.classList.remove('is-switching');
    hydrateIcons(screen);
    hydrateMotion(screen);
    if (!quiet) window.scrollTo({ top: 0, behavior: 'auto' });
    setTimeout(() => {
      if (ticket === renderTicket) screen.style.removeProperty('min-height');
    }, quiet ? 80 : 520);
  };

  if (quiet || calmMode() || !screen.firstElementChild) { paint(); return; }
  screen.style.setProperty('--slide-from', `${slideFrom}px`);
  screen.classList.add('is-switching');
  setTimeout(paint, 160);
}

function switchTab(tab) {
  if (state.adminMode) state.adminMode = false;
  if (state.tab === tab) { render(); return; }
  const direction = TABS.indexOf(tab) > TABS.indexOf(state.tab) ? 1 : -1;
  state.tab = tab;
  const markup = { home: renderHome, plans: renderPlans, devices: renderDevices, profile: renderProfile }[tab]();
  commitScreen(markup, direction * 26);
  updateNav();
  syncTelegramBackButton();
}

function updateNav() {
  nav.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', !state.adminMode && item.dataset.tab === state.tab);
  });
  scheduleNavIndicator();
}

function updateNavIndicator() {
  const active = nav.querySelector('.nav-item.active');
  if (!active || !navSelection) { if (navSelection) navSelection.style.opacity = '0'; return; }
  const navRect = nav.getBoundingClientRect();
  const rect = active.getBoundingClientRect();
  navSelection.style.opacity = '1';
  navSelection.style.width = `${rect.width}px`;
  navSelection.style.height = `${rect.height}px`;
  navSelection.style.top = `${rect.top - navRect.top}px`;
  navSelection.style.transform = `translateX(${rect.left - navRect.left}px)`;
}

function scheduleNavIndicator() {
  requestAnimationFrame(() => requestAnimationFrame(updateNavIndicator));
}

function syncTelegramBackButton() {
  const back = tg?.BackButton;
  if (!back) return;
  const deep = state.adminMode || state.tab !== 'home';
  try { deep ? back.show() : back.hide(); } catch (_) {}
}

function syncTelegramSafeArea() {
  if (!tg) return;
  const safeBottom = Number(tg.safeAreaInset?.bottom || 0);
  const contentBottom = Number(tg.contentSafeAreaInset?.bottom || 0);
  const bottom = Math.max(safeBottom, contentBottom);
  document.documentElement.style.setProperty('--tg-safe-bottom', `${safeBottom}px`);
  document.documentElement.style.setProperty('--tg-content-safe-bottom', `${contentBottom}px`);
  document.documentElement.style.setProperty('--app-safe-bottom', `${bottom}px`);
  scheduleNavIndicator();
}

function syncKeyboardState() {
  const viewport = window.visualViewport;
  const keyboardOpen = Boolean(viewport && window.innerHeight - viewport.height > 140);
  document.body.classList.toggle('keyboard-open', keyboardOpen);
}

function handleBack() {
  if (state.admin.selectedUser) { state.admin.selectedUser = null; render(); return; }
  if (state.adminMode) { state.adminMode = false; render(); return; }
  if (state.tab !== 'home') { switchTab('home'); return; }
  try { tg?.close?.(); } catch (_) {}
}

/* ── Pull to refresh ──────────────────────────────────────────────────────── */
const PTR_TRIGGER = 74;
let ptrState = null;

function ensurePtrNode() {
  if (ptrNode) return ptrNode;
  ptrNode = document.createElement('div');
  ptrNode.className = 'ptr';
  ptrNode.innerHTML = ICONS.refresh;
  document.body.appendChild(ptrNode);
  return ptrNode;
}

function setupPullToRefresh() {
  const node = ensurePtrNode();

  document.addEventListener('touchstart', event => {
    if (ptrState || state.busy || sheet.hidden === false) return;
    if (event.touches.length !== 1) return;
    if (window.scrollY > 2 || document.documentElement.scrollTop > 2) return;
    ptrState = { y: event.touches[0].clientY, pulled: 0, armed: false };
  }, { passive: true });

  document.addEventListener('touchmove', event => {
    if (!ptrState) return;
    const delta = event.touches[0].clientY - ptrState.y;
    if (delta <= 0) { resetPtr(); return; }
    // Rubber-band: the further you pull, the less it follows.
    ptrState.pulled = Math.pow(delta, 0.82);
    const progress = clamp(ptrState.pulled / PTR_TRIGGER, 0, 1.35);
    node.classList.remove('is-resetting');
    node.style.transform = `translate(-50%, ${-70 + progress * 82}px) scale(${0.6 + progress * 0.4})`;
    node.style.opacity = String(clamp(progress, 0, 1));
    const armed = ptrState.pulled >= PTR_TRIGGER;
    if (armed !== ptrState.armed) { ptrState.armed = armed; node.classList.toggle('is-armed', armed); selectionHaptic(); }
  }, { passive: true });

  const finish = () => {
    if (!ptrState) return;
    const armed = ptrState.armed;
    ptrState = null;
    if (!armed) { resetPtr(); return; }
    node.classList.add('is-spinning');
    node.classList.remove('is-armed');
    haptic('medium');
    refreshAll().finally(() => {
      node.classList.remove('is-spinning');
      resetPtr();
    });
  };
  document.addEventListener('touchend', finish, { passive: true });
  document.addEventListener('touchcancel', finish, { passive: true });
}

function resetPtr() {
  ptrState = null;
  if (!ptrNode) return;
  ptrNode.classList.add('is-resetting');
  ptrNode.classList.remove('is-armed');
  ptrNode.style.transform = '';
  ptrNode.style.opacity = '';
  setTimeout(() => ptrNode?.classList.remove('is-resetting'), 320);
}

async function refreshAll() {
  try {
    state.data = await api('/bootstrap');
    if (state.adminMode) await loadAdminTab(state.adminTab, { quiet: true });
    else render();
    if (state.adminMode) render();
    toast('Обновлено', 'success');
  } catch (error) {
    toast(toastMessage(error), 'error');
  }
}

/* ── Home ─────────────────────────────────────────────────────────────────── */
function renderHome() {
  const { subscription, service, trial, user } = state.data;
  if (!subscription) return renderNoSubscriptionHome();

  const days = Math.max(0, Number(subscription.days_left || 0));
  const offline = service?.online === false;
  const ring = subscription.is_expired ? 0 : clamp(Math.round((days / 30) * 100), days > 0 ? 4 : 0, 100);
  const ringClass = days <= 3 ? ' is-critical' : days <= 7 ? ' is-low' : '';
  const pill = subscription.is_expired
    ? '<span class="status-pill offline">Подписка истекла</span>'
    : subscription.is_frozen
      ? `<span class="status-pill frozen">${escapeHtml('Заморожена')}</span>`
      : offline
        ? '<span class="status-pill offline">Сервис недоступен</span>'
        : '<span class="status-pill">Канал защищён</span>';

  const heroClass = `hero${subscription.is_frozen ? ' is-frozen' : ''}${offline || subscription.is_expired ? ' is-offline' : ''}`;
  const limit = Number(subscription.traffic_limit_bytes || 0);
  const used = Number(subscription.traffic_used_bytes || 0);
  const trafficPct = limit > 0 ? clamp(Math.round((used / limit) * 100), 0, 100) : 0;

  return `
    <section class="${heroClass}">
      <img class="hero-character" src="/miniapp/static/mister-character.png?v=20260820-1" alt="" aria-hidden="true">
      <div class="hero-top">
        ${pill}
        <span class="signal-code">ID ${escapeHtml(String(user.telegram_id || '—'))}</span>
      </div>
      <div class="hero-bottom">
        <div class="hero-copy">
          <span class="hero-label">Текущий тариф</span>
          <h1>${escapeHtml(subscription.plan_name || 'Подписка')}</h1>
          <p class="hero-subtitle">${subscription.is_expired
            ? 'Продлите доступ, чтобы вернуть защиту'
            : `Активна до ${escapeHtml(formatDate(subscription.expires_at))}`}</p>
        </div>
        <div class="hero-stats">
          <div class="day-ring${ringClass}" style="--ring:${ring}">
            <b data-count="${days}">${days}</b>
            <small>дней</small>
          </div>
          <div class="hero-stat">
            <small>Устройства</small>
            <b>${subscription.device_count || 0} / ${subscription.max_devices || 0}</b>
          </div>
          <div class="hero-stat">
            <small>Трафик</small>
            <b>${limit > 0 ? `${formatBytes(used)} / ${formatBytes(limit)}` : formatBytes(used)}</b>
          </div>
        </div>
        <button class="button button-primary" data-action="connect" type="button">
          ${icon('power')}<span>Подключить устройство</span>
        </button>
      </div>
    </section>

    ${homeBanner(subscription, service)}
    ${limit > 0 ? `
    <div class="usage-panel section">
      <div class="progress-meta"><span>Трафик израсходован</span><span data-count="${trafficPct}" data-count-suffix="%">${trafficPct}%</span></div>
      <div class="progress${trafficPct >= 90 ? ' danger' : trafficPct >= 70 ? ' warning' : ''}"><i style="width:${trafficPct}%"></i></div>
    </div>` : ''}

    <div class="section quick-section">
      <div class="section-title"><h2>Быстрые действия</h2></div>
      <div class="quick-grid stagger">
        <button class="quick-action" data-action="show-key" type="button">
          <span class="icon-box accent">${icon('key')}</span>
          <b>Ключ и QR</b><small>Ссылка подписки</small>
        </button>
        <button class="quick-action" data-action="renew" type="button">
          <span class="icon-box">${icon('refresh')}</span>
          <b>Продлить</b><small>На любой срок</small>
        </button>
        <button class="quick-action" data-action="tab-devices" type="button">
          <span class="icon-box">${icon('devices')}</span>
          <b>Устройства</b><small>${subscription.device_count || 0} активно</small>
        </button>
        <button class="quick-action" data-action="freeze" type="button">
          <span class="icon-box${subscription.is_frozen ? ' warning' : ''}">${icon('snow')}</span>
          <b>${subscription.is_frozen ? 'Разморозить' : 'Заморозить'}</b><small>Пауза без потерь</small>
        </button>
      </div>
    </div>

    ${trial ? trialCard(trial) : ''}
    ${homeOrders()}`;
}

function homeBanner(subscription, service) {
  const days = Number(subscription.days_left || 0);
  if (subscription.is_expired) {
    return banner('danger', 'clock', 'Подписка истекла', 'Доступ отключён. Продлите, чтобы вернуть защиту.', 'Продлить', 'renew');
  }
  if (service?.online === false) {
    return banner('danger', 'power', 'Сервис недоступен', service.message || 'Панель управления не отвечает. Мы уже разбираемся.', '', '');
  }
  if (subscription.is_frozen) {
    return banner('warning', 'snow', 'Подписка заморожена', 'Дни не расходуются. Включите, когда понадобится.', 'Включить', 'freeze');
  }
  if (days > 0 && days <= 7) {
    return banner('warning', 'clock', `Осталось ${formatCount(days, 'день', 'дня', 'дней')}`,
      subscription.auto_renew_enabled ? 'Автопродление включено — спишем с баланса.' : 'Продлите заранее, чтобы не потерять доступ.',
      subscription.auto_renew_enabled ? '' : 'Продлить', 'renew');
  }
  const seats = Number(subscription.max_devices || 0) - Number(subscription.device_count || 0);
  if (seats === 0 && Number(subscription.max_devices || 0) > 0) {
    return banner('warning', 'devices', 'Все слоты заняты', 'Освободите устройство или перейдите на тариф побольше.', 'Тарифы', 'tab-plans');
  }
  return '';
}

function banner(kind, iconName, title, text, actionLabel, action) {
  return `<div class="banner ${kind}">
    <span class="icon-box ${kind}">${icon(iconName)}</span>
    <div class="banner-copy"><b>${escapeHtml(title)}</b><small>${escapeHtml(text)}</small></div>
    ${actionLabel ? `<button class="button button-ghost" data-action="${action}" type="button">${escapeHtml(actionLabel)}</button>` : ''}
  </div>`;
}

function trialCard(trial) {
  return `<div class="card trial-card">
    <div class="trial-head">
      <span class="icon-box ok">${icon('gift')}</span>
      <div><b>${escapeHtml(trial.name || 'Пробный доступ')}</b>
      <small>${formatCount(trial.days, 'день', 'дня', 'дней')} бесплатно · до ${formatCount(trial.max_devices, 'устройство', 'устройства', 'устройств')}</small></div>
    </div>
    <button class="button button-primary button-block" data-action="claim-trial" type="button">
      ${icon('check')}<span>Забрать бесплатно</span>
    </button>
  </div>`;
}

function renderNoSubscriptionHome() {
  const { trial, service } = state.data;
  return `
    <section class="hero${service?.online === false ? ' is-offline' : ''}">
      <img class="hero-character" src="/miniapp/static/mister-character.png?v=20260820-1" alt="" aria-hidden="true">
      <div class="hero-top">
        <span class="status-pill offline">Нет подписки</span>
        <span class="signal-code">OFFLINE</span>
      </div>
      <div class="hero-bottom">
        <div class="hero-copy">
          <span class="hero-label">Mister VPN</span>
          <h1>Включите приватность</h1>
          <p class="hero-subtitle">Выберите тариф — ключ выдаём сразу после оплаты.</p>
        </div>
        <button class="button button-primary" data-action="tab-plans" type="button">
          ${icon('layers')}<span>Посмотреть тарифы</span>
        </button>
      </div>
    </section>
    ${trial ? trialCard(trial) : ''}
    <div class="section">
      <div class="section-title"><h2>Как это работает</h2></div>
      <div class="card list-card stagger">
        ${[['tag', 'Выберите тариф', 'Оплата картой, СБП или криптой'],
           ['key', 'Получите ключ', 'Одна ссылка на все устройства'],
           ['power', 'Нажмите подключить', 'Клиент настроится сам']]
          .map(([ic, title, text]) => `<div class="setting-row">
            <span class="icon-box">${icon(ic)}</span>
            <div class="setting-copy"><b>${title}</b><small>${text}</small></div>
          </div>`).join('')}
      </div>
    </div>
    ${homeOrders()}`;
}

function homeOrders() {
  const orders = (state.data.orders || []).filter(order => ['pending', 'paid', 'provisioning'].includes(order.status));
  if (!orders.length) return '';
  return `<div class="section">
    <div class="section-title"><h2>Заказы в работе</h2></div>
    <div class="card order-list stagger">${orders.map(renderOrder).join('')}</div>
  </div>`;
}

/* ── Plans ────────────────────────────────────────────────────────────────── */
function periods() {
  const groups = new Set(['all']);
  (state.data.plans || []).forEach(plan => { if (plan.period_group) groups.add(plan.period_group); });
  return Array.from(groups);
}

const PERIOD_LABELS = {
  all: 'Все', trial: 'Пробные', day: 'Сутки', week: 'Неделя', month: 'Месяц',
  quarter: '3 месяца', half: '6 месяцев', half_year: '6 месяцев', halfyear: '6 месяцев',
  year: 'Год', lifetime: 'Навсегда', other: 'Другие',
};

/* Groups come straight from the upstream panel, so unknown keys are normal —
 * fall back to the duration the group actually holds instead of leaking a slug. */
function periodLabel(value) {
  const known = PERIOD_LABELS[String(value).toLowerCase()];
  if (known) return known;
  const days = (state.data?.plans || [])
    .filter(plan => plan.period_group === value && plan.duration_days)
    .map(plan => Number(plan.duration_days));
  if (!days.length) return String(value);
  const min = Math.min(...days);
  if (min % 365 === 0) return formatCount(min / 365, 'год', 'года', 'лет');
  if (min % 30 === 0) return formatCount(min / 30, 'месяц', 'месяца', 'месяцев');
  return formatCount(min, 'день', 'дня', 'дней');
}

function renderPlans() {
  const current = state.data.subscription;
  const all = (state.data.plans || []).filter(plan => !plan.is_trial);
  const plans = state.planPeriod === 'all' ? all : all.filter(plan => plan.period_group === state.planPeriod);
  const cheapestPerDay = all.reduce((best, plan) => {
    const perDay = Number(plan.price) / Math.max(1, Number(plan.duration_days || 1));
    return best == null || perDay < best ? perDay : best;
  }, null);
  const baselinePerDay = all.reduce((highest, plan) => {
    const perDay = Number(plan.price) / Math.max(1, Number(plan.duration_days || 1));
    return Math.max(highest, perDay);
  }, 0);

  return `
    <div class="screen-head">
      <p class="eyebrow">TARIFFS</p>
      <h1>Тарифы</h1>
      <p>Чем длиннее срок, тем ниже цена за день. Апгрейд возможен в любой момент.</p>
    </div>
    ${periods().length > 2 ? `<div class="chip-row">${periods().map(group => `
      <button class="chip${state.planPeriod === group ? ' active' : ''}" data-period="${escapeHtml(group)}" type="button">${escapeHtml(periodLabel(group))}</button>`).join('')}</div>` : ''}
    ${plans.length ? `<div class="plan-list stagger">${plans.map(plan => renderPlanCard(plan, current, cheapestPerDay, baselinePerDay)).join('')}</div>` : `
      <div class="card empty-state">
        <div class="icon-box">${icon('layers')}</div>
        <h3>Тарифов пока нет</h3>
        <p>В этой группе ничего не осталось. Попробуйте другую.</p>
      </div>`}
    <div class="card card-pad section">
      <div class="setting-copy"><b>Есть промокод?</b><small>Начислим сумму на баланс — потратите на любой тариф.</small></div>
      <button class="button button-ghost button-block" data-action="promo" style="margin-top:14px" type="button">
        ${icon('tag')}<span>Активировать промокод</span>
      </button>
    </div>`;
}

function renderPlanCard(plan, current, cheapestPerDay, baselinePerDay) {
  const isCurrent = current && current.plan_uuid === plan.uuid;
  const days = Math.max(1, Number(plan.duration_days || 1));
  const perDay = Number(plan.price) / days;
  const isBestValue = cheapestPerDay != null && perDay <= cheapestPerDay * 1.001 && days > 31;
  const savingPercent = baselinePerDay > perDay
    ? Math.max(1, Math.round((1 - perDay / baselinePerDay) * 100))
    : 0;
  const badges = [];
  if (isCurrent) badges.push('<span class="popular-label ok">Ваш тариф</span>');
  if (isBestValue) badges.push('<span class="popular-label save">Выгоднее всего</span>');
  if (plan.button_style === 'popular') badges.push('<span class="popular-label">Хит</span>');

  const limit = Number(plan.traffic_limit_bytes || 0);
  return `<article class="plan-card${isCurrent ? ' is-current' : ''}${isBestValue ? ' is-best' : ''}" data-plan="${escapeHtml(plan.uuid)}" role="button" tabindex="0">
    ${badges.length ? `<div class="plan-badges">${badges.join('')}</div>` : ''}
    <div class="plan-card-main">
      <div class="plan-card-copy">
        <h3>${escapeHtml(plan.name)}</h3>
        <span class="plan-duration">${formatCount(days, 'день', 'дня', 'дней')}</span>
      </div>
      <div class="plan-price">
        <b>${formatMoney(plan.price, plan.currency)}</b>
        <small>${formatMoney(perDay.toFixed(2), plan.currency)} / день</small>
      </div>
    </div>
    <div class="plan-features">
      <span class="plan-feature">${formatCount(plan.max_devices, 'устройство', 'устройства', 'устройств')}</span>
      <span class="plan-feature">${limit > 0 ? formatBytes(limit) : 'Трафик без лимита'}</span>
      ${savingPercent ? `<span class="plan-feature is-saving">Экономия ${savingPercent}%</span>` : ''}
    </div>
    <div class="plan-card-footer"><span>${isCurrent ? 'Управление подпиской' : 'Подключить тариф'}</span>${icon('chevron')}</div>
  </article>`;
}

/* ── Devices ──────────────────────────────────────────────────────────────── */
function renderDevices() {
  const { subscription, devices } = state.data;
  if (!subscription) {
    return `${devicesHead()}<div class="card empty-state">
      <div class="icon-box warning">${icon('devices')}</div>
      <h3>Нет активной подписки</h3>
      <p>Оформите тариф — и подключайте устройства одним нажатием.</p>
      <button class="button button-primary" data-action="tab-plans" type="button">${icon('layers')}<span>К тарифам</span></button>
    </div>`;
  }

  const list = devices || [];
  const seats = Number(subscription.max_devices || 0);
  return `${devicesHead()}
    <div class="chip-row">
      <button class="chip${state.deviceView === 'devices' ? ' active' : ''}" data-device-view="devices" type="button">Подключённые</button>
      <button class="chip${state.deviceView === 'log' ? ' active' : ''}" data-device-view="log" type="button">Журнал входов</button>
    </div>
    ${state.deviceView === 'log' ? renderConnections() : `
      <div class="card card-pad">
        <div class="progress-meta"><span>Слоты заняты</span><span>${list.length} / ${seats}</span></div>
        <div class="progress${seats && list.length >= seats ? ' warning' : ''}"><i style="width:${seats ? clamp((list.length / seats) * 100, 0, 100) : 0}%"></i></div>
      </div>
      <button class="button button-primary button-block" data-action="connect" style="margin-top:14px" type="button">
        ${icon('plus')}<span>Подключить новое</span>
      </button>
      ${list.length ? `<div class="card device-list stagger" style="margin-top:14px">${list.map(renderDevice).join('')}</div>` : `
        <div class="card empty-state" style="margin-top:14px">
          <div class="icon-box">${icon('devices')}</div>
          <h3>Пока пусто</h3>
          <p>Нажмите «Подключить новое» — покажем ключ и откроем клиент.</p>
        </div>`}`}`;
}

function devicesHead() {
  return `<div class="screen-head">
    <p class="eyebrow">DEVICES</p>
    <h1>Устройства</h1>
    <p>Один ключ работает на всех платформах в пределах лимита тарифа.</p>
  </div>`;
}

function renderDevice(device) {
  const platform = `${device.os || ''} ${device.model || ''}`.trim();
  const probe = platform.toLowerCase();
  const iconName = /win|mac|linux|desktop/.test(probe) ? 'monitor' : /ios|android|phone/.test(probe) ? 'phone' : 'devices';
  return `<div class="setting-row device-row">
    <span class="icon-box">${icon(iconName)}</span>
    <div class="setting-copy">
      <b>${escapeHtml(device.name || platform || 'Устройство')}</b>
      <div class="device-meta">
        ${device.os ? `<span class="mini-chip">${escapeHtml(device.os)}</span>` : ''}
        ${device.last_seen ? `<span class="mini-chip ok">${escapeHtml(ago(device.last_seen))}</span>` : ''}
        ${device.ip ? `<span class="mini-chip">${escapeHtml(device.ip)}</span>` : ''}
      </div>
    </div>
    ${device.id ? `<button class="row-action danger" data-action="drop-device" data-device-id="${escapeHtml(device.id)}" type="button" aria-label="Отключить">${icon('trash')}</button>` : ''}
  </div>`;
}

function renderConnections() {
  const { items, hasMore, loading } = state.connections;
  if (loading && !items.length) {
    return `<div class="card" style="padding:16px;display:grid;gap:10px">
      ${Array.from({ length: 5 }, () => '<div class="skeleton" style="height:44px"></div>').join('')}
    </div>`;
  }
  if (!items.length) {
    return `<div class="card empty-state">
      <div class="icon-box">${icon('history')}</div>
      <h3>Журнал пуст</h3>
      <p>Здесь появятся подключения после первого входа.</p>
    </div>`;
  }
  return `<div class="card device-list stagger">${items.map(entry => `
    <div class="setting-row">
      <span class="icon-box">${icon('globe')}</span>
      <div class="setting-copy">
        <b>${escapeHtml(entry.node || entry.country || 'Узел')}</b>
        <div class="device-meta">
          <span class="mini-chip">${escapeHtml(formatDate(entry.connected_at || entry.created_at, true))}</span>
          ${entry.ip ? `<span class="mini-chip">${escapeHtml(entry.ip)}</span>` : ''}
        </div>
      </div>
    </div>`).join('')}</div>
    ${hasMore ? `<button class="button button-ghost button-block" data-action="more-connections" style="margin-top:12px" type="button">
      ${icon('history')}<span>Показать ещё</span>
    </button>` : ''}`;
}

/* ── Profile ──────────────────────────────────────────────────────────────── */
function renderProfile() {
  const { user, subscription, orders, config } = state.data;
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Клиент';
  const recent = (orders || []).slice(0, 6);

  return `
    <div class="card profile-card">
      <div class="profile-avatar">${escapeHtml((user.first_name || 'M').slice(0, 1).toUpperCase())}</div>
      <div class="setting-copy">
        <h2>${escapeHtml(name)}</h2>
        <p>${user.username ? `@${escapeHtml(user.username)}` : `ID ${escapeHtml(String(user.telegram_id))}`}</p>
      </div>
      ${user.is_blocked ? '<span class="mini-chip danger">Заблокирован</span>' : ''}
    </div>

    <div class="card balance-card section">
      <p class="eyebrow">BALANCE</p>
      <div class="balance-value" data-count="${Number(user.balance || 0)}" data-count-decimals="${Number(user.balance || 0) % 1 ? 2 : 0}" data-count-currency="${escapeHtml(config.currency || 'RUB')}">${formatMoney(user.balance, config.currency)}</div>
      <div class="balance-actions">
        <button class="button button-primary" data-action="topup" type="button">${icon('plus')}<span>Пополнить</span></button>
        <button class="button button-dark" data-action="promo" type="button">${icon('tag')}<span>Промокод</span></button>
      </div>
    </div>

    ${subscription ? `<div class="card section">
      <div class="setting-row">
        <span class="icon-box${subscription.auto_renew_enabled ? ' ok' : ''}">${icon('refresh')}</span>
        <div class="setting-copy">
          <b>Автопродление</b>
          <small>${subscription.auto_renew_enabled
            ? 'Спишем стоимость тарифа с баланса за день до конца.'
            : 'Включите, чтобы доступ не прерывался.'}</small>
        </div>
        <button class="switch${subscription.auto_renew_enabled ? ' on' : ''}" data-action="toggle-auto-renew" type="button" role="switch" aria-checked="${subscription.auto_renew_enabled}" aria-label="Автопродление"><i></i></button>
      </div>
    </div>` : ''}

    <p class="section-label">Кабинет</p>
    <div class="card menu-card">
      ${subscription ? `<button class="menu-row" data-action="show-key" type="button">
        <span class="icon-box">${icon('key')}</span><b>Ключ подписки</b>${icon('chevron')}
      </button>` : ''}
      <button class="menu-row" data-action="orders" type="button">
        <span class="icon-box">${icon('history')}</span><b>История платежей</b>${icon('chevron')}
      </button>
      <button class="menu-row" data-action="referral" type="button">
        <span class="icon-box">${icon('users')}</span><b>Пригласить друзей</b>${icon('chevron')}
      </button>
      <button class="menu-row" data-action="gift" type="button">
        <span class="icon-box">${icon('gift')}</span><b>Подарить VPN</b>${icon('chevron')}
      </button>
      <button class="menu-row" data-action="payment-preference" type="button">
        <span class="icon-box">${icon('wallet')}</span><b>Способ оплаты</b>${icon('chevron')}
      </button>
      <button class="menu-row" data-action="notifications" type="button">
        <span class="icon-box">${icon('bell')}</span><b>Уведомления</b>${Number(state.data.notification_unread || 0) ? `<span class="menu-count">${state.data.notification_unread}</span>` : ''}${icon('chevron')}
      </button>
      <button class="menu-row" data-action="server-status" type="button">
        <span class="icon-box">${icon('globe')}</span><b>Сервер и задержка</b>${icon('chevron')}
      </button>
      <button class="menu-row" data-action="support" type="button">
        <span class="icon-box">${icon('support')}</span><b>Поддержка</b>${icon('chevron')}
      </button>
      ${user.is_admin ? `<button class="menu-row admin" data-action="admin" type="button">
        <span class="icon-box accent">${icon('admin')}</span><b>Панель администратора</b>${icon('chevron')}
      </button>` : ''}
    </div>

    ${recent.length ? `<div class="section">
      <div class="section-title"><h2>Последние платежи</h2>
        <button data-action="orders" type="button">Все</button></div>
      <div class="card order-list stagger">${recent.map(renderOrder).join('')}</div>
    </div>` : ''}`;
}

const ORDER_STATUS = {
  pending: 'Ожидает оплаты', paid: 'Оплачен', provisioning: 'Выдаём доступ',
  completed: 'Выполнен', failed: 'Ошибка', cancelled: 'Отменён',
};

const ORDER_TYPES = {
  new_subscription: 'Новая подписка', gift: 'Подарок', renew: 'Продление', renew_custom: 'Продление',
  upgrade: 'Апгрейд тарифа', traffic: 'Докупка трафика', balance_topup: 'Пополнение баланса',
};

function orderStatus(status) { return ORDER_STATUS[status] || status; }

function paymentMethodLabel(id) {
  return PAYMENT_METHODS.find(method => method.id === id)?.label || id;
}

/* The plan name lives in the order snapshot; fall back to the order type. */
function orderTitle(order) {
  return order.snapshot?.plan_name || ORDER_TYPES[order.type] || 'Заказ';
}

function renderOrder(order) {
  const pending = ['pending', 'paid', 'provisioning'].includes(order.status);
  return `<div class="setting-row order-row" data-action="order-details" data-uuid="${escapeHtml(order.uuid)}">
    <span class="icon-box${order.status === 'completed' ? ' ok' : order.status === 'failed' ? ' danger' : pending ? ' warning' : ''}">${icon(order.status === 'failed' ? 'ban' : pending ? 'clock' : 'check')}</span>
    <div class="setting-copy">
      <b><span>${escapeHtml(orderTitle(order))}</span><span>${formatMoney(order.amount, order.currency)}</span></b>
      <small><span class="order-status ${escapeHtml(order.status)}">${escapeHtml(orderStatus(order.status))}</span> · ${escapeHtml(formatDate(order.created_at, true))}${order.snapshot?.payment_method ? ` · ${escapeHtml(paymentMethodLabel(order.snapshot.payment_method))}` : ''}</small>
    </div>
    ${pending ? `<button class="row-action" data-action="check-order" data-uuid="${escapeHtml(order.uuid)}" type="button" aria-label="Проверить оплату">${icon('refresh')}</button>` : ''}
  </div>`;
}

/* ── Sheets ───────────────────────────────────────────────────────────────── */
function openSheet(markup) {
  clearTimeout(sheetCloseTimer);
  sheetLastFocus = document.activeElement;
  sheetContent.innerHTML = markup;
  hydrateIcons(sheetContent);
  ensureSheetGrip();
  backdrop.hidden = false;
  sheet.hidden = false;
  sheet.style.transform = '';
  /* Flush the closed position synchronously — rAF is throttled in a hidden or
   * backgrounded webview, which would leave the sheet stuck off-screen. */
  void sheet.offsetHeight;
  backdrop.classList.add('open');
  sheet.classList.add('open');
  hydrateMotion(sheetContent);
  sheetContent.querySelector('input,textarea,select')?.focus({ preventScroll: true });
  haptic('light');
}

function closeSheet() {
  stopPaymentPoll();
  stopBroadcastPoll();
  sheet.classList.remove('open', 'is-dragging');
  sheet.style.transform = '';
  backdrop.classList.remove('open');
  sheetCloseTimer = setTimeout(() => {
    sheet.hidden = true;
    backdrop.hidden = true;
    sheetContent.innerHTML = '';
  }, 260);
  try { sheetLastFocus?.focus?.({ preventScroll: true }); } catch (_) {}
  sheetLastFocus = null;
}

function sheetIsOpen() { return !sheet.hidden; }

/* Drag-to-dismiss. The grip is injected rather than markup-authored so every
 * sheet gets it for free. */
function ensureSheetGrip() {
  if (sheet.querySelector('.sheet-grip')) return;
  const grip = document.createElement('div');
  grip.className = 'sheet-grip';
  sheet.appendChild(grip);

  let drag = null;
  grip.addEventListener('pointerdown', event => {
    if (event.button !== undefined && event.button !== 0) return;
    drag = { id: event.pointerId, y: event.clientY, dy: 0 };
    sheet.classList.add('is-dragging');
    grip.setPointerCapture(event.pointerId);
  });
  grip.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    drag.dy = Math.max(0, event.clientY - drag.y);
    sheet.style.transform = `translate(-50%, ${drag.dy}px)`;
  });
  const end = event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = drag.dy;
    drag = null;
    sheet.classList.remove('is-dragging');
    if (dy > 110) { haptic('light'); closeSheet(); }
    else sheet.style.transform = '';
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
}

function connectionSheet() {
  const url = state.data.subscription?.subscription_url;
  if (!url) return toast('Ключ ещё не создан', 'error');
  const ua = `${tg?.platform || ''} ${navigator.userAgent || ''}`.toLowerCase();
  const recommended = ua.includes('android') || ua.includes('iphone') || ua.includes('ipad')
    ? 'happ'
    : ua.includes('windows') ? 'karing' : 'happ';
  const clients = [...CLIENTS].sort((a, b) => Number(b.id === recommended) - Number(a.id === recommended));
  return `
    <h2>Подключение</h2>
    <p class="sheet-lead">Выберите приложение — конфигурация импортируется сама. Ключ не покидает ваше устройство.</p>
    <div class="connect-steps"><span><b>1</b> Установите клиент</span><span><b>2</b> Импортируйте ключ</span><span><b>3</b> Включите VPN</span></div>
    <div class="client-grid">${clients.map(client => `
      <button class="client-tile" data-client="${client.id}" type="button">
        <span class="client-mark">${client.mark}${client.id === recommended ? '<i class="client-recommended">★</i>' : ''}</span>
        <span class="setting-copy"><b>${escapeHtml(client.name)}</b><small>${escapeHtml(client.hint)}</small></span>
      </button>`).join('')}</div>
    <h3>Ключ подписки</h3>
    ${qrSvg(url)}
    <div class="key-box"><code>${escapeHtml(url)}</code>
      <button class="row-action" data-action="copy-key" type="button" aria-label="Скопировать">${icon('copy')}</button>
    </div>
    <p class="field-hint">Не делитесь ключом: он даёт доступ к вашему трафику и слотам устройств.</p>`;
}

/* ── Checkout ─────────────────────────────────────────────────────────────── */
function paymentOptions(kind, planUuid, days = '', amount = null) {
  const balance = Number(state.data.user.balance || 0);
  const preferred = state.data.user.preferred_payment_method;
  const methods = [...PAYMENT_METHODS].sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred));
  return `<div class="payment-grid">${methods.map(method => {
    const short = method.id === 'balance' && amount != null && balance < amount;
    return `<button class="payment-option${short ? ' is-short' : ''}" type="button"
      data-pay="${method.id}" data-kind="${kind}" data-plan="${escapeHtml(planUuid || '')}" data-days="${escapeHtml(String(days))}">
      ${icon(method.icon)}
      <b>${escapeHtml(method.label)}${method.id === preferred ? ' · Избранное' : ''}</b>
      <small>${method.id === 'balance' ? (short ? `Не хватает ${formatMoney(amount - balance, state.data.config.currency)}` : `Доступно ${formatMoney(balance, state.data.config.currency)}`) : escapeHtml(method.hint)}</small>
    </button>`;
  }).join('')}</div>`;
}

function giftSheet(plan) {
  return `
    <h2>Подарок</h2>
    <p class="sheet-lead">Введите username или Telegram ID получателя. Он должен хотя бы один раз открыть бота.</p>
    <div class="field" style="margin-bottom:16px">
      <label for="giftRecipient">Получатель</label>
      <input class="input" id="giftRecipient" type="text" autocomplete="off" placeholder="@username или 123456789">
    </div>
    <div class="card sheet-summary">
      <div class="summary-line"><span>Тариф</span><b>${escapeHtml(plan.name)}</b></div>
      <div class="summary-line"><span>К оплате</span><b>${formatMoney(plan.price, plan.currency)}</b></div>
    </div>
    <h3>Способ оплаты</h3>${paymentOptions('gift', plan.uuid, '', Number(plan.price))}`;
}

function giftPlanSelectSheet() {
  return `<h2>Подарить VPN</h2><p class="sheet-lead">Сначала выберите тариф, затем укажите получателя.</p>
    <div class="plan-list compact-list">${(state.data.plans || []).filter(plan => !plan.is_trial).map(plan => `
      <button class="card plan-card" data-action="gift-plan-select" data-plan="${escapeHtml(plan.uuid)}" type="button">
        <span class="plan-card-head"><b>${escapeHtml(plan.name)}</b><strong>${formatMoney(plan.price, plan.currency)}</strong></span>
        <small>${formatCount(plan.duration_days, 'день', 'дня', 'дней')} · ${plan.max_devices} устройств</small>
      </button>`).join('')}</div>`;
}

function referralSheet(data) {
  return `<h2>Пригласить друзей</h2>
    <p class="sheet-lead">Друг открывает бота по вашей ссылке и получает VPN. После его первой покупки вам начисляется бонус.</p>
    <div class="card sheet-summary">
      <div class="summary-line"><span>Приглашено</span><b>${data.invited}</b></div>
      <div class="summary-line"><span>Начислено</span><b>${formatMoney(data.earned, data.currency)}</b></div>
      <div class="summary-line"><span>Бонус за покупку</span><b>${formatMoney(data.bonus, data.currency)}</b></div>
    </div>
    <div class="key-box"><code>${escapeHtml(data.link)}</code><button class="row-action" data-action="copy-referral" data-value="${escapeHtml(data.link)}" type="button" aria-label="Скопировать">${icon('copy')}</button></div>`;
}

function notificationSheet(items) {
  return `<h2>Уведомления</h2>
    ${items.length ? `<div class="notification-list">${items.map(item => `<button class="notification-item${item.read ? '' : ' unread'}" data-action="mark-notification" data-notification-id="${item.id}" type="button">
      <span class="icon-box ${escapeHtml(item.kind)}">${icon(item.kind === 'danger' ? 'ban' : item.kind === 'warning' ? 'clock' : item.kind === 'success' ? 'check' : 'bell')}</span>
      <span class="setting-copy"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.body)}</small><em>${escapeHtml(formatDate(item.created_at, true))}</em></span>
    </button>`).join('')}</div>` : '<p class="sheet-lead">Новых уведомлений пока нет.</p>'}`;
}

function supportSheet(tickets = []) {
  const categories = [['connection', 'Подключение'], ['payment', 'Оплата'], ['subscription', 'Подписка'], ['other', 'Другое']];
  return `<h2>Поддержка</h2>
    <p class="sheet-lead">Опишите проблему. Ответ появится здесь, а для срочного вопроса можно открыть чат с оператором.</p>
    <div class="field"><label for="supportCategory">Тема</label><select class="input" id="supportCategory">${categories.map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select></div>
    <div class="field" style="margin-top:12px"><label for="supportMessage">Сообщение</label><textarea class="input" id="supportMessage" rows="4" maxlength="2000" placeholder="Что произошло?"></textarea></div>
    <button class="button button-primary button-block" data-action="support-submit" type="button">${icon('send')}<span>Отправить обращение</span></button>
    ${state.data.config.support_url ? `<button class="button button-dark button-block" data-action="open-support-chat" style="margin-top:10px" type="button">${icon('message')}<span>Открыть чат</span></button>` : ''}
    ${tickets.length ? `<h3>Мои обращения</h3><div class="ticket-list">${tickets.map(ticket => `<div class="card ticket-item"><b>${escapeHtml(ticket.category)}</b><small>${escapeHtml(ticket.status)} · ${escapeHtml(formatDate(ticket.created_at, true))}</small><p>${escapeHtml(ticket.message)}</p>${ticket.reply ? `<em>${escapeHtml(ticket.reply)}</em>` : ''}</div>`).join('')}</div>` : ''}`;
}

function paymentPreferenceSheet() {
  const preferred = state.data.user.preferred_payment_method || 'card';
  return `<h2>Способ оплаты</h2><p class="sheet-lead">Избранный метод будет первым при покупке и продлении.</p>
    <div class="payment-grid">${PAYMENT_METHODS.map(method => `<button class="payment-option${method.id === preferred ? ' active' : ''}" data-action="save-payment-preference" data-payment-method="${method.id}" type="button">${icon(method.icon)}<b>${escapeHtml(method.label)}</b><small>${method.id === preferred ? 'Выбран' : escapeHtml(method.hint)}</small></button>`).join('')}</div>`;
}

function orderDetailsSheet(order) {
  const receipt = [
    'Mister VPN',
    `Чек ${order.uuid}`,
    `Операция: ${orderTitle(order)}`,
    `Сумма: ${formatMoney(order.amount, order.currency)}`,
    `Статус: ${orderStatus(order.status)}`,
    `Дата: ${formatDate(order.created_at, true)}`,
  ].join('\n');
  return `<h2>Детали операции</h2><div class="card sheet-summary">
    <div class="summary-line"><span>Операция</span><b>${escapeHtml(orderTitle(order))}</b></div>
    <div class="summary-line"><span>Сумма</span><b>${formatMoney(order.amount, order.currency)}</b></div>
    <div class="summary-line"><span>Статус</span><b class="order-status ${escapeHtml(order.status)}">${escapeHtml(orderStatus(order.status))}</b></div>
    <div class="summary-line"><span>Дата</span><b>${escapeHtml(formatDate(order.created_at, true))}</b></div>
    ${order.snapshot?.recipient_name ? `<div class="summary-line"><span>Получатель</span><b>${escapeHtml(order.snapshot.recipient_name)}</b></div>` : ''}
  </div><button class="button button-dark button-block" data-action="copy-receipt" data-receipt="${encodeURIComponent(receipt)}" type="button">${icon('copy')}<span>Скопировать чек</span></button>`;
}

function serverStatusSheet(data) {
  return `<h2>Сервер и задержка</h2><p class="sheet-lead">${data.selection_supported ? 'Выберите доступный регион.' : 'Региональная настройка пока не поддерживается AdaptGroup, поэтому сервер выбирается автоматически.'}</p>
    <div class="card sheet-summary"><div class="summary-line"><span>Режим</span><b>Автоматический сервер</b></div><div class="summary-line"><span>AdaptGroup</span><b class="${data.online ? 'ok' : 'danger'}">${data.online ? `${data.latency_ms} мс` : 'Недоступен'}</b></div></div>`;
}

function planCheckout(plan) {
  const current = state.data.subscription;
  const upgrade = current && !current.is_expired;
  return `
    <h2>${escapeHtml(plan.name)}</h2>
    <p class="sheet-lead">${upgrade ? 'Смена тарифа: остаток текущего периода пересчитаем.' : 'Доступ активируется сразу после оплаты.'}</p>
    <div class="card sheet-summary">
      <div class="summary-line"><span>Срок</span><b>${formatCount(plan.duration_days, 'день', 'дня', 'дней')}</b></div>
      <div class="summary-line"><span>Устройства</span><b>${plan.max_devices}</b></div>
      <div class="summary-line"><span>Трафик</span><b>${Number(plan.traffic_limit_bytes || 0) > 0 ? formatBytes(plan.traffic_limit_bytes) : 'Без лимита'}</b></div>
      <div class="summary-line"><span>К оплате</span><b>${formatMoney(plan.price, plan.currency)}</b></div>
    </div>
    <button class="button button-dark button-block" data-action="gift-plan" data-plan="${escapeHtml(plan.uuid)}" style="margin-bottom:12px" type="button">
      ${icon('gift')}<span>Подарить этот тариф</span>
    </button>
    <h3>Способ оплаты</h3>
    ${paymentOptions('purchase', plan.uuid, '', Number(plan.price))}`;
}

const RENEW_PRESETS = [7, 30, 90, 180];

function renewCheckout() {
  const subscription = state.data.subscription;
  if (!subscription) return toast('Нет активной подписки', 'error');
  const plan = (state.data.plans || []).find(item => item.uuid === subscription.plan_uuid);
  return `
    <h2>Продление</h2>
    <p class="sheet-lead">Выберите срок — цена считается по вашему тарифу «${escapeHtml(subscription.plan_name || '')}».</p>
    ${plan ? `<button class="button button-primary button-block" data-action="renew-standard" type="button">
      ${icon('refresh')}<span>Стандартный период · ${formatMoney(plan.price, plan.currency)}</span>
    </button>
    <button class="button button-dark button-block" data-action="quick-renew" style="margin-top:10px" type="button">
      ${icon('wallet')}<span>Быстро через ${escapeHtml((PAYMENT_METHODS.find(item => item.id === state.data.user.preferred_payment_method) || PAYMENT_METHODS[1]).label)}</span>
    </button>
    <h3>Или свой срок</h3>` : ''}
    <div class="renew-presets">${RENEW_PRESETS.map(days => `
      <button class="renew-preset${days === 30 ? ' active' : ''}" data-renew-preset="${days}" type="button">${days} д</button>`).join('')}</div>
    <div class="renew-picker">
      <button class="renew-step" data-renew-step="-1" type="button" aria-label="Меньше">−</button>
      <label class="renew-days-box"><input id="renewDays" type="number" min="3" max="365" value="30" inputmode="numeric"><span>дней</span></label>
      <button class="renew-step" data-renew-step="1" type="button" aria-label="Больше">+</button>
    </div>
    <div class="card sheet-summary renew-total">
      <div class="summary-line"><span>Продлим до</span><b id="renewUntil">—</b></div>
      <div class="summary-line"><span>Ориентировочно</span><b id="renewPrice">—</b></div>
    </div>
    <h3>Способ оплаты</h3>
    ${paymentOptions('renew-custom', '', 30)}
    <p class="field-hint">Точную сумму подтвердит платёжная система до списания.</p>`;
}

function dailyRate() {
  const subscription = state.data.subscription;
  const plan = (state.data.plans || []).find(item => item.uuid === subscription?.plan_uuid);
  if (!plan) return null;
  return Number(plan.price) / Math.max(1, Number(plan.duration_days || 1));
}

function updateRenewDays(value) {
  const input = document.getElementById('renewDays');
  if (!input) return;
  const days = clamp(Math.round(Number(value) || 30), 3, 365);
  input.value = String(days);
  sheetContent.querySelectorAll('[data-renew-preset]').forEach(node => {
    node.classList.toggle('active', Number(node.dataset.renewPreset) === days);
  });
  sheetContent.querySelectorAll('[data-pay]').forEach(node => { node.dataset.days = String(days); });

  const base = toDate(state.data.subscription?.expires_at);
  const from = base && base.getTime() > Date.now() ? base : new Date();
  const until = document.getElementById('renewUntil');
  if (until) until.textContent = formatDate(new Date(from.getTime() + days * 86400000));
  const price = document.getElementById('renewPrice');
  const rate = dailyRate();
  if (price) price.textContent = rate != null ? formatMoney((rate * days).toFixed(2), state.data.config.currency) : '—';
}

function topupSheet() {
  const { min_topup: min, max_topup: max, currency } = state.data.config;
  return `
    <h2>Пополнение</h2>
    <p class="sheet-lead">Баланс можно тратить на любой тариф и продление. От ${formatMoney(min, currency)} до ${formatMoney(max, currency)}.</p>
    <div class="renew-presets">${[300, 600, 1200, 3000].map(amount => `
      <button class="renew-preset" data-topup-preset="${amount}" type="button">${amount}</button>`).join('')}</div>
    <div class="field" style="margin-bottom:16px">
      <label for="topupAmount">Сумма</label>
      <input class="input" id="topupAmount" type="number" min="${min}" max="${max}" value="600" inputmode="decimal">
    </div>
    <h3>Способ оплаты</h3>
    <div class="payment-grid">${PAYMENT_METHODS.filter(method => method.id !== 'balance').map(method => `
      <button class="payment-option" data-topup="${method.id}" type="button">
        ${icon(method.icon)}<b>${escapeHtml(method.label)}</b><small>${escapeHtml(method.hint)}</small>
      </button>`).join('')}</div>`;
}

function promoSheet() {
  return `
    <h2>Промокод</h2>
    <p class="sheet-lead">Сумма промокода зачислится на баланс мгновенно.</p>
    <div class="field" style="margin-bottom:16px">
      <label for="promoCode">Код</label>
      <input class="input" id="promoCode" type="text" autocapitalize="characters" autocomplete="off" placeholder="MISTER2026">
    </div>
    <button class="button button-primary button-block" data-action="apply-promo" type="button">${icon('check')}<span>Активировать</span></button>`;
}

function confirmFreeze() {
  const frozen = state.data.subscription?.is_frozen;
  return `
    <h2>${frozen ? 'Разморозить подписку?' : 'Заморозить подписку?'}</h2>
    <p class="sheet-lead">${frozen
      ? 'Отсчёт дней возобновится, доступ включится сразу.'
      : 'Дни перестанут расходоваться, но подключения будут отключены до разморозки.'}</p>
    <button class="button ${frozen ? 'button-primary' : 'button-danger'} button-block" data-action="confirm-freeze" type="button">
      ${icon('snow')}<span>${frozen ? 'Разморозить' : 'Заморозить'}</span>
    </button>`;
}

function ordersSheet() {
  const orders = state.data.orders || [];
  return `
    <h2>История платежей</h2>
    ${orders.length ? `<div class="card order-list stagger">${orders.map(renderOrder).join('')}</div>`
      : '<p class="sheet-lead">Платежей пока не было.</p>'}`;
}

/* ── Payments ─────────────────────────────────────────────────────────────── */
async function performPayment(kind, planUuid, method, days = '', trigger = null) {
  if (state.busy) return;
  state.busy = true;
  setBusy(trigger, true);
  try {
    await rememberPaymentMethod(method);
    let result;
    if (kind === 'purchase') result = await post('/orders/purchase', { plan_uuid: planUuid, payment_method: method });
    else if (kind === 'renew') result = await post('/orders/renew', { payment_method: method });
    else if (kind === 'renew-custom') result = await post('/orders/renew/custom', { days: clamp(Math.round(Number(days) || 30), 3, 365), payment_method: method });
    else throw new Error('Неизвестная операция');

    if (result.needs_topup) {
      notify('warning');
      openSheet(`<h2>Не хватает на балансе</h2>
        <p class="sheet-lead">${escapeHtml(result.message || 'Пополните баланс и повторите оплату.')}</p>
        <div class="card sheet-summary"><div class="summary-line"><span>Нужно</span><b class="danger">${formatMoney(result.amount, state.data.config.currency)}</b></div></div>
        <button class="button button-primary button-block" data-action="topup" type="button">${icon('plus')}<span>Пополнить баланс</span></button>`);
      return;
    }
    if (result.completed) {
      closeSheet();
      showSuccessMoment(kind === 'purchase' ? 'Доступ активирован' : 'Подписка продлена', 'Защита готова к работе');
      await loadBootstrap({ quiet: true });
      return;
    }
    awaitPaymentSheet(result, {
      title: kind === 'purchase' ? 'Доступ активирован' : 'Подписка продлена',
      detail: 'Оплата подтверждена',
    });
  } catch (error) {
    notify('error');
    toast(toastMessage(error), 'error');
  } finally {
    state.busy = false;
    setBusy(trigger, false);
  }
}

async function performGiftPayment(planUuid, method, trigger = null) {
  if (state.busy) return;
  const recipient = document.getElementById('giftRecipient')?.value.trim();
  if (!recipient) return toast('Укажите получателя', 'error');
  state.busy = true;
  setBusy(trigger, true);
  try {
    await rememberPaymentMethod(method);
    const result = await post('/orders/gift', { plan_uuid: planUuid, recipient, payment_method: method });
    if (result.needs_topup) {
      notify('warning');
      return toast(result.message || 'Пополните баланс и повторите оплату', 'error');
    }
    if (result.completed) {
      closeSheet();
      showSuccessMoment('Подарок отправлен', 'Подписка будет активирована у получателя');
      await loadBootstrap({ quiet: true });
      return;
    }
    awaitPaymentSheet(result, { title: 'Подарок отправлен', detail: 'После оплаты доступ активируется у получателя' });
  } catch (error) {
    notify('error');
    toast(toastMessage(error), 'error');
  } finally {
    state.busy = false;
    setBusy(trigger, false);
  }
}

async function rememberPaymentMethod(method) {
  if (!method || method === state.data.user.preferred_payment_method) return;
  state.data.user.preferred_payment_method = method;
  try { await post('/preferences/payment', { payment_method: method }); } catch (_) {}
}

/* Waiting screen + auto-polling: the user pays in an external window, we watch
 * the order and close ourselves the moment it lands. */
function awaitPaymentSheet(result, success = {}) {
  if (result.confirmation_url) openExternal(result.confirmation_url);
  openSheet(`
    <h2>Ждём оплату</h2>
    <p class="sheet-lead">${escapeHtml(result.message || 'Завершите оплату в открывшемся окне — статус обновится автоматически.')}</p>
    <div class="card sheet-summary">
      <div class="summary-line"><span>Заказ</span><b>${escapeHtml(String(result.order_uuid).slice(0, 8))}</b></div>
      <div class="summary-line"><span>Статус</span><b id="payStatus">проверяем…</b></div>
    </div>
    ${result.confirmation_url ? `<button class="button button-dark button-block" data-action="reopen-payment" data-url="${escapeHtml(result.confirmation_url)}" style="margin-bottom:10px" type="button">
      ${icon('card')}<span>Открыть окно оплаты</span></button>` : ''}
    <button class="button button-primary button-block" data-action="check-order" data-uuid="${escapeHtml(result.order_uuid)}" type="button">
      ${icon('refresh')}<span>Проверить сейчас</span>
    </button>`);
  startPaymentPoll(result.order_uuid, success);
}

function startPaymentPoll(uuid, success = {}) {
  stopPaymentPoll();
  let attempts = 0;
  paymentPoll = setInterval(async () => {
    attempts += 1;
    if (attempts > 40 || !sheetIsOpen()) { stopPaymentPoll(); return; }
    try {
      const result = await api(`/orders/${uuid}/check`, { method: 'POST' });
      const node = document.getElementById('payStatus');
      if (node) node.textContent = orderStatus(result.status).toLowerCase();
      if (result.status === 'completed') {
        stopPaymentPoll();
        closeSheet();
        showSuccessMoment(success.title || 'Оплата подтверждена', success.detail || 'Операция успешно завершена');
        await loadBootstrap({ quiet: true });
      } else if (['failed', 'cancelled'].includes(result.status)) {
        stopPaymentPoll();
        notify('error');
        toast(result.message || 'Платёж не прошёл', 'error');
      }
    } catch (_) { /* transient network hiccup — keep polling */ }
  }, 3000);
}

function stopPaymentPoll() {
  if (paymentPoll) { clearInterval(paymentPoll); paymentPoll = null; }
}

async function checkOrder(uuid, trigger = null) {
  trigger?.classList.add('is-spinning');
  try {
    const result = await api(`/orders/${uuid}/check`, { method: 'POST' });
    if (result.status === 'completed') {
      closeSheet();
      showSuccessMoment('Оплата подтверждена', result.message || 'Операция успешно завершена');
      await loadBootstrap({ quiet: true });
    } else {
      toast(result.message || orderStatus(result.status));
    }
  } catch (error) {
    toast(toastMessage(error), 'error');
  } finally {
    trigger?.classList.remove('is-spinning');
  }
}

/* ── Admin shell ──────────────────────────────────────────────────────────── */
const ADMIN_TABS = [
  { id: 'pulse', label: 'Очередь', scope: 'overview' },
  { id: 'tasks', label: 'Задачи', scope: 'overview' },
  { id: 'users', label: 'Люди', scope: 'users:read' },
  { id: 'orders', label: 'Заказы', scope: 'orders:read' },
  { id: 'plans', label: 'Продажи', scopes: ['orders:finance', 'promos'] },
  { id: 'tools', label: 'Связь', scope: 'marketing' },
  { id: 'campaigns', label: 'Кампании', scope: 'campaigns' },
  { id: 'audit', label: 'Аудит', scope: 'overview' },
  { id: 'system', label: 'Система', scope: 'overview' },
];

function hasAdminScope(scope) {
  const scopes = state.data?.user?.admin_scopes || [];
  return scopes.includes('*') || scopes.includes(scope);
}

function visibleAdminTabs() {
  return ADMIN_TABS.filter(tab => tab.scope ? hasAdminScope(tab.scope) : tab.scopes.some(hasAdminScope));
}

function renderAdmin() {
  if (state.admin.selectedUser) return renderAdminUserCard();
  const tabs = visibleAdminTabs();
  return `
    <div class="screen-head">
      <p class="eyebrow">CONTROL ROOM</p>
      <h1>${escapeHtml(ADMIN_TABS.find(tab => tab.id === state.adminTab)?.label || 'Панель')}</h1>
    </div>
    <div class="admin-global-search search-box">
      ${ICONS.search}
      <input class="input" id="adminGlobalSearch" type="search" placeholder="ID, @username, заказ, подписка, платёж" autocomplete="off">
      <div class="admin-search-results" id="adminSearchResults"></div>
    </div>
    <div class="admin-tabs">${tabs.map(tab => `
      <button class="admin-tab${state.adminTab === tab.id ? ' active' : ''}" data-admin-tab="${tab.id}" type="button">${escapeHtml(tab.label)}</button>`).join('')}</div>
    ${renderAdminContent()}`;
}

function renderAdminContent() {
  return {
    pulse: renderAdminPulse,
    tasks: renderAdminTasks,
    users: renderAdminUsers,
    orders: renderAdminOrders,
    plans: renderAdminPlans,
    tools: renderAdminTools,
    campaigns: renderAdminCampaigns,
    audit: renderAdminAudit,
    system: renderAdminSystem,
  }[state.adminTab]();
}

function renderAdminTasks() {
  const tasks = state.admin.tasks;
  if (!tasks) return adminSkeleton(4);
  return `<div class="section-title"><h2>Открытые задачи</h2><button class="button button-ghost" data-action="admin-refresh" type="button">${icon('refresh')}<span>Обновить</span></button></div>
    ${tasks.length ? `<div class="card order-list stagger">${tasks.map(task => `<div class="setting-row">
      <span class="icon-box ${task.priority === 'high' ? 'danger' : 'warning'}">${icon('activity')}</span>
      <div class="setting-copy"><b>${escapeHtml(task.title)}</b><small>${escapeHtml(task.type)} · ${escapeHtml(formatDate(task.created_at, true))}</small></div>
      <button class="row-action" data-action="admin-task-resolve" data-uuid="${escapeHtml(task.uuid)}" type="button" aria-label="Закрыть задачу">${icon('check')}</button>
    </div>`).join('')}</div>` : `<div class="card empty-state"><div class="icon-box ok">${icon('check')}</div><h3>Очередь пуста</h3><p>Открытых задач нет.</p></div>`}`;
}

function renderAdminCampaigns() {
  const campaigns = state.admin.campaigns;
  if (!campaigns) return adminSkeleton(4);
  return `<div class="section-title"><h2>Кампании</h2><button class="button button-ghost" data-action="admin-refresh" type="button">${icon('refresh')}<span>Обновить</span></button></div>
    ${campaigns.length ? `<div class="card order-list stagger">${campaigns.map(item => `<div class="setting-row">
      <span class="icon-box ${item.status === 'active' ? 'ok' : ''}">${icon('send')}</span>
      <div class="setting-copy"><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.audience)} · ${escapeHtml(item.status)}${item.schedule_at ? ` · ${escapeHtml(formatDate(item.schedule_at, true))}` : ''}</small></div>
      <button class="switch${item.status === 'active' || item.status === 'scheduled' ? ' on' : ''}" data-action="admin-campaign-toggle" data-uuid="${escapeHtml(item.uuid)}" data-enabled="${item.status === 'active' || item.status === 'scheduled' ? '1' : '0'}" type="button" role="switch" aria-label="Кампания активна"><i></i></button>
    </div>`).join('')}</div>` : `<div class="card empty-state"><div class="icon-box">${icon('send')}</div><h3>Кампаний нет</h3><p>Создайте кампанию через API или подключите форму рассылки.</p></div>`}`;
}

function renderAdminAudit() {
  const items = state.admin.audit;
  if (!items) return adminSkeleton(5);
  return `<div class="section-title"><h2>Журнал действий</h2><button class="button button-ghost" data-action="admin-refresh" type="button">${icon('refresh')}<span>Обновить</span></button></div>
    ${items.length ? `<div class="card order-list stagger">${items.map(item => `<div class="setting-row"><span class="icon-box">${icon('activity')}</span><div class="setting-copy"><b>${escapeHtml(item.summary)}</b><small>${escapeHtml(item.action)} · ${escapeHtml(formatDate(item.created_at, true))} · #${item.admin_user_id || 'system'}</small></div></div>`).join('')}</div>` : `<div class="card empty-state"><h3>Журнал пуст</h3></div>`}`;
}

function renderAdminSystem() {
  const health = state.admin.health;
  return `<div class="section-title"><h2>Состояние сервисов</h2><button class="button button-primary" data-action="admin-refresh" type="button">${icon('refresh')}<span>Проверить</span></button></div>
    ${health ? `<div class="card card-pad">${Object.entries(health).filter(([key]) => ['database', 'telegram', 'adaptgroup', 'workers'].includes(key)).map(([key, value]) => {
      const online = value.online !== false;
      return `<div class="summary-line"><span>${escapeHtml(key)}</span><b class="${online ? 'ok' : 'danger'}">${online ? 'online' : 'offline'}${value.latency_ms != null ? ` · ${value.latency_ms} мс` : ''}</b></div>`;
    }).join('')}</div>` : adminSkeleton(4)}
    <p class="section-label">Экспорт</p><div class="button-row">
      ${['users', 'orders', 'promos'].map(entity => `<button class="button button-dark" data-action="admin-export" data-entity="${entity}" type="button">${icon('download')}<span>${entity === 'users' ? 'Люди' : entity === 'orders' ? 'Заказы' : 'Промокоды'}</span></button>`).join('')}
    </div>`;
}

function renderAdminSearchResults(result = state.admin.search) {
  if (!result) return '';
  const users = result.users || [];
  const orders = result.orders || [];
  const subscriptions = result.subscriptions || [];
  if (!users.length && !orders.length && !subscriptions.length) {
    return '<div class="admin-search-empty">Ничего не найдено</div>';
  }
  return `<div class="admin-search-panel">
    ${users.map(user => `<button data-admin-user="${user.id}" type="button"><b>${escapeHtml(user.first_name || `ID ${user.telegram_id}`)}</b><small>${user.username ? `@${escapeHtml(user.username)}` : `TG ${user.telegram_id}`}</small></button>`).join('')}
    ${orders.map(order => `<button data-admin-order="${escapeHtml(order.uuid)}" type="button"><b>Заказ ${escapeHtml(String(order.uuid).slice(0, 8))}</b><small>${escapeHtml(orderStatus(order.status))} · ${formatMoney(order.amount, order.currency)}</small></button>`).join('')}
    ${subscriptions.map(sub => `<button data-admin-user="${sub.user_id}" type="button"><b>${escapeHtml(sub.plan_name || 'Подписка')}</b><small>${escapeHtml(String(sub.uuid || '').slice(0, 12))} · до ${escapeHtml(formatDate(sub.expires_at))}</small></button>`).join('')}
  </div>`;
}

function adminSkeleton(rows = 4) {
  return `<div class="card" style="padding:16px;display:grid;gap:10px">
    ${Array.from({ length: rows }, () => '<div class="skeleton" style="height:52px"></div>').join('')}
  </div>`;
}

/* ── Admin · pulse ────────────────────────────────────────────────────────── */
function renderAdminPulse() {
  const overview = state.admin.overview;
  if (!overview) return adminSkeleton(5);
  const { pulse, metrics, series, top_plans: topPlans, recent_orders: recentOrders, attention } = overview;
  const currency = state.data.config.currency;

  return `
    <div class="card pulse-card${pulse.online ? '' : ' is-down'}">
      <div class="pulse-head">
        <div>
          <p class="eyebrow">${pulse.online ? 'SYSTEM ONLINE' : 'SYSTEM DOWN'}</p>
          <h2>${pulse.online ? 'Панель отвечает' : 'Нет связи с панелью'}</h2>
        </div>
        <span class="icon-box ${pulse.online ? 'ok' : 'danger'}">${icon('activity')}</span>
      </div>
      <div class="pulse-wave">
        <svg viewBox="0 0 300 48" preserveAspectRatio="none"><path d="M0 24 40 24 52 8 64 40 76 24 120 24 132 14 144 34 156 24 200 24 212 10 224 38 236 24 300 24"/></svg>
      </div>
      <div class="summary-line"><span>Отклик</span><b>${pulse.latency_ms != null ? `${pulse.latency_ms} мс` : '—'}</b></div>
      ${pulse.message ? `<p class="field-hint">${escapeHtml(pulse.message)}</p>` : ''}
    </div>

    ${renderAdminAttention(attention)}

    ${adminChartCard(series, currency)}

    <p class="section-label">Показатели</p>
    <div class="metric-grid stagger">
      ${metric('Пользователей', metrics.users)}
      ${metric('Новых за 24 ч', metrics.new_users_24h)}
      ${metric('Активных подписок', metrics.active_subscriptions)}
      ${metric('Истекают за 7 дней', metrics.expiring_7d, metrics.expiring_7d > 0)}
      ${metric('Выручка 24 ч', metrics.revenue_24h, false, currency)}
      ${metric('Выручка 30 дней', metrics.revenue_30d, false, currency)}
      ${metric('Средний чек', metrics.average_check, false, currency)}
      ${metric('Оплат за 30 дней', metrics.paid_orders_30d)}
      ${metric('Заказов в ожидании', metrics.pending_orders, metrics.pending_orders > 0)}
      ${metric('Ручная проверка', metrics.manual_review, metrics.manual_review > 0)}
      ${metric('Заморожено', metrics.frozen_subscriptions)}
      ${metric('Заблокировано', metrics.blocked_users, metrics.blocked_users > 0)}
      ${metric('Активных промокодов', metrics.active_promos)}
      ${metric('Всего заказов', metrics.orders)}
    </div>

    ${topPlans?.length ? `<p class="section-label">Топ тарифов</p>
    <div class="card">${(() => {
      const max = Math.max(...topPlans.map(item => Number(item.count) || 0), 1);
      return topPlans.map(item => `<div class="top-plan-row">
        <b>${escapeHtml(item.name)}</b>
        <span class="top-plan-bar"><i style="width:${clamp((Number(item.count) / max) * 100, 4, 100)}%"></i></span>
        <span>${item.count}</span>
      </div>`).join('');
    })()}</div>` : ''}

    ${recentOrders?.length ? `<p class="section-label">Свежие заказы</p>
    <div class="card order-list stagger">${recentOrders.map(renderOrder).join('')}</div>` : ''}`;
}

function renderAdminAttention(attention) {
  const failedOrders = attention?.failed_orders || [];
  const expiringUsers = attention?.expiring_users || [];
  if (!failedOrders.length && !expiringUsers.length) {
    return `<div class="card attention-clear section">
      <span class="icon-box ok">${icon('check')}</span>
      <div><b>Очередь внимания пуста</b><small>Нет ошибок выдачи и срочно истекающих подписок.</small></div>
    </div>`;
  }
  return `<div class="section">
    <div class="section-title"><h2>Требует внимания</h2><button data-admin-tab="orders" type="button">Все заказы</button></div>
    <div class="attention-grid">
      ${failedOrders.map(order => `<button class="card attention-card danger" data-admin-order="${escapeHtml(order.uuid)}" type="button">
        <span class="icon-box danger">${icon('ban')}</span>
        <span><small>Ошибка выдачи</small><b>${escapeHtml(orderTitle(order))}</b><em>${escapeHtml(order.owner?.first_name || `ID ${order.owner?.telegram_id || '—'}`)}</em></span>
      </button>`).join('')}
      ${expiringUsers.map(user => `<button class="card attention-card warning" data-admin-user="${user.id}" type="button">
        <span class="icon-box warning">${icon('clock')}</span>
        <span><small>Истекает подписка</small><b>${escapeHtml(user.first_name || `ID ${user.telegram_id}`)}</b><em>${formatCount(user.subscription?.days_left || 0, 'день', 'дня', 'дней')}</em></span>
      </button>`).join('')}
    </div>
  </div>`;
}

function metric(label, value, alert = false, currency = null) {
  const numeric = Number(value || 0);
  const text = currency ? formatMoney(numeric, currency) : numeric.toLocaleString('ru-RU');
  return `<div class="card metric${alert ? ' is-alert' : ''}">
    <small>${escapeHtml(label)}</small>
    <b data-count="${numeric}"${currency ? ` data-count-currency="${escapeHtml(currency)}"` : ''}>${text}</b>
  </div>`;
}

function adminChartCard(series, currency) {
  if (!series?.labels?.length) return '';
  const showRevenue = state.adminChart === 'revenue';
  const values = (showRevenue ? series.revenue : series.signups).map(value => Number(value) || 0);
  const max = Math.max(...values, 1);
  const total = values.reduce((sum, value) => sum + value, 0);
  const axis = index => formatDate(series.labels[index]) || series.labels[index];
  return `<div class="card chart-card section">
    <div class="chart-head">
      <b>${showRevenue ? 'Выручка' : 'Регистрации'} · ${showRevenue ? formatMoney(total, currency) : total}</b>
      <small><button class="admin-tab" data-admin-chart="${showRevenue ? 'signups' : 'revenue'}" style="min-height:30px;padding:0 10px" type="button">${showRevenue ? 'Регистрации' : 'Выручка'}</button></small>
    </div>
    <div class="chart">${values.map((value, index) => `
      <div class="chart-bar" title="${escapeHtml(axis(index))}: ${showRevenue ? formatMoney(value, currency) : value}">
        <i style="height:${clamp((value / max) * 100, 2, 100)}%;animation-delay:${Math.min(index * 22, 400)}ms"></i>
      </div>`).join('')}</div>
    <div class="chart-axis"><span>${escapeHtml(axis(0))}</span><span>${escapeHtml(axis(series.labels.length - 1))}</span></div>
  </div>`;
}

/* ── Admin · users ────────────────────────────────────────────────────────── */
const USER_SEGMENTS = [
  { id: 'all', label: 'Все' },
  { id: 'active', label: 'С подпиской' },
  { id: 'expiring', label: 'Истекают' },
  { id: 'no_subscription', label: 'Без активной' },
  { id: 'blocked', label: 'Заблокированы' },
];

function renderAdminUsers() {
  const users = state.admin.users;
  const meta = state.admin.usersMeta;
  return `
    <div class="search-box">
      ${ICONS.search}
      <input class="input" id="adminSearch" type="search" placeholder="ID, username или имя" value="${escapeHtml(state.adminUserQuery)}" autocomplete="off">
    </div>
    <div class="chip-row">${USER_SEGMENTS.map(segment => `
      <button class="chip${state.adminUserSegment === segment.id ? ' active' : ''}" data-user-segment="${segment.id}" type="button">${escapeHtml(segment.label)}</button>`).join('')}</div>
    ${users == null ? adminSkeleton(5) : users.length ? `
      <div class="card user-list stagger">${users.map(renderAdminUserRow).join('')}</div>`
      : `<div class="card empty-state">
        <div class="icon-box">${icon('users')}</div>
        <h3>Никого не нашли</h3>
        <p>Измените запрос или выберите другой сегмент.</p>
      </div>`}
    ${meta.hasMore ? `<button class="button button-ghost button-block section" data-action="admin-users-more" type="button">${icon('plus')}<span>Показать ещё · ${Math.max(meta.total - users.length, 0)}</span></button>` : ''}`;
}

function renderAdminUserRow(user) {
  const name = user.first_name || `ID ${user.telegram_id}`;
  const daysLeft = user.subscription?.days_left;
  return `<div class="setting-row user-row" data-admin-user="${user.id}">
    <div class="profile-avatar">${escapeHtml((user.first_name || 'U').slice(0, 1).toUpperCase())}</div>
    <div class="setting-copy">
      <b>${escapeHtml(name)}</b>
      <small>${user.username ? `@${escapeHtml(user.username)}` : `ID ${escapeHtml(String(user.telegram_id))}`}
        ${user.is_blocked ? ' · <span class="blocked-label">блок</span>' : ''}
        ${daysLeft != null && daysLeft <= 7 && !user.is_blocked ? ` · <span class="expiring-label">${daysLeft} д</span>` : ''}</small>
    </div>
    <div class="user-side">
      <b>${formatMoney(user.balance, state.data.config.currency)}</b>
      <small>${escapeHtml(user.subscription?.plan_name || 'без тарифа')}</small>
    </div>
  </div>`;
}

function renderAdminUserCard() {
  const card = state.admin.selectedUser;
  const user = card.user;
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || `ID ${user.telegram_id}`;
  const active = (card.subscriptions || [])[0];
  const currency = state.data.config.currency;

  return `
    <div class="screen-head">
      <button class="button button-ghost" data-action="admin-back" style="min-height:40px;padding:0 14px;margin-bottom:16px" type="button">
        ${icon('arrowLeft')}<span>К списку</span>
      </button>
      <p class="eyebrow">ID ${escapeHtml(String(user.telegram_id))}</p>
      <h1>${escapeHtml(name)}</h1>
      <p>${user.username ? `@${escapeHtml(user.username)} · ` : ''}Регистрация ${escapeHtml(formatDate(user.created_at))}</p>
    </div>

    <div class="metric-grid">
      ${metric('Баланс', user.balance, false, currency)}
      ${metric('Заказов', (card.orders || []).length)}
      ${metric('Потрачено', card.summary?.spent || 0, false, currency)}
      ${metric('Оплачено', card.summary?.paid_orders || 0)}
      ${metric('Продлений', card.summary?.renewals || 0)}
      ${metric('Устройств', card.summary?.device_count || 0)}
    </div>

    ${user.note || (user.tags || []).length ? `<div class="card card-pad section"><b>Заметка администратора</b>${user.note ? `<p>${escapeHtml(user.note)}</p>` : ''}${(user.tags || []).length ? `<div class="chip-row">${user.tags.map(tag => `<span class="mini-chip">#${escapeHtml(tag)}</span>`).join('')}</div>` : ''}</div>` : ''}

    ${active ? `<div class="card card-pad section">
      <div class="summary-line"><span>Тариф</span><b>${escapeHtml(active.plan_name || '—')}</b></div>
      <div class="summary-line"><span>Действует до</span><b>${escapeHtml(formatDate(active.expires_at))}</b></div>
      <div class="summary-line"><span>Осталось</span><b class="${Number(active.days_left) <= 7 ? 'danger' : 'ok'}">${formatCount(Math.max(0, Number(active.days_left || 0)), 'день', 'дня', 'дней')}</b></div>
      <div class="summary-line"><span>Устройства</span><b>${active.device_count || 0} / ${active.max_devices || 0}</b></div>
      <div class="summary-line"><span>Статус</span><b>${active.is_frozen ? 'заморожена' : active.is_expired ? 'истекла' : 'активна'}</b></div>
    </div>` : `<div class="card empty-state section">
      <div class="icon-box warning">${icon('layers')}</div>
      <h3>Без подписки</h3>
      <p>Можно выдать тариф вручную.</p>
    </div>`}

    <p class="section-label">Действия</p>
    <div class="card menu-card">
      ${active ? `<button class="menu-row" data-action="admin-extend" type="button">
        <span class="icon-box">${icon('clock')}</span><b>Продлить подписку</b>${icon('chevron')}
      </button>
      <button class="menu-row" data-action="admin-freeze" type="button">
        <span class="icon-box">${icon('snow')}</span><b>${active.is_frozen ? 'Разморозить' : 'Заморозить'}</b>${icon('chevron')}
      </button>` : ''}
      <button class="menu-row" data-action="admin-grant" type="button">
        <span class="icon-box ok">${icon('gift')}</span><b>Выдать тариф</b>${icon('chevron')}
      </button>
      <button class="menu-row" data-action="admin-balance" type="button">
        <span class="icon-box">${icon('wallet')}</span><b>Изменить баланс</b>${icon('chevron')}
      </button>
      <button class="menu-row" data-action="admin-message" type="button">
        <span class="icon-box">${icon('message')}</span><b>Написать в бот</b>${icon('chevron')}
      </button>
      <button class="menu-row" data-action="admin-block" type="button">
        <span class="icon-box ${user.is_blocked ? 'ok' : 'danger'}">${icon('ban')}</span><b>${user.is_blocked ? 'Разблокировать' : 'Заблокировать'}</b>${icon('chevron')}
      </button>
    </div>

    ${(card.orders || []).length ? `<p class="section-label">Заказы</p>
    <div class="card order-list stagger">${card.orders.slice(0, 10).map(renderOrder).join('')}</div>` : ''}`;
}

/* ── Admin · orders ───────────────────────────────────────────────────────── */
const ORDER_FILTERS = ['all', 'pending', 'paid', 'provisioning', 'completed', 'failed', 'cancelled'];

function renderAdminOrders() {
  const orders = state.admin.orders;
  const meta = state.admin.ordersMeta;
  return `
    <div class="chip-row">${ORDER_FILTERS.map(status => `
      <button class="chip${state.adminOrderStatus === status ? ' active' : ''}" data-order-status="${status}" type="button">${escapeHtml(status === 'all' ? 'Все' : orderStatus(status))}</button>`).join('')}</div>
    ${orders == null ? adminSkeleton(5) : orders.length ? `
      <div class="card order-list stagger">${orders.map(renderAdminOrderRow).join('')}</div>
      ${meta.hasMore ? `<button class="button button-ghost button-block section" data-action="admin-orders-more" type="button">${icon('plus')}<span>Показать ещё · ${Math.max(meta.total - orders.length, 0)}</span></button>` : ''}`
      : `<div class="card empty-state">
        <div class="icon-box">${icon('orders')}</div>
        <h3>Заказов нет</h3>
        <p>В этом статусе пока пусто.</p>
      </div>`}`;
}

function renderAdminOrderRow(order) {
  const owner = order.owner || {};
  const name = [owner.first_name, owner.username && `@${owner.username}`].filter(Boolean).join(' · ') || `ID ${owner.telegram_id || '—'}`;
  const retryable = ['paid', 'failed', 'provisioning'].includes(order.status);
  return `<div class="setting-row order-row is-clickable" data-admin-order="${escapeHtml(order.uuid)}">
    <span class="icon-box${order.status === 'completed' ? ' ok' : order.status === 'failed' ? ' danger' : ' warning'}">${icon('orders')}</span>
    <div class="setting-copy">
      <b><span>${escapeHtml(orderTitle(order))}</span><span>${formatMoney(order.amount, order.currency)}</span></b>
      <small><span class="order-status ${escapeHtml(order.status)}">${escapeHtml(orderStatus(order.status))}</span> · ${escapeHtml(name)}</small>
      <div class="device-meta"><span class="mini-chip">${escapeHtml(formatDate(order.created_at, true))}</span><span class="mini-chip">${escapeHtml(String(order.uuid).slice(0, 8))}</span></div>
    </div>
    ${retryable ? `<button class="row-action" data-action="admin-retry" data-uuid="${escapeHtml(order.uuid)}" type="button" aria-label="Повторить выдачу">${icon('refresh')}</button>` : icon('chevron')}
  </div>`;
}

function adminOrderSheet(order) {
  const owner = order.owner || {};
  const retryable = ['paid', 'failed', 'provisioning'].includes(order.status);
  const snapshot = order.snapshot || {};
  return `<h2>Заказ ${escapeHtml(String(order.uuid).slice(0, 8))}</h2>
    <p class="sheet-lead">${escapeHtml(owner.first_name || owner.username || `ID ${owner.telegram_id || '—'}`)} · ${escapeHtml(formatDate(order.created_at, true))}</p>
    <div class="card sheet-summary">
      <div class="summary-line"><span>Статус</span><b class="order-status ${escapeHtml(order.status)}">${escapeHtml(orderStatus(order.status))}</b></div>
      <div class="summary-line"><span>Операция</span><b>${escapeHtml(orderTitle(order))}</b></div>
      <div class="summary-line"><span>Сумма</span><b>${formatMoney(order.amount, order.currency)}</b></div>
      <div class="summary-line"><span>Тариф</span><b>${escapeHtml(snapshot.plan_name || '—')}</b></div>
      <div class="summary-line"><span>Оплата</span><b>${escapeHtml(snapshot.payment_method ? paymentMethodLabel(snapshot.payment_method) : order.payment_provider || '—')}</b></div>
      <div class="summary-line"><span>Payment ID</span><b class="mono-value">${escapeHtml(order.payment_id || '—')}</b></div>
      <div class="summary-line"><span>Подписка</span><b class="mono-value">${escapeHtml(order.subscription_uuid || '—')}</b></div>
    </div>
    ${order.error ? `<div class="admin-error-box"><b>Ошибка</b><p>${escapeHtml(order.error)}</p></div>` : ''}
    <div class="button-row" style="margin-top:16px">
      ${owner.id ? `<button class="button button-dark" data-action="admin-open-user" data-user-id="${owner.id}" type="button">${icon('user')}<span>Пользователь</span></button>` : ''}
      ${retryable ? `<button class="button button-primary" data-action="admin-retry" data-uuid="${escapeHtml(order.uuid)}" type="button">${icon('refresh')}<span>Повторить</span></button>` : ''}
    </div>`;
}

/* ── Admin · plans & promos ───────────────────────────────────────────────── */
function renderAdminPlans() {
  const plans = state.admin.plans;
  const promos = state.admin.promos;
  const currency = state.data.config.currency;

  return `
    <button class="button button-dark button-block" data-action="admin-sync-plans" type="button">
      ${icon('refresh')}<span>Синхронизировать с панелью</span>
    </button>
    ${plans == null ? adminSkeleton(4) : `<div class="card section" style="overflow:hidden">${plans.map(plan => `
      <div class="setting-row">
        <span class="icon-box${plan.is_public && plan.is_active ? ' ok' : ''}">${icon('layers')}</span>
        <div class="setting-copy">
          <b>${escapeHtml(plan.name)}</b>
          <small>${formatMoney(plan.price, plan.currency || currency)} · ${formatCount(plan.duration_days, 'день', 'дня', 'дней')} · ${plan.max_devices} устр.</small>
        </div>
        <button class="row-action" data-action="admin-plan-price" data-uuid="${escapeHtml(plan.uuid)}" type="button" aria-label="Изменить цену">${icon('edit')}</button>
        <button class="switch${plan.is_public ? ' on' : ''}" data-action="admin-plan-visibility" data-uuid="${escapeHtml(plan.uuid)}" data-enabled="${plan.is_public ? '1' : '0'}" type="button" role="switch" aria-checked="${Boolean(plan.is_public)}" aria-label="Видимость тарифа"><i></i></button>
      </div>`).join('')}</div>`}

    <p class="section-label">Промокоды</p>
    <button class="button button-ghost button-block" data-action="admin-new-promo" type="button">
      ${icon('plus')}<span>Создать промокод</span>
    </button>
    ${promos == null ? adminSkeleton(3) : promos.length ? `<div class="card section" style="overflow:hidden">${promos.map(promo => `
      <div class="setting-row">
        <span class="icon-box${promo.is_usable ? ' ok' : ' danger'}">${icon('tag')}</span>
        <div class="setting-copy">
          <b>${escapeHtml(promo.code)}</b>
          <small>${formatMoney(promo.amount, promo.currency || currency)} · использован ${promo.used_count}${promo.max_uses ? ` из ${promo.max_uses}` : ' раз'}${promo.expires_at ? ` · до ${escapeHtml(formatDate(promo.expires_at))}` : ''}</small>
        </div>
        <button class="row-action" data-action="admin-promo-edit" data-code="${escapeHtml(promo.code)}" type="button" aria-label="Изменить промокод">${icon('edit')}</button>
        <button class="switch${promo.is_active ? ' on' : ''}" data-action="admin-promo-toggle" data-code="${escapeHtml(promo.code)}" data-enabled="${promo.is_active ? '1' : '0'}" type="button" role="switch" aria-checked="${Boolean(promo.is_active)}" aria-label="Промокод активен"><i></i></button>
      </div>`).join('')}</div>` : `
      <div class="card empty-state">
        <div class="icon-box">${icon('tag')}</div>
        <h3>Промокодов нет</h3>
        <p>Создайте первый — сумма зачисляется на баланс.</p>
      </div>`}`;
}

/* ── Admin · broadcast ────────────────────────────────────────────────────── */
const AUDIENCES = [
  { id: 'all', label: 'Все пользователи' },
  { id: 'active', label: 'С активной подпиской' },
  { id: 'expiring', label: 'Истекают за 7 дней' },
  { id: 'no_subscription', label: 'Без активной' },
];

/* Held between the dry-run count and the confirmation tap. */
let pendingBroadcast = null;

function broadcastConfirmSheet(payload, recipients) {
  const label = AUDIENCES.find(item => item.id === payload.audience)?.label || payload.audience;
  const preview = payload.text.length > 400 ? `${payload.text.slice(0, 400)}…` : payload.text;
  return `
    <h2>Отправить рассылку?</h2>
    <p class="sheet-lead">Сообщение уйдёт ${formatCount(recipients, 'получателю', 'получателям', 'получателям')}
      — аудитория «${escapeHtml(label)}». Отменить отправку после старта нельзя.</p>
    <div class="broadcast-preview">${escapeHtml(preview)}</div>
    <button class="button button-primary button-block" data-action="broadcast-confirm" type="button">
      ${icon('send')}<span>Отправить</span>
    </button>`;
}

function renderAdminTools() {
  const progress = state.admin.broadcast;
  return `
    <div class="card card-pad">
      <div class="form-stack">
        <div class="field">
          <label for="broadcastAudience">Аудитория</label>
          <select class="select" id="broadcastAudience">${AUDIENCES.map(item => `
            <option value="${item.id}">${escapeHtml(item.label)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="broadcastText">Сообщение</label>
          <textarea class="textarea" id="broadcastText" maxlength="3500" placeholder="Поддерживается HTML-разметка Telegram"></textarea>
          <p class="field-hint">Отправка идёт в фоне с ограничением скорости, чтобы Telegram не отклонил рассылку.</p>
        </div>
        <div class="field"><label for="broadcastImage">Изображение</label><input class="input" id="broadcastImage" type="url" placeholder="https://..."></div>
        <div class="field"><label for="broadcastButtonText">Кнопка</label><input class="input" id="broadcastButtonText" maxlength="64" placeholder="Открыть Mini App"></div>
        <div class="field"><label for="broadcastButtonUrl">Ссылка кнопки</label><input class="input" id="broadcastButtonUrl" type="url" placeholder="https://..."></div>
        <div class="field"><label for="broadcastSchedule">Отложенная отправка</label><input class="input" id="broadcastSchedule" type="datetime-local"></div>
        <div class="field"><label for="broadcastTemplate">Имя шаблона</label><input class="input" id="broadcastTemplate" maxlength="100" placeholder="Необязательно"></div>
      </div>
      <div class="button-row" style="margin-top:16px">
        <button class="button button-dark" data-action="broadcast-count" type="button">${icon('users')}<span>Посчитать</span></button>
        <button class="button button-primary" data-action="broadcast-send" type="button">${icon('send')}<span>Отправить</span></button>
      </div>
      ${progress ? `<div class="broadcast-progress">
        <div class="progress"><i style="width:${progress.total ? clamp(((progress.sent + progress.failed) / progress.total) * 100, 2, 100) : 0}%"></i></div>
        <div class="broadcast-stats">
          <span>Доставлено <b>${progress.sent}</b></span>
          <span>Ошибок <b>${progress.failed}</b></span>
          <span>Всего <b>${progress.total}</b></span>
        </div>
        ${progress.done ? '<p class="field-hint">Рассылка завершена.</p>' : ''}
      </div>` : ''}
    </div>

    <p class="section-label">Быстрые сегменты</p>
    <div class="quick-grid stagger">
      ${AUDIENCES.map(item => `<button class="quick-action" data-audience="${item.id}" type="button">
        <span class="icon-box">${icon('users')}</span>
        <b>${escapeHtml(item.label)}</b><small>Подставить аудиторию</small>
      </button>`).join('')}
    </div>`;
}

/* ── Admin data ───────────────────────────────────────────────────────────── */
async function enterAdmin() {
  if (!state.data.user.is_admin) return;
  state.adminMode = true;
  state.admin.selectedUser = null;
  render();
  await loadAdminTab(state.adminTab);
}

async function loadAdminTab(tab, { quiet = false } = {}) {
  try {
    if (tab === 'pulse') state.admin.overview = await api('/admin/overview');
    else if (tab === 'tasks') state.admin.tasks = (await api('/admin/tasks')).items;
    else if (tab === 'users') await loadAdminUsers(state.adminUserQuery, { keep: quiet });
    else if (tab === 'orders') {
      const result = await api(`/admin/orders?status=${state.adminOrderStatus}&limit=30&offset=0`);
      state.admin.orders = result.items;
      state.admin.ordersMeta = { total: result.total, offset: result.items.length, hasMore: result.has_more };
    }
    else if (tab === 'plans') {
      const [plans, promos] = await Promise.all([api('/admin/plans'), api('/admin/promos')]);
      state.admin.plans = plans.items;
      state.admin.promos = promos.items;
    }
    else if (tab === 'campaigns') state.admin.campaigns = (await api('/admin/campaigns')).items;
    else if (tab === 'audit') state.admin.audit = (await api('/admin/audit')).items;
    else if (tab === 'system') state.admin.health = await api('/admin/health');
    if (!quiet) render();
  } catch (error) {
    toast(toastMessage(error), 'error');
  }
}

async function loadAdminUsers(query = '', { keep = false } = {}) {
  state.adminUserQuery = query;
  if (!keep) { state.admin.users = null; if (state.adminMode) render(); }
  const params = new URLSearchParams({ segment: state.adminUserSegment, limit: '40' });
  if (query.trim()) params.set('q', query.trim());
  try {
    const result = await api(`/admin/users?${params}`);
    state.admin.users = result.items;
    state.admin.usersMeta = { total: result.total, offset: result.items.length, hasMore: result.has_more };
  } catch (error) {
    state.admin.users = [];
    toast(toastMessage(error), 'error');
  }
  if (state.adminMode) render();
}

async function showAdminOrder(orderUuid) {
  try {
    const order = await api(`/admin/orders/${encodeURIComponent(orderUuid)}`);
    openSheet(adminOrderSheet(order));
  } catch (error) {
    toast(toastMessage(error), 'error');
  }
}

async function showAdminUser(userId) {
  try {
    state.admin.selectedUser = await api(`/admin/users/${userId}`);
    render();
  } catch (error) {
    toast(toastMessage(error), 'error');
  }
}

async function reloadAdminUser() {
  const id = state.admin.selectedUser?.user?.id;
  if (!id) return;
  try { state.admin.selectedUser = await api(`/admin/users/${id}`); render(); }
  catch (_) { /* keep the stale card rather than blanking it */ }
}

async function adminAction(path, body, message) {
  if (state.busy) return;
  state.busy = true;
  try {
    await post(path, body);
    notify('success');
    toast(message, 'success');
    closeSheet();
    await reloadAdminUser();
  } catch (error) {
    notify('error');
    toast(toastMessage(error), 'error');
  } finally {
    state.busy = false;
  }
}

const adminUserId = () => state.admin.selectedUser?.user?.id;

function adminExtendSheet() {
  return `
    <h2>Продлить подписку</h2>
    <p class="sheet-lead">Дни добавятся к текущему сроку. Пользователь получит уведомление в боте.</p>
    <div class="renew-presets">${[7, 30, 90, 180].map(days => `
      <button class="renew-preset${days === 30 ? ' active' : ''}" data-admin-extend-preset="${days}" type="button">${days} д</button>`).join('')}</div>
    <div class="field" style="margin-bottom:16px">
      <label for="adminExtendDays">Количество дней (3–365)</label>
      <input class="input" id="adminExtendDays" type="number" min="3" max="365" value="30" inputmode="numeric">
    </div>
    <button class="button button-primary button-block" data-action="admin-extend-submit" type="button">${icon('clock')}<span>Продлить</span></button>`;
}

function adminBalanceSheet() {
  const user = state.admin.selectedUser.user;
  return `
    <h2>Баланс</h2>
    <p class="sheet-lead">Текущий баланс: ${formatMoney(user.balance, state.data.config.currency)}. Отрицательное значение спишет средства.</p>
    <div class="renew-presets">${[100, 300, 600, 1000].map(amount => `
      <button class="renew-preset" data-admin-balance-preset="${amount}" type="button">+${amount}</button>`).join('')}</div>
    <div class="field" style="margin-bottom:16px">
      <label for="adminBalanceDelta">Изменение</label>
      <input class="input" id="adminBalanceDelta" type="number" step="0.01" value="300" inputmode="decimal">
    </div>
    <button class="button button-primary button-block" data-action="admin-balance-submit" type="button">${icon('wallet')}<span>Применить</span></button>`;
}

function adminMessageSheet() {
  return `
    <h2>Сообщение в бот</h2>
    <p class="sheet-lead">Придёт личным сообщением от бота. Поддерживается HTML-разметка Telegram.</p>
    <div class="field" style="margin-bottom:16px">
      <label for="adminMessageText">Текст</label>
      <textarea class="textarea" id="adminMessageText" maxlength="3500" placeholder="Здравствуйте! …"></textarea>
    </div>
    <button class="button button-primary button-block" data-action="admin-message-submit" type="button">${icon('send')}<span>Отправить</span></button>`;
}

function adminGrantSheet() {
  const plans = state.data.plans || [];
  return `
    <h2>Выдать тариф</h2>
    <p class="sheet-lead">Подписка создастся без оплаты. Существующая будет продлена по правилам тарифа.</p>
    <div class="field" style="margin-bottom:16px">
      <label for="adminGrantPlan">Тариф</label>
      <select class="select" id="adminGrantPlan">${plans.map(plan => `
        <option value="${escapeHtml(plan.uuid)}">${escapeHtml(plan.name)} · ${formatCount(plan.duration_days, 'день', 'дня', 'дней')}</option>`).join('')}</select>
    </div>
    <button class="button button-primary button-block" data-action="admin-grant-submit" type="button">${icon('gift')}<span>Выдать</span></button>`;
}

function adminBlockSheet() {
  const blocked = state.admin.selectedUser.user.is_blocked;
  return `
    <h2>${blocked ? 'Разблокировать?' : 'Заблокировать?'}</h2>
    <p class="sheet-lead">${blocked
      ? 'Пользователь снова получит доступ к боту и кабинету.'
      : 'Доступ к боту и кабинету будет закрыт. Подписка сохранится.'}</p>
    <button class="button ${blocked ? 'button-primary' : 'button-danger'} button-block" data-action="admin-block-submit" data-blocked="${blocked ? '1' : '0'}" type="button">
      ${icon('ban')}<span>${blocked ? 'Разблокировать' : 'Заблокировать'}</span>
    </button>`;
}

function adminPlanPriceSheet(uuid) {
  const plan = (state.admin.plans || []).find(item => item.uuid === uuid);
  if (!plan) return '';
  return `
    <h2>Цена тарифа</h2>
    <p class="sheet-lead">«${escapeHtml(plan.name)}». Оставьте поле пустым, чтобы вернуть цену из панели.</p>
    <div class="field" style="margin-bottom:16px">
      <label for="adminPlanPrice">Цена</label>
      <input class="input" id="adminPlanPrice" type="number" min="0" step="0.01" value="${escapeHtml(String(plan.price ?? ''))}" inputmode="decimal">
    </div>
    <div class="button-row">
      <button class="button button-dark" data-action="admin-price-reset" data-uuid="${escapeHtml(uuid)}" type="button">${icon('refresh')}<span>Сбросить</span></button>
      <button class="button button-primary" data-action="admin-price-submit" data-uuid="${escapeHtml(uuid)}" type="button">${icon('check')}<span>Сохранить</span></button>
    </div>`;
}

function adminNewPromoSheet() {
  return `
    <h2>Новый промокод</h2>
    <p class="sheet-lead">Сумма зачисляется на баланс при активации.</p>
    <div class="form-stack">
      <div class="field">
        <label for="promoNewCode">Код</label>
        <input class="input" id="promoNewCode" type="text" autocapitalize="characters" autocomplete="off" placeholder="AUGUST300">
      </div>
      <div class="field">
        <label for="promoNewAmount">Сумма</label>
        <input class="input" id="promoNewAmount" type="number" min="1" step="0.01" value="300" inputmode="decimal">
      </div>
      <div class="field">
        <label for="promoNewUses">Лимит активаций (пусто — без лимита)</label>
        <input class="input" id="promoNewUses" type="number" min="1" placeholder="100" inputmode="numeric">
      </div>
      <div class="field">
        <label for="promoNewExpires">Срок действия, дней (пусто — бессрочно)</label>
        <input class="input" id="promoNewExpires" type="number" min="1" max="3650" placeholder="30" inputmode="numeric">
      </div>
    </div>
    <button class="button button-primary button-block" data-action="admin-promo-submit" style="margin-top:16px" type="button">${icon('plus')}<span>Создать</span></button>`;
}

function adminPromoEditSheet(code) {
  const promo = (state.admin.promos || []).find(item => item.code === code);
  if (!promo) return '';
  return `<h2>Изменить промокод</h2>
    <p class="sheet-lead"><code>${escapeHtml(promo.code)}</code> · использован ${promo.used_count}${promo.max_uses ? ` из ${promo.max_uses}` : ' раз'}.</p>
    <div class="form-stack">
      <div class="field"><label for="promoEditAmount">Сумма</label><input class="input" id="promoEditAmount" type="number" min="1" step="0.01" value="${escapeHtml(String(promo.amount))}" inputmode="decimal"></div>
      <div class="field"><label for="promoEditUses">Новый лимит активаций</label><input class="input" id="promoEditUses" type="number" min="${Math.max(promo.used_count, 1)}" value="${escapeHtml(String(promo.max_uses ?? ''))}" placeholder="Без лимита" inputmode="numeric"></div>
      <div class="field"><label for="promoEditExpires">Продлить срок от сегодня, дней</label><input class="input" id="promoEditExpires" type="number" min="1" max="3650" placeholder="Без срока" inputmode="numeric"></div>
    </div>
    <button class="button button-primary button-block" data-action="admin-promo-update" data-code="${escapeHtml(promo.code)}" style="margin-top:16px" type="button">${icon('check')}<span>Сохранить</span></button>`;
}

function startBroadcastPoll(id) {
  stopBroadcastPoll();
  broadcastPoll = setInterval(async () => {
    try {
      const progress = await api(`/admin/broadcast/${id}`);
      state.admin.broadcast = progress;
      if (state.adminMode && state.adminTab === 'tools') {
        const bar = screen.querySelector('.broadcast-progress .progress i');
        const stats = screen.querySelector('.broadcast-stats');
        if (bar && stats) {
          bar.style.width = `${progress.total ? clamp(((progress.sent + progress.failed) / progress.total) * 100, 2, 100) : 0}%`;
          stats.innerHTML = `<span>Доставлено <b>${progress.sent}</b></span><span>Ошибок <b>${progress.failed}</b></span><span>Всего <b>${progress.total}</b></span>`;
        } else render();
      }
      if (progress.done) {
        stopBroadcastPoll();
        notify('success');
        toast(`Рассылка завершена: ${progress.sent} из ${progress.total}`, 'success');
        if (state.adminMode && state.adminTab === 'tools') render();
      }
    } catch (_) { stopBroadcastPoll(); }
  }, 2000);
}

function stopBroadcastPoll() {
  if (broadcastPoll) { clearInterval(broadcastPoll); broadcastPoll = null; }
}

/* ── Event delegation ─────────────────────────────────────────────────────── */
const ACTIONS = {
  reload: () => loadBootstrap(),
  connect: () => { const markup = connectionSheet(); if (markup) openSheet(markup); },
  'show-key': () => { const markup = connectionSheet(); if (markup) openSheet(markup); },
  'copy-key': () => copyText(state.data.subscription?.subscription_url || '', 'Ключ скопирован'),
  renew: () => { const markup = renewCheckout(); if (markup) { openSheet(markup); updateRenewDays(30); } },
  'quick-renew': node => performPayment('renew', '', state.data.user.preferred_payment_method || 'card', '', node),
  'renew-standard': () => {
    const plan = (state.data.plans || []).find(item => item.uuid === state.data.subscription?.plan_uuid);
    if (!plan) return toast('Тариф недоступен', 'error');
    openSheet(`<h2>Продление</h2><p class="sheet-lead">Тариф «${escapeHtml(plan.name)}» на ${formatCount(plan.duration_days, 'день', 'дня', 'дней')}.</p>
      <div class="card sheet-summary"><div class="summary-line"><span>К оплате</span><b>${formatMoney(plan.price, plan.currency)}</b></div></div>
      <h3>Способ оплаты</h3>${paymentOptions('renew', '', '', Number(plan.price))}`);
  },
  freeze: () => openSheet(confirmFreeze()),
  'confirm-freeze': async node => {
    setBusy(node, true);
    try {
      const enabled = !state.data.subscription?.is_frozen;
      await post('/subscription/freeze', { enabled });
      notify('success');
      closeSheet();
      toast(enabled ? 'Подписка заморожена' : 'Подписка активна', 'success');
      await loadBootstrap({ quiet: true });
    } catch (error) { notify('error'); toast(toastMessage(error), 'error'); }
    finally { setBusy(node, false); }
  },
  'toggle-auto-renew': async node => {
    const enabled = !state.data.subscription?.auto_renew_enabled;
    node.classList.toggle('on', enabled);
    try {
      await post('/subscription/auto-renew', { enabled });
      haptic('light');
      toast(enabled ? 'Автопродление включено' : 'Автопродление выключено', 'success');
      await loadBootstrap({ quiet: true });
    } catch (error) { node.classList.toggle('on', !enabled); toast(toastMessage(error), 'error'); }
  },
  'claim-trial': async node => {
    setBusy(node, true);
    try {
      const result = await post('/trial/claim');
      showSuccessMoment('Пробный доступ активирован', `${result.plan_name}: ${formatCount(result.days, 'день', 'дня', 'дней')}`);
      await loadBootstrap({ quiet: true });
    } catch (error) { notify('error'); toast(toastMessage(error), 'error'); }
    finally { setBusy(node, false); }
  },
  topup: () => openSheet(topupSheet()),
  promo: () => openSheet(promoSheet()),
  gift: () => openSheet(giftPlanSelectSheet()),
  'gift-plan': node => {
    const plan = (state.data.plans || []).find(item => item.uuid === node.dataset.plan);
    if (plan) openSheet(giftSheet(plan));
  },
  'gift-plan-select': node => {
    const plan = (state.data.plans || []).find(item => item.uuid === node.dataset.plan);
    if (plan) openSheet(giftSheet(plan));
  },
  referral: async () => {
    try { openSheet(referralSheet(await api('/referral'))); }
    catch (error) { toast(toastMessage(error), 'error'); }
  },
  'copy-referral': node => copyText(node.dataset.value || '', 'Ссылка скопирована'),
  notifications: async () => {
    try {
      const result = await api('/notifications');
      state.data.notifications = result.items;
      state.data.notification_unread = result.unread;
      updateNotificationBadge();
      openSheet(notificationSheet(result.items));
    } catch (error) { toast(toastMessage(error), 'error'); }
  },
  'mark-notification': async node => {
    try {
      await post(`/notifications/${node.dataset.notificationId}/read`);
      const result = await api('/notifications');
      state.data.notifications = result.items;
      state.data.notification_unread = result.unread;
      updateNotificationBadge();
      openSheet(notificationSheet(result.items));
    } catch (error) { toast(toastMessage(error), 'error'); }
  },
  'payment-preference': () => openSheet(paymentPreferenceSheet()),
  'save-payment-preference': async node => {
    const method = node.dataset.paymentMethod;
    try {
      await post('/preferences/payment', { payment_method: method });
      state.data.user.preferred_payment_method = method;
      openSheet(paymentPreferenceSheet());
      toast('Способ оплаты сохранён', 'success');
    } catch (error) { toast(toastMessage(error), 'error'); }
  },
  'server-status': async () => {
    try { openSheet(serverStatusSheet(await api('/service/latency'))); }
    catch (error) { toast(toastMessage(error), 'error'); }
  },
  'order-details': async node => {
    try { openSheet(orderDetailsSheet(await api(`/orders/${node.dataset.uuid}`))); }
    catch (error) { toast(toastMessage(error), 'error'); }
  },
  'copy-receipt': node => copyText(decodeURIComponent(node.dataset.receipt || ''), 'Чек скопирован'),
  'apply-promo': async node => {
    const code = document.getElementById('promoCode')?.value.trim();
    if (!code) return toast('Введите код', 'error');
    setBusy(node, true);
    try {
      const result = await post('/promo', { code });
      notify('success');
      closeSheet();
      toast(result.message || 'Промокод активирован', 'success');
      await loadBootstrap({ quiet: true });
    } catch (error) { notify('error'); toast(toastMessage(error), 'error'); }
    finally { setBusy(node, false); }
  },
  orders: () => openSheet(ordersSheet()),
  support: async () => {
    try { openSheet(supportSheet((await api('/support/tickets')).items)); }
    catch (error) { toast(toastMessage(error), 'error'); }
  },
  'open-support-chat': () => { if (state.data.config.support_url) openExternal(state.data.config.support_url); },
  'support-submit': async node => {
    const category = document.getElementById('supportCategory')?.value || 'other';
    const message = document.getElementById('supportMessage')?.value.trim();
    if (!message || message.length < 10) return toast('Опишите проблему подробнее', 'error');
    setBusy(node, true);
    try {
      await post('/support/tickets', { category, message });
      showSuccessMoment('Обращение отправлено', 'Ответ появится в разделе поддержки');
      closeSheet();
    } catch (error) { toast(toastMessage(error), 'error'); }
    finally { setBusy(node, false); }
  },
  'more-connections': node => loadConnections({ next: true, trigger: node }),
  'tab-plans': () => switchTab('plans'),
  'tab-devices': () => switchTab('devices'),
  admin: () => enterAdmin(),
  'admin-back': () => { state.admin.selectedUser = null; render(); },
  'admin-open-user': node => {
    closeSheet();
    showAdminUser(node.dataset.userId);
  },
  'admin-users-more': async node => {
    setBusy(node, true);
    const params = new URLSearchParams({
      segment: state.adminUserSegment,
      limit: '40',
      offset: String(state.admin.usersMeta.offset),
    });
    if (state.adminUserQuery.trim()) params.set('q', state.adminUserQuery.trim());
    try {
      const result = await api(`/admin/users?${params}`);
      state.admin.users = [...(state.admin.users || []), ...result.items];
      state.admin.usersMeta = {
        total: result.total,
        offset: state.admin.users.length,
        hasMore: result.has_more,
      };
      render();
    } catch (error) { toast(toastMessage(error), 'error'); }
    finally { setBusy(node, false); }
  },
  'admin-orders-more': async node => {
    setBusy(node, true);
    try {
      const result = await api(`/admin/orders?status=${state.adminOrderStatus}&limit=30&offset=${state.admin.ordersMeta.offset}`);
      state.admin.orders = [...(state.admin.orders || []), ...result.items];
      state.admin.ordersMeta = {
        total: result.total,
        offset: state.admin.orders.length,
        hasMore: result.has_more,
      };
      render();
    } catch (error) { toast(toastMessage(error), 'error'); }
    finally { setBusy(node, false); }
  },
  'admin-refresh': () => loadAdminTab(state.adminTab),
  'admin-task-resolve': node => {
    const task = (state.admin.tasks || []).find(item => item.uuid === node.dataset.uuid);
    openSheet(`<h2>Закрыть задачу?</h2>
      <p class="sheet-lead">${task ? `«${escapeHtml(task.title)}» будет отмечена решённой.` : 'Задача будет отмечена решённой.'}</p>
      <button class="button button-primary button-block" data-action="admin-task-confirm" data-uuid="${escapeHtml(node.dataset.uuid)}" type="button">${icon('check')}<span>Закрыть задачу</span></button>`);
  },
  'admin-task-confirm': async node => {
    setBusy(node, true);
    try {
      await post(`/admin/tasks/${encodeURIComponent(node.dataset.uuid)}/resolve`, { confirm: true });
      notify('success');
      closeSheet();
      toast('Задача закрыта', 'success');
      await loadAdminTab('tasks');
    } catch (error) { toast(toastMessage(error), 'error'); }
    finally { setBusy(node, false); }
  },
  'admin-campaign-toggle': async node => {
    const enabled = node.dataset.enabled !== '1';
    try {
      await post(`/admin/campaigns/${encodeURIComponent(node.dataset.uuid)}/toggle`, { enabled });
      await loadAdminTab('campaigns');
    } catch (error) { toast(toastMessage(error), 'error'); }
  },
  'admin-export': async node => {
    setBusy(node, true);
    try {
      const response = await fetch(`/miniapp/api/admin/export/${node.dataset.entity}`, {
        headers: tg?.initData ? { Authorization: `tma ${tg.initData}` } : {},
      });
      if (!response.ok) throw new Error(`Ошибка экспорта ${response.status}`);
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `mister-vpn-${node.dataset.entity}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast('CSV скачан', 'success');
    } catch (error) { toast(toastMessage(error), 'error'); }
    finally { setBusy(node, false); }
  },
  'reopen-payment': node => openExternal(node.dataset.url),
  'check-order': node => checkOrder(node.dataset.uuid, node),
  'drop-device': async node => {
    node.classList.add('is-spinning');
    try {
      await api(`/devices/${encodeURIComponent(node.dataset.deviceId)}`, { method: 'DELETE' });
      notify('success');
      toast('Устройство отключено', 'success');
      await loadBootstrap({ quiet: true });
    } catch (error) { notify('error'); toast(toastMessage(error), 'error'); node.classList.remove('is-spinning'); }
  },

  /* admin */
  'admin-extend': () => openSheet(adminExtendSheet()),
  'admin-extend-submit': node => {
    const days = clamp(Math.round(Number(document.getElementById('adminExtendDays')?.value) || 30), 3, 365);
    setBusy(node, true);
    adminAction(`/admin/users/${adminUserId()}/extend`, { days, notify: true }, `Продлено на ${days} д`)
      .finally(() => setBusy(node, false));
  },
  'admin-freeze': () => {
    const active = state.admin.selectedUser?.subscriptions?.[0];
    adminAction(`/admin/users/${adminUserId()}/freeze`, { enabled: !active?.is_frozen },
      active?.is_frozen ? 'Разморожено' : 'Заморожено');
  },
  'admin-balance': () => openSheet(adminBalanceSheet()),
  'admin-balance-submit': node => {
    const delta = Number(document.getElementById('adminBalanceDelta')?.value);
    if (!Number.isFinite(delta) || delta === 0) return toast('Введите сумму', 'error');
    setBusy(node, true);
    adminAction(`/admin/users/${adminUserId()}/balance`, { delta }, 'Баланс обновлён')
      .finally(() => setBusy(node, false));
  },
  'admin-message': () => openSheet(adminMessageSheet()),
  'admin-message-submit': node => {
    const text = document.getElementById('adminMessageText')?.value.trim();
    if (!text) return toast('Введите текст', 'error');
    setBusy(node, true);
    adminAction(`/admin/users/${adminUserId()}/message`, { text }, 'Сообщение отправлено')
      .finally(() => setBusy(node, false));
  },
  'admin-grant': () => openSheet(adminGrantSheet()),
  'admin-grant-submit': node => {
    const planUuid = document.getElementById('adminGrantPlan')?.value;
    if (!planUuid) return toast('Выберите тариф', 'error');
    setBusy(node, true);
    adminAction(`/admin/users/${adminUserId()}/grant`, { plan_uuid: planUuid }, 'Тариф выдан')
      .finally(() => setBusy(node, false));
  },
  'admin-block': () => openSheet(adminBlockSheet()),
  'admin-block-submit': node => {
    const blocked = node.dataset.blocked === '1';
    setBusy(node, true);
    adminAction(`/admin/users/${adminUserId()}/block`, { enabled: !blocked }, blocked ? 'Разблокирован' : 'Заблокирован')
      .finally(() => setBusy(node, false));
  },
  'admin-retry': async node => {
    node.classList.add('is-spinning');
    try {
      await post(`/admin/orders/${node.dataset.uuid}/retry`);
      notify('success');
      toast('Выдача перезапущена', 'success');
      await loadAdminTab('orders');
    } catch (error) { notify('error'); toast(toastMessage(error), 'error'); node.classList.remove('is-spinning'); }
  },
  'admin-sync-plans': async node => {
    setBusy(node, true);
    try {
      const result = await post('/admin/plans/sync');
      notify('success');
      toast(`Синхронизировано тарифов: ${result.count}`, 'success');
      await loadAdminTab('plans');
    } catch (error) { notify('error'); toast(toastMessage(error), 'error'); }
    finally { setBusy(node, false); }
  },
  'admin-plan-visibility': async node => {
    const enabled = node.dataset.enabled !== '1';
    node.classList.toggle('on', enabled);
    node.dataset.enabled = enabled ? '1' : '0';
    try {
      await post(`/admin/plans/${node.dataset.uuid}/visibility`, { enabled });
      haptic('light');
      const plan = (state.admin.plans || []).find(item => item.uuid === node.dataset.uuid);
      if (plan) plan.is_public = enabled;
    } catch (error) {
      node.classList.toggle('on', !enabled);
      node.dataset.enabled = enabled ? '0' : '1';
      toast(toastMessage(error), 'error');
    }
  },
  'admin-plan-price': node => openSheet(adminPlanPriceSheet(node.dataset.uuid)),
  'admin-price-submit': node => {
    const raw = document.getElementById('adminPlanPrice')?.value.trim();
    savePlanPrice(node, raw ? Number(raw) : null);
  },
  'admin-price-reset': node => savePlanPrice(node, null),
  'admin-new-promo': () => openSheet(adminNewPromoSheet()),
  'admin-promo-edit': node => openSheet(adminPromoEditSheet(node.dataset.code)),
  'admin-promo-update': async node => {
    const amount = Number(document.getElementById('promoEditAmount')?.value);
    const maxUses = document.getElementById('promoEditUses')?.value.trim();
    const expires = document.getElementById('promoEditExpires')?.value.trim();
    if (!Number.isFinite(amount) || amount <= 0) return toast('Введите сумму', 'error');
    setBusy(node, true);
    try {
      const result = await post(`/admin/promos/${encodeURIComponent(node.dataset.code)}`, {
        amount,
        max_uses: maxUses ? Number(maxUses) : null,
        expires_in_days: expires ? Number(expires) : null,
      });
      const index = (state.admin.promos || []).findIndex(item => item.code === node.dataset.code);
      if (index >= 0) state.admin.promos[index] = result.promo;
      notify('success');
      closeSheet();
      render();
      toast('Промокод обновлён', 'success');
    } catch (error) { notify('error'); toast(toastMessage(error), 'error'); }
    finally { setBusy(node, false); }
  },
  'admin-promo-submit': async node => {
    const code = document.getElementById('promoNewCode')?.value.trim();
    const amount = Number(document.getElementById('promoNewAmount')?.value);
    const maxUses = document.getElementById('promoNewUses')?.value.trim();
    const expires = document.getElementById('promoNewExpires')?.value.trim();
    if (!code) return toast('Введите код', 'error');
    if (!Number.isFinite(amount) || amount <= 0) return toast('Введите сумму', 'error');
    setBusy(node, true);
    try {
      await post('/admin/promos', {
        code, amount,
        max_uses: maxUses ? Number(maxUses) : null,
        expires_in_days: expires ? Number(expires) : null,
      });
      notify('success');
      closeSheet();
      toast('Промокод создан', 'success');
      await loadAdminTab('plans');
    } catch (error) { notify('error'); toast(toastMessage(error), 'error'); }
    finally { setBusy(node, false); }
  },
  'admin-promo-toggle': async node => {
    const enabled = node.dataset.enabled !== '1';
    node.classList.toggle('on', enabled);
    node.dataset.enabled = enabled ? '1' : '0';
    try {
      await post(`/admin/promos/${encodeURIComponent(node.dataset.code)}/toggle`, { enabled });
      haptic('light');
    } catch (error) {
      node.classList.toggle('on', !enabled);
      node.dataset.enabled = enabled ? '0' : '1';
      toast(toastMessage(error), 'error');
    }
  },
  'broadcast-count': async node => {
    const payload = broadcastPayload();
    if (!payload) return;
    setBusy(node, true);
    try {
      const result = await post('/admin/broadcast', { ...payload, dry_run: true });
      toast(`Получателей: ${result.recipients}`, 'success');
    } catch (error) { toast(toastMessage(error), 'error'); }
    finally { setBusy(node, false); }
  },
  'broadcast-send': async node => {
    const payload = broadcastPayload();
    if (!payload) return;
    setBusy(node, true);
    try {
      /* A broadcast cannot be recalled — count first, then ask. */
      const result = await post('/admin/broadcast', { ...payload, dry_run: true });
      if (!result.recipients) { toast('В этой аудитории никого нет', 'error'); return; }
      pendingBroadcast = payload;
      openSheet(broadcastConfirmSheet(payload, result.recipients));
    } catch (error) { toast(toastMessage(error), 'error'); }
    finally { setBusy(node, false); }
  },
  'broadcast-confirm': async node => {
    const payload = pendingBroadcast;
    if (!payload) return;
    setBusy(node, true);
    try {
      const result = await post('/admin/broadcast', payload);
      pendingBroadcast = null;
      notify('success');
      closeSheet();
      state.admin.broadcast = { id: result.broadcast_id, total: result.recipients, sent: 0, failed: 0, done: false };
      toast(`Отправляем ${result.recipients} сообщений`, 'success');
      render();
      startBroadcastPoll(result.broadcast_id);
    } catch (error) { notify('error'); toast(toastMessage(error), 'error'); }
    finally { setBusy(node, false); }
  },
};

function broadcastPayload() {
  const text = document.getElementById('broadcastText')?.value.trim();
  const audience = document.getElementById('broadcastAudience')?.value || 'all';
  if (!text) { toast('Введите текст рассылки', 'error'); return null; }
  const imageUrl = document.getElementById('broadcastImage')?.value.trim() || null;
  const buttonText = document.getElementById('broadcastButtonText')?.value.trim() || null;
  const buttonUrl = document.getElementById('broadcastButtonUrl')?.value.trim() || null;
  const scheduleAt = document.getElementById('broadcastSchedule')?.value;
  const templateName = document.getElementById('broadcastTemplate')?.value.trim() || null;
  return { text, audience, image_url: imageUrl, button_text: buttonText, button_url: buttonUrl,
    schedule_at: scheduleAt ? new Date(scheduleAt).toISOString() : null, template_name: templateName };
}

async function savePlanPrice(node, price) {
  setBusy(node, true);
  try {
    await post(`/admin/plans/${node.dataset.uuid}/price`, {
      price: price == null || Number.isNaN(price) ? null : price,
    });
    notify('success');
    closeSheet();
    toast('Цена обновлена', 'success');
    await loadAdminTab('plans');
  } catch (error) { notify('error'); toast(toastMessage(error), 'error'); }
  finally { setBusy(node, false); }
}

async function loadConnections({ next = false, trigger = null } = {}) {
  if (state.connections.loading) return;
  state.connections.loading = true;
  setBusy(trigger, true);
  const page = next ? state.connections.page + 1 : 1;
  try {
    const result = await api(`/connections?page=${page}`);
    state.connections.items = next ? [...state.connections.items, ...result.items] : result.items;
    state.connections.page = result.page;
    state.connections.hasMore = result.has_more;
  } catch (error) {
    toast(toastMessage(error), 'error');
  } finally {
    state.connections.loading = false;
    setBusy(trigger, false);
    if (state.tab === 'devices' && !state.adminMode) render();
  }
}

/* One listener for the whole app: screens are re-rendered as strings, so
 * per-node handlers would be re-bound on every paint. */
document.addEventListener('click', event => {
  if (!event.target.closest('.admin-global-search')) {
    const results = document.getElementById('adminSearchResults');
    if (results && !results.hidden && results.childElementCount) {
      state.admin.search = null;
      results.innerHTML = '';
    }
  }

  const actionNode = event.target.closest('[data-action]');
  if (actionNode) {
    const handler = ACTIONS[actionNode.dataset.action];
    if (handler) { haptic('light'); handler(actionNode); return; }
  }

  const navItem = event.target.closest('.nav-item');
  if (navItem) {
    if (suppressNavClick) { suppressNavClick = false; return; }
    selectionHaptic();
    switchTab(navItem.dataset.tab);
    return;
  }

  const period = event.target.closest('[data-period]');
  if (period) { state.planPeriod = period.dataset.period; selectionHaptic(); render(); return; }

  const deviceView = event.target.closest('[data-device-view]');
  if (deviceView) {
    state.deviceView = deviceView.dataset.deviceView;
    selectionHaptic();
    render();
    if (state.deviceView === 'log' && !state.connections.items.length) loadConnections();
    return;
  }

  const planCard = event.target.closest('[data-plan]:not([data-pay])');
  if (planCard) {
    const plan = (state.data.plans || []).find(item => item.uuid === planCard.dataset.plan);
    if (plan) { haptic('light'); openSheet(planCheckout(plan)); }
    return;
  }

  const client = event.target.closest('[data-client]');
  if (client) {
    const url = state.data.subscription?.subscription_url;
    const entry = CLIENTS.find(item => item.id === client.dataset.client);
    if (!url || !entry) return;
    haptic('medium');
    if (entry.link) openScheme(entry.link(url));
    else copyText(url, 'Ключ скопирован');
    return;
  }

  const pay = event.target.closest('[data-pay]');
  if (pay) {
    if (pay.dataset.kind === 'gift') performGiftPayment(pay.dataset.plan, pay.dataset.pay, pay);
    else performPayment(pay.dataset.kind, pay.dataset.plan, pay.dataset.pay, pay.dataset.days, pay);
    return;
  }

  const topup = event.target.closest('[data-topup]');
  if (topup) { startTopUp(topup.dataset.topup, topup); return; }

  const topupPreset = event.target.closest('[data-topup-preset]');
  if (topupPreset) {
    const input = document.getElementById('topupAmount');
    if (input) input.value = topupPreset.dataset.topupPreset;
    sheetContent.querySelectorAll('[data-topup-preset]').forEach(node => node.classList.toggle('active', node === topupPreset));
    selectionHaptic();
    return;
  }

  const renewPreset = event.target.closest('[data-renew-preset]');
  if (renewPreset) { updateRenewDays(renewPreset.dataset.renewPreset); selectionHaptic(); return; }

  const renewStep = event.target.closest('[data-renew-step]');
  if (renewStep) {
    const current = Number(document.getElementById('renewDays')?.value) || 30;
    updateRenewDays(current + Number(renewStep.dataset.renewStep) * (current >= 30 ? 5 : 1));
    selectionHaptic();
    return;
  }

  const extendPreset = event.target.closest('[data-admin-extend-preset]');
  if (extendPreset) {
    const input = document.getElementById('adminExtendDays');
    if (input) input.value = extendPreset.dataset.adminExtendPreset;
    sheetContent.querySelectorAll('[data-admin-extend-preset]').forEach(node => node.classList.toggle('active', node === extendPreset));
    selectionHaptic();
    return;
  }

  const balancePreset = event.target.closest('[data-admin-balance-preset]');
  if (balancePreset) {
    const input = document.getElementById('adminBalanceDelta');
    if (input) input.value = balancePreset.dataset.adminBalancePreset;
    sheetContent.querySelectorAll('[data-admin-balance-preset]').forEach(node => node.classList.toggle('active', node === balancePreset));
    selectionHaptic();
    return;
  }

  const adminTab = event.target.closest('[data-admin-tab]');
  if (adminTab) {
    state.adminTab = adminTab.dataset.adminTab;
    state.admin.selectedUser = null;
    selectionHaptic();
    render();
    loadAdminTab(state.adminTab);
    return;
  }

  const chartToggle = event.target.closest('[data-admin-chart]');
  if (chartToggle) { state.adminChart = chartToggle.dataset.adminChart; selectionHaptic(); render(); return; }

  const segment = event.target.closest('[data-user-segment]');
  if (segment) { state.adminUserSegment = segment.dataset.userSegment; selectionHaptic(); loadAdminUsers(state.adminUserQuery); return; }

  const orderStatusChip = event.target.closest('[data-order-status]');
  if (orderStatusChip) {
    state.adminOrderStatus = orderStatusChip.dataset.orderStatus;
    state.admin.orders = null;
    selectionHaptic();
    render();
    loadAdminTab('orders');
    return;
  }

  const audience = event.target.closest('[data-audience]');
  if (audience) {
    const select = document.getElementById('broadcastAudience');
    if (select) { select.value = audience.dataset.audience; selectionHaptic(); toast('Аудитория выбрана'); }
    return;
  }

  const adminUser = event.target.closest('[data-admin-user]');
  if (adminUser) { haptic('light'); showAdminUser(adminUser.dataset.adminUser); return; }

  const adminOrder = event.target.closest('[data-admin-order]');
  if (adminOrder) { haptic('light'); showAdminOrder(adminOrder.dataset.adminOrder); }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && sheetIsOpen()) { closeSheet(); return; }
  if (event.key !== 'Enter') return;
  const card = event.target.closest?.('[data-plan]');
  if (card && !card.hasAttribute('data-pay')) card.click();
});

let searchTimer;
document.addEventListener('input', event => {
  if (event.target.id === 'adminGlobalSearch') {
    clearTimeout(searchTimer);
    const query = event.target.value.trim();
    searchTimer = setTimeout(async () => {
      if (query.length < 2) { state.admin.search = null; const target = document.getElementById('adminSearchResults'); if (target) target.innerHTML = ''; return; }
      try {
        state.admin.search = await api(`/admin/search?q=${encodeURIComponent(query)}`);
        const target = document.getElementById('adminSearchResults');
        if (target) target.innerHTML = renderAdminSearchResults();
      } catch (error) { toast(toastMessage(error), 'error'); }
    }, 300);
    return;
  }
  if (event.target.id === 'adminSearch') {
    clearTimeout(searchTimer);
    const query = event.target.value;
    searchTimer = setTimeout(() => loadAdminUsers(query, { keep: true }), 350);
    return;
  }
  if (event.target.id === 'renewDays') updateRenewDays(event.target.value);
});

async function startTopUp(method, trigger) {
  const { min_topup: min, max_topup: max } = state.data.config;
  const amount = Number(document.getElementById('topupAmount')?.value);
  if (!Number.isFinite(amount) || amount < min || amount > max) {
    return toast(`Сумма от ${min} до ${max}`, 'error');
  }
  setBusy(trigger, true);
  try {
    const result = await post('/orders/topup', { amount, payment_method: method });
    if (result.completed) {
      closeSheet();
      showSuccessMoment('Баланс пополнен', `${formatMoney(amount, state.data.config.currency)} зачислено`);
      await loadBootstrap({ quiet: true });
      return;
    }
    awaitPaymentSheet(result, {
      title: 'Баланс пополнен',
      detail: `${formatMoney(amount, state.data.config.currency)} зачислено`,
    });
  } catch (error) {
    notify('error');
    toast(toastMessage(error), 'error');
  } finally {
    setBusy(trigger, false);
  }
}

document.getElementById('sheetClose')?.addEventListener('click', closeSheet);
backdrop.addEventListener('click', closeSheet);
document.getElementById('brandButton')?.addEventListener('click', () => { haptic('light'); switchTab('home'); });
document.getElementById('avatarButton')?.addEventListener('click', () => { haptic('light'); switchTab('profile'); });

/* Swipe the bottom bar to change tabs — the indicator tracks the finger. */
nav.addEventListener('pointerdown', event => {
  if (event.button !== undefined && event.button !== 0) return;
  const item = event.target.closest('.nav-item');
  if (!item) return;
  navSlideState = { pointerId: event.pointerId, startX: event.clientX, moved: false };
});

nav.addEventListener('pointermove', event => {
  if (!navSlideState || event.pointerId !== navSlideState.pointerId) return;
  if (Math.abs(event.clientX - navSlideState.startX) > 26) navSlideState.moved = true;
});

function finishNavSlide(event) {
  if (!navSlideState || event.pointerId !== navSlideState.pointerId) return;
  const { startX, moved } = navSlideState;
  navSlideState = null;
  if (!moved) return;
  const delta = event.clientX - startX;
  const index = TABS.indexOf(state.tab);
  const next = clamp(index + (delta < 0 ? 1 : -1), 0, TABS.length - 1);
  suppressNavClick = true;
  setTimeout(() => { suppressNavClick = false; }, 250);
  if (TABS[next] !== state.tab) { selectionHaptic(); switchTab(TABS[next]); }
}

nav.addEventListener('pointerup', finishNavSlide);
nav.addEventListener('pointercancel', finishNavSlide);

window.addEventListener('resize', scheduleNavIndicator);
window.addEventListener('orientationchange', scheduleNavIndicator);
window.visualViewport?.addEventListener('resize', () => {
  syncTelegramSafeArea();
  syncKeyboardState();
});

/* ── Init ─────────────────────────────────────────────────────────────────── */
function initTelegram() {
  if (!tg) return;
  try { tg.ready(); tg.expand(); } catch (_) {}
  syncTelegramSafeArea();
  syncKeyboardState();
  if (tgSupports('6.1')) {
    try { tg.setHeaderColor('#080a0b'); tg.setBackgroundColor('#080a0b'); } catch (_) {}
  }
  if (tgSupports('7.7')) {
    try { tg.disableVerticalSwipes(); } catch (_) {}
  }
  try { tg.BackButton?.onClick(handleBack); } catch (_) {}
  try { tg.onEvent?.('viewportChanged', syncTelegramSafeArea); } catch (_) {}
  try { tg.onEvent?.('themeChanged', () => { if (tgSupports('6.1')) tg.setHeaderColor('#080a0b'); }); } catch (_) {}
}

initTelegram();
hydrateIcons();
setupPullToRefresh();
loadBootstrap();
