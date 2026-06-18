function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function doGet(e) {
  const template = HtmlService.createTemplateFromFile('index');
  template.updateLabel = getAppUpdateLabel_();
  template.appVersion = APP_META.VERSION;

  return template
    .evaluate()
    .setTitle('러닝 챌린지')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getAppUpdateLabel_() {
  const props = PropertiesService.getScriptProperties();
  const storedVersion = props.getProperty('APP_UPDATE_VERSION') || '';
  const storedLabel = props.getProperty('APP_UPDATE_LABEL') || '';
  if (storedVersion === APP_META.VERSION && storedLabel) return normalizeUpdateLabel_(storedLabel);

  const deployedAt = Utilities.formatDate(new Date(), getTimezoneSafe_(), 'yyyy-MM-dd HH:mm');
  const label = normalizeUpdateLabel_(APP_META.UPDATED_AT || deployedAt);
  props.setProperty('APP_UPDATE_VERSION', APP_META.VERSION);
  props.setProperty('APP_UPDATE_LABEL', label);
  return label;
}

function normalizeUpdateLabel_(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return Utilities.formatDate(new Date(), getTimezoneSafe_(), 'yyyy년 M월 d일 HH:mm 업데이트');
  }
  if (/^20\d{2}년/.test(raw)) {
    return raw.indexOf('업데이트') >= 0 ? raw : raw + ' 업데이트';
  }
  const match = raw.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const time = match[4] ? ' ' + String(match[4]).padStart(2, '0') + ':' + match[5] : '';
    return year + '년 ' + month + '월 ' + day + '일' + time + ' 업데이트';
  }
  return raw.indexOf('업데이트') >= 0 ? raw : raw + ' 업데이트';
}

/**
 * Apps Script 함수 목록에서 실행하면 현재 시각을 상단 업데이트 날짜로 저장합니다.
 * 이 값은 현재 APP_META.VERSION과 함께 저장되므로, 다음 버전으로 올리면 APP_META.UPDATED_AT이 다시 기본값이 됩니다.
 */

function setUpdateDateNow(adminCode) {
  verifyAdminCode_(adminCode);
  const label = Utilities.formatDate(new Date(), getTimezoneSafe_(), 'yyyy년 M월 d일 HH:mm 업데이트');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('APP_UPDATE_VERSION', APP_META.VERSION);
  props.setProperty('APP_UPDATE_LABEL', label);
  return {
    ok: true,
    version: APP_META.VERSION,
    label: label,
    message: '상단 업데이트 날짜를 현재 시각으로 저장했어요. 저장 후 웹앱을 새 버전으로 배포해주세요.'
  };
}

/**
 * 원하는 문구로 직접 지정하고 싶을 때 사용합니다.
 * 예: setUpdateDateLabel('관리자코드', '2026년 6월 16일 00:28 업데이트')
 */

function setUpdateDateLabel(adminCode, label) {
  verifyAdminCode_(adminCode);
  const text = normalizeUpdateLabel_(label);
  if (!text) throw new Error('업데이트 날짜 문구를 입력해주세요.');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('APP_UPDATE_VERSION', APP_META.VERSION);
  props.setProperty('APP_UPDATE_LABEL', text);
  return {
    ok: true,
    version: APP_META.VERSION,
    label: text,
    message: '상단 업데이트 날짜를 직접 지정했어요. 저장 후 웹앱을 새 버전으로 배포해주세요.'
  };
}

/**
 * Script Properties에 저장된 업데이트 날짜를 지우고 현재 버전의 배포 반영 시각을 다시 저장합니다.
 */

function clearUpdateDateLabel(adminCode) {
  verifyAdminCode_(adminCode);
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('APP_UPDATE_VERSION');
  props.deleteProperty('APP_UPDATE_LABEL');
  return {
    ok: true,
    version: APP_META.VERSION,
    label: getAppUpdateLabel_(),
    message: '저장된 업데이트 날짜를 지우고 현재 버전의 배포 반영 시각을 다시 저장합니다.'
  };
}

/**
 * 외부 자동화용 JSON API입니다. 필요 없으면 쓰지 않아도 됩니다.
 */

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    verifyApiSecret_(body.apiSecret || body.token || (e && e.parameter && (e.parameter.apiSecret || e.parameter.token)));
    const dataUrl = body.dataUrl || body.imageDataUrl || makeDataUrl_(body.imageBase64, body.mimeType);
    const result = submitRun({
      participantId: body.participantId || body.challengerId,
      dataUrl: dataUrl,
      fileName: body.fileName || 'running-upload.jpg',
      proofPhotoDataUrl: body.proofPhotoDataUrl || body.proofImageDataUrl || makeDataUrl_(body.proofPhotoBase64, body.proofPhotoMimeType),
      proofPhotoFileName: body.proofPhotoFileName || body.proofImageFileName || '',
      proofPhotoPublic: toBoolean_(body.proofPhotoPublic),
      note: body.note || ''
    });
    return jsonOutput_(result);
  } catch (err) {
    return jsonOutput_({ ok: false, error: errorMessage_(err) });
  }
}

