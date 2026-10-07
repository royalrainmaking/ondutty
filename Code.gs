// ================================================
// ระบบลงเวลา Work From Home - Google Apps Script
// ================================================
// วิธีใช้: 
// 1. เปิด Google Sheets -> Extensions -> Apps Script
// 2. วางโค้ดนี้ แล้ว Deploy -> New Deployment -> Web App
//    - Execute as: Me
//    - Who has access: Anyone
// 3. คัดลอก URL ที่ได้ไปใส่ในไฟล์ HTML (ค่า API_URL)
// ================================================

const SS_ID = '10XtFPQ4yi4_q8onBaN8W9RRgWZ-AvosadBrhvY2fa2c';

// เปิดไฟล์ Sheet ครั้งเดียวต่อคำขอ แล้วใช้ซ้ำ (เดิมเปิดใหม่ทุกครั้งที่เรียก getSheet)
let _ss = null;
const _sheetCache = {};
function getSS() {
  if (!_ss) _ss = SpreadsheetApp.openById(SS_ID);
  return _ss;
}

function getSheet(name) {
  if (_sheetCache[name]) return _sheetCache[name];
  const ss = getSS();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  _sheetCache[name] = sheet;
  return sheet;
}

// ตรวจโครงสร้างชีตแค่ครั้งแรก แล้วจำไว้ 6 ชั่วโมง (เดิมตรวจทุกคำขอ)
const INIT_CACHE_KEY = 'sheets_ready_v3';
function ensureInit() {
  const cache = CacheService.getScriptCache();
  if (cache.get(INIT_CACHE_KEY)) return;
  initSheets();
  cache.put(INIT_CACHE_KEY, '1', 21600);
}

function initSheets() {
  const usersSheet = getSheet('users');
  if (usersSheet.getLastRow() === 0) {
    usersSheet.appendRow(['id','phone','name','password','role','salary','shift','active','faceDescriptor','department','position']);
    usersSheet.appendRow(["'"+'admin',"'"+'admin',"'"+'ผู้ดูแลระบบ',"'"+'1234',"'"+'admin',"'"+'20000',"'"+'standard',"'"+'true','',"'"+'-',"'"+'-']);
    usersSheet.appendRow(["'"+'1001',"'"+'1001',"'"+'สมชาย เรียนดี',"'"+'1111',"'"+'user',"'"+'9000',"'"+'standard',"'"+'true','',"'"+'ฝบบ',"'"+'ข้าราชการ']);
  } else {
    // ตรวจสอบและอัปเดต Header แบบอัตโนมัติหากยังไม่มีคอลัมน์ใหม่
    const headers = usersSheet.getRange(1, 1, 1, usersSheet.getLastColumn()).getValues()[0];
    if (headers[9] !== 'department') usersSheet.getRange(1, 10).setValue('department');
    if (headers[10] !== 'position') usersSheet.getRange(1, 11).setValue('position');
  }
  const logsSheet = getSheet('logs');
  if (logsSheet.getLastRow() === 0) {
    logsSheet.appendRow(['id','userId','userName','date','time','type','location','lat','lng','photo','signature','lateMin','task','verifyMethod']);
  } else {
    ensureLogsExtraColumns(logsSheet);
  }
  const schedulesSheet = getSheet('schedules');
  if (schedulesSheet.getLastRow() === 0) {
    schedulesSheet.appendRow(['id','userId','from','to','start','end']);
  }
  const settingsSheet = getSheet('settings');
  if (settingsSheet.getLastRow() === 0) {
    settingsSheet.appendRow(['key','value']);
    [['companyName','บริษัท ทดสอบ จำกัด'],['checkInTime','08:30'],['checkOutTime','16:30'],
     ['latePerMin','5'],['workDaysPerMonth','22'],
     ['supervisorName','นายสมชาย คนขยัน'],['approverName','นายสมพงษ์ ใจดี']
    ].forEach(r => settingsSheet.appendRow(r));
  }
}

// ================================================
// เมนู "⚙️ ระบบลงเวลา" ใน Google Sheets
// (ทำงานเมื่อสคริปต์ผูกกับไฟล์ Sheet นี้ผ่าน Extensions -> Apps Script)
// ================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚙️ ระบบลงเวลา')
    .addItem('🛠️ Setup Sheet (สร้าง/ตรวจสอบชีตทั้งหมด)', 'setupSheets')
    .addSeparator()
    .addItem('📷 ดูรายการที่ถ่ายรูปแทนการสแกน', 'showPhotoFallbackLogs')
    .addToUi();
}

