// T-2253: pantau kuota harian akun Google (Gmail biasa: ±100 penerima email, 20.000 UrlFetch, 90 menit trigger).
// Dihitung per hari WIB di Script Property QUOTA_<yyyymmdd> = {mail, fetch, triggerMs, mailSkipped}, disimpan 7 hari.
// Murah: selama tick (runReminderTick, runWarmTick) hitungan ditampung di memori dan ditulis SEKALI di akhir; di luar
// tick setiap penambahan langsung ditulis. Penghitungan tidak pernah menggagalkan pengiriman (semua dibungkus try).
// Titik kirim baru: email lewat _mailSend_(msg), UrlFetch diikuti _quotaFetch_().
// Hanya angka; dibaca hubStatus (XNK Pusat) lewat _quotaToday_().

var QUOTA_KEEP_DAYS = 7;
var MAIL_RESERVE_DEFAULT = 10;

let _quotaAcc_ = null;    // {mail, fetch, triggerMs, mailSkipped} yang belum ditulis
let _quotaHold_ = 0;      // > 0 = sedang di dalam tick; tulis di akhir

/** 'yyyyMMdd' WIB untuk waktu ini (atau `now`). */
function _quotaDay_(now) {
  return Utilities.formatDate(now || new Date(), REMINDER_TZ, 'yyyyMMdd');
}

function _quotaRead_(day) {
  var o = null;
  try { o = JSON.parse(PropertiesService.getScriptProperties().getProperty('QUOTA_' + day) || 'null'); } catch (e) { o = null; }
  o = o && typeof o === 'object' ? o : {};
  return { mail: Number(o.mail) || 0, fetch: Number(o.fetch) || 0, triggerMs: Number(o.triggerMs) || 0, mailSkipped: Number(o.mailSkipped) || 0 };
}

function _quotaAdd_(field, n) {
  try {
    if (!_quotaAcc_) _quotaAcc_ = { mail: 0, fetch: 0, triggerMs: 0, mailSkipped: 0 };
    _quotaAcc_[field] += Number(n) || 0;
    if (_quotaHold_ <= 0) _quotaFlush_();
  } catch (e) { Logger.log('Kuota gagal dihitung: ' + e); }
}

function _quotaMail_(n) { _quotaAdd_('mail', n == null ? 1 : n); }
function _quotaFetch_(n) { _quotaAdd_('fetch', n == null ? 1 : n); }
function _quotaTrigger_(ms) { _quotaAdd_('triggerMs', Math.max(0, Math.round(Number(ms) || 0))); }

/** Mulai tick: hitungan ditampung sampai _quotaHoldEnd_. */
function _quotaHoldStart_() { _quotaHold_++; }

/** Akhir tick: tambahkan lama berjalan lalu tulis sekali. */
function _quotaHoldEnd_(startedMs) {
  try {
    if (startedMs) {
      if (!_quotaAcc_) _quotaAcc_ = { mail: 0, fetch: 0, triggerMs: 0, mailSkipped: 0 };
      _quotaAcc_.triggerMs += Math.max(0, Date.now() - startedMs);
    }
  } catch (e) { /* abaikan */ }
  _quotaHold_ = Math.max(0, _quotaHold_ - 1);
  if (_quotaHold_ === 0) _quotaFlush_();
}

/** Tulis tampungan ke QUOTA_<hari ini> (satu tulis); hari baru = hapus catatan lebih tua dari 7 hari. */
function _quotaFlush_() {
  var acc = _quotaAcc_;
  _quotaAcc_ = null;
  if (!acc || !(acc.mail || acc.fetch || acc.triggerMs || acc.mailSkipped)) return;
  try {
    var props = PropertiesService.getScriptProperties();
    var now = new Date(), day = _quotaDay_(now);
    var isNew = props.getProperty('QUOTA_' + day) == null;
    var cur = _quotaRead_(day);
    ['mail', 'fetch', 'triggerMs', 'mailSkipped'].forEach(function (k) { cur[k] += acc[k] || 0; });
    props.setProperty('QUOTA_' + day, JSON.stringify(cur));
    if (isNew) {
      for (var i = QUOTA_KEEP_DAYS; i < QUOTA_KEEP_DAYS + 8; i++) {
        props.deleteProperty('QUOTA_' + _quotaDay_(new Date(now.getTime() - i * 864e5)));
      }
    }
  } catch (e) { Logger.log('Kuota gagal disimpan: ' + e); }
}

/** Sisa kuota email hari ini menurut Google; null bila tidak bisa dibaca. */
function _mailRemaining_() {
  try {
    var n = MailApp.getRemainingDailyQuota();
    return typeof n === 'number' && isFinite(n) ? n : null;
  } catch (e) { return null; }
}

/** Boleh kirim `n` penerima? Tidak bila sisa − n di bawah MAIL_RESERVE (bawaan 10); yang dilewati dicatat. */
function _mailAllowed_(n) {
  var left = _mailRemaining_();
  if (left == null) return true;
  var reserve = Math.max(0, Math.floor(_numProp_('MAIL_RESERVE', MAIL_RESERVE_DEFAULT)));
  if (left - (n == null ? 1 : n) < reserve) {
    _quotaAdd_('mailSkipped', 1);
    Logger.log('Email dilewati: sisa kuota ' + left + ', cadangan ' + reserve + '.');
    return false;
  }
  return true;
}

/** Jumlah penerima satu email (to, cc, bcc dipisah koma). */
function _mailRecipients_(msg) {
  var n = 0;
  ['to', 'cc', 'bcc'].forEach(function (k) {
    n += String((msg && msg[k]) || '').split(',').map(function (s) { return s.trim(); }).filter(String).length;
  });
  return Math.max(1, n);
}

/**
 * Kirim email lewat MailApp dengan cek cadangan kuota dan hitungan. true = terkirim, false = dilewati (kuota).
 * Error MailApp tetap dilempar seperti sebelumnya.
 */
function _mailSend_(msg) {
  var n = _mailRecipients_(msg);
  if (!_mailAllowed_(n)) return false;
  MailApp.sendEmail(msg);
  _quotaMail_(n);
  return true;
}

/** Angka hari ini untuk hubStatus. */
function _quotaToday_() {
  var day = _quotaDay_();
  var cur = _quotaRead_(day);
  if (_quotaAcc_) ['mail', 'fetch', 'triggerMs', 'mailSkipped'].forEach(function (k) { cur[k] += _quotaAcc_[k] || 0; });
  return {
    date: day.slice(0, 4) + '-' + day.slice(4, 6) + '-' + day.slice(6, 8),
    mail: cur.mail,
    fetch: cur.fetch,
    triggerMin: Math.round(cur.triggerMs / 6000) / 10,
    mailRemaining: _mailRemaining_(),
    mailSkipped: cur.mailSkipped,
  };
}