/**
 * 최초 1회 실행하세요.
 * 기존 Sheet/Drive를 이미 만들었다면 Script Properties의 SHEET_ID, DRIVE_FOLDER_ID를 그대로 사용합니다.
 */

function setupOnce(adminCodeOrSetupSecret) {
  const props = PropertiesService.getScriptProperties();
  const existingAdminCode = props.getProperty('ADMIN_CODE');
  if (existingAdminCode) {
    verifyAdminCode_(adminCodeOrSetupSecret);
  } else {
    verifySetupSecretIfConfigured_(adminCodeOrSetupSecret);
  }
  let sheetId = props.getProperty('SHEET_ID');
  let folderId = props.getProperty('DRIVE_FOLDER_ID');

  if (!sheetId) {
    const ss = SpreadsheetApp.create('러닝 챌린지 DB');
    sheetId = ss.getId();
    props.setProperty('SHEET_ID', sheetId);
  }

  if (!folderId) {
    const folder = DriveApp.createFolder('running-challenge-uploads');
    folderId = folder.getId();
    props.setProperty('DRIVE_FOLDER_ID', folderId);
  }

  props.setProperty('GEMINI_MODEL', props.getProperty('GEMINI_MODEL') || APP.DEFAULT_GEMINI_MODEL);
  props.setProperty('MAX_UPLOAD_BYTES', props.getProperty('MAX_UPLOAD_BYTES') || String(APP.DEFAULT_MAX_UPLOAD_BYTES));
  props.setProperty('MAKE_IMAGES_PUBLIC', props.getProperty('MAKE_IMAGES_PUBLIC') || 'false');
  props.setProperty('ALLOW_DUPLICATES', props.getProperty('ALLOW_DUPLICATES') || 'false');
  props.setProperty('APP_TIMEZONE', props.getProperty('APP_TIMEZONE') || APP.DEFAULT_TIMEZONE);
  props.setProperty('ADMIN_CODE', props.getProperty('ADMIN_CODE') || makeAdminCode_());
  props.setProperty('API_SECRET', props.getProperty('API_SECRET') || Utilities.getUuid().replace(/-/g, ''));

  const ss = SpreadsheetApp.openById(sheetId);
  ensureSheets_(ss);
  props.setProperty('SCHEMA_VERSION', APP_META.VERSION + '_polished_running_club');
  backfillParticipantEmojis_(ss);
  refreshDashboardSheet();

  return {
    ok: true,
    message: '초기 설정 완료. 기존 닉네임의 이모지도 자동 보완했습니다. GEMINI_API_KEY를 Script Properties에 넣은 뒤 testGeminiConnection(관리자코드)을 실행하세요. 관리자 코드는 Script Properties의 ADMIN_CODE에서 확인/변경할 수 있습니다.',
    sheetUrl: ss.getUrl(),
    driveFolderUrl: 'https://drive.google.com/drive/folders/' + folderId,
    adminCodeSet: Boolean(props.getProperty('ADMIN_CODE'))
  };
}

function healthCheck(adminCode) {
  verifyAdminCode_(adminCode);
  const props = PropertiesService.getScriptProperties();
  const required = ['SHEET_ID', 'DRIVE_FOLDER_ID', 'GEMINI_API_KEY'];
  const missing = required.filter(function (key) { return !props.getProperty(key); });

  let sheetOk = false;
  let folderOk = false;
  let sheetsOk = false;

  try {
    const ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
    sheetOk = true;
    sheetsOk = Boolean(
      ss.getSheetByName(APP.SHEET_PARTICIPANTS) &&
      ss.getSheetByName(APP.SHEET_RECORDS) &&
      ss.getSheetByName(APP.SHEET_DASHBOARD) &&
      ss.getSheetByName(APP.SHEET_REACTIONS) &&
      ss.getSheetByName(APP.SHEET_GOAL_HISTORY) &&
      ss.getSheetByName(APP.SHEET_LIGHTNING_RSVP)
    );
  } catch (err) {
    sheetOk = false;
  }

  try {
    DriveApp.getFolderById(props.getProperty('DRIVE_FOLDER_ID'));
    folderOk = true;
  } catch (err) {
    folderOk = false;
  }

  return {
    ok: missing.length === 0 && sheetOk && folderOk && sheetsOk,
    missingProperties: missing,
    sheetOk: sheetOk,
    folderOk: folderOk,
    requiredSheetsOk: sheetsOk,
    model: getProp_('GEMINI_MODEL', APP.DEFAULT_GEMINI_MODEL),
    adminCodeSet: Boolean(props.getProperty('ADMIN_CODE')),
    pinRemoved: true,
    inviteCodeRemoved: true,
    rankingRemoved: true
  };
}

