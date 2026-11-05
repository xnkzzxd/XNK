#!/usr/bin/env node
'use strict';
// Fase U (T-1611): animasi gerakan buatan sendiri. Membangun figure/rig.min.json — figur samping (sagital) dari segmen
// sederhana (kapsul) dengan titik sendi, alat netral, dan 13 frame per pola. Sudut sendi tiap pola bersumber di
// docs/program/Gerak.md; file ini hanya menghitung posisi (FK / IK dua ruas), tidak ada angka tanpa sumber di sana.
// Jalankan ulang setelah mengubah pola: node apps-script/pt-scheduler/tools/build-rig.js. Jangan edit rig.min.json manual.
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', '..', '..', 'figure', 'rig.min.json');
const FRAMES = 13;

// Panjang ruas (unit viewBox 200 × 200). Pria dan wanita memakai panjang sama (frame sama), hanya lebar ruas berbeda.
const LEN = { torso: 52, thigh: 44, shin: 42, foot: 15, ua: 30, fa: 27, neck: 13, head: 8.5 };
const WIDTH = {
  m: { torso: 23, thigh: 15, shin: 10.5, foot: 6, ua: 10.5, fa: 8, head: 8.5 },
  f: { torso: 20, thigh: 15.5, shin: 10, foot: 5.5, ua: 9, fa: 7, head: 8 }
};
// Otot di permukaan ruas: [ruas, otot, posisi sepanjang ruas (0–1), sisi (+1 depan / −1 belakang / 0 tengah), rx, ry].
// Sisi depan: badan = +y lokal, anggota gerak = −y lokal (lihat side()).
const MUSCLES = [
  ['torso', 'pectorals', 0.8, 1, 8.5, 3.6], ['torso', 'abs', 0.38, 1, 10, 3], ['torso', 'lats', 0.6, -1, 10, 3.8],
  ['torso', 'upper back', 0.86, -1, 7, 3.4], ['torso', 'traps', 1.0, -0.6, 4.5, 3], ['torso', 'spine', 0.25, -1, 8, 2.6],
  ['torso', 'glutes', 0.0, -1, 7.5, 5.5],
  ['thigh', 'quads', 0.5, 1, 15, 4.2], ['thigh', 'hamstrings', 0.55, -1, 14, 3.8], ['thigh', 'adductors', 0.25, 0, 9, 3], ['thigh', 'abductors', 0.08, 0, 5, 3.4],
  ['shin', 'calves', 0.3, -1, 10, 3.2],
  ['ua', 'delts', 0.08, 0, 6.5, 5.6], ['ua', 'biceps', 0.55, 1, 8.5, 2.8], ['ua', 'triceps', 0.55, -1, 9, 2.8],
  ['fa', 'forearms', 0.35, 0, 8, 2.8]
];

const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const add = (p, a, l) => [p[0] + l * Math.cos(rad(a)), p[1] + l * Math.sin(rad(a))];
const ang = (a, b) => deg(Math.atan2(b[1] - a[1], b[0] - a[0]));
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const norm = a => { while (a > 180) a -= 360; while (a <= -180) a += 360; return a; };
const ease = t => (1 - Math.cos(Math.PI * t)) / 2;
const lerp = (a, b, t) => a + (b - a) * t;

/** IK dua ruas: dari akar ke target, bend = +1 / −1 memilih sisi sendi tengah. Hasil: sudut ruas 1 dan 2. */
function ik(root, target, l1, l2, bend) {
  const d = Math.min(dist(root, target), l1 + l2 - 1e-6);
  const base = ang(root, target);
  const a1 = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const s1 = base - bend * deg(a1);
  const mid = add(root, s1, l1);
  return [s1, ang(mid, target)];
}

/** Kaki dengan sudut sendi anatomis dari badan: fleksi pinggul F dan fleksi lutut K (0 = lurus). */
function legFk(trunk, F, K) { const thigh = trunk + 180 - F; return [thigh, thigh + K]; }
/** Lengan: fleksi bahu S (0 = di samping badan, 180 = di atas kepala), fleksi siku E. */
function armFk(trunk, S, E) { const ua = trunk + 180 - S; return [ua, ua - E]; }

