/**
 * Fungsi untuk mengirim pesan ke Telegram Admin
 * @param {string} pesan - Teks yang ingin dikirim
 */
function kirimNotifTelegram(pesan) {
  // Token bot & chat ID admin disimpan di Script Properties (Project Settings),
  // BUKAN di kode: TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_IDS (dipisah koma).
  const props = PropertiesService.getScriptProperties();
  const tokenBot = props.getProperty('TELEGRAM_BOT_TOKEN');
  const chatIdAdmin = String(props.getProperty('TELEGRAM_CHAT_IDS') || '')
    .split(',').map(function(id) { return id.trim(); }).filter(String);
  if (!tokenBot || chatIdAdmin.length === 0) {
    Logger.log("Notif Telegram dilewati: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_IDS belum diatur di Script Properties.");
    return;
  }
  
  const url = "https://api.telegram.org/bot" + tokenBot + "/sendMessage";
  
  // Lakukan perulangan (looping) untuk setiap ID di dalam array
  chatIdAdmin.forEach(function(id) {
    
    const payload = {
      "chat_id": id, // Gunakan 'id' satuan dari hasil perulangan
      "text": pesan,
      "parse_mode": "HTML" 
    };
    
    const options = {
      "method": "post",
      "contentType": "application/json",
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    };
    
    try {
      UrlFetchApp.fetch(url, options);
    } catch(e) {
      Logger.log("Gagal kirim notif ke ID " + id + ": " + e);
    }
    
  });
}

// ==========================================
// FUNGSI UNTUK UJI COBA (JALANKAN FUNGSI INI)
// ==========================================
function testNotif() {
  const teks = "🚨 <b>Ada Booking Baru!</b>\n\nNama: Budi\nJadwal: Senin, 10:00\nStatus: Menunggu Persetujuan.\n\nSilakan cek di Dashboard!";
  kirimNotifTelegram(teks);
}