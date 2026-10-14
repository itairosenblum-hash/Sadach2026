/**
 * סדרת חינוך · טבריה — גלריית תמונות (שמירה בתיקייה בדרייב)
 *
 * האתר מקטין כל תמונה לפני ההעלאה (עד 1600 פיקסלים, איכות 80%) ושולח אותה לכאן.
 * הסקריפט שומר אותה בתיקיית הגלריה בדרייב שלך ומחזיר לאתר את רשימת התמונות (20 בכל עמוד).
 *
 * התקנה חד-פעמית:
 * 1. script.google.com ← פרויקט חדש ← להדביק את כל הקובץ הזה במקום הקוד הקיים ← שמירה.
 * 2. לבחור בסרגל העליון את הפונקציה setup ← הפעלה ← לאשר הרשאות.
 *    ביומן (Execution log) יופיע הקישור לתיקיית הגלריה שנוצרה בדרייב.
 * 3. פריסה (Deploy) ← פריסה חדשה (New deployment) ← סוג: אפליקציית אינטרנט (Web app)
 *    ← Execute as: Me ← Who has access: Anyone ← פריסה (Deploy).
 * 4. להעתיק את כתובת ה-Web app (מסתיימת ב-/exec) ולשלוח אותה.
 *
 * מחיקת תמונה: פשוט למחוק אותה מתיקיית הגלריה בדרייב (תיעלם מהאתר תוך דקה).
 */

const CONFIG = {
  FOLDER_ID: '',                               // ריק = הסקריפט יוצר תיקייה חדשה בעצמו
  FOLDER_NAME: 'סדרת חינוך טבריה – גלריה',
  PAGE_SIZE: 20,
  MAX_BYTES: 4 * 1024 * 1024,                  // תקרה לתמונה אחרי הקטנה
  UPLOAD_KEY: 'chinuch-tiberias-2026'          // חייב להתאים לאתר
};

/** להריץ פעם אחת: יוצר את תיקיית הגלריה ומדפיס קישור אליה. */
function setup() {
  const f = getFolder_();
  Logger.log('תיקיית הגלריה: https://drive.google.com/drive/folders/' + f.getId());
}

/** רשימת תמונות לעמוד: ?page=1 */
function doGet(e) {
  const page = Math.max(1, parseInt((e && e.parameter && e.parameter.page) || '1', 10) || 1);
  const all = listAll_();
  const size = CONFIG.PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(all.length / size));
  return json_({
    ok: true, total: all.length, page: page, pages: pages,
    items: all.slice((page - 1) * size, page * size)
  });
}

/** העלאת תמונה אחת: { key, data: "data:image/jpeg;base64,...", name } */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.key !== CONFIG.UPLOAD_KEY) return json_({ ok: false, error: 'bad key' });

    const m = String(body.data || '').match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
    if (!m) return json_({ ok: false, error: 'bad image' });

    const bytes = Utilities.base64Decode(m[3]);
    if (bytes.length > CONFIG.MAX_BYTES) return json_({ ok: false, error: 'too big' });

    const name = String(body.name || '').replace(/[\\\/:*?"<>|]/g, '').trim().slice(0, 40);
    const ts = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM-dd_HH-mm-ss');
    const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
    const blob = Utilities.newBlob(bytes, m[1], ts + (name ? '_' + name : '') + '.' + ext);

    const file = getFolder_().createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    if (name) file.setDescription(name);

    CacheService.getScriptCache().remove('list');
    return json_({ ok: true, id: file.getId() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ---------- helpers ----------

function getFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = CONFIG.FOLDER_ID || props.getProperty('FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* נמחקה — ניצור חדשה */ }
  }
  const folder = DriveApp.createFolder(CONFIG.FOLDER_NAME);
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
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
  arr.sort(function (a, b) { return b.t - a.t; });   // החדשות קודם
  try { cache.put('list', JSON.stringify(arr), 60); } catch (e) {}
  return arr;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