/** Satu pose → posisi + sudut tiap ruas, sudut sendi anatomis (untuk test), titik ikut alat. */
function solve(p) {
  const hip = p.pelvis, trunk = p.trunk;
  const shoulder = add(hip, trunk, LEN.torso);
  const leg = p.leg.ik ? ik(hip, p.leg.ik, LEN.thigh, LEN.shin, p.leg.bend || 1) : legFk(trunk, p.leg.F, p.leg.K);
  const knee = add(hip, leg[0], LEN.thigh), ankle = add(knee, leg[1], LEN.shin);
  const footA = p.leg.foot != null ? p.leg.foot : leg[1] - 90;
  const arm = p.arm.ik ? ik(shoulder, p.arm.ik, LEN.ua, LEN.fa, p.arm.bend || 1) : armFk(trunk, p.arm.S, p.arm.E);
  const sx = p.arm.sx == null ? 1 : p.arm.sx;   // pemendekan lengan yang bergerak keluar bidang gambar (chest fly)
  const elbow = add(shoulder, arm[0], LEN.ua * sx), wrist = add(elbow, arm[1], LEN.fa * sx);
  const neck = add(shoulder, trunk + (p.neck || 0), LEN.neck);
  const r1 = v => Math.round(v * 10) / 10;
  const seg = (o, a, s) => s === 1 || s == null ? [r1(o[0]), r1(o[1]), r1(a)] : [r1(o[0]), r1(o[1]), r1(a), Math.round(s * 100) / 100];
  // Sudut sendi anatomis (derajat): lutut / siku 0 = lurus; pinggul / bahu dari garis badan.
  const knee0 = Math.abs(norm(leg[1] - leg[0]));
  const hipF = norm(trunk + 180 - leg[0]);
  const elbow0 = Math.abs(norm(arm[0] - arm[1]));
  const shoulderF = norm(trunk + 180 - arm[0]);
  return {
    s: { torso: seg(hip, trunk), thigh: seg(hip, leg[0]), shin: seg(knee, leg[1]), foot: seg(ankle, footA), ua: seg(shoulder, arm[0], sx), fa: seg(elbow, arm[1], sx), head: seg(neck, trunk) },
    j: { knee: Math.round(knee0), hip: Math.round(hipF), elbow: Math.round(elbow0), shoulder: Math.round(shoulderF) },
    p: { hip: [r1(hip[0]), r1(hip[1])], shoulder: [r1(shoulder[0]), r1(shoulder[1])], knee: [r1(knee[0]), r1(knee[1])], ankle: [r1(ankle[0]), r1(ankle[1])],
      wrist: [r1(wrist[0]), r1(wrist[1])], elbow: [r1(elbow[0]), r1(elbow[1])] }
  };
}

/** Jarak pinggul–pergelangan kaki untuk fleksi lutut K (hukum kosinus). */
// Leg press: rel 45° sejajar jalur kaki, sedikit di bawahnya.
const LP_HIP = [80, 142];
const legReachC = K => Math.sqrt(44 ** 2 + 42 ** 2 + 2 * 44 * 42 * Math.cos(K * Math.PI / 180));
const LP_RAIL = (function() { const a = -38 * Math.PI / 180, o = [LP_HIP[0] + 10 * Math.cos(a + Math.PI / 2), LP_HIP[1] + 10 * Math.sin(a + Math.PI / 2)];
  const p1 = [o[0] + 40 * Math.cos(a), o[1] + 40 * Math.sin(a)], p2 = [o[0] + 112 * Math.cos(a), o[1] + 112 * Math.sin(a)];
  return 'M' + p1.map(Math.round).join(' ') + ' L' + p2.map(Math.round).join(' '); })();
