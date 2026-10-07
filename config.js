// ================================================
// ที่อยู่ Apps Script Web App (แก้ที่นี่ที่เดียว ทุกหน้าจะใช้ตาม)
// เมื่อ Deploy แบบ New deployment จะได้ URL ใหม่ → เอามาวางแทนบรรทัดล่างนี้
// ================================================
window.WFH_API_URL = 'https://script.google.com/macros/s/AKfycbwmbbyJeO2DecfYlEypt6lAIrgwRzZLDTKdIVIZOgdRZF8WA1QQecFcOJWAlEYMsDhZyA/exec';

// ระบบนี้ไม่ได้ใช้ Service Worker — ถ้ามีตัวค้างจากโปรเจกต์อื่นที่รันบน 127.0.0.1:5500 ให้ถอดออก
// (ตัวค้างจะทำให้หน้าเว็บโหลดไม่ขึ้น: "FetchEvent ... network error" / "sw.js Failed to convert value to 'Response'")
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    if (!regs.length) return;
    Promise.all(regs.map(function (r) { return r.unregister(); })).then(function () {
      if (window.caches) caches.keys().then(function (keys) { keys.forEach(function (k) { caches.delete(k); }); });
      if (!sessionStorage.getItem('wfh_sw_cleaned')) { sessionStorage.setItem('wfh_sw_cleaned', '1'); location.reload(); }
    });
  }).catch(function () { });
}
