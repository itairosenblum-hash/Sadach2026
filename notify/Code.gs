/**
 * סדרת חינוך · טבריה — התראה לנייד (Push) על כל נרשם חדש
 *
 * איך זה עובד: הסקריפט בודק כל דקה את רשימת הנרשמים הציבורית ב-Firestore
 * (public_list — שם, יחידה ומין בלבד) ושולח התראת Push לנייד דרך אפליקציית ntfy
 * על כל רשומה חדשה (ואם רוצים — גם מייל, ראו SEND_EMAIL).
 * רשומה ב-public_list נוצרת רק יחד עם הרשמה אמיתית (כלל existsAfter),
 * כך שאי אפשר לזייף התראות. אין צורך בשינוי באתר.
 *
 * התקנה חד-פעמית:
 * 1. script.google.com ← פרויקט חדש ← להדביק את הקובץ הזה במקום הקוד הקיים.
 * 2. לבחור בפונקציה setup בסרגל העליון ← הפעלה ← לאשר הרשאות.
 * 3. בנייד: להתקין את האפליקציה ntfy (חינם, Android/iPhone) ← "+" ← Subscribe to topic
 *    ← להקליד את שם הנושא מ-NTFY_TOPIC למטה (בדיוק כמו שהוא) ← Subscribe.
 * 4. להריץ sendTestPush — אמורה להגיע התראה לנייד תוך שניות.
 *
 * שם הנושא הוא כמו סיסמה: מי שיודע אותו יכול לקבל את ההתראות. לא לשתף.
 */

const CONFIG = {
  PROJECT_ID: 'sadach-a63c7',
  API_KEY: 'AIzaSyB7mXq6CuqSxS6A20xIir6EkrR3rMPSvCI',
  NTFY_TOPIC: 'PASTE_TOPIC_HERE',           // שם הנושא באפליקציית ntfy
  SEND_EMAIL: false,                        // true = לשלוח גם מייל כמו קודם
  NOTIFY_TO: 'itai.rosenblum@gmail.com',   // למייל, אם SEND_EMAIL פעיל
  SITE_URL: 'https://itairosenblum-hash.github.io/Sadach2026/',
  TIMEZONE: 'Asia/Jerusalem'
};

const BASE = 'https://firestore.googleapis.com/v1/projects/' + CONFIG.PROJECT_ID +
             '/databases/(default)/documents';
const PROP_LAST = 'lastSeenCreatedAt';

/** להריץ פעם אחת: מסמן "מעכשיו והלאה" ויוצר טריגר שרץ כל דקה. */
function setup() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'checkNewRegistrations'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });

  // נרשמים קיימים לא יקבלו התראה — רק מי שנרשם מעכשיו
  PropertiesService.getScriptProperties().setProperty(PROP_LAST, new Date().toISOString());

  ScriptApp.newTrigger('checkNewRegistrations').timeBased().everyMinutes(1).create();
  Logger.log('הוגדר. התראות Push נשלחות לנושא: ' + CONFIG.NTFY_TOPIC);
}

/** רץ אוטומטית כל דקה. */
function checkNewRegistrations() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const last = props.getProperty(PROP_LAST) || new Date().toISOString();

    const rows = queryNewSince_(last);
    if (!rows.length) return;

    const total = countAll_();
    rows.forEach(function (r) {
      sendPush_(r, total);
      if (CONFIG.SEND_EMAIL) sendMail_(r, total);
      props.setProperty(PROP_LAST, r.createdAt);   // מתקדם אחרי כל התראה — בלי כפילויות
    });
  } finally {
    lock.releaseLock();
  }
}

/** התראת Push לדוגמה, בלי לגעת בנתונים. */
function sendTestPush() {
  sendPush_({ name: 'ישראל ישראלי (בדיקה)', unit: 'קריה', gender: 'זכר',
              createdAt: new Date().toISOString() }, countAll_());
}

/** מייל לדוגמה, בלי לגעת בנתונים. */
function sendTestEmail() {
  sendMail_({ name: 'ישראל ישראלי (בדיקה)', unit: 'קריה', gender: 'זכר',
              createdAt: new Date().toISOString() }, countAll_());
}