const legReach = K => Math.sqrt(LEN.thigh ** 2 + LEN.shin ** 2 + 2 * LEN.thigh * LEN.shin * Math.cos(rad(K)));
const armReach = E => Math.sqrt(LEN.ua ** 2 + LEN.fa ** 2 + 2 * LEN.ua * LEN.fa * Math.cos(rad(E)));

// ── Pola (t: 0 = awal / posisi teregang, 1 = akhir / posisi kontraksi). Sumber sudut: docs/program/Gerak.md ──
const PATTERNS = {
  // Leg Extension (Machine): lutut 100° → 30° fleksi (Pedrosa 2021). Duduk, punggung pada sandaran.
  'leg-extension': {
    name: 'Leg Extension (Machine)', muscles: [['quads'], []],
    pose: t => ({ pelvis: [78, 128], trunk: -100, leg: { F: 90, K: lerp(100, 30, t) }, arm: { S: 15, E: 35 } }),
    eq: [
      { d: 'M52 140 H104 V148 H52 Z' }, { d: 'M40 70 L50 66 L66 132 L56 136 Z' }, { d: 'M72 148 V182 M60 182 H96' },
      { f: 'ankle', d: 'M-6 -7 h12 v14 h-12 Z' }, { f: 'knee', d: 'M-3 -3 h6 v6 h-6 Z', soft: true }
    ]
  },
  // Leg Press (45°): lutut 100° → 5° fleksi (Larsen 2025), kereta bergerak di rel 45°.
  'leg-press': {
    name: 'Leg Press (45°)', muscles: [['quads'], ['glutes', 'adductors']],
    pose: t => { const K = lerp(100, 5, t), hip = LP_HIP; return { pelvis: hip, trunk: -150, leg: { ik: add(hip, -38, legReach(K)), bend: 1 }, arm: { S: 25, E: 40 } }; },
    eq: [
      { d: 'M48 150 L106 150 L110 158 L52 158 Z' }, { d: 'M34 108 L42 104 L62 146 L54 150 Z' }, { d: LP_RAIL, line: true },
      { f: 'ankle', d: 'M2 -16 L12 -10 L-2 18 L-12 12 Z' }
    ]
  },
  // Squat (Machine), lever ala chair squat: lutut 5° → 100° (rentang Larsen 2025 untuk paha depan; Kubo 2019: lebih dalam
  // menambah gluteus / adduktor). Kaki tetap di platform, bantalan bahu ikut bahu.
  'squat-machine': {
    name: 'Squat (Machine)', muscles: [['quads'], ['glutes', 'adductors']],
    pose: t => {
      const K = lerp(5, 100, t), ankle = [112, 176];
      const shinUp = lerp(-92, -66, t);                   // tulang kering condong ke depan saat turun
      const knee = add(ankle, shinUp, LEN.shin);
      const thigh = (shinUp + 180) - K;                    // arah pinggul → lutut
      const hip = add(knee, thigh + 180, LEN.thigh);
      return { pelvis: hip, trunk: lerp(-88, -66, t), leg: { ik: ankle, bend: 1, foot: 0 }, arm: { S: 70, E: 100 } };
    },
    eq: [{ d: 'M84 180 H152 V186 H84 Z' }, { d: 'M30 186 H60 V178 H30 Z' }, { f: 'shoulder', cable: [44, 178], thick: true }, { f: 'shoulder', d: 'M-12 -7 H8 V-1 H-12 Z' }]
  },
  // Hip Thrust (Machine): punggung atas di bangku, kaki tetap; pinggul dari fleksi ke ekstensi penuh di atas (aktivasi
  // tertinggi di posisi atas, McCurdy 2021).
  'hip-thrust-machine': {
    name: 'Hip Thrust (Machine)', muscles: [['glutes'], ['hamstrings']],
    pose: t => {
      const sh = [52, 120], down = lerp(36, 0, t);         // arah bahu → pinggul (derajat di bawah horizontal)
      const hip = add(sh, down, LEN.torso);
      return { pelvis: hip, trunk: down + 180, leg: { ik: [148, 162], bend: 1, foot: 0 }, arm: { S: 8, E: 8 }, neck: 0 };
    },
    eq: [{ d: 'M18 125 H62 V135 H18 Z' }, { d: 'M28 135 V184 M54 135 V184' }, { d: 'M126 166 H184 V172 H126 Z' }, { d: 'M136 172 V184 M176 172 V184' }, { f: 'hip', d: 'M-13 -11 H13 V-5 H-13 Z' }]
  },
  // Lat Pulldown (Cable): bar dari atas kepala ke depan dada atas (jalur depan, Di Fonza 2026).
  'lat-pulldown': {
    name: 'Lat Pulldown (Cable)', muscles: [['lats'], ['upper back', 'biceps', 'delts']],
    pose: t => {
      const hip = [92, 134], trunk = lerp(-96, -104, t), sh = add(hip, trunk, LEN.torso);
      const top = add(sh, -84, armReach(10)), low = [sh[0] + 13, sh[1] + 4];
      return { pelvis: hip, trunk: trunk, leg: { F: 92, K: 90 }, arm: { ik: [lerp(top[0], low[0], t), lerp(top[1], low[1], t)], bend: -1 } };
    },
    eq: [{ d: 'M66 142 H116 V150 H66 Z' }, { d: 'M90 150 V184 M74 184 H108' }, { d: 'M128 118 H146 V126 H128 Z' }, { d: 'M92 8 H140', line: true },
      { f: 'wrist', d: 'M-22 -2 H22 V2 H-22 Z' }, { f: 'wrist', cable: [110, 8] }]
  },
  // Seated Cable Row: tangan dari depan ke badan, siku rapat ke badan (abduksi bahu rendah, Di Fonza 2026).
  'seated-cable-row': {
    name: 'Seated Cable Row', muscles: [['upper back'], ['lats', 'biceps', 'delts']],
    pose: t => {
      const hip = [70, 150], trunk = lerp(-80, -92, t), sh = add(hip, trunk, LEN.torso);
      const far = add(sh, 12, armReach(5)), near = [sh[0] + 12, sh[1] + 16];
      return { pelvis: hip, trunk: trunk, leg: { ik: [132, 160], bend: -1, foot: -80 }, arm: { ik: [lerp(far[0], near[0], t), lerp(far[1], near[1], t)], bend: -1 } };
    },
    eq: [{ d: 'M40 158 H100 V166 H40 Z' }, { d: 'M136 140 L142 140 L142 176 L136 176 Z' }, { d: 'M180 100 V180 M170 180 H190', line: true },
      { f: 'wrist', d: 'M-3 -6 H3 V6 H-3 Z' }, { f: 'wrist', cable: [180, 120] }]
  },
  // Chest Fly (Machine): lengan setinggi bahu, dari terbuka ke samping sampai pegangan bertemu di depan (Solstad 2020).
  // Gerak di bidang horizontal: di tampak samping lengan memendek (sx = proyeksi ke depan).
  'chest-fly-machine': {
    name: 'Chest Fly (Machine)', muscles: [['pectorals'], ['delts']],
    pose: t => { const hf = lerp(10, 88, t); return { pelvis: [80, 132], trunk: -92, leg: { F: 90, K: 90 }, arm: { S: 88, E: 15, sx: Math.max(0.12, Math.sin(rad(hf))) } }; },
    eq: [{ d: 'M54 140 H104 V148 H54 Z' }, { d: 'M58 62 L66 60 L76 136 L68 138 Z' }, { d: 'M80 148 V184 M64 184 H96' }, { f: 'wrist', d: 'M-2 -9 H2 V9 H-2 Z' }]
  },
  // Incline Push Up: tangan di bangku, badan lurus; siku dari lurus penuh (atas) sampai dada dekat bangku (Kang 2019).
  'incline-push-up': {
    name: 'Incline Push Up', muscles: [['pectorals'], ['delts', 'triceps', 'abs']],
    pose: t => {
      const ankle = [34, 178], hand = [150, 134], legLen = LEN.thigh + LEN.shin, body = legLen + LEN.torso;
      const want = lerp(armReach(4), armReach(95), t);
      // sudut badan (pergelangan kaki → bahu) supaya jarak bahu–tangan = want
      let lo = -60, hi = 0;
      for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; const sh = add(ankle, m, body); if (dist(sh, hand) > want) lo = m; else hi = m; }
      const a = (lo + hi) / 2, hip = add(ankle, a, legLen);
      return { pelvis: hip, trunk: a, leg: { F: 0, K: 0, foot: a + 90 }, arm: { ik: hand, bend: 1 }, neck: 0 };
    },
    eq: [{ d: 'M144 138 H186 V146 H144 Z' }, { d: 'M150 146 V184 M180 146 V184' }]
  }
};

