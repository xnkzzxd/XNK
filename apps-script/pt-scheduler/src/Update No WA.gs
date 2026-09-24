function pertahankanWABaru() {
  requireOwner_(); // hanya pemilik, dari editor Apps Script
  // PENTING: sejak migrasi split-sheet, data klien (termasuk No WA) ada di
  // sheet "MemberData", BUKAN "Members" lagi. Sheet "Members" sekarang cuma
  // log transaksi (append-only, kolom C-nya "Tanggal", bukan "No WA").
  // Kalau fungsi ini masih menunjuk ke "Members", dia akan salah kira kolom
  // Tanggal sebagai No WA, dan menimpa tanggal transaksi lama jadi "-" tiap
  // ada 2 transaksi dengan tanggal yang sama — yang bikin baris itu gagal
  // di-parse tanggalnya dan hilang dari riwayat/card arsip di tab Klien.
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("MemberData");
  var range = sheet.getDataRange();
  var values = range.getValues();
  
  // Kolom C (No WA) berada di indeks ke-2 (A=0, B=1, C=2) di sheet MemberData
  var waColumnIndex = 2; 
  var seenWA = {};
  
  // Scan data dari bawah (baris paling baru) ke atas (baris lama)
  for (var i = values.length - 1; i >= 1; i--) {
    var waNumber = values[i][waColumnIndex].toString().trim();
    
    // Abaikan jika sel kosong atau sudah berupa "-"
    if (waNumber && waNumber !== "-") {
      if (seenWA[waNumber]) {
        // Jika nomor sudah pernah ditemukan di bawahnya (artinya ini data lama)
        // Ubah nomor di baris lama ini menjadi "-"
        sheet.getRange(i + 1, waColumnIndex + 1).setValue("-");
      } else {
        // Jika belum pernah ditemukan, tandai nomor ini sebagai yang terbaru
        seenWA[waNumber] = true;
      }
    }
  }
}