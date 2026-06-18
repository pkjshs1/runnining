function getMonday_(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays_(date, days) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

function formatYmd_(date) {
  return Utilities.formatDate(date, getTimezone_(), 'yyyy-MM-dd');
}

function dateTimeToYmd_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]') return formatYmd_(value);

  const text = String(value).trim();
  const normalized = normalizeDateString_(text);
  if (normalized) return normalized;

  // Google Sheets 표시 형식이 2026. 6. 2 오전 12:05:00처럼 바뀌어도 날짜만 안정적으로 뽑습니다.
  const match = text.match(/(20\d{2})[-/.년\s]+(\d{1,2})[-/.월\s]+(\d{1,2})/);
  if (!match) return null;
  return match[1] + '-' + ('0' + match[2]).slice(-2) + '-' + ('0' + match[3]).slice(-2);
}

function recordIdToYmd_(recordId) {
  const m = String(recordId || '').match(/run_(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return m[1] + '-' + m[2] + '-' + m[3];
}

/**
 * 1회용 보정 함수입니다.
 * 성준님의 2026-06-01 업로드 기록이 AI 오인식으로 2026-06-02 러닝일자로 들어간 경우,
 * 러닝일자를 2026-06-01로 바꿉니다.
 * 실행 후 결과의 changedRows가 1 이상이면 보정이 완료된 것입니다.
 */

function getSpreadsheet_() {
  return SpreadsheetApp.openById(getRequiredProp_('SHEET_ID'));
}

function getDriveFolder_() {
  return DriveApp.getFolderById(getRequiredProp_('DRIVE_FOLDER_ID'));
}

function getGeminiModel_() {
  return getProp_('GEMINI_MODEL', APP.DEFAULT_GEMINI_MODEL);
}

function getTimezone_() {
  return getProp_('APP_TIMEZONE', Session.getScriptTimeZone() || APP.DEFAULT_TIMEZONE);
}

function getProp_(key, fallback) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  return value === null || value === undefined || value === '' ? fallback : value;
}

function getRequiredProp_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new Error('Script Properties에 ' + key + ' 값이 없습니다.');
  return value;
}

function makeAdminCode_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 10);
}

function verifyAdminCode_(adminCode) {
  const expected = getProp_('ADMIN_CODE', '');
  if (!expected) throw new Error('ADMIN_CODE가 아직 설정되지 않았습니다. setupOnce()를 먼저 실행해주세요.');
  if (String(adminCode || '').trim() !== String(expected).trim()) throw new Error('관리자 코드가 맞지 않습니다.');
  return true;
}

function tableRows_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return [];
  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const headers = values[0].map(function (h) { return String(h || '').trim(); });
  return values.slice(1)
    .filter(function (row) { return row.some(function (cell) { return cell !== '' && cell !== null; }); })
    .map(function (row) {
      const obj = {};
      headers.forEach(function (header, idx) {
        if (header) obj[header] = normalizeSheetCell_(row[idx], header);
      });
      return obj;
    });
}

function normalizeSheetCell_(value, header) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (String(header || '').indexOf('일자') >= 0) return Utilities.formatDate(value, getTimezoneSafe_(), 'yyyy-MM-dd');
    return Utilities.formatDate(value, getTimezoneSafe_(), 'yyyy-MM-dd HH:mm:ss');
  }
  return value;
}

function normalizeCellValueForApp_(header, value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    const h = String(header || '');
    if (h.indexOf('일자') >= 0 || h.indexOf('날짜') >= 0) return Utilities.formatDate(value, getTimezoneSafe_(), 'yyyy-MM-dd');
    return Utilities.formatDate(value, getTimezoneSafe_(), 'yyyy-MM-dd HH:mm:ss');
  }
  return value;
}

function decodeDataUrl_(dataUrl, fileName) {
  const text = String(dataUrl || '');
  const match = text.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('이미지 데이터 형식이 올바르지 않습니다.');
  const mimeType = match[1] || 'image/jpeg';
  const bytes = Utilities.base64Decode(match[2]);
  const safeName = safeFileName_(fileName || 'running-upload.jpg');
  const blob = Utilities.newBlob(bytes, mimeType, safeName);
  return { blob: blob, bytes: bytes, mimeType: mimeType, originalFileName: safeName };
}

function makeDataUrl_(imageBase64, mimeType) {
  if (!imageBase64) return '';
  const data = String(imageBase64);
  if (data.indexOf('data:') === 0) return data;
  return 'data:' + (mimeType || 'image/jpeg') + ';base64,' + data;
}