function setupSheets() {
  const ui = SpreadsheetApp.getUi();
  initSheets();
  CacheService.getScriptCache().put(INIT_CACHE_KEY, '1', 21600);

  // จัดรูปแบบหัวตาราง + ตรึงแถวแรก ทุกชีต
  const names = ['users', 'logs', 'schedules', 'settings'];
  names.forEach(n => {
    const sh = getSheet(n);
    const lastCol = Math.max(sh.getLastColumn(), 1);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, lastCol)
      .setFontWeight('bold').setBackground('#4f46e5').setFontColor('#ffffff');
  });

  // ชีต logs: ขยายคอลัมน์ M (task) ให้อ่านรายละเอียดงานได้ง่าย
  const logs = getSheet('logs');
  logs.setColumnWidth(13, 420);
  logs.getRange('M:M').setWrap(true);

  const report = names.map(n => {
    const rows = Math.max(getSheet(n).getLastRow() - 1, 0);
    return '✅ ' + n + ' (' + rows + ' แถวข้อมูล)';
  }).join('\n');
  ui.alert('Setup Sheet เรียบร้อย', report, ui.ButtonSet.OK);
}

// สร้าง/อัปเดตชีต photo_fallback ที่รวมรายการที่ระบบถ่ายรูปแทนการสแกน (verifyMethod = photo)
function showPhotoFallbackLogs() {
  initSheets();
  const data = getSheet('logs').getDataRange().getDisplayValues();
  const h = data[0];
  const vIdx = h.indexOf('verifyMethod');
  const pick = ['date','time','userId','userName','type','location','lat','lng','task'].map(k => h.indexOf(k));
  const rows = data.slice(1)
    .filter(r => String(r[vIdx]).replace(/^'/, '') === 'photo')
    .map(r => pick.map(i => i >= 0 ? r[i] : ''));

  const sh = getSheet('photo_fallback');
  sh.clear();
  sh.appendRow(['date','time','userId','userName','type','location','lat','lng','task']);
  if (rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#f59e0b').setFontColor('#ffffff');
  SpreadsheetApp.getActive().setActiveSheet(sh);
  SpreadsheetApp.getUi().alert('พบ ' + rows.length + ' รายการที่ใช้การถ่ายรูปแทนการสแกน');
}

// เพิ่มคอลัมน์ต่อท้ายชีต logs เดิม (ไม่แตะคอลัมน์ A–L และข้อมูลเก่า)
//   M = task          รายละเอียดงานที่ได้รับมอบหมาย
//   N = verifyMethod  face = สแกนผ่าน, photo = ถ่ายรูปแทนหลังสแกนไม่ผ่านใน 8 วินาที
function ensureLogsExtraColumns(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 12);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  if (headers.indexOf('task') >= 0 && headers.indexOf('verifyMethod') >= 0) return;

  // กรณีเคยใช้โค้ดรุ่นก่อนที่ใส่ verifyMethod ไว้ที่ M: ย้ายไป N แล้วใส่ task ที่ M
  if (headers[12] === 'verifyMethod' && headers.indexOf('task') < 0) {
    const n = sheet.getLastRow();
    if (n > 1 && !headers[13]) {
      const vals = sheet.getRange(2, 13, n - 1, 1).getValues();
      sheet.getRange(2, 14, n - 1, 1).setValues(vals);
      sheet.getRange(2, 13, n - 1, 1).clearContent();
    }
    sheet.getRange(1, 13, 1, 2).setValues([['task', 'verifyMethod']]);
    return;
  }
  if (headers.indexOf('task') < 0 && !headers[12]) sheet.getRange(1, 13).setValue('task');
  if (headers.indexOf('verifyMethod') < 0 && !headers[13]) sheet.getRange(1, 14).setValue('verifyMethod');
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    ensureInit();
    const action = e.parameter.action;
    if (action === 'getUsers')     return respond(getUsers());
    if (action === 'getLogs')      return respond(getLogs(e.parameter));
    if (action === 'getSchedules') return respond(getSchedules(e.parameter));
    if (action === 'getSettings')  return respond(getSettings());
    if (action === 'getPhoto')     return respond(getPhoto(e.parameter.id));
    if (action === 'deleteLog')    return respond(deleteRow('logs', e.parameter.id));
    if (action === 'deleteUser')   return respond(deleteRow('users', e.parameter.id));
    return respond({success:false, error:'Unknown action'});
  } catch(err) {
    return respond({success:false, error:err.message});
  }
}

function doPost(e) {
  try {
    ensureInit();
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    if (action === 'addLog')        return respond(addLog(data));
    if (action === 'saveUser')      return respond(saveUser(data));
    if (action === 'deleteLog')     return respond(deleteRow('logs', data.id));
    if (action === 'deleteUser')    return respond(deleteRow('users', data.id));
    if (action === 'saveSchedule')  return respond(saveSchedule(data));
    if (action === 'saveSettings')  return respond(saveSettings(data));
    if (action === 'changePassword')return respond(changePassword(data));
    return respond({success:false, error:'Unknown action'});
  } catch(err) {
    return respond({success:false, error:err.message});
  }
}

// ---- USERS ----
function getUsers() {
  const sheet = getSheet('users');
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return {success:true, data:[]};
  const data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  const headers = data[0];
  const users = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h,i) => {
      if (!h) return; // ignore empty headers
      let val = String(row[i] || '');
      if (val.startsWith("'")) val = val.substring(1);
      obj[h.trim()] = val;
    });
    // Fallback and formatting
    if (!obj.faceDescriptor) obj.faceDescriptor = String(row[8] || '').replace(/^'/, '');
    if (!obj.department) obj.department = String(row[9] || '').replace(/^'/, '');
    if (!obj.position) obj.position = String(row[10] || '').replace(/^'/, '');
    obj.active = String(obj.active).toLowerCase() === 'true';
    obj.salary = String(obj.salary || '0');
    return obj;
  });

  // Deduplicate: If same ID/Phone exists, keep the one with faceDescriptor
  const uniqueUsers = [];
  const map = new Map();
  users.forEach(u => {
    const key = u.id || u.phone;
    if (!map.has(key)) {
      map.set(key, u);
      uniqueUsers.push(u);
    } else {
      // If we found a duplicate, but the new one has a face, replace it
      const existing = map.get(key);
      if (!existing.faceDescriptor && u.faceDescriptor) {
        map.set(key, u);
        const idx = uniqueUsers.indexOf(existing);
        if (idx > -1) uniqueUsers[idx] = u;
      }
    }
  });

  return {success:true, data:uniqueUsers};
}