// Gerakan → pola. Kunci: Exercise ID pustaka atau nama gerakan gym (huruf kecil).
const EX = {
  '0585': 'leg-extension', '0739': 'leg-press', '2330': 'lat-pulldown', '0861': 'seated-cable-row', '0596': 'chest-fly-machine', '0493': 'incline-push-up',
  'leg extension (machine)': 'leg-extension', 'leg press (45°)': 'leg-press', 'squat (machine)': 'squat-machine', 'hip thrust (machine)': 'hip-thrust-machine',
  'lat pulldown (cable)': 'lat-pulldown', 'seated cable row': 'seated-cable-row', 'chest fly (machine)': 'chest-fly-machine', 'incline push up': 'incline-push-up'
};

function build() {
  const pats = {};
  Object.keys(PATTERNS).forEach(function(k) {
    const P = PATTERNS[k];
    const frames = [];
    for (let i = 0; i < FRAMES; i++) frames.push(solve(P.pose(ease(i / (FRAMES - 1)))));
    // Sudut ruas dibuat bersambung antar frame (tidak lompat 179 → −179) supaya animasi CSS tidak berputar balik.
    Object.keys(frames[0].s).forEach(function(sg) {
      for (let i = 1; i < frames.length; i++) {
        const prev = frames[i - 1].s[sg][2];
        let a = frames[i].s[sg][2];
        while (a - prev > 180) a -= 360;
        while (a - prev < -180) a += 360;
        frames[i].s[sg][2] = Math.round(a * 10) / 10;
      }
    });
    // Kabel / tuas: garis dari titik tetap ke sendi yang diikuti → [x, y, sudut, panjang] per frame.
    frames.forEach(function(fr) {
      const c = [];
      (P.eq || []).forEach(function(e) { if (e.cable) { const to = fr.p[e.f]; c.push([e.cable[0], e.cable[1], Math.round(ang(e.cable, to) * 10) / 10, Math.round(dist(e.cable, to) * 10) / 10]); } });
      if (c.length) fr.c = c;
    });
    pats[k] = { name: P.name, muscles: P.muscles, eq: P.eq, frames: frames };
  });
  return { v: 1, len: LEN, w: WIDTH, muscles: MUSCLES, pats: pats, ex: EX, frames: FRAMES };
}

if (require.main === module) {
  const data = build();
  fs.writeFileSync(OUT, JSON.stringify(data));
  const zlib = require('zlib');
  const raw = fs.readFileSync(OUT);
  console.log('wrote ' + path.relative(process.cwd(), OUT) + ' (' + raw.length + ' B, ' + zlib.gzipSync(raw).length + ' B gzip)');
  Object.keys(data.pats).forEach(function(k) {
    const f = data.pats[k].frames, a = f[0].j, b = f[f.length - 1].j;
    console.log(k.padEnd(20) + ' knee ' + a.knee + '→' + b.knee + ' hip ' + a.hip + '→' + b.hip + ' elbow ' + a.elbow + '→' + b.elbow + ' shoulder ' + a.shoulder + '→' + b.shoulder);
  });
}

module.exports = { build, solve, ik, LEN, PATTERNS, EX, legReach, armReach };