function getGeminiText_(responseJson) {
  const parts = responseJson && responseJson.candidates && responseJson.candidates[0] && responseJson.candidates[0].content && responseJson.candidates[0].content.parts;
  if (!parts || !parts.length) throw new Error('Gemini 응답에 텍스트가 없습니다.');
  const text = parts.map(function (part) { return part.text || ''; }).join('\n').trim();
  if (!text) throw new Error('Gemini 응답 텍스트가 비어 있습니다.');
  return text;
}

function parseJsonLoose_(text) {
  let cleaned = String(text || '').trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch (err) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('JSON 파싱 실패: ' + trimForLog_(cleaned));
  }
}

function sha256Hex_(bytes) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return digest.map(function (b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function makeId_(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  const time = Utilities.formatDate(new Date(), getTimezoneSafe_(), 'yyyyMMddHHmmss');
  return prefix + '_' + time + '_' + rand;
}

function nowString() {
  return nowString_();
}

function nowString_() {
  return Utilities.formatDate(new Date(), getTimezoneSafe_(), 'yyyy-MM-dd HH:mm:ss');
}

function getTimezoneSafe_() {
  try { return getTimezone_(); } catch (err) { return APP.DEFAULT_TIMEZONE; }
}

function cleanNickname_(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[<>"'`\\/|{}\[\]]/g, '');
}

function safeFileName_(name) {
  return String(name || 'upload.jpg')
    .replace(/[\\/:*?"<>|#%{}~&]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 160);
}

function normalizeDateString_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, getTimezoneSafe_(), 'yyyy-MM-dd');
  }
  const text = String(value).trim();
  if (/^20\d{2}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/(20\d{2})[-/.년\s]+(\d{1,2})[-/.월\s]+(\d{1,2})/);
  if (!match) return null;
  return match[1] + '-' + ('0' + match[2]).slice(-2) + '-' + ('0' + match[3]).slice(-2);
}

function parseDurationText_(text) {
  const s = String(text || '').trim();
  const korean = s.match(/(?:(\d+)\s*시간)?\s*(?:(\d+)\s*분)?\s*(?:(\d+)\s*초)?/);
  if (korean && (korean[1] || korean[2] || korean[3])) {
    return (Number(korean[1] || 0) * 3600) + (Number(korean[2] || 0) * 60) + Number(korean[3] || 0);
  }
  const parts = s.match(/\d+/g);
  if (!parts || parts.length < 2) return null;
  const nums = parts.map(Number);
  if (nums.length >= 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return nums[0] * 60 + nums[1];
}

function parsePaceText_(text) {
  const parts = String(text || '').match(/\d+/g);
  if (!parts || parts.length < 2) return null;
  return Number(parts[0]) * 60 + Number(parts[1]);
}

function formatDuration_(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return h + '시간 ' + pad2_(m) + '분 ' + pad2_(s) + '초';
  return m + '분 ' + pad2_(s) + '초';
}

function formatPace_(secondsPerKm) {
  const total = Math.max(0, Math.round(Number(secondsPerKm || 0)));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m + '\'' + pad2_(s) + '"/km';
}

function pad2_(n) { return ('0' + n).slice(-2); }

function numberOrNull_(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && !isNaN(value)) return value;
  const cleaned = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!cleaned) return null;
  const n = Number(cleaned[0]);
  return isNaN(n) ? null : n;
}

function intOrNull_(value) {
  const n = numberOrNull_(value);
  return n === null ? null : Math.round(n);
}

function roundOrNull_(value, digits) {
  if (value === null || value === undefined || isNaN(value)) return null;
  const factor = Math.pow(10, digits || 0);
  return Math.round(Number(value) * factor) / factor;
}

function stringOrNull_(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function toBoolean_(value) {
  if (value === true) return true;
  if (value === false) return false;
  const s = String(value || '').trim().toLowerCase();
  return ['true', 'y', 'yes', '1', '활성', '예', '사용'].indexOf(s) >= 0;
}

function isProofPhotoPublicValue_(value, hasProofPhoto) {
  if (!hasProofPhoto) return false;
  const text = String(value == null ? '' : value).trim();
  if (!text) return true; // v19 이전 기록은 기존 동작과의 호환을 위해 공개로 간주합니다.
  return toBoolean_(text);
}

function bytesToMb_(bytes) {
  return Math.round((Number(bytes || 0) / 1024 / 1024) * 10) / 10;
}

function trimForLog_(text) {
  const s = String(text || '');
  return s.length > 600 ? s.slice(0, 600) + '...' : s;
}

function errorMessage_(err) {
  return err && err.message ? err.message : String(err);
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
