const CONFIG = {
  FOLDER_ID: '1c1WyuG02oyfehayScsgo9yQibiZvZWTL',
  PAGE_SIZE: 20,
  MAX_BYTES: 4 * 1024 * 1024,
  UPLOAD_KEY: 'chinuch-tiberias-2026',
  FIREBASE_API_KEY: 'AIzaSyB7mXq6CuqSxS6A20xIir6EkrR3rMPSvCI',
  ADMIN_EMAILS: ['itai.rosenblum@gmail.com', 'henshvarts@gmail.com']
};

/** להריץ פעם אחת ולאשר הרשאות (כתיבה לדרייב + חיבור לאינטרנט) */
function authorize() {
  const f = getFolder_().createFile('test.txt', 'ok');
  f.setTrashed(true);
  UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  Logger.log('הרשאות תקינות ✓ תיקייה: ' + getFolder_().getName());
}

function doGet(e) {
  const page = Math.max(1, parseInt((e && e.parameter && e.parameter.page) || '1', 10) || 1);
  const all = listAll_();
  const pages = Math.max(1, Math.ceil(all.length / CONFIG.PAGE_SIZE));
  return json_({ ok: true, total: all.length, page: page, pages: pages,
    items: all.slice((page - 1) * CONFIG.PAGE_SIZE, page * CONFIG.PAGE_SIZE) });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.key !== CONFIG.UPLOAD_KEY) return json_({ ok: false, error: 'bad key' });
    if (body.action === 'delete') return deleteImage_(body);
    return uploadImage_(body);
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function getFolder_() {
  return DriveApp.getFolderById(CONFIG.FOLDER_ID);
}

function uploadImage_(body) {
  const m = String(body.data || '').match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
  if (!m) return json_({ ok: false, error: 'bad image' });
  const bytes = Utilities.base64Decode(m[3]);
  if (bytes.length > CONFIG.MAX_BYTES) return json_({ ok: false, error: 'too big' });
  const name = String(body.name || '').replace(/[\\\/:*?"<>|]/g, '').trim().slice(0, 40);
  const ts = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM-dd_HH-mm-ss');
  const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
  const file = getFolder_().createFile(Utilities.newBlob(bytes, m[1], ts + (name ? '_' + name : '') + '.' + ext));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  if (name) file.setDescription(name);
  const token = String(body.token || '');
  if (/^[a-f0-9]{32}$/.test(token)) {
    PropertiesService.getScriptProperties().setProperty('t_' + file.getId(), token);
  }
  CacheService.getScriptCache().remove('list');
  return json_({ ok: true, id: file.getId() });
}

function deleteImage_(body) {
  const id = String(body.id || '');
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty('t_' + id);
  const byOwner = !!saved && body.token === saved;
  if (!byOwner && !isAdmin_(body.idToken)) return json_({ ok: false, error: 'not allowed' });
  const file = DriveApp.getFileById(id);
  let inGallery = false;
  const parents = file.getParents();
  while (parents.hasNext()) { if (parents.next().getId() === CONFIG.FOLDER_ID) inGallery = true; }
  if (!inGallery) return json_({ ok: false, error: 'not in gallery' });
  file.setTrashed(true);
  props.deleteProperty('t_' + id);
  CacheService.getScriptCache().remove('list');
  return json_({ ok: true });
}

function isAdmin_(idToken) {
  if (!idToken) return false;
  const r = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + CONFIG.FIREBASE_API_KEY,
    { method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return false;
  const u = (JSON.parse(r.getContentText()).users || [])[0];
  return !!(u && u.emailVerified && CONFIG.ADMIN_EMAILS.indexOf(String(u.email).toLowerCase()) !== -1);
}

function listAll_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('list');
  if (hit) return JSON.parse(hit);
  const files = getFolder_().getFiles();
  const arr = [];
  while (files.hasNext()) {
    const f = files.next();
    if (f.isTrashed() || f.getMimeType().indexOf('image/') !== 0) continue;
    arr.push({ id: f.getId(), t: f.getDateCreated().getTime(), by: f.getDescription() || '' });
  }
  arr.sort(function (a, b) { return b.t - a.t; });
  try { cache.put('list', JSON.stringify(arr), 60); } catch (e) {}
  return arr;
}