function saveUser(data) {
  const sheet = getSheet('users');
  const allData = sheet.getDataRange().getValues();
  const searchId = String(data.id || data.phone).replace(/^'/, '');
  
  // Find Row Index (ignoring leadsing single quotes)
  const rowIdx = allData.findIndex((row,i) => {
     if (i === 0) return false;
     const rowId = String(row[0]).replace(/^'/, '');
     const rowPhone = String(row[1]).replace(/^'/, '');
     return rowId === searchId || rowPhone === searchId;
  });

  const faceDesc = data.faceDescriptor ? String(data.faceDescriptor) : '';
  const dept = data.department ? String(data.department) : '';
  const pos = data.position ? String(data.position) : '';
  
  const newRow = ["'"+(data.id || data.phone), "'"+data.phone, "'"+data.name, "'"+data.password,
                  "'"+data.role, "'"+data.salary, "'"+(data.shift || 'standard'), String(data.active !== false), "'"+faceDesc, "'"+dept, "'"+pos];
  
  if (rowIdx > 0) {
    // Update existing
    sheet.getRange(rowIdx+1, 1, 1, newRow.length).setValues([newRow]);
  } else {
    // Check if phone exists (extra safety)
    const phoneExists = allData.slice(1).find(row => String(row[1]).replace(/^'/, '') === String(data.phone));
    if (phoneExists) return {success:false, error:'เบอร์โทรนี้มีอยู่แล้ว'};
    sheet.appendRow(newRow);
  }
  return {success:true};
}

function changePassword(data) {
  const sheet = getSheet('users');
  const allData = sheet.getDataRange().getValues();
  const rowIdx = allData.findIndex((row,i) => i > 0 && String(row[0]).replace(/^'/, '') === String(data.userId));
  if (rowIdx > 0) {
    sheet.getRange(rowIdx+1, 4).setValue("'"+String(data.password));
    return {success:true};
  }
  return {success:false, error:'User not found'};
}

// ---- LOGS ----
function getLogs(params) {
  // อ่านเฉพาะคอลัมน์ข้อมูล ไม่อ่านคอลัมน์รูป/ลายเซ็น (J,K) ซึ่งหนักมาก
  // ส่ง withPhoto=1 มาเมื่อหน้าไหนต้องแสดงรูปจริงๆ จึงจะอ่านรูปเฉพาะแถวที่ตรงเงื่อนไข
  params = params || {};
  const sheet = getSheet('logs');
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return {success:true, data:[]};
  const lastCol = sheet.getLastColumn();
  const n = lastRow - 1;
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());

  const mediaIdx = ['photo','signature'].map(h => headers.indexOf(h)).filter(i => i >= 0);
  const mStart = mediaIdx.length ? Math.min.apply(null, mediaIdx) : lastCol; // 0-based
  const mEnd   = mediaIdx.length ? Math.max.apply(null, mediaIdx) : lastCol - 1;

  const left  = mStart > 0 ? sheet.getRange(2, 1, n, mStart).getValues() : [];
  const rightCount = lastCol - (mEnd + 1);
  const right = rightCount > 0 ? sheet.getRange(2, mEnd + 2, n, rightCount).getValues() : [];

  const wantUser = params.userId ? String(params.userId) : '';
  const logs = [], rowIdx = [];
  for (let r = 0; r < n; r++) {
    const obj = {};
    for (let c = 0; c < mStart; c++) if (headers[c]) obj[headers[c]] = left[r][c];
    for (let c = 0; c < rightCount; c++) { const h = headers[mEnd + 1 + c]; if (h) obj[h] = right[r][c]; }
    if (!obj.id && !obj.userId) continue;
    obj.id = String(obj.id || '');
    obj.date = String(obj.date || '');
    obj.time = String(obj.time || '');
    obj.lateMin = String(obj.lateMin || '0');
    if (wantUser && String(obj.userId) !== wantUser) continue;
    if (params.dateFrom && obj.date < params.dateFrom) continue;
    if (params.dateTo && obj.date > params.dateTo) continue;
    mediaIdx.forEach(i => obj[headers[i]] = '');
    logs.push(obj); rowIdx.push(r);
  }

  if (String(params.withPhoto) === '1' && mediaIdx.length && logs.length) {
    const minR = Math.min.apply(null, rowIdx), maxR = Math.max.apply(null, rowIdx);
    const block = sheet.getRange(minR + 2, mStart + 1, maxR - minR + 1, mEnd - mStart + 1).getValues();
    logs.forEach((obj, k) => {
      const row = block[rowIdx[k] - minR];
      mediaIdx.forEach(i => obj[headers[i]] = String(row[i - mStart] || ''));
    });
  }
  return {success:true, data:logs};
}

function addLog(data) {
  const sheet = getSheet('logs');
  const logType = String(data.type);   // 'checkin' or 'checkout'
  const logUserId = String(data.userId);
  const logDate = String(data.date || '');

  // ── Server-side duplicate guard ──────────────────────────────────────────
  // ป้องกันบันทึก checkin หรือ checkout ซ้ำในวันเดียวกัน
  if (logDate && (logType === 'checkin' || logType === 'checkout')) {
    // อ่านเฉพาะคอลัมน์ B–F (userId..type) ของ 300 แถวล่าสุด
    // (แถวถูกเพิ่มต่อท้ายตามเวลา รายการของวันนี้จึงอยู่ท้ายชีตเสมอ)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const headers = sheet.getRange(1, 2, 1, 5).getValues()[0]; // userId,userName,date,time,type
      const take = Math.min(300, lastRow - 1);
      const allLogs = sheet.getRange(lastRow - take + 1, 2, take, 5).getValues();
      const userIdIdx = headers.indexOf('userId');
      const dateIdx   = headers.indexOf('date');
      const typeIdx   = headers.indexOf('type');

      const duplicate = allLogs.some(row => {
        const rowUserId = String(row[userIdIdx] || '').replace(/^'/, '');
        const rowDate   = String(row[dateIdx]   || '').replace(/^'/, '');
        const rowType   = String(row[typeIdx]   || '').replace(/^'/, '');
        return rowUserId === logUserId && rowDate === logDate && rowType === logType;
      });

      if (duplicate) {
        return {success: false, error: `มีการลงเวลา${logType === 'checkin' ? 'เข้างาน' : 'ออกงาน'}วันนี้ไปแล้ว`};
      }
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  const id = "'" + String(Date.now());
  const userId = "'" + logUserId;
  const userName = "'" + String(data.userName);
  const type = "'" + logType;
  const location = "'" + String(data.location || '');
  const lat = "'" + String(data.lat || '');
  const lng = "'" + String(data.lng || '');
  const lateMin = "'" + String(data.lateMin || 0);
  
  // Limit photo/sig size to avoid cell overflow
  const photo = data.photo ? data.photo.substring(0, 40000) : '';
  const sig   = data.signature ? data.signature.substring(0, 10000) : '';
  
  const date = "'" + logDate;
  const time = "'" + String(data.time || '');
  
  const taskText = String(data.task || '').trim().substring(0, 1000);
  const task = taskText ? "'" + taskText : '';
  const verifyMethod = "'" + (String(data.verifyMethod || '') === 'photo' ? 'photo' : 'face');

  // A–L เหมือนเดิม, M = task, N = verifyMethod
  sheet.appendRow([id, userId, userName, date, time, type,
                   location, lat, lng, photo, sig, lateMin, task, verifyMethod]);
  return {success:true, id: id.replace(/^'/, '')};
}

// ดึงรูปของรายการเดียว (หน้าแอดมินกดดูรูปทีละรายการ)
function getPhoto(id) {
  const sheet = getSheet('logs');
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return {success:false, error:'ไม่พบรายการ'};
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  const pIdx = headers.indexOf('photo');
  if (pIdx < 0) return {success:false, error:'ไม่มีคอลัมน์รูป'};
  const want = String(id || '').replace(/^'/, '');
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {   // รายการใหม่อยู่ท้าย ค้นจากท้ายขึ้นไป
    if (String(ids[i][0]).replace(/^'/, '') === want) {
      const photo = String(sheet.getRange(i + 2, pIdx + 1).getValue() || '');
      return {success:true, data:{photo: photo}};
    }
  }
  return {success:false, error:'ไม่พบรายการ'};
}

// ---- SCHEDULES ----
function getSchedules(params) {
  const sheet = getSheet('schedules');
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return {success:true, data:[]};
  const data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  const headers = data[0];
  let schedules = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h,i) => obj[h] = row[i]);
    obj.id = String(obj.id);
    return obj;
  });
  if (params && params.userId) schedules = schedules.filter(s => String(s.userId) === String(params.userId));
  return {success:true, data:schedules};
}

function saveSchedule(data) {
  const sheet = getSheet('schedules');
  const allData = sheet.getDataRange().getValues();
  const existingIdx = allData.findIndex((row,i) =>
    i > 0 && String(row[1]) === String(data.userId) && row[2] === data.from && row[3] === data.to
  );
  if (existingIdx > 0) sheet.deleteRow(existingIdx+1);
  sheet.appendRow([String(Date.now()), data.userId, data.from, data.to, data.start, data.end]);
  // Update user shift
  const usersSheet = getSheet('users');
  const usersData = usersSheet.getDataRange().getValues();
  const userIdx = usersData.findIndex((row,i) => i > 0 && String(row[0]) === String(data.userId));
  if (userIdx > 0) usersSheet.getRange(userIdx+1, 7).setValue(data.start+'-'+data.end);
  return {success:true};
}

// ---- SETTINGS ----
function getSettings() {
  const sheet = getSheet('settings');
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return {success:true, data:{}};
  const data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  const settings = {};
  data.slice(1).forEach(row => { if(row[0]) settings[row[0]] = row[1]; });
  return {success:true, data:settings};
}

function saveSettings(data) {
  const sheet = getSheet('settings');
  const allData = sheet.getDataRange().getValues();
  const keys = ['companyName','checkInTime','checkOutTime','latePerMin','workDaysPerMonth','supervisorName','approverName'];
  keys.forEach(key => {
    if (data[key] !== undefined) {
      const rowIdx = allData.findIndex((row,i) => i > 0 && row[0] === key);
      if (rowIdx > 0) sheet.getRange(rowIdx+1, 2).setValue(data[key]);
      else sheet.appendRow([key, data[key]]);
    }
  });
  return {success:true};
}

// ---- GENERIC DELETE ----
function deleteRow(sheetName, id) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return {success:true};
  // อ่านเฉพาะคอลัมน์ id (A) ไม่ต้องอ่านทั้งชีต
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const want = String(id).replace(/^'/, '');
  const idx = ids.findIndex(r => String(r[0]).replace(/^'/, '') === want);
  if (idx >= 0) sheet.deleteRow(idx + 2);
  return {success:true};
}