/** מבטל את ההתראות. */
function stopNotifications() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'checkNewRegistrations'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log('ההתראות בוטלו.');
}

// ---------- Firestore REST ----------

function queryNewSince_(isoTs) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'public_list' }],
      where: { fieldFilter: {
        field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN',
        value: { timestampValue: isoTs } } },
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }],
      limit: 50
    }
  };
  const res = post_(BASE + ':runQuery', body);
  return res
    .filter(function (x) { return x.document; })
    .map(function (x) {
      const f = x.document.fields || {};
      return {
        name: str_(f.name), unit: str_(f.unit), gender: str_(f.gender),
        createdAt: f.createdAt ? f.createdAt.timestampValue : isoTs
      };
    });
}

function countAll_() {
  try {
    const res = post_(BASE + ':runAggregationQuery', {
      structuredAggregationQuery: {
        structuredQuery: { from: [{ collectionId: 'public_list' }] },
        aggregations: [{ alias: 'n', count: {} }]
      }
    });
    return Number(res[0].result.aggregateFields.n.integerValue);
  } catch (e) {
    return null;
  }
}

function post_(url, body) {
  const resp = UrlFetchApp.fetch(url + '?key=' + CONFIG.API_KEY, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(body), muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Firestore ' + resp.getResponseCode() + ': ' + resp.getContentText());
  }
  return JSON.parse(resp.getContentText());
}

function str_(v) { return v && v.stringValue ? v.stringValue : ''; }

// ---------- Push (ntfy) ----------

function sendPush_(r, total) {
  const when = Utilities.formatDate(new Date(r.createdAt), CONFIG.TIMEZONE, 'HH:mm');
  const verb = r.gender === 'נקבה' ? 'נרשמה' : 'נרשם';
  const resp = UrlFetchApp.fetch('https://ntfy.sh/', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({
      topic: CONFIG.NTFY_TOPIC,
      title: r.name + ' ' + verb + ' (' + r.unit + ')',
      message: 'סדרת חינוך · ' + when + (total != null ? ' · סה"כ נרשמים: ' + total : ''),
      tags: ['tada'],
      click: CONFIG.SITE_URL + 'admin.html'
    })
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('ntfy ' + resp.getResponseCode() + ': ' + resp.getContentText());
  }
}

// ---------- Email ----------

function sendMail_(r, total) {
  const when = Utilities.formatDate(new Date(r.createdAt), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm');
  const verb = r.gender === 'נקבה' ? 'נרשמה' : 'נרשם';
  const subject = 'סדרת חינוך: ' + r.name + ' (' + r.unit + ') ' + verb;

  const row = function (k, v) {
    return '<tr><td style="padding:6px 0;color:#5b7b7b;width:90px">' + k +
           '</td><td style="padding:6px 0;font-weight:600">' + esc_(v) + '</td></tr>';
  };
  const html =
    '<div dir="rtl" style="font-family:Arial,sans-serif;max-width:480px;margin:auto;' +
    'background:#eaf6f6;border-radius:14px;padding:20px;color:#0f4c4c">' +
    '<h2 style="margin:0 0 12px">נרשם/ה חדש/ה לסדרת החינוך</h2>' +
    '<table style="width:100%;border-collapse:collapse;font-size:15px">' +
    row('שם', r.name) + row('יחידה', r.unit) + row('מין', r.gender) + row('זמן', when) +
    (total != null ? row('סה"כ נרשמים', String(total)) : '') +
    '</table>' +
    '<a href="' + CONFIG.SITE_URL + '" style="display:inline-block;margin-top:16px;' +
    'background:#0f4c4c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px">' +
    'לפרטים המלאים באתר</a></div>';

  MailApp.sendEmail({
    to: CONFIG.NOTIFY_TO,
    subject: subject,
    htmlBody: html,
    body: subject + '\n' + when + (total != null ? '\nסה"כ: ' + total : '') + '\n' + CONFIG.SITE_URL,
    name: 'סדרת חינוך · טבריה'
  });
}

function esc_(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