function testGeminiConnection(adminCode) {
  verifyAdminCode_(adminCode);
  const apiKey = getRequiredProp_('GEMINI_API_KEY');
  const model = getGeminiModel_();
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': apiKey },
    payload: JSON.stringify({
      contents: [{ parts: [{ text: 'Reply with exactly: ok' }] }],
      generationConfig: { temperature: 0 }
    }),
    muteHttpExceptions: true
  });

  return {
    ok: res.getResponseCode() >= 200 && res.getResponseCode() < 300,
    status: res.getResponseCode(),
    model: model,
    response: trimForLog_(res.getContentText())
  };
}

function getInitialData() {
  try {
    const cached = getCachedJson_('initialData');
    if (cached && cached.participants) {
      cached.announcement = getActiveAnnouncement_();
      cached.memberStatuses = getMemberStatusMap_();
      return Object.assign({ ok: true, cached: true, fastMode: true }, cached);
    }

    ensureSchemaReady_();
    const participants = getParticipants_();
    const dashboard = getDashboardSnapshotForInitial_(participants);
    const data = {
      participants: participants,
      dashboard: dashboard,
      dashboardDeferred: !dashboard,
      announcement: getActiveAnnouncement_(),
      memberStatuses: getMemberStatusMap_(),
      maxUploadBytes: Number(getProp_('MAX_UPLOAD_BYTES', String(APP.DEFAULT_MAX_UPLOAD_BYTES))),
      timezone: getTimezone_()
    };
    putCachedJson_('initialData', data, 60);
    return Object.assign({ ok: true, cached: false, fastMode: true }, data);
  } catch (err) {
    return {
      ok: false,
      error: errorMessage_(err),
      hint: 'SHEET_ID, DRIVE_FOLDER_ID, GEMINI_API_KEY와 시트 헤더를 확인해주세요.'
    };
  }
}

function getDashboardSummary() {
  try {
    ensureSchemaReady_();
    const participants = getParticipants_();
    const dashboard = getDashboardSummaryDataCached_(participants, false);
    cacheInitialData_(participants, dashboard);
    return { ok: true, dashboard: dashboard };
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  }
}

function getChallengers() {
  return getParticipants_();
}

function ensureSchemaReady_() {
  const version = APP_META.VERSION + '_polished_running_club';
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SCHEMA_VERSION') === version) return;
  const ss = getSpreadsheet_();
  ensureSheets_(ss);
  props.setProperty('SCHEMA_VERSION', version);
}

function getCachedJson_(key) {
  try {
    const text = CacheService.getScriptCache().get(cacheKey_(key));
    return text ? JSON.parse(text) : null;
  } catch (err) {
    return null;
  }
}

function putCachedJson_(key, value, seconds) {
  try {
    CacheService.getScriptCache().put(cacheKey_(key), JSON.stringify(value), seconds || APP.CACHE_TTL_SECONDS);
  } catch (err) {
    // 캐시 용량을 넘거나 일시 오류가 나도 앱 기능은 그대로 동작합니다.
  }
}

function invalidateAppCache_() {
  try {
    CacheService.getScriptCache().removeAll([cacheKey_('initialData'), cacheKey_('dashboardSummary')]);
  } catch (err) {
  }
}

function cacheKey_(key) {
  return 'running_challenge_' + APP_META.VERSION + '_' + key;
}

function verifySetupSecretIfConfigured_(setupSecret) {
  const expected = getProp_('SETUP_SECRET', '');
  if (expected && String(setupSecret || '').trim() !== String(expected).trim()) {
    throw new Error('SETUP_SECRET이 맞지 않습니다.');
  }
  return true;
}

function verifyApiSecret_(apiSecret) {
  const expected = getProp_('API_SECRET', '');
  if (!expected) throw new Error('API_SECRET이 설정되지 않아 doPost 업로드를 막았습니다.');
  if (String(apiSecret || '').trim() !== String(expected).trim()) {
    throw new Error('API_SECRET이 맞지 않습니다.');
  }
  return true;
}

function cacheInitialData_(participants, dashboard) {
  const safeParticipants = participants || getParticipants_();
  const safeDashboard = dashboard || getDashboardSummaryDataCached_(safeParticipants, false);
  if (safeDashboard) {
    putCachedJson_('dashboardSummary', { dashboard: safeDashboard }, APP.CACHE_TTL_SECONDS * 3);
    saveDashboardSnapshot_(safeDashboard);
  }
  putCachedJson_('initialData', {
    participants: safeParticipants,
    dashboard: safeDashboard,
    dashboardDeferred: !safeDashboard,
    announcement: getActiveAnnouncement_(),
    memberStatuses: getMemberStatusMap_(),
    maxUploadBytes: Number(getProp_('MAX_UPLOAD_BYTES', String(APP.DEFAULT_MAX_UPLOAD_BYTES))),
    timezone: getTimezone_()
  }, APP.CACHE_TTL_SECONDS);
}
