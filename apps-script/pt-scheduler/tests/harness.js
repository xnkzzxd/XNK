// Loads the Apps Script server files (src/*.gs) into a Node `vm` context with
// in-memory stand-ins for the Google services they use, so server logic can be
// tested without a Google account. Only the behaviour the code relies on is
// modelled; anything else throws so gaps show up loudly.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const SRC = path.join(__dirname, '..', 'src');
const EXEC_URL = 'https://script.google.com/macros/s/TEST_DEPLOYMENT/exec';

// ── Spreadsheet ─────────────────────────────────────────────────────────────

function colToIndex(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

class Range {
  constructor(sheet, row, col, numRows, numCols) {
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const src = this.sheet.rows[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.numCols; c++) {
        const v = src[this.col - 1 + c];
        line.push(v === undefined || v === null ? '' : v);
      }
      out.push(line);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(values) {
    values.forEach((line, r) => line.forEach((v, c) => this.sheet._set(this.row + r, this.col + c, v)));
    return this;
  }
  setValue(v) {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) this.sheet._set(this.row + r, this.col + c, v);
    }
    return this;
  }
  clearContent() { return this.setValue(''); }
  // Formatting has no effect on stored values here.
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
  setBackground() { return this; }
}

class Sheet {
  constructor(name, rows) {
    this.name = name;
    this.rows = (rows || []).map(r => r.slice());
  }
  getName() { return this.name; }
  getLastRow() {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if ((this.rows[i] || []).some(v => v !== '' && v !== null && v !== undefined)) return i + 1;
    }
    return 0;
  }
  getLastColumn() {
    return this.rows.reduce((m, r) => Math.max(m, (r || []).length), 0);
  }
  _set(row, col, v) {
    while (this.rows.length < row) this.rows.push([]);
    const line = this.rows[row - 1];
    while (line.length < col) line.push('');
    line[col - 1] = v;
  }
  getDataRange() {
    return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
  }
  getRange(a, b, c, d) {
    if (typeof a === 'string') {
      const m = a.match(/^([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/i);
      if (!m) throw new Error('Unsupported A1 notation in test harness: ' + a);
      const c1 = colToIndex(m[1]);
      const r1 = m[2] ? parseInt(m[2], 10) : 1;
      const c2 = m[3] ? colToIndex(m[3]) : c1;
      const r2 = m[4] ? parseInt(m[4], 10) : (m[2] ? r1 : Math.max(1, this.getLastRow()));
      return new Range(this, r1, c1, r2 - r1 + 1, c2 - c1 + 1);
    }
    return new Range(this, a, b, c || 1, d || 1);
  }
  appendRow(values) {
    this.rows.splice(this.getLastRow(), 0, values.slice());
    return this;
  }
  deleteRow(row) { this.rows.splice(row - 1, 1); }
  insertRowBefore(row) { this.rows.splice(row - 1, 0, []); }
  setFrozenRows() {}
}

class Spreadsheet {
  constructor(id) {
    this.id = id;
    this.sheets = [];
  }
  getId() { return this.id; }
  getSheetByName(name) { return this.sheets.find(s => s.name === name) || null; }
  getSheets() { return this.sheets.slice(); }
  insertSheet(name) {
    const s = new Sheet(name);
    this.sheets.push(s);
    return s;
  }
  // Test helper: create/replace a sheet with the given rows (row 1 = header).
  seed(name, rows) {
    this.sheets = this.sheets.filter(s => s.name !== name);
    const s = new Sheet(name, rows);
    this.sheets.push(s);
    return s;
  }
}

// ── Other services ──────────────────────────────────────────────────────────

const toSigned = buf => Array.from(buf, b => (b > 127 ? b - 256 : b));
const toBuffer = data =>
  Array.isArray(data) ? Buffer.from(data.map(b => (b < 0 ? b + 256 : b))) : Buffer.from(String(data), 'utf8');

function makeBlob(data, contentType, name) {
  let buf = data === undefined ? Buffer.alloc(0) : toBuffer(data);
  return {
    getBytes: () => toSigned(buf),
    getDataAsString: () => buf.toString('utf8'),
    getContentType: () => contentType || null,
    getName: () => name || null,
    setName(n) { name = n; return this; },
  };
}

function formatDate(date, _tz, fmt) {
  const d = new Date(date);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = n => String(n).padStart(2, '0');
  return fmt
    .replace('yyyy', d.getFullYear())
    .replace('MMM', months[d.getMonth()])
    .replace('MM', pad(d.getMonth() + 1))
    .replace('dd', pad(d.getDate()))
    .replace(/\bd\b/, d.getDate())
    .replace('HH', pad(d.getHours()))
    .replace('mm', pad(d.getMinutes()))
    .replace('ss', pad(d.getSeconds()));
}

function createEnv(opts = {}) {
  const env = {
    ss: new Spreadsheet('ACTIVE'),
    external: {},          // spreadsheets opened by id
    props: {},             // Script Properties
    cache: {},             // key -> { value, expires }
    mails: [],
    fetches: [],
    logs: [],
    files: [],
    activeUserEmail: opts.activeUserEmail || '',       // anonymous web app visitor
    effectiveUserEmail: opts.effectiveUserEmail || 'owner@example.com',
    now: null,             // override Date.now() for cache expiry tests
  };
  const clock = () => (env.now === null ? Date.now() : env.now);

  const folder = (id, name) => ({
    getId: () => id,
    getName: () => name,
    createFile(blob) {
      const fileId = 'FILE_' + (env.files.length + 1);
      const file = {
        blob, sharing: null, trashed: false,
        getId: () => fileId,
        getUrl: () => 'https://drive.google.com/file/d/' + fileId + '/view',
        setSharing(access, perm) { this.sharing = [access, perm]; return this; },
        setTrashed(t) { this.trashed = t; return this; },
      };
      env.files.push(file);
      return file;
    },
    setTrashed() { return this; },
  });

  const triggerBuilder = () => {
    const b = { timeBased: () => b, everyDays: () => b, atHour: () => b, onWeekDay: () => b, create: () => ({}) };
    return b;
  };

  const htmlOutput = content => {
    const out = {
      content,
      getContent: () => content,
      setTitle: () => out,
      addMetaTag: () => out,
      setXFrameOptionsMode: () => out,
    };
    return out;
  };

  const context = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => env.ss,
      openById: id => {
        if (!env.external[id]) env.external[id] = new Spreadsheet(id);
        return env.external[id];
      },
      flush: () => {},
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (Object.prototype.hasOwnProperty.call(env.props, k) ? env.props[k] : null),
        setProperty(k, v) { env.props[k] = String(v); return this; },
        deleteProperty(k) { delete env.props[k]; return this; },
        getProperties: () => Object.assign({}, env.props),
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: k => {
          const e = env.cache[k];
          if (!e) return null;
          if (e.expires <= clock()) { delete env.cache[k]; return null; }
          return e.value;
        },
        put: (k, v, ttl) => { env.cache[k] = { value: String(v), expires: clock() + (ttl || 600) * 1000 }; },
        remove: k => { delete env.cache[k]; },
      }),
    },
    LockService: {
      getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      getUuid: () => crypto.randomUUID(),
      formatDate,
      sleep: () => {},
      newBlob: makeBlob,
      base64Decode: s => toSigned(Buffer.from(String(s), 'base64')),
      base64Encode: d => toBuffer(d).toString('base64'),
      base64EncodeWebSafe: d => toBuffer(d).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64DecodeWebSafe: s => toSigned(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
      computeDigest: (alg, value) => toSigned(crypto.createHash(alg).update(toBuffer(value)).digest()),
      computeHmacSha256Signature: (value, key) =>
        toSigned(crypto.createHmac('sha256', toBuffer(key)).update(toBuffer(value)).digest()),
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => env.activeUserEmail }),
      getEffectiveUser: () => ({ getEmail: () => env.effectiveUserEmail }),
      getScriptTimeZone: () => 'Asia/Jakarta',
    },
    MailApp: { sendEmail: msg => env.mails.push(msg) },
    UrlFetchApp: {
      fetch: (url, options) => {
        env.fetches.push({ url, options });
        return { getResponseCode: () => 200, getContentText: () => '{}' };
      },
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
      Permission: { VIEW: 'VIEW' },
      createFolder: name => folder('FOLDER_' + name, name),
      getFolderById: id => folder(id, id),
      getFileById: id => env.files.find(f => f.getId() === id),
    },
    ScriptApp: {
      WeekDay: { MONDAY: 'MONDAY' },
      getService: () => ({ getUrl: () => EXEC_URL }),
      getProjectTriggers: () => [],
      newTrigger: () => triggerBuilder(),
      deleteTrigger: () => {},
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
      createTemplateFromFile: name => {
        const file = path.join(SRC, name.endsWith('.html') ? name : name + '.html');
        const text = fs.readFileSync(file, 'utf8'); // throws like Apps Script when missing
        return { evaluate: () => htmlOutput(text), name };
      },
      createHtmlOutputFromFile: name => {
        const file = path.join(SRC, name.endsWith('.html') ? name : name + '.html');
        return htmlOutput(fs.readFileSync(file, 'utf8'));
      },
    },
    Logger: { log: (...a) => env.logs.push(a.join(' ')) },
  };

  vm.createContext(context);
  const gsFiles = fs.readdirSync(SRC).filter(f => f.endsWith('.gs')).sort();
  for (const f of gsFiles) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), context, { filename: f });
  }

  env.context = context;
  // Call a server function the way google.script.run would. Arguments and
  // results are JSON-cloned, since google.script.run only passes plain data.
  env.call = (name, ...args) => {
    const fn = context[name];
    if (typeof fn !== 'function') throw new Error('No server function ' + name);
    const out = fn(...JSON.parse(JSON.stringify(args)));
    // google.script.run also serialises return values.
    return out === undefined ? undefined : JSON.parse(JSON.stringify(out));
  };
  env.sheet = name => env.ss.getSheetByName(name);
  env.EXEC_URL = EXEC_URL;
  return env;
}

module.exports = { createEnv, Spreadsheet, Sheet, EXEC_URL };
