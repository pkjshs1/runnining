/***** Config.gs *****/
/**
 * 러닝 챌린지 Google Apps Script 웹앱 v42
 * - PIN/초대코드 없음
 * - 새 닉네임 등록 → 참가자 DB 자동 추가
 * - 닉네임 클릭 → 러닝 인증 사진 업로드 → Gemini 분석 → 신뢰도 낮으면 확인/수동입력 → Google Sheets 저장
 * - Google Drive에 원본 인증샷 저장
 * - 웹앱 대시보드 공유 지원: 배포URL?view=dashboard
 * - 개인별 최근 기록 수정/삭제 지원
 * - 오늘 달린 기록 업로드일 기준 표시, 이모지 다시 뽑기, 개인별 이번 주/지난주 기록 지원
 * - 선택 인증샷, 개인 이미지 카드, 모바일 대시보드 순서, 캐시 기반 초기 로딩 개선
 * - 브라우저 즉시 캐시, 요약 대시보드 선로딩, 개인 통계 지연 로딩, 인증샷만 삭제 지원
 * - 목표 진행률 색상, 업로드 완료 요약, 수정 요청, 관리자 변경 이력, 주간 마감 안내 지원
 */

const APP = Object.freeze({
  SHEET_PARTICIPANTS: '참가자',
  SHEET_RECORDS: '러닝기록',
  SHEET_DASHBOARD: '대시보드',
  SHEET_REACTIONS: '응원',
  SHEET_GOAL_HISTORY: '목표변경',
  SHEET_LIGHTNING_RSVP: '번개참석',
  SHEET_MEMBER_STATUS: '멤버상태',
  SHEET_RECORD_REQUESTS: '수정요청',
  SHEET_ADMIN_AUDIT: '관리자변경',
  ANNOUNCEMENT_TEXT_PROP: 'ANNOUNCEMENT_TEXT',
  ANNOUNCEMENT_CREATED_AT_PROP: 'ANNOUNCEMENT_CREATED_AT',
  ANNOUNCEMENT_DATE_PROP: 'ANNOUNCEMENT_DATE',
  ANNOUNCEMENT_EVENT_ID_PROP: 'LIGHTNING_EVENT_ID',
  ANNOUNCEMENT_EVENT_DATE_PROP: 'LIGHTNING_EVENT_DATE',
  ANNOUNCEMENT_EVENT_TIME_PROP: 'LIGHTNING_EVENT_TIME',
  ANNOUNCEMENT_LOCATION_PROP: 'LIGHTNING_LOCATION',
  ANNOUNCEMENT_CAPACITY_PROP: 'LIGHTNING_CAPACITY',
  ANNOUNCEMENT_SUPPLIES_PROP: 'LIGHTNING_SUPPLIES',
  ANNOUNCEMENT_MEMO_PROP: 'LIGHTNING_MEMO',
  ANNOUNCEMENT_MAP_LINK_PROP: 'LIGHTNING_MAP_LINK',
  DEFAULT_GEMINI_MODEL: 'gemini-2.5-flash',
  DEFAULT_MAX_UPLOAD_BYTES: 8 * 1024 * 1024,
  DEFAULT_TIMEZONE: 'Asia/Seoul',
  CACHE_TTL_SECONDS: 180
});

const APP_META = Object.freeze({
  VERSION: 'v42',
  UPDATED_AT: ''
});

const CUTE_EMOJIS = Object.freeze([
  '🌼', '🌸', '🌷', '🌻', '🌺', '🪻', '🍀', '🌿', '🌱', '🍓',
  '🍑', '🍊', '🍋', '🍒', '🥝', '🫐', '🥕', '🥐', '🍪', '🧁',
  '🍩', '🍭', '🍬', '🐰', '🐻', '🐼', '🐨', '🐹', '🐱', '🐶',
  '🦊', '🐧', '🐥', '🦄', '🐢', '🐬', '🦋', '🐝', '🐞', '🐿️',
  '🦔', '🦦', '🦭', '⭐', '🌙', '☁️', '🌈', '✨', '💫', '🫧',
  '🎀', '🧸', '🛼', '🎈', '🎠', '🚲', '👟', '🏃‍♀️', '🏃‍♂️', '🥇'
]);

const DASHBOARD_SNAPSHOT = Object.freeze({
  MARKER: 'DASHBOARD_JSON_V1',
  START_COLUMN: 13,
  CHUNK_SIZE: 40000,
  MAX_CHUNKS: 8
});

const HEADERS = Object.freeze({
  PARTICIPANTS: [
    '참가자ID',
    '이름',
    '표시이름',
    '개인PIN',
    '활성여부',
    '목표거리(km)',
    '목표횟수',
    '표시순서',
    '생성일시',
    '이모지'
  ],
  RECORDS: [
    '기록ID',
    '업로드일시',
    '러닝일자',
    '참가자ID',
    '이름',
    '거리(km)',
    '시간(초)',
    '시간표시',
    '평균페이스(초/km)',
    '페이스표시',
    '칼로리(kcal)',
    '평균심박수(bpm)',
    '고도상승(m)',
    '케이던스(spm)',
    '앱명',
    '원본파일명',
    '이미지URL',
    '이미지파일ID',
    '이미지SHA256',
    '중복여부',
    '상태',
    'Gemini모델',
    '신뢰도',
    '경고',
    '추출JSON',
    '메모',
    '입력방식',
    '인증샷파일명',
    '인증샷URL',
    '인증샷파일ID',
    '인증샷SHA256',
    '인증샷공개여부'
  ],
  DASHBOARD: [
    '구분',
    '참가자ID',
    '이름',
    '기록수',
    '거리(km)',
    '시간',
    '평균페이스',
    '기간',
    '달성률(%)',
    '초과율(%)',
    '마지막업로드'
  ],
  REACTIONS: [
    '응원ID',
    '생성일시',
    '기록ID',
    '대상참가자ID',
    '보낸참가자ID',
    '리액션'
  ],
  GOAL_HISTORY: [
    '변경ID',
    '변경일시',
    '참가자ID',
    '이름',
    '이전목표(km)',
    '새목표(km)',
    '변경자',
    '메모'
  ],
  LIGHTNING_RSVP: [
    '참석ID',
    '응답일시',
    '번개ID',
    '참가자ID',
    '이름',
    '참석여부',
    '메모',
    '상태'
  ],
  MEMBER_STATUS: [
    '상태ID',
    '변경일시',
    '참가자ID',
    '이름',
    '상태',
    '메모',
    '상태일자'
  ],
  RECORD_REQUESTS: [
    '요청ID',
    '요청일시',
    '기록ID',
    '참가자ID',
    '이름',
    '요청내용',
    '상태',
    '처리메모',
    '처리일시'
  ],
  ADMIN_AUDIT: [
    '로그ID',
    '일시',
    '작업',
    '대상구분',
    '대상ID',
    '요약',
    '변경전JSON',
    '변경후JSON'
  ],
});



/***** App.gs *****/
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



/***** Lightning.gs *****/
function getAnnouncement() {
  try {
    return { ok: true, announcement: getActiveAnnouncement_() };
  } catch (err) {
    return { ok: false, error: errorMessage_(err), announcement: null };
  }
}

function saveAnnouncement(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    ensureSchemaReady_();
    const data = normalizeLightningPayload_(payload);
    const props = PropertiesService.getScriptProperties();
    const today = formatYmd_(new Date());
    const eventDate = normalizeDateString_(data.eventDate) || '';
    const eventTime = normalizeLightningTime_(data.eventTime);
    const location = String(data.location || '').trim().slice(0, 80);
    const memo = String(data.memo || '').trim().slice(0, 160);

    if (!eventDate && !eventTime && !location && !memo && !data.text) {
      clearAnnouncementProps_(props);
      invalidateAppCache_();
      return { ok: true, announcement: null, message: '번개 모임을 비웠어요.' };
    }
    if (!eventDate) throw new Error('번개 모임 날짜를 선택해주세요.');
    if (eventDate < today) throw new Error('지난 날짜로는 번개 모임을 열 수 없어요.');
    if (!eventTime) throw new Error('번개 모임 시간을 선택해주세요.');
    if (!location) throw new Error('번개 모임 장소를 입력해주세요.');

    const text = String(data.text || '러닝 번개 모임').trim().slice(0, 180);
    const currentEventId = String(props.getProperty(APP.ANNOUNCEMENT_EVENT_ID_PROP) || '').trim();
    const eventId = data.preserveEventId && currentEventId ? currentEventId : makeId_('meet');
    const createdAt = nowString_();

    props.setProperty(APP.ANNOUNCEMENT_TEXT_PROP, text);
    props.setProperty(APP.ANNOUNCEMENT_CREATED_AT_PROP, createdAt);
    props.setProperty(APP.ANNOUNCEMENT_DATE_PROP, today);
    props.setProperty(APP.ANNOUNCEMENT_EVENT_ID_PROP, eventId);
    props.setProperty(APP.ANNOUNCEMENT_EVENT_DATE_PROP, eventDate);
    props.setProperty(APP.ANNOUNCEMENT_EVENT_TIME_PROP, eventTime);
    props.setProperty(APP.ANNOUNCEMENT_LOCATION_PROP, location);
    props.setProperty(APP.ANNOUNCEMENT_MEMO_PROP, memo);
    props.deleteProperty(APP.ANNOUNCEMENT_CAPACITY_PROP);
    props.deleteProperty(APP.ANNOUNCEMENT_SUPPLIES_PROP);
    props.deleteProperty(APP.ANNOUNCEMENT_MAP_LINK_PROP);
    invalidateAppCache_();

    return {
      ok: true,
      announcement: getActiveAnnouncement_(),
      message: '번개 모임을 등록했어요. 참석 여부를 체크할 수 있어요.'
    };
  } catch (err) {
    return { ok: false, error: errorMessage_(err), announcement: null };
  } finally {
    try { lock.releaseLock(); } catch (unlockErr) {}
  }
}

function submitLightningAttendance(participantId, status, memo) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensureSchemaReady_();
    const participant = findParticipantById_(participantId);
    if (!participant) throw new Error('참석 여부를 체크하려면 먼저 닉네임을 선택해주세요.');
    const announcement = getActiveAnnouncement_();
    if (!announcement || !announcement.eventId) throw new Error('현재 등록된 번개 모임이 없어요.');
    const cleanStatus = normalizeLightningAttendanceStatus_(status);
    if (!cleanStatus) throw new Error('참석 / 미정 / 불참 중 하나를 선택해주세요.');

    const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_LIGHTNING_RSVP);
    sheet.appendRow([
      makeId_('attend'),
      nowString_(),
      announcement.eventId,
      participant.id,
      participant.displayName || participant.name,
      cleanStatus,
      String(memo || '').trim().slice(0, 80),
      'ACTIVE'
    ]);
    maybeFormatSheetOnWrite_(sheet, APP.SHEET_LIGHTNING_RSVP);
    invalidateAppCache_();
    const nextAnnouncement = getActiveAnnouncement_();
    return {
      ok: true,
      announcement: nextAnnouncement,
      message: (participant.emoji || '') + ' ' + participant.displayName + '님, 번개 모임 참석 여부를 ' + cleanStatus + '(으)로 체크했어요.'
    };
  } catch (err) {
    return { ok: false, error: errorMessage_(err), announcement: getActiveAnnouncement_() };
  } finally {
    try { lock.releaseLock(); } catch (unlockErr) {}
  }
}

function getActiveAnnouncement_() {
  const props = PropertiesService.getScriptProperties();
  const text = String(props.getProperty(APP.ANNOUNCEMENT_TEXT_PROP) || '').trim();
  const createdDate = String(props.getProperty(APP.ANNOUNCEMENT_DATE_PROP) || '').trim();
  const today = formatYmd_(new Date());
  if (!text) return null;

  const eventId = String(props.getProperty(APP.ANNOUNCEMENT_EVENT_ID_PROP) || '').trim() || ('meet_' + (createdDate || today));
  const eventDate = normalizeDateString_(props.getProperty(APP.ANNOUNCEMENT_EVENT_DATE_PROP)) || createdDate || today;
  const eventTime = normalizeLightningTime_(props.getProperty(APP.ANNOUNCEMENT_EVENT_TIME_PROP));
  const location = String(props.getProperty(APP.ANNOUNCEMENT_LOCATION_PROP) || '').trim();
  const memo = String(props.getProperty(APP.ANNOUNCEMENT_MEMO_PROP) || '').trim();
  const expiresYmd = eventDate || createdDate || today;

  if (expiresYmd < today) {
    clearAnnouncementProps_(props);
    return null;
  }

  const attendance = getLightningAttendanceSummary_(eventId);
  return {
    eventId: eventId,
    text: text,
    createdAt: String(props.getProperty(APP.ANNOUNCEMENT_CREATED_AT_PROP) || ''),
    date: createdDate,
    eventDate: eventDate,
    eventTime: eventTime,
    eventDateTimeLabel: formatLightningDateTimeLabel_(eventDate, eventTime),
    location: location,
    memo: memo,
    expiresAt: expiresYmd + ' 24:00',
    attendance: attendance
  };
}

function clearAnnouncementProps_(props) {
  const safeProps = props || PropertiesService.getScriptProperties();
  safeProps.deleteProperty(APP.ANNOUNCEMENT_TEXT_PROP);
  safeProps.deleteProperty(APP.ANNOUNCEMENT_CREATED_AT_PROP);
  safeProps.deleteProperty(APP.ANNOUNCEMENT_DATE_PROP);
  safeProps.deleteProperty(APP.ANNOUNCEMENT_EVENT_ID_PROP);
  safeProps.deleteProperty(APP.ANNOUNCEMENT_EVENT_DATE_PROP);
  safeProps.deleteProperty(APP.ANNOUNCEMENT_EVENT_TIME_PROP);
  safeProps.deleteProperty(APP.ANNOUNCEMENT_LOCATION_PROP);
  safeProps.deleteProperty(APP.ANNOUNCEMENT_CAPACITY_PROP);
  safeProps.deleteProperty(APP.ANNOUNCEMENT_SUPPLIES_PROP);
  safeProps.deleteProperty(APP.ANNOUNCEMENT_MEMO_PROP);
  safeProps.deleteProperty(APP.ANNOUNCEMENT_MAP_LINK_PROP);
}

function normalizeLightningPayload_(payload) {
  if (typeof payload === 'string') return { text: String(payload || '').trim() };
  const data = payload || {};
  return {
    text: String(data.text || data.message || '').trim(),
    eventDate: String(data.eventDate || data.date || '').trim(),
    eventTime: String(data.eventTime || data.time || '').trim(),
    location: String(data.location || '').trim(),
    memo: String(data.memo || data.note || '').trim(),
    preserveEventId: data.preserveEventId === true || String(data.preserveEventId || '').toLowerCase() === 'true'
  };
}

function normalizeLightningTime_(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
  return pad2_(hour) + ':' + pad2_(minute);
}

function formatLightningDateTimeLabel_(eventDate, eventTime) {
  const date = normalizeDateString_(eventDate) || '';
  const time = normalizeLightningTime_(eventTime);
  if (!date && !time) return '';
  if (!time) return date;
  return date + ' ' + time;
}

function normalizeLightningAttendanceStatus_(status) {
  const text = String(status || '').trim();
  if (['참석', '불참', '미정'].indexOf(text) >= 0) return text;
  const lower = text.toLowerCase();
  if (['yes', 'attend', 'join'].indexOf(lower) >= 0) return '참석';
  if (['no', 'absent'].indexOf(lower) >= 0) return '불참';
  if (['maybe', 'pending'].indexOf(lower) >= 0) return '미정';
  return '';
}

function getLightningAttendanceSummary_(eventId) {
  const summary = {
    yes: 0,
    maybe: 0,
    no: 0,
    total: 0,
    attendees: []
  };
  try {
    const id = String(eventId || '').trim();
    if (!id) return summary;
    const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_LIGHTNING_RSVP);
    if (!sheet || sheet.getLastRow() < 2) return summary;

    const participantMap = {};
    getParticipants_().forEach(function (p) {
      participantMap[p.id] = p;
    });

    const latest = {};
    tableRows_(sheet).forEach(function (row) {
      if (String(row['번개ID'] || '').trim() !== id) return;
      if (String(row['상태'] || '').toUpperCase().indexOf('ACTIVE') !== 0) return;
      const participantId = String(row['참가자ID'] || '').trim();
      if (!participantId) return;
      const status = normalizeLightningAttendanceStatus_(row['참석여부']);
      if (!status) {
        delete latest[participantId];
        return;
      }
      const participant = participantMap[participantId] || {};
      latest[participantId] = {
        participantId: participantId,
        name: String(row['이름'] || participant.displayName || participant.name || '').trim(),
        emoji: participant.emoji || '',
        status: status,
        respondedAt: String(row['응답일시'] || ''),
        memo: String(row['메모'] || '').trim()
      };
    });

    summary.attendees = Object.keys(latest).map(function (key) { return latest[key]; })
      .sort(function (a, b) {
        const statusOrder = { '참석': 1, '미정': 2, '불참': 3 };
        const orderDiff = (statusOrder[a.status] || 9) - (statusOrder[b.status] || 9);
        if (orderDiff) return orderDiff;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
    summary.attendees.forEach(function (item) {
      if (item.status === '참석') summary.yes += 1;
      else if (item.status === '미정') summary.maybe += 1;
      else if (item.status === '불참') summary.no += 1;
    });
    summary.total = summary.attendees.length;
    return summary;
  } catch (err) {
    return summary;
  }
}

function getLightningAttendanceForAdmin_(eventId, participants) {
  const id = String(eventId || '').trim();
  const rowsByParticipant = {};
  const sourceParticipants = participants || getAllParticipantsForAdmin_();
  sourceParticipants.forEach(function (p) {
    if (!p || !p.id) return;
    rowsByParticipant[p.id] = {
      participantId: p.id,
      name: p.displayName || p.name || p.id,
      emoji: p.emoji || '',
      active: p.active !== false,
      order: p.order || 9999,
      status: '',
      respondedAt: '',
      memo: ''
    };
  });

  if (!id) {
    return Object.keys(rowsByParticipant).map(function (key) { return rowsByParticipant[key]; });
  }

  try {
    const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_LIGHTNING_RSVP);
    if (!sheet || sheet.getLastRow() < 2) {
      return Object.keys(rowsByParticipant).map(function (key) { return rowsByParticipant[key]; });
    }

    tableRows_(sheet).forEach(function (row) {
      if (String(row['번개ID'] || '').trim() !== id) return;
      if (String(row['상태'] || '').toUpperCase().indexOf('ACTIVE') !== 0) return;
      const participantId = String(row['참가자ID'] || '').trim();
      if (!participantId) return;
      const base = rowsByParticipant[participantId] || {
        participantId: participantId,
        name: String(row['이름'] || participantId).trim(),
        emoji: '',
        active: false,
        order: 9999,
        status: '',
        respondedAt: '',
        memo: ''
      };
      const status = normalizeLightningAttendanceStatus_(row['참석여부']);
      rowsByParticipant[participantId] = Object.assign({}, base, {
        name: String(row['이름'] || base.name || participantId).trim(),
        status: status,
        respondedAt: String(row['응답일시'] || ''),
        memo: String(row['메모'] || '').trim()
      });
    });
  } catch (err) {
  }

  return Object.keys(rowsByParticipant).map(function (key) { return rowsByParticipant[key]; })
    .sort(function (a, b) {
      if (a.active !== b.active) return a.active ? -1 : 1;
      const orderDiff = (Number(a.order) || 9999) - (Number(b.order) || 9999);
      if (orderDiff) return orderDiff;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
}



/***** Members.gs *****/
function registerNickname(nickname) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const name = cleanNickname_(nickname);
    if (!name) throw new Error('닉네임을 입력해주세요.');
    if (name.length < 2) throw new Error('닉네임은 2글자 이상으로 만들어주세요.');
    if (name.length > 16) throw new Error('닉네임은 16글자 이하로 만들어주세요.');

    ensureSchemaReady_();
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(APP.SHEET_PARTICIPANTS);
    const rows = tableRows_(sheet);
    const duplicated = rows.some(function (row) {
      return String(row['표시이름'] || row['이름'] || '').trim().toLowerCase() === name.toLowerCase() && toBoolean_(row['활성여부']);
    });
    if (duplicated) throw new Error('이미 사용 중인 닉네임입니다. 다른 닉네임을 골라주세요.');

    const id = makeId_('p');
    const order = Math.max(1, sheet.getLastRow());
    const usedEmojis = {};
    getParticipants_().forEach(function (p) { if (p.emoji) usedEmojis[p.emoji] = true; });
    const emoji = pickNewEmoji_(id + name + nowString_(), '', usedEmojis);
    const defaultGoalKm = Number(getProp_('WEEKLY_GOAL_KM', '10')) || 10;
    sheet.appendRow([
      id,
      name,
      name,
      '',
      true,
      defaultGoalKm,
      '',
      order,
      nowString_(),
      emoji
    ]);
    maybeFormatSheetOnWrite_(sheet, APP.SHEET_PARTICIPANTS);

    const participants = getParticipants_();
    const created = participants.filter(function (p) { return p.id === id; })[0] || {
      id: id,
      name: name,
      displayName: name,
      emoji: CUTE_EMOJIS[positiveHash_(id) % CUTE_EMOJIS.length]
    };

    invalidateAppCache_();
    const dashboard = rebuildDashboardSummary_(participants);
    cacheInitialData_(participants, dashboard);
    return {
      ok: true,
      participant: created,
      participants: participants,
      dashboard: dashboard
    };
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 닉네임 + 사진 업로드 → Gemini 분석 → 즉시 DB 저장
 */

/**
 * 닉네임 + 사진 업로드 → Gemini 분석 → 신뢰도 높으면 즉시 저장
 * 신뢰도 낮거나 AI가 읽지 못하면 저장하지 않고 확인/수동 입력을 요청합니다.
 */

function getParticipants_() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(APP.SHEET_PARTICIPANTS);
  const rows = tableRows_(sheet);

  const participants = rows
    .filter(function (row) { return toBoolean_(row['활성여부']); })
    .sort(function (a, b) { return Number(a['표시순서'] || 9999) - Number(b['표시순서'] || 9999); })
    .map(function (row) {
      return {
        id: String(row['참가자ID'] || '').trim(),
        name: String(row['이름'] || '').trim(),
        displayName: String(row['표시이름'] || row['이름'] || '').trim(),
        emoji: stringOrNull_(row['이모지']),
        targetDistanceKm: numberOrNull_(row['목표거리(km)']),
        targetCount: intOrNull_(row['목표횟수'])
      };
    })
    .filter(function (p) { return p.id && p.displayName; });

  return assignUniqueEmojis_(participants);
}

function findParticipantById_(id) {
  const target = String(id || '').trim();
  const participants = getParticipants_();
  for (let i = 0; i < participants.length; i++) {
    if (participants[i].id === target) return participants[i];
  }
  return null;
}

function assignUniqueEmojis_(participants) {
  const used = {};
  return participants.map(function (participant, index) {
    const storedEmoji = stringOrNull_(participant.emoji);
    let emoji = storedEmoji;

    if (!emoji || used[emoji]) {
      const seed = String(participant.id || participant.displayName || participant.name || index);
      let emojiIndex = positiveHash_(seed) % CUTE_EMOJIS.length;
      emoji = CUTE_EMOJIS[emojiIndex];
      let attempts = 0;
      while (used[emoji] && attempts < CUTE_EMOJIS.length) {
        emojiIndex = (emojiIndex + 1) % CUTE_EMOJIS.length;
        emoji = CUTE_EMOJIS[emojiIndex];
        attempts += 1;
      }
    }

    used[emoji] = true;
    return Object.assign({}, participant, { emoji: emoji });
  });
}

function rerollParticipantEmoji(participantId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const id = String(participantId || '').trim();
    if (!id) throw new Error('이모지를 바꿀 닉네임을 먼저 선택해주세요.');

    ensureSchemaReady_();
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(APP.SHEET_PARTICIPANTS);
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) throw new Error('등록된 닉네임이 없습니다.');

    const headers = values[0].map(function (h) { return String(h || '').trim(); });
    const idCol = headers.indexOf('참가자ID') + 1;
    const activeCol = headers.indexOf('활성여부') + 1;
    const emojiCol = headers.indexOf('이모지') + 1;
    if (!idCol || !emojiCol) throw new Error('참가자 시트의 이모지 컬럼을 확인해주세요. setupOnce 또는 healthCheck를 한 번 실행해주세요.');

    const usedEmojis = {};
    getParticipants_().forEach(function (p) {
      if (p.id !== id && p.emoji) usedEmojis[p.emoji] = true;
    });
    let targetRow = 0;
    let currentEmoji = '';

    for (let r = 2; r <= values.length; r++) {
      const row = values[r - 1];
      const rowId = String(row[idCol - 1] || '').trim();
      const active = activeCol ? toBoolean_(row[activeCol - 1]) : true;
      const rowEmoji = String(row[emojiCol - 1] || '').trim();
      if (rowId === id) {
        targetRow = r;
        currentEmoji = rowEmoji;
      } else if (active && rowEmoji) {
        usedEmojis[rowEmoji] = true;
      }
    }

    if (!targetRow) throw new Error('선택한 닉네임을 찾지 못했습니다. 새로고침 후 다시 시도해주세요.');

    const newEmoji = pickNewEmoji_(id + nowString_(), currentEmoji, usedEmojis);
    sheet.getRange(targetRow, emojiCol).setValue(newEmoji);

    const participants = getParticipants_();
    const participant = participants.filter(function (p) { return p.id === id; })[0] || null;
    updateEmojiInCachedInitialData_(id, newEmoji);
    return { ok: true, emoji: newEmoji, participant: participant, participants: participants };
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  } finally {
    lock.releaseLock();
  }
}



/**
 * 참가자가 자기 닉네임의 이번 주 목표 거리(km)를 직접 수정합니다.
 * PIN 없이 아는 사람끼리 쓰는 전제라 참가자 선택만으로 수정합니다.
 */

function updateParticipantGoal(participantId, goalKm) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const id = String(participantId || '').trim();
    const goal = roundOrNull_(numberOrNull_(goalKm), 2);
    if (!id) throw new Error('목표를 수정할 닉네임을 먼저 선택해주세요.');
    if (!goal || goal <= 0) throw new Error('목표 거리는 0보다 큰 숫자로 입력해주세요.');
    if (goal > 300) throw new Error('주간 목표는 300km 이하로 입력해주세요.');

    ensureSchemaReady_();
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(APP.SHEET_PARTICIPANTS);
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) throw new Error('등록된 닉네임이 없습니다.');

    const headers = values[0].map(function (h) { return String(h || '').trim(); });
    const idCol = headers.indexOf('참가자ID') + 1;
    const nameCol = headers.indexOf('표시이름') + 1 || headers.indexOf('이름') + 1;
    const goalCol = headers.indexOf('목표거리(km)') + 1;
    const activeCol = headers.indexOf('활성여부') + 1;
    if (!idCol || !goalCol) throw new Error('참가자 시트의 참가자ID/목표거리(km) 컬럼을 확인해주세요.');

    let targetRow = 0;
    let oldGoal = '';
    let participantName = '';
    for (let r = 2; r <= values.length; r++) {
      const rowId = String(values[r - 1][idCol - 1] || '').trim();
      const active = activeCol ? toBoolean_(values[r - 1][activeCol - 1]) : true;
      if (rowId === id && active) {
        targetRow = r;
        oldGoal = values[r - 1][goalCol - 1];
        participantName = nameCol ? String(values[r - 1][nameCol - 1] || '') : '';
        break;
      }
    }

    if (!targetRow) throw new Error('선택한 닉네임을 찾지 못했습니다.');
    sheet.getRange(targetRow, goalCol).setValue(goal);
    appendGoalHistory_(id, participantName, oldGoal, goal, 'participant', '개인 목표 저장');

    invalidateAppCache_();
    const participants = getParticipants_();
    const participant = participants.filter(function (p) { return p.id === id; })[0] || null;
    const dashboard = rebuildDashboardSummary_(participants);
    cacheInitialData_(participants, dashboard);
    return {
      ok: true,
      goalKm: goal,
      participant: participant,
      participants: participants,
      dashboard: dashboard,
      message: '이번 주 목표를 ' + goal + 'km로 바꿨어요.'
    };
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  } finally {
    lock.releaseLock();
  }
}

function appendGoalHistory_(participantId, name, oldGoalKm, newGoalKm, actor, memo) {
  try {
    ensureSchemaReady_();
    const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_GOAL_HISTORY);
    sheet.appendRow([
      makeId_('goal'),
      nowString_(),
      String(participantId || '').trim(),
      String(name || '').trim(),
      oldGoalKm || '',
      newGoalKm || '',
      String(actor || '').trim(),
      String(memo || '').trim()
    ]);
    maybeFormatSheetOnWrite_(sheet, APP.SHEET_GOAL_HISTORY);
  } catch (err) {
  }
}

function getGoalHistoryForParticipant_(participantId, limit) {
  try {
    const id = String(participantId || '').trim();
    if (!id) return [];
    const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_GOAL_HISTORY);
    if (!sheet) return [];
    const rows = tableRows_(sheet).slice().reverse();
    const out = [];
    rows.forEach(function (row) {
      if (out.length >= (limit || 5)) return;
      if (String(row['참가자ID'] || '').trim() !== id) return;
      out.push({
        changedAt: String(row['변경일시'] || ''),
        oldGoalKm: numberOrNull_(row['이전목표(km)']),
        newGoalKm: numberOrNull_(row['새목표(km)']),
        actor: String(row['변경자'] || ''),
        memo: String(row['메모'] || '')
      });
    });
    return out;
  } catch (err) {
    return [];
  }
}

function pickNewEmoji_(seed, currentEmoji, usedEmojis) {
  const used = usedEmojis || {};
  const preferred = CUTE_EMOJIS.filter(function (emoji) {
    return emoji !== currentEmoji && !used[emoji];
  });
  const pool = preferred.length ? preferred : CUTE_EMOJIS.filter(function (emoji) {
    return emoji !== currentEmoji;
  });
  if (!pool.length) return currentEmoji || CUTE_EMOJIS[0];
  const base = positiveHash_(String(seed || '') + String(Math.random()) + nowString_());
  return pool[base % pool.length];
}

function positiveHash_(text) {
  const source = String(text || 'runner');
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}



/***** Records.gs *****/
function submitRun(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    if (!payload) throw new Error('업로드 데이터가 비어 있습니다.');
    const participantId = String(payload.participantId || payload.challengerId || '').trim();
    if (!participantId) throw new Error('닉네임을 선택해주세요.');
    if (!payload.dataUrl) throw new Error('러닝 인증 사진이 없습니다.');

    const participant = findParticipantById_(participantId);
    if (!participant) throw new Error('참가자를 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.');

    const image = decodeDataUrl_(payload.dataUrl, payload.fileName || 'running-upload.jpg');
    validateImageSize_(image.bytes);

    const imageHash = sha256Hex_(image.bytes);
    const duplicate = findDuplicateRecord_(participant.id, imageHash);
    const allowDuplicates = toBoolean_(getProp_('ALLOW_DUPLICATES', 'false'));
    if (duplicate && !allowDuplicates) {
      return {
        ok: true,
        duplicate: true,
        message: '이미 업로드된 인증샷입니다. 중복 저장하지 않았어요.',
        existingRecordId: duplicate.recordId,
        dashboard: getDashboardSummaryDataCached_(null, false)
      };
    }

    let rawExtracted = null;
    let extracted = null;

    try {
      rawExtracted = extractRunningData_(image.blob);
      extracted = normalizeExtraction_(rawExtracted);
    } catch (aiErr) {
      return {
        ok: true,
        needsManual: true,
        message: 'AI가 이 캡처를 충분히 읽지 못했어요. 날짜·거리·시간을 직접 입력하면 인증샷과 함께 저장할 수 있어요.',
        aiError: errorMessage_(aiErr),
        participant: participant
      };
    }

    if (!extracted.isRunningScreenshot || !extracted.distanceKm || !extracted.durationSeconds) {
      return {
        ok: true,
        needsManual: true,
        message: '거리 또는 시간을 충분히 읽지 못했어요. 날짜·거리·시간을 직접 입력하면 인증샷과 함께 저장할 수 있어요.',
        extracted: extracted,
        participant: participant
      };
    }

    const threshold = getReviewThreshold_();
    const confidence = Number(extracted.confidence || 0);
    if (confidence > 0 && confidence < threshold) {
      return {
        ok: true,
        needsReview: true,
        message: 'AI가 값을 읽었지만 신뢰도가 조금 낮아요. 거리·시간이 맞는지만 확인한 뒤 저장해주세요.',
        threshold: threshold,
        extracted: extracted,
        participant: participant
      };
    }

    const suspectedDuplicate = findPotentialDuplicateRecord_(participant.id, extracted);
    if (suspectedDuplicate && !toBoolean_(payload.allowSimilarDuplicate)) {
      return {
        ok: true,
        needsDuplicateConfirm: true,
        message: '같은 날짜에 거의 같은 거리·시간 기록이 있어요. 중복이 아니면 확인 후 저장해주세요.',
        suspectedDuplicate: suspectedDuplicate,
        extracted: extracted,
        rawExtracted: rawExtracted,
        participant: participant
      };
    }

    const saved = saveFinalRun_(payload, participant, image, imageHash, extracted, rawExtracted, Boolean(duplicate), 'AI');
    return saved;
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 낮은 신뢰도 확인 단계 또는 수동 입력 단계에서 최종 저장합니다.
 */

function saveReviewedRun(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    if (!payload) throw new Error('저장 데이터가 비어 있습니다.');
    const participantId = String(payload.participantId || '').trim();
    if (!participantId) throw new Error('닉네임을 선택해주세요.');
    if (!payload.dataUrl) throw new Error('인증 사진이 없습니다.');

    const participant = findParticipantById_(participantId);
    if (!participant) throw new Error('참가자를 찾을 수 없습니다.');

    const image = decodeDataUrl_(payload.dataUrl, payload.fileName || 'running-upload.jpg');
    validateImageSize_(image.bytes);
    const imageHash = sha256Hex_(image.bytes);

    const duplicate = findDuplicateRecord_(participant.id, imageHash);
    const allowDuplicates = toBoolean_(getProp_('ALLOW_DUPLICATES', 'false'));
    if (duplicate && !allowDuplicates) {
      return {
        ok: true,
        duplicate: true,
        message: '이미 업로드된 인증샷입니다. 중복 저장하지 않았어요.',
        existingRecordId: duplicate.recordId,
        dashboard: getDashboardSummaryDataCached_(null, false)
      };
    }

    const mode = payload.mode === 'manual' ? '수동입력' : 'AI확인';
    const extracted = normalizeReviewedData_(payload.review || payload.extracted || {}, mode);
    const rawExtracted = payload.rawExtracted || payload.review || payload.extracted || extracted;

    const suspectedDuplicate = findPotentialDuplicateRecord_(participant.id, extracted);
    if (suspectedDuplicate && !toBoolean_(payload.allowSimilarDuplicate)) {
      return {
        ok: true,
        needsDuplicateConfirm: true,
        message: '같은 날짜에 거의 같은 거리·시간 기록이 있어요. 중복이 아니면 다시 한 번 확인 후 저장해주세요.',
        suspectedDuplicate: suspectedDuplicate,
        extracted: extracted,
        rawExtracted: rawExtracted,
        participant: participant
      };
    }

    const saved = saveFinalRun_(payload, participant, image, imageHash, extracted, rawExtracted, Boolean(duplicate), mode);
    return saved;
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  } finally {
    lock.releaseLock();
  }
}

function saveFinalRun_(payload, participant, image, imageHash, extracted, rawExtracted, duplicate, mode) {
  const recordId = makeId_('run');
  const uploadYmd = formatYmd_(new Date());
  const safeExtracted = coerceRunningDateForSave_(extracted, uploadYmd);
  const savedImage = saveImageToDrive_(image.blob, participant, safeExtracted, recordId);
  const savedProofPhoto = saveOptionalProofPhotoToDrive_(payload, participant, safeExtracted, recordId);
  const inputMode = normalizeInputMode_(mode);
  const record = appendRunRecord_({
    recordId: recordId,
    participant: participant,
    originalFileName: image.originalFileName,
    imageUrl: savedImage.url,
    imageFileId: savedImage.id,
    imageHash: imageHash,
    proofPhoto: savedProofPhoto,
    proofPhotoPublic: Boolean(savedProofPhoto && toBoolean_(payload.proofPhotoPublic)),
    duplicate: Boolean(duplicate),
    model: getGeminiModel_(),
    extracted: safeExtracted,
    rawExtracted: rawExtracted,
    note: String(payload.note || '').trim(),
    inputMode: inputMode
  });

  invalidateAppCache_();
  const participants = getParticipants_();
  const dashboard = rebuildDashboardSummary_(participants);
  cacheInitialData_(participants, dashboard);

  return {
    ok: true,
    duplicate: Boolean(duplicate),
    message: (participant.emoji || '') + ' ' + participant.displayName + '님의 러닝 인증이 저장됐어요.',
    record: record,
    extracted: safeExtracted,
    proofPhoto: savedProofPhoto,
    dashboard: dashboard
  };
}

/**
 * 저장 직전 러닝일자를 보정합니다.
 * - AI가 날짜를 못 읽으면 업로드일로 저장합니다.
 * - AI가 업로드일보다 미래 날짜를 반환하면 업로드일로 보정합니다.
 * 이 보정은 성준님처럼 6/1 기록이 6/2로 잘못 들어가는 케이스를 줄이기 위한 안전장치입니다.
 */

function coerceRunningDateForSave_(extracted, uploadYmd) {
  const e = Object.assign({}, extracted || {});
  const warnings = Array.isArray(e.warnings) ? e.warnings.slice() : [];
  const normalized = normalizeDateString_(e.runningDate);
  const baseYmd = uploadYmd || formatYmd_(new Date());

  if (!normalized) {
    e.runningDate = baseYmd;
    warnings.push('러닝일자 미확인: 업로드일 기준으로 저장');
  } else if (normalized > baseYmd) {
    e.runningDate = baseYmd;
    warnings.push('러닝일자 미래 날짜 자동 보정: 업로드일 기준으로 저장');
  } else {
    e.runningDate = normalized;
  }

  e.warnings = uniqueStrings_(warnings);
  return e;
}

function uniqueStrings_(items) {
  const seen = {};
  const out = [];
  (items || []).forEach(function (item) {
    const text = String(item || '').trim();
    if (!text || seen[text]) return;
    seen[text] = true;
    out.push(text);
  });
  return out;
}

function normalizeReviewedData_(data, mode) {
  const distanceKm = roundOrNull_(numberOrNull_(data.distanceKm), 2);
  let durationSeconds = intOrNull_(data.durationSeconds);
  if (!durationSeconds) {
    durationSeconds = (intOrNull_(data.durationMinutes) || 0) * 60 + (intOrNull_(data.durationSecondsPart) || 0);
  }
  if (!durationSeconds && data.durationText) durationSeconds = parseDurationText_(data.durationText);

  if (!distanceKm || distanceKm <= 0) throw new Error('달린 거리(km)를 입력해주세요.');
  if (!durationSeconds || durationSeconds <= 0) throw new Error('달린 시간(분/초)을 입력해주세요.');

  const paceSeconds = Math.round(durationSeconds / distanceKm);
  const warnings = Array.isArray(data.warnings) ? data.warnings.map(String) : [];
  if (mode === '수동입력') warnings.push('사용자가 수동 입력');
  if (mode === 'AI확인') warnings.push('AI 낮은 신뢰도 결과를 사용자가 확인 후 저장');
  if (mode === '개인수정') warnings.push('기존 기록을 개인이 직접 수정');
  if (mode === '관리자수정') warnings.push('관리자가 직접 수정');

  return {
    isRunningScreenshot: true,
    appName: stringOrNull_(data.appName) || (mode === '수동입력' ? '수동입력' : null),
    runningDate: normalizeDateString_(data.runningDate) || formatYmd_(new Date()),
    distanceKm: distanceKm,
    durationSeconds: durationSeconds,
    durationText: formatDuration_(durationSeconds),
    averagePaceSecondsPerKm: paceSeconds,
    averagePaceText: formatPace_(paceSeconds),
    caloriesKcal: intOrNull_(data.caloriesKcal),
    averageHeartRateBpm: intOrNull_(data.averageHeartRateBpm),
    elevationGainM: intOrNull_(data.elevationGainM),
    cadenceSpm: intOrNull_(data.cadenceSpm),
    confidence: mode === '수동입력' ? 1 : (roundOrNull_(numberOrNull_(data.confidence), 2) || 0.7),
    warnings: warnings,
    rawText: stringOrNull_(data.rawText)
  };
}

function normalizeInputMode_(mode) {
  const text = String(mode || '').trim();
  if (text === '수동입력' || text === 'manual') return '수동 입력';
  if (text === 'AI확인' || text === 'review') return 'AI 확인 후 저장';
  if (text === 'AI' || text === 'auto') return 'AI 자동인식';
  return text || 'AI 자동인식';
}

function inferInputModeFromNote_(note) {
  const text = String(note || '').trim();
  if (/^\[수동입력\]/.test(text)) return '수동 입력';
  if (/^\[AI확인\]/.test(text)) return 'AI 확인 후 저장';
  if (/^\[AI\]/.test(text)) return 'AI 자동인식';
  return '';
}

function inferInputModeFromRow_(row) {
  const direct = String(row['입력방식'] || '').trim();
  if (direct) return direct;
  return inferInputModeFromNote_(row['메모']) || 'AI 자동인식';
}

function validateImageSize_(bytes) {
  const maxBytes = Number(getProp_('MAX_UPLOAD_BYTES', String(APP.DEFAULT_MAX_UPLOAD_BYTES)));
  if (bytes.length > maxBytes) {
    throw new Error('이미지 용량이 너무 큽니다. 현재 ' + bytesToMb_(bytes.length) + 'MB, 제한 ' + bytesToMb_(maxBytes) + 'MB입니다.');
  }
}

function getReviewThreshold_() {
  return Number(getProp_('REVIEW_CONFIDENCE_THRESHOLD', '0.78')) || 0.78;
}

/**
 * 선택한 닉네임의 최근 기록을 개인이 직접 확인/수정/삭제할 수 있게 반환합니다.
 * PIN 없이 아는 사람끼리 쓰는 전제라 참가자ID 일치만 확인합니다.
 */

function getParticipantRecords(participantId) {
  try {
    const id = String(participantId || '').trim();
    if (!id) throw new Error('닉네임을 먼저 선택해주세요.');
    const participant = findParticipantById_(id);
    if (!participant) throw new Error('참가자를 찾을 수 없습니다.');

    const requestMap = getRecordRequestMapForParticipant_(id);
    const rows = tableRows_(getSpreadsheet_().getSheetByName(APP.SHEET_RECORDS)).slice().reverse();
    const records = rows
      .filter(function (row) {
        const status = String(row['상태'] || '').toUpperCase();
        return String(row['참가자ID'] || '').trim() === id && status.indexOf('삭제') !== 0;
      })
      .slice(0, 30)
      .map(function (row) {
        const distance = numberOrNull_(row['거리(km)']) || 0;
        const seconds = intOrNull_(row['시간(초)']) || 0;
        const pace = distance && seconds ? Math.round(seconds / distance) : intOrNull_(row['평균페이스(초/km)']);
        const recordId = String(row['기록ID'] || '');
        const request = requestMap[recordId] || null;
        return {
          recordId: recordId,
          uploadedAt: String(row['업로드일시'] || ''),
          activityDate: normalizeDateString_(row['러닝일자']) || '',
          name: String(row['이름'] || ''),
          distanceKm: roundOrNull_(distance, 2) || 0,
          durationSeconds: seconds,
          durationText: seconds ? formatDuration_(seconds) : String(row['시간표시'] || ''),
          durationMinutes: seconds ? Math.floor(seconds / 60) : '',
          durationSecondsPart: seconds ? seconds % 60 : '',
          averagePaceSecondsPerKm: pace,
          averagePaceText: pace ? formatPace_(pace) : String(row['페이스표시'] || ''),
          caloriesKcal: intOrNull_(row['칼로리(kcal)']),
          averageHeartRateBpm: intOrNull_(row['평균심박수(bpm)']),
          cadenceSpm: intOrNull_(row['케이던스(spm)']),
          appName: String(row['앱명'] || ''),
        inputMode: inferInputModeFromRow_(row),
        hasProofPhoto: Boolean(String(row['인증샷파일ID'] || '').trim()),
        proofPhotoPublic: isProofPhotoPublicValue_(row['인증샷공개여부'], Boolean(String(row['인증샷파일ID'] || '').trim())),
        proofPhotoFileName: String(row['인증샷파일명'] || '').trim(),
        proofPhotoFileId: String(row['인증샷파일ID'] || '').trim(),
        proofPhotoUrl: String(row['인증샷URL'] || '').trim(),
        requestStatus: request ? request.status : '',
        requestMessage: request ? request.message : '',
        requestCreatedAt: request ? request.createdAt : ''
        };
      });
    return { ok: true, participant: participant, records: records };
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  }
}

function requestRecordCorrection(participantId, recordId, message) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const id = String(participantId || '').trim();
    const targetId = String(recordId || '').trim();
    const cleanMessage = String(message || '').trim().slice(0, 300);
    if (!id) throw new Error('닉네임을 먼저 선택해주세요.');
    if (!targetId) throw new Error('요청할 기록ID가 없습니다.');
    if (!cleanMessage) throw new Error('수정 요청 내용을 입력해주세요.');

    ensureSchemaReady_();
    const participant = findParticipantById_(id);
    if (!participant) throw new Error('참가자를 찾을 수 없습니다.');

    const record = findOwnedRecordForRequest_(id, targetId);
    if (!record) throw new Error('선택한 닉네임의 기록을 찾지 못했습니다.');

    const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_RECORD_REQUESTS);
    sheet.appendRow([
      makeId_('req'),
      nowString_(),
      targetId,
      id,
      participant.displayName || participant.name,
      cleanMessage,
      '접수',
      '',
      ''
    ]);
    maybeFormatSheetOnWrite_(sheet, APP.SHEET_RECORD_REQUESTS);
    return {
      ok: true,
      message: '수정 요청을 관리자에게 남겼어요.',
      records: getParticipantRecords(id).records || []
    };
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  } finally {
    lock.releaseLock();
  }
}

function findOwnedRecordForRequest_(participantId, recordId) {
  const rows = tableRows_(getSpreadsheet_().getSheetByName(APP.SHEET_RECORDS));
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const status = String(row['상태'] || '').toUpperCase();
    if (status.indexOf('삭제') === 0) continue;
    if (String(row['기록ID'] || '').trim() === String(recordId || '').trim() &&
        String(row['참가자ID'] || '').trim() === String(participantId || '').trim()) {
      return row;
    }
  }
  return null;
}

function getRecordRequestMapForParticipant_(participantId) {
  const result = {};
  try {
    const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_RECORD_REQUESTS);
    if (!sheet || sheet.getLastRow() < 2) return result;
    tableRows_(sheet).forEach(function (row) {
      if (String(row['참가자ID'] || '').trim() !== String(participantId || '').trim()) return;
      const recordId = String(row['기록ID'] || '').trim();
      if (!recordId) return;
      result[recordId] = {
        requestId: String(row['요청ID'] || '').trim(),
        createdAt: String(row['요청일시'] || ''),
        message: String(row['요청내용'] || ''),
        status: String(row['상태'] || '접수'),
        handledAt: String(row['처리일시'] || '')
      };
    });
  } catch (err) {
  }
  return result;
}

function getParticipantDetailData(participantId) {
  try {
    const id = String(participantId || '').trim();
    if (!id) throw new Error('닉네임을 먼저 선택해주세요.');

    const participants = getParticipants_();
    const participant = participants.filter(function (p) { return p.id === id; })[0] || null;
    if (!participant) throw new Error('참가자를 찾을 수 없습니다.');

    const defaultWeeklyGoalKm = Number(getProp_('WEEKLY_GOAL_KM', '10')) || 10;
    const now = new Date();
    const todayYmd = formatYmd_(now);
    const weekStart = getMonday_(now);
    const weekEnd = addDays_(weekStart, 6);
    const weekStartYmd = formatYmd_(weekStart);
    const weekEndYmd = formatYmd_(weekEnd);
    const lastWeekStart = addDays_(weekStart, -7);
    const lastWeekEnd = addDays_(lastWeekStart, 6);
    const lastWeekStartYmd = formatYmd_(lastWeekStart);
    const lastWeekEndYmd = formatYmd_(lastWeekEnd);
    const goalKm = getParticipantGoalKm_(participant, defaultWeeklyGoalKm);

    const weeklyStats = emptyMemberWeeklyStats_(participant, weekStart, goalKm);
    const lastWeekStats = emptyMemberLastWeekStats_(participant, lastWeekStart);
    const allTimeStats = emptyMemberAllTimeStats_(participant, goalKm);
    const rows = tableRows_(getSpreadsheet_().getSheetByName(APP.SHEET_RECORDS));
    const reactionCountsByRecord = getReactionCountsMap_(800);

    rows.forEach(function (row) {
      const status = String(row['상태'] || '').toUpperCase();
      const duplicated = toBoolean_(row['중복여부']);
      if (status.indexOf('OK') !== 0 || duplicated) return;
      if (String(row['참가자ID'] || '').trim() !== id) return;

      const uploadedAt = row['업로드일시'];
      const recordId = String(row['기록ID'] || '');
      const uploadedYmd = dateTimeToYmd_(uploadedAt) || recordIdToYmd_(recordId);
      const activityDate = normalizeDateString_(row['러닝일자']) || uploadedYmd || todayYmd;
      const distance = numberOrNull_(row['거리(km)']) || 0;
      const seconds = intOrNull_(row['시간(초)']) || 0;
      const paceSeconds = distance ? Math.round(seconds / distance) : intOrNull_(row['평균페이스(초/km)']);
      const proofPhotoFileId = String(row['인증샷파일ID'] || '').trim();
      const proofPhotoPublic = isProofPhotoPublicValue_(row['인증샷공개여부'], Boolean(proofPhotoFileId));
      const record = {
        recordId: recordId,
        participantId: id,
        name: participant.displayName || participant.name,
        emoji: participant.emoji || CUTE_EMOJIS[positiveHash_(id) % CUTE_EMOJIS.length],
        activityDate: activityDate,
        uploadedAt: uploadedAt,
        distanceKm: roundOrNull_(distance, 2) || 0,
        durationSeconds: seconds,
        durationText: seconds ? formatDuration_(seconds) : String(row['시간표시'] || ''),
        averagePaceSecondsPerKm: paceSeconds,
        averagePaceText: paceSeconds ? formatPace_(paceSeconds) : String(row['페이스표시'] || ''),
        caloriesKcal: intOrNull_(row['칼로리(kcal)']),
        averageHeartRateBpm: intOrNull_(row['평균심박수(bpm)']),
        cadenceSpm: intOrNull_(row['케이던스(spm)']),
        appName: String(row['앱명'] || ''),
        note: String(row['메모'] || ''),
        inputMode: inferInputModeFromRow_(row),
        reactionCounts: reactionCountsByRecord[recordId] || {},
        hasProofPhoto: Boolean(proofPhotoFileId),
        proofPhotoPublic: proofPhotoPublic,
        proofPhotoFileName: String(row['인증샷파일명'] || '').trim(),
        proofPhotoUrl: String(row['인증샷URL'] || '').trim(),
        proofPhotoFileId: proofPhotoFileId,
        proofPhotoSha256: String(row['인증샷SHA256'] || '').trim()
      };

      addToMemberAllTimeStats_(allTimeStats, record);
      if (activityDate >= weekStartYmd && activityDate <= weekEndYmd) addToMemberWeeklyStats_(weeklyStats, record);
      if (activityDate >= lastWeekStartYmd && activityDate <= lastWeekEndYmd) addToMemberLastWeekStats_(lastWeekStats, record);
    });

    finalizeMemberAllTimeStats_(allTimeStats);
    finalizeMemberWeeklyStats_(weeklyStats);
    finalizeMemberLastWeekStats_(lastWeekStats);
    weeklyStats.allTimeCount = Number(allTimeStats.count || 0);
    weeklyStats.isFirstRunEver = Boolean(weeklyStats.count > 0 && Number(allTimeStats.count || 0) === 1);
    weeklyStats.goalAchieved = Number(weeklyStats.percent || 0) >= 100;
    weeklyStats.congratsText = weeklyStats.goalAchieved ? '축하합니다' : '';
    weeklyStats.badges = makePraiseBadges_(weeklyStats);

    return {
      ok: true,
      participantId: id,
      participant: participant,
      memberWeeklyStats: weeklyStats,
      memberLastWeekStats: lastWeekStats,
      memberAllTimeStats: allTimeStats
    };
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  }
}

function deleteParticipantProofPhoto(participantId, recordId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const id = String(participantId || '').trim();
    const targetId = String(recordId || '').trim();
    if (!id) throw new Error('닉네임을 먼저 선택해주세요.');
    if (!targetId) throw new Error('인증샷을 삭제할 기록ID가 없습니다.');

    const participant = findParticipantById_(id);
    if (!participant) throw new Error('참가자를 찾을 수 없습니다.');

    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(APP.SHEET_RECORDS);
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) throw new Error('삭제할 인증샷이 없습니다.');

    const headers = values[0].map(function (h) { return String(h || '').trim(); });
    const col = function (name) { return headers.indexOf(name) + 1; };
    const idCol = col('기록ID');
    const participantCol = col('참가자ID');
    const statusCol = col('상태');
    const memoCol = col('메모');
    const proofNameCol = col('인증샷파일명');
    const proofUrlCol = col('인증샷URL');
    const proofIdCol = col('인증샷파일ID');
    const proofHashCol = col('인증샷SHA256');
    if (!idCol || !participantCol || !statusCol || !proofIdCol) {
      throw new Error('러닝기록 시트의 인증샷 컬럼을 확인해주세요. setupOnce를 한 번 실행해주세요.');
    }

    for (let r = 2; r <= values.length; r++) {
      const rowRecordId = String(values[r - 1][idCol - 1] || '').trim();
      const rowParticipantId = String(values[r - 1][participantCol - 1] || '').trim();
      const status = String(values[r - 1][statusCol - 1] || '').toUpperCase();
      if (rowRecordId !== targetId) continue;
      if (rowParticipantId !== id) throw new Error('선택한 닉네임의 인증샷만 삭제할 수 있습니다.');
      if (status.indexOf('삭제') === 0) throw new Error('삭제된 기록의 인증샷은 수정할 수 없습니다.');

      const fileId = String(values[r - 1][proofIdCol - 1] || '').trim();
      if (!fileId) throw new Error('이 기록에는 삭제할 러닝 인증샷이 없습니다.');

      if (toBoolean_(getProp_('TRASH_DELETED_PROOF_PHOTOS', 'true'))) {
        try { DriveApp.getFileById(fileId).setTrashed(true); } catch (driveErr) {}
      }

      if (proofNameCol) sheet.getRange(r, proofNameCol).setValue('');
      if (proofUrlCol) sheet.getRange(r, proofUrlCol).setValue('');
      if (proofIdCol) sheet.getRange(r, proofIdCol).setValue('');
      if (proofHashCol) sheet.getRange(r, proofHashCol).setValue('');
      if (memoCol) {
        const oldMemo = String(values[r - 1][memoCol - 1] || '');
        sheet.getRange(r, memoCol).setValue((oldMemo ? oldMemo + ' / ' : '') + '개인 인증샷 삭제 ' + nowString_());
      }

      invalidateAppCache_();
      const participants = getParticipants_();
      const dashboard = rebuildDashboardSummary_(participants);
      const records = getParticipantRecords(id).records || [];
      cacheInitialData_(participants, dashboard);
      return {
        ok: true,
        message: (participant.emoji || '') + ' ' + participant.displayName + '님의 러닝 인증샷만 삭제했어요. 러닝 기록은 그대로 남아 있어요.',
        dashboard: dashboard,
        records: records,
        deletedProofPhotoFileId: fileId
      };
    }
    throw new Error('인증샷을 삭제할 기록을 찾지 못했습니다.');
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  } finally {
    lock.releaseLock();
  }
}

function updateParticipantRecord(participantId, recordId, review) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const id = String(participantId || '').trim();
    const targetId = String(recordId || '').trim();
    if (!id) throw new Error('닉네임을 먼저 선택해주세요.');
    if (!targetId) throw new Error('수정할 기록ID가 없습니다.');

    const participant = findParticipantById_(id);
    if (!participant) throw new Error('참가자를 찾을 수 없습니다.');

    const normalized = normalizeReviewedData_(review || {}, '개인수정');
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(APP.SHEET_RECORDS);
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) throw new Error('수정할 기록이 없습니다.');

    const headers = values[0].map(function (h) { return String(h || '').trim(); });
    const col = function (name) { return headers.indexOf(name) + 1; };
    const idCol = col('기록ID');
    const participantCol = col('참가자ID');
    const statusCol = col('상태');
    if (!idCol || !participantCol || !statusCol) throw new Error('러닝기록 시트의 기록ID/참가자ID/상태 컬럼을 확인해주세요.');

    for (let r = 2; r <= values.length; r++) {
      const rowRecordId = String(values[r - 1][idCol - 1] || '').trim();
      const rowParticipantId = String(values[r - 1][participantCol - 1] || '').trim();
      const status = String(values[r - 1][statusCol - 1] || '').toUpperCase();
      if (rowRecordId !== targetId) continue;
      if (rowParticipantId !== id) throw new Error('선택한 닉네임의 기록만 수정할 수 있습니다.');
      if (status.indexOf('삭제') === 0) throw new Error('삭제된 기록은 수정할 수 없습니다.');

      const set = function (name, value) {
        const c = col(name);
        if (c) sheet.getRange(r, c).setValue(value);
      };
      set('러닝일자', normalized.runningDate || '');
      set('거리(km)', normalized.distanceKm || '');
      set('시간(초)', normalized.durationSeconds || '');
      set('시간표시', normalized.durationText || '');
      set('평균페이스(초/km)', normalized.averagePaceSecondsPerKm || '');
      set('페이스표시', normalized.averagePaceText || '');
      set('칼로리(kcal)', normalized.caloriesKcal || '');
      set('평균심박수(bpm)', normalized.averageHeartRateBpm || '');
      set('케이던스(spm)', normalized.cadenceSpm || '');
      set('상태', 'OK_수정');
      set('신뢰도', normalized.confidence || 1);
      set('경고', uniqueStrings_((normalized.warnings || []).concat(['개인이 직접 수정'])).join(' / '));
      set('입력방식', '개인 수정');
      const memoCol = col('메모');
      if (memoCol) {
        const oldMemo = String(values[r - 1][memoCol - 1] || '');
        sheet.getRange(r, memoCol).setValue((oldMemo ? oldMemo + ' / ' : '') + '개인 수정 ' + nowString_());
      }

      invalidateAppCache_();
      const participants = getParticipants_();
      const dashboard = rebuildDashboardSummary_(participants);
      const records = getParticipantRecords(id).records || [];
      cacheInitialData_(participants, dashboard);
      return {
        ok: true,
        message: (participant.emoji || '') + ' ' + participant.displayName + '님의 기록을 수정했어요.',
        dashboard: dashboard,
        records: records
      };
    }
    throw new Error('수정할 기록을 찾지 못했습니다.');
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  } finally {
    lock.releaseLock();
  }
}

function deleteParticipantRecord(participantId, recordId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const id = String(participantId || '').trim();
    const targetId = String(recordId || '').trim();
    if (!id) throw new Error('닉네임을 먼저 선택해주세요.');
    if (!targetId) throw new Error('삭제할 기록ID가 없습니다.');

    const participant = findParticipantById_(id);
    if (!participant) throw new Error('참가자를 찾을 수 없습니다.');

    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(APP.SHEET_RECORDS);
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) throw new Error('삭제할 기록이 없습니다.');

    const headers = values[0].map(function (h) { return String(h || '').trim(); });
    const col = function (name) { return headers.indexOf(name) + 1; };
    const idCol = col('기록ID');
    const participantCol = col('참가자ID');
    const statusCol = col('상태');
    const memoCol = col('메모');
    if (!idCol || !participantCol || !statusCol) throw new Error('러닝기록 시트의 기록ID/참가자ID/상태 컬럼을 확인해주세요.');

    for (let r = 2; r <= values.length; r++) {
      const rowRecordId = String(values[r - 1][idCol - 1] || '').trim();
      const rowParticipantId = String(values[r - 1][participantCol - 1] || '').trim();
      if (rowRecordId !== targetId) continue;
      if (rowParticipantId !== id) throw new Error('선택한 닉네임의 기록만 삭제할 수 있습니다.');

      sheet.getRange(r, statusCol).setValue('삭제');
      if (memoCol) {
        const oldMemo = String(values[r - 1][memoCol - 1] || '');
        sheet.getRange(r, memoCol).setValue((oldMemo ? oldMemo + ' / ' : '') + '개인 삭제 ' + nowString_());
      }
      invalidateAppCache_();
      const participants = getParticipants_();
      const dashboard = rebuildDashboardSummary_(participants);
      const records = getParticipantRecords(id).records || [];
      cacheInitialData_(participants, dashboard);
      return {
        ok: true,
        message: (participant.emoji || '') + ' ' + participant.displayName + '님의 기록을 삭제했어요.',
        dashboard: dashboard,
        records: records
      };
    }
    throw new Error('삭제할 기록을 찾지 못했습니다.');
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  } finally {
    lock.releaseLock();
  }
}

function appendRunRecord_(args) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(APP.SHEET_RECORDS);
  const e = args.extracted;
  const uploadedAt = nowString_();
  const warnings = (e.warnings || []).join(' / ');

  const row = [
    args.recordId,
    uploadedAt,
    e.runningDate || '',
    args.participant.id,
    args.participant.displayName || args.participant.name,
    e.distanceKm || '',
    e.durationSeconds || '',
    e.durationText || '',
    e.averagePaceSecondsPerKm || '',
    e.averagePaceText || '',
    e.caloriesKcal || '',
    e.averageHeartRateBpm || '',
    e.elevationGainM || '',
    e.cadenceSpm || '',
    e.appName || '',
    args.originalFileName || '',
    args.imageUrl || '',
    args.imageFileId || '',
    args.imageHash || '',
    args.duplicate ? 'TRUE' : 'FALSE',
    warnings ? 'OK_주의' : 'OK',
    args.model || '',
    e.confidence || '',
    warnings,
    JSON.stringify(args.rawExtracted || e),
    args.note || '',
    args.inputMode || inferInputModeFromNote_(args.note) || 'AI 자동인식',
    args.proofPhoto ? args.proofPhoto.fileName || '' : '',
    args.proofPhoto ? args.proofPhoto.url || '' : '',
    args.proofPhoto ? args.proofPhoto.id || '' : '',
    args.proofPhoto ? args.proofPhoto.hash || '' : '',
    args.proofPhoto ? (args.proofPhotoPublic ? 'TRUE' : 'FALSE') : ''
  ];

  sheet.appendRow(row);
  maybeFormatSheetOnWrite_(sheet, APP.SHEET_RECORDS);

  return {
    recordId: args.recordId,
    uploadedAt: uploadedAt,
    name: args.participant.displayName || args.participant.name,
    emoji: args.participant.emoji || CUTE_EMOJIS[positiveHash_(args.participant.id) % CUTE_EMOJIS.length],
    distanceKm: e.distanceKm,
    durationSeconds: e.durationSeconds,
    durationText: e.durationText,
    averagePaceSecondsPerKm: e.averagePaceSecondsPerKm,
    averagePaceText: e.averagePaceText,
    caloriesKcal: e.caloriesKcal,
    appName: e.appName,
    confidence: e.confidence,
    warnings: e.warnings || [],
    inputMode: args.inputMode || inferInputModeFromNote_(args.note) || 'AI 자동인식',
    hasProofPhoto: Boolean(args.proofPhoto && args.proofPhoto.id),
    proofPhotoPublic: Boolean(args.proofPhoto && args.proofPhotoPublic),
    proofPhotoFileId: args.proofPhoto ? args.proofPhoto.id || '' : '',
    proofPhotoUrl: args.proofPhoto ? args.proofPhoto.url || '' : ''
  };
}

function findDuplicateRecord_(participantId, imageHash) {
  if (!imageHash) return null;
  const rows = tableRows_(getSpreadsheet_().getSheetByName(APP.SHEET_RECORDS));
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const status = String(row['상태'] || '').toUpperCase();
    if (status.indexOf('삭제') === 0) continue;
    if (String(row['참가자ID'] || '') === String(participantId) && String(row['이미지SHA256'] || '') === String(imageHash)) {
      return { recordId: String(row['기록ID'] || ''), uploadedAt: String(row['업로드일시'] || '') };
    }
  }
  return null;
}

function findPotentialDuplicateRecord_(participantId, extracted) {
  if (!participantId || !extracted) return null;
  const activityDate = normalizeDateString_(extracted.runningDate);
  const distanceKm = numberOrNull_(extracted.distanceKm);
  const durationSeconds = intOrNull_(extracted.durationSeconds);
  if (!activityDate || !distanceKm || !durationSeconds) return null;

  const distanceToleranceKm = Number(getProp_('SIMILAR_DUP_DISTANCE_KM', '0.03')) || 0.03;
  const timeToleranceSeconds = Number(getProp_('SIMILAR_DUP_TIME_SECONDS', '45')) || 45;
  const rows = tableRows_(getSpreadsheet_().getSheetByName(APP.SHEET_RECORDS));

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const status = String(row['상태'] || '').toUpperCase();
    if (status.indexOf('OK') !== 0) continue;
    if (toBoolean_(row['중복여부'])) continue;
    if (String(row['참가자ID'] || '').trim() !== String(participantId)) continue;
    const rowDate = normalizeDateString_(row['러닝일자']);
    if (rowDate !== activityDate) continue;
    const rowDistance = numberOrNull_(row['거리(km)']);
    const rowSeconds = intOrNull_(row['시간(초)']);
    if (!rowDistance || !rowSeconds) continue;
    const distanceDiff = Math.abs(rowDistance - distanceKm);
    const timeDiff = Math.abs(rowSeconds - durationSeconds);
    if (distanceDiff <= distanceToleranceKm && timeDiff <= timeToleranceSeconds) {
      return {
        recordId: String(row['기록ID'] || ''),
        uploadedAt: String(row['업로드일시'] || ''),
        activityDate: rowDate,
        distanceKm: roundOrNull_(rowDistance, 2) || rowDistance,
        durationText: rowSeconds ? formatDuration_(rowSeconds) : String(row['시간표시'] || ''),
        averagePaceText: String(row['페이스표시'] || '') || (rowSeconds && rowDistance ? formatPace_(Math.round(rowSeconds / rowDistance)) : ''),
        distanceDiffKm: roundOrNull_(distanceDiff, 2) || 0,
        timeDiffSeconds: timeDiff
      };
    }
  }
  return null;
}

function addReaction(recordId, fromParticipantId, reaction) {
  try {
    const targetRecordId = String(recordId || '').trim();
    const fromId = String(fromParticipantId || '').trim();
    const cleanReaction = normalizeReaction_(reaction);
    if (!targetRecordId) throw new Error('응원할 기록ID가 없습니다.');
    if (!fromId) throw new Error('응원하려면 먼저 내 닉네임을 선택해주세요.');
    if (!cleanReaction) throw new Error('사용할 수 없는 리액션입니다.');

    const participant = findParticipantById_(fromId);
    if (!participant) throw new Error('응원하는 참가자를 찾을 수 없습니다.');
    const target = findRecordForReaction_(targetRecordId);
    if (!target) throw new Error('응원할 기록을 찾을 수 없습니다.');

    ensureSchemaReady_();
    const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_REACTIONS);
    sheet.appendRow([
      makeId_('react'),
      nowString_(),
      targetRecordId,
      target.participantId,
      fromId,
      cleanReaction
    ]);
    maybeFormatSheetOnWrite_(sheet, APP.SHEET_REACTIONS);
    invalidateAppCache_();

    const counts = getReactionCountsMap_(1200);
    return {
      ok: true,
      recordId: targetRecordId,
      reactionCounts: counts[targetRecordId] || {},
      message: '응원을 남겼어요.'
    };
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  }
}

function normalizeReaction_(reaction) {
  const value = String(reaction || '').trim();
  const allowed = ['멋져요', '꾸준해요', '목표달성', '파이팅'];
  return allowed.indexOf(value) >= 0 ? value : '';
}

function findRecordForReaction_(recordId) {
  const targetId = String(recordId || '').trim();
  if (!targetId) return null;
  const rows = tableRows_(getSpreadsheet_().getSheetByName(APP.SHEET_RECORDS));
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (String(row['기록ID'] || '').trim() !== targetId) continue;
    const status = String(row['상태'] || '').toUpperCase();
    if (status.indexOf('OK') !== 0) return null;
    return {
      recordId: targetId,
      participantId: String(row['참가자ID'] || '').trim()
    };
  }
  return null;
}

function getReactionCountsMap_(maxRows) {
  try {
    const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_REACTIONS);
    if (!sheet) return {};
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastRow < 2 || lastColumn < 1) return {};
    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (h) { return String(h || '').trim(); });
    const limit = Number(maxRows || 0);
    const startRow = limit ? Math.max(2, lastRow - limit + 1) : 2;
    const values = sheet.getRange(startRow, 1, lastRow - startRow + 1, lastColumn).getValues();
    const map = {};
    values.forEach(function (cells) {
      const row = {};
      headers.forEach(function (header, idx) {
        if (header) row[header] = cells[idx];
      });
      const recordId = String(row['기록ID'] || '').trim();
      const reaction = normalizeReaction_(row['리액션']);
      if (!recordId || !reaction) return;
      if (!map[recordId]) map[recordId] = {};
      map[recordId][reaction] = Number(map[recordId][reaction] || 0) + 1;
    });
    return map;
  } catch (err) {
    return {};
  }
}



/***** Dashboard.gs *****/
function getDashboardSnapshotForInitial_(participants) {
  const safeParticipants = participants || getParticipants_();
  const cached = getCachedJson_('dashboardSummary');
  if (cached && cached.dashboard && isDashboardSnapshotFresh_(cached.dashboard, safeParticipants)) {
    return cached.dashboard;
  }
  const stored = readDashboardSnapshot_();
  if (stored && stored.dashboard && isDashboardSnapshotFresh_(stored.dashboard, safeParticipants)) {
    putCachedJson_('dashboardSummary', { dashboard: stored.dashboard }, APP.CACHE_TTL_SECONDS * 3);
    return stored.dashboard;
  }
  return null;
}

function getDashboardSummaryDataCached_(participants, forceRebuild) {
  const safeParticipants = participants || getParticipants_();
  if (!forceRebuild) {
    const snapshot = getDashboardSnapshotForInitial_(safeParticipants);
    if (snapshot) return snapshot;
  }
  return rebuildDashboardSummary_(safeParticipants);
}

function rebuildDashboardSummary_(participants) {
  const safeParticipants = participants || getParticipants_();
  const dashboard = getDashboardSummaryData_(safeParticipants);
  putCachedJson_('dashboardSummary', { dashboard: dashboard }, APP.CACHE_TTL_SECONDS * 3);
  saveDashboardSnapshot_(dashboard);
  return dashboard;
}

function isDashboardSnapshotFresh_(dashboard, participants) {
  if (!dashboard) return false;
  const today = formatYmd_(new Date());
  if (String(dashboard.today || '') !== today) return false;
  const activeCount = (participants || getParticipants_()).length;
  if (Number(dashboard.totalParticipants || 0) !== activeCount) return false;
  return Array.isArray(dashboard.weeklyProgress) && Array.isArray(dashboard.weeklyProofPhotos);
}

function readDashboardSnapshot_() {
  try {
    const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_DASHBOARD);
    if (!sheet) return null;
    const rows = sheet.getRange(1, DASHBOARD_SNAPSHOT.START_COLUMN, DASHBOARD_SNAPSHOT.MAX_CHUNKS + 1, 2).getValues();
    if (String(rows[0][0] || '') !== DASHBOARD_SNAPSHOT.MARKER) return null;
    const chunks = rows.slice(1)
      .filter(function (row) { return row[0] !== '' && row[1] !== ''; })
      .sort(function (a, b) { return Number(a[0]) - Number(b[0]); })
      .map(function (row) { return String(row[1] || ''); });
    if (!chunks.length) return null;
    return JSON.parse(chunks.join(''));
  } catch (err) {
    return null;
  }
}

function saveDashboardSnapshot_(dashboard) {
  try {
    if (!dashboard) return;
    const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_DASHBOARD);
    if (!sheet) return;
    const payload = JSON.stringify({
      savedAt: nowString_(),
      dashboard: dashboard
    });
    const chunks = [];
    for (let i = 0; i < payload.length; i += DASHBOARD_SNAPSHOT.CHUNK_SIZE) {
      chunks.push(payload.slice(i, i + DASHBOARD_SNAPSHOT.CHUNK_SIZE));
    }
    if (!chunks.length || chunks.length > DASHBOARD_SNAPSHOT.MAX_CHUNKS) return;
    sheet.getRange(1, DASHBOARD_SNAPSHOT.START_COLUMN, DASHBOARD_SNAPSHOT.MAX_CHUNKS + 1, 2).clearContent();
    sheet.getRange(1, DASHBOARD_SNAPSHOT.START_COLUMN, 1, 2).setValues([[DASHBOARD_SNAPSHOT.MARKER, nowString_()]]);
    sheet.getRange(2, DASHBOARD_SNAPSHOT.START_COLUMN, chunks.length, 2).setValues(chunks.map(function (chunk, index) {
      return [index + 1, chunk];
    }));
  } catch (err) {
  }
}

function updateEmojiInCachedInitialData_(participantId, emoji) {
  const id = String(participantId || '').trim();
  const nextEmoji = String(emoji || '').trim();
  if (!id || !nextEmoji) return;
  const cached = getCachedJson_('initialData');
  if (!cached) return;

  if (Array.isArray(cached.participants)) {
    cached.participants.forEach(function (p) {
      if (String(p.id || '') === id) p.emoji = nextEmoji;
    });
  }
  replaceEmojiInDashboardObject_(cached.dashboard, id, nextEmoji);
  putCachedJson_('initialData', cached, APP.CACHE_TTL_SECONDS);

  const cachedDashboard = getCachedJson_('dashboardSummary');
  if (cachedDashboard && cachedDashboard.dashboard) {
    replaceEmojiInDashboardObject_(cachedDashboard.dashboard, id, nextEmoji);
    putCachedJson_('dashboardSummary', cachedDashboard, APP.CACHE_TTL_SECONDS * 3);
    saveDashboardSnapshot_(cachedDashboard.dashboard);
  } else if (cached.dashboard) {
    saveDashboardSnapshot_(cached.dashboard);
  }
}

function replaceEmojiInDashboardObject_(dashboard, participantId, emoji) {
  if (!dashboard) return;
  ['weeklyProgress', 'weeklyLeaderboard', 'monthlyLeaderboard', 'todayRecords', 'todayRunnerTotals', 'todayProofPhotos', 'weeklyProofPhotos'].forEach(function (key) {
    (dashboard[key] || []).forEach(function (item) {
      if (String(item.participantId || '') === String(participantId)) item.emoji = emoji;
    });
  });
  ['memberWeeklyStats', 'memberLastWeekStats', 'memberAllTimeStats'].forEach(function (key) {
    const map = dashboard[key] || {};
    if (map[participantId]) map[participantId].emoji = emoji;
  });
}

/**
 * 친구가 새 닉네임을 만들면 참가자 시트에 즉시 등록합니다.
 */

function refreshDashboardSheet() {
  const ss = getSpreadsheet_();
  ensureSheets_(ss);
  const dashboard = rebuildDashboardSummary_(getParticipants_());
  const sheet = ss.getSheetByName(APP.SHEET_DASHBOARD);

  sheet.clearContents();
  sheet.getRange(1, 1, 1, HEADERS.DASHBOARD.length).setValues([HEADERS.DASHBOARD]);

  const rows = [];

  dashboard.weeklyProgress.forEach(function (item) {
    rows.push([
      '주간목표',
      item.participantId,
      item.name,
      item.count,
      item.distanceKm,
      item.durationText,
      item.averagePaceText,
      dashboard.weekLabel,
      item.percent,
      item.excessPercent,
      item.lastUploadedAt || ''
    ]);
  });

  const todayRowsForSheet = dashboard.todayRunnerTotals || dashboard.todayRecords || [];
  todayRowsForSheet.forEach(function (item) {
    rows.push([
      '오늘기록',
      item.participantId,
      item.name,
      item.count || 1,
      item.distanceKm,
      item.durationText,
      item.averagePaceText,
      item.activityDate || dashboard.today,
      '',
      '',
      item.lastUploadedAt || item.uploadedAt || ''
    ]);
  });

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, HEADERS.DASHBOARD.length).setValues(rows);
  }

  formatSheet_(sheet, APP.SHEET_DASHBOARD);
  saveDashboardSnapshot_(dashboard);
}

function getDashboardSummaryData_(participants) {
  const activeParticipants = participants || getParticipants_();
  const defaultWeeklyGoalKm = Number(getProp_('WEEKLY_GOAL_KM', '10')) || 10;
  const now = new Date();
  const todayYmd = formatYmd_(now);
  const weekStart = getMonday_(now);
  const weekEnd = addDays_(weekStart, 6);
  const weekStartYmd = formatYmd_(weekStart);
  const weekEndYmd = formatYmd_(weekEnd);
  const lastWeekStart = addDays_(weekStart, -7);
  const lastWeekEnd = addDays_(lastWeekStart, 6);
  const lastWeekStartYmd = formatYmd_(lastWeekStart);
  const lastWeekEndYmd = formatYmd_(lastWeekEnd);

  const participantMap = {};
  const weekById = {};
  const todayById = {};
  const monthById = {};
  const allTimeById = {};
  const allTimeCountById = {};
  const activeDayMapById = {};
  const caloriesById = {};
  const todayRecords = [];
  const weeklyProofPhotos = [];
  const dayMap = {};

  activeParticipants.forEach(function (p) {
    participantMap[p.id] = p;
    weekById[p.id] = emptyTotalForParticipant_(p);
    todayById[p.id] = emptyTotalForParticipant_(p);
    monthById[p.id] = emptyTotalForParticipant_(p);
    allTimeById[p.id] = emptyTotalForParticipant_(p);
    allTimeCountById[p.id] = 0;
    activeDayMapById[p.id] = {};
    caloriesById[p.id] = 0;
  });

  const table = getRecordSheetTable_();
  const rows = table.rows;
  const idx = table.idx;
  const reactionCountsByRecord = getReactionCountsMap_(800);

  rows.forEach(function (sheetRow) {
    const status = String(fastCell_(sheetRow, idx, '상태') || '').toUpperCase();
    const duplicated = toBoolean_(fastCell_(sheetRow, idx, '중복여부'));
    const participantId = String(fastCell_(sheetRow, idx, '참가자ID') || '').trim();
    const participant = participantMap[participantId];
    if (status.indexOf('OK') !== 0 || duplicated || !participant) return;

    allTimeCountById[participantId] = Number(allTimeCountById[participantId] || 0) + 1;

    const uploadedAt = fastCell_(sheetRow, idx, '업로드일시');
    const recordId = String(fastCell_(sheetRow, idx, '기록ID') || '');
    const uploadedYmd = dateTimeToYmd_(uploadedAt) || recordIdToYmd_(recordId);
    const activityDate = normalizeDateString_(fastCell_(sheetRow, idx, '러닝일자')) || uploadedYmd || todayYmd;
    const isToday = uploadedYmd === todayYmd;
    const isThisWeek = activityDate >= weekStartYmd && activityDate <= weekEndYmd;
    const isThisMonth = String(activityDate || '').slice(0, 7) === String(todayYmd).slice(0, 7);

    const distance = numberOrNull_(fastCell_(sheetRow, idx, '거리(km)')) || 0;
    const seconds = intOrNull_(fastCell_(sheetRow, idx, '시간(초)')) || 0;
    const paceSeconds = distance ? Math.round(seconds / distance) : intOrNull_(fastCell_(sheetRow, idx, '평균페이스(초/km)'));
    const proofPhotoFileId = String(fastCell_(sheetRow, idx, '인증샷파일ID') || '').trim();
    const proofPhotoPublic = isProofPhotoPublicValue_(fastCell_(sheetRow, idx, '인증샷공개여부'), Boolean(proofPhotoFileId));
    const record = {
      recordId: recordId,
      participantId: participantId,
      name: participant.displayName || participant.name,
      emoji: participant.emoji || CUTE_EMOJIS[positiveHash_(participantId) % CUTE_EMOJIS.length],
      activityDate: activityDate,
      uploadedAt: uploadedAt,
      distanceKm: roundOrNull_(distance, 2) || 0,
      durationSeconds: seconds,
      durationText: seconds ? formatDuration_(seconds) : String(fastCell_(sheetRow, idx, '시간표시') || ''),
      averagePaceSecondsPerKm: paceSeconds,
      averagePaceText: paceSeconds ? formatPace_(paceSeconds) : String(fastCell_(sheetRow, idx, '페이스표시') || ''),
      caloriesKcal: intOrNull_(fastCell_(sheetRow, idx, '칼로리(kcal)')),
      averageHeartRateBpm: intOrNull_(fastCell_(sheetRow, idx, '평균심박수(bpm)')),
      cadenceSpm: intOrNull_(fastCell_(sheetRow, idx, '케이던스(spm)')),
      appName: String(fastCell_(sheetRow, idx, '앱명') || ''),
      note: String(fastCell_(sheetRow, idx, '메모') || ''),
      inputMode: inferInputModeFromFastRow_(sheetRow, idx),
      reactionCounts: reactionCountsByRecord[recordId] || {},
      hasProofPhoto: Boolean(proofPhotoFileId),
      proofPhotoPublic: proofPhotoPublic,
      proofPhotoFileName: String(fastCell_(sheetRow, idx, '인증샷파일명') || '').trim(),
      proofPhotoUrl: String(fastCell_(sheetRow, idx, '인증샷URL') || '').trim(),
      proofPhotoFileId: proofPhotoFileId,
      proofPhotoSha256: String(fastCell_(sheetRow, idx, '인증샷SHA256') || '').trim()
    };

    addToTotal_(allTimeById[participantId], record);
    if (!isToday && !isThisWeek && !isThisMonth) return;

    if (isThisMonth) {
      addToTotal_(monthById[participantId], record);
    }

    if (isToday) {
      todayRecords.push(record);
      addToTotal_(todayById[participantId], record);
    }
    if (isThisWeek) {
      addToTotal_(weekById[participantId], record);
      activeDayMapById[participantId][activityDate] = true;
      caloriesById[participantId] += Number(record.caloriesKcal || 0);
      if (record.hasProofPhoto && record.proofPhotoPublic !== false) weeklyProofPhotos.push(record);
      if (!dayMap[activityDate]) dayMap[activityDate] = { date: activityDate, label: dayLabelFromYmd_(activityDate), distanceKm: 0 };
      dayMap[activityDate].distanceKm += Number(record.distanceKm || 0);
    }
  });

  Object.keys(weekById).forEach(function (id) { finalizeTotal_(weekById[id]); });
  Object.keys(todayById).forEach(function (id) { finalizeTotal_(todayById[id]); });
  Object.keys(monthById).forEach(function (id) { finalizeTotal_(monthById[id]); });
  Object.keys(allTimeById).forEach(function (id) { finalizeTotal_(allTimeById[id]); });

  const weeklyProgress = activeParticipants.map(function (p) {
    const item = weekById[p.id];
    const goalKm = getParticipantGoalKm_(p, defaultWeeklyGoalKm);
    const percent = goalKm ? Math.round((item.distanceKm / goalKm) * 1000) / 10 : 0;
    const statsForBadges = Object.assign({}, item, {
      goalKm: goalKm,
      percent: percent,
      excessPercent: percent > 100 ? Math.round((percent - 100) * 10) / 10 : 0,
      remainingKm: roundOrNull_(Math.max(0, goalKm - item.distanceKm), 2) || 0,
      activeDays: Object.keys(activeDayMapById[p.id] || {}).length,
      caloriesKcal: Math.round(caloriesById[p.id] || 0),
      allTimeCount: Number(allTimeCountById[p.id] || 0),
      isFirstRunEver: Boolean(item.count > 0 && Number(allTimeCountById[p.id] || 0) === 1),
      goalAchieved: percent >= 100,
      congratsText: percent >= 100 ? '축하합니다' : ''
    });
    statsForBadges.badges = makePraiseBadges_(statsForBadges);
    return Object.assign({}, item, statsForBadges, {
      defaultGoalKm: defaultWeeklyGoalKm
    });
  });

  const todayRunnerTotals = activeParticipants.map(function (p) { return todayById[p.id]; }).filter(function (item) {
    return item && item.count > 0;
  });
  todayRecords.sort(function (a, b) {
    return String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || ''));
  });
  weeklyProofPhotos.sort(function (a, b) {
    const dateCompare = String(b.activityDate || '').localeCompare(String(a.activityDate || ''));
    if (dateCompare) return dateCompare;
    return String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || ''));
  });
  const todayProofPhotos = todayRecords.filter(function (record) { return record.hasProofPhoto && record.proofPhotoPublic !== false; });
  const weeklyLeaderboard = makeLeaderboard_(weekById);
  const monthlyLeaderboard = makeLeaderboard_(monthById);
  const allTimeLeaderboard = makeLeaderboard_(allTimeById);
  const moodStats = { group: { days: Object.keys(dayMap).map(function (date) { return dayMap[date]; }) } };
  const groupMood = buildGroupMood_(activeParticipants, weeklyProgress, moodStats, todayRunnerTotals, weekStartYmd, weekEndYmd);

  return {
    generatedAt: nowString_(),
    fastMode: true,
    weeklyGoalKm: defaultWeeklyGoalKm,
    defaultWeeklyGoalKm: defaultWeeklyGoalKm,
    today: todayYmd,
    weekStart: weekStartYmd,
    weekEnd: weekEndYmd,
    weekLabel: weekStartYmd + ' ~ ' + weekEndYmd,
    weekSeasonLabel: makeWeekSeasonLabel_(weekStart),
    closingNotice: makeWeeklyClosingNotice_(now, weeklyProgress, activeParticipants.length),
    lastWeekStart: lastWeekStartYmd,
    lastWeekEnd: lastWeekEndYmd,
    lastWeekLabel: lastWeekStartYmd + ' ~ ' + lastWeekEndYmd,
    totalParticipants: activeParticipants.length,
    weeklyProgress: weeklyProgress,
    todayRecords: todayRecords,
    todayRunnerTotals: todayRunnerTotals,
    todayProofPhotos: todayProofPhotos,
    weeklyProofPhotos: weeklyProofPhotos,
    weeklyLeaderboard: weeklyLeaderboard,
    monthlyLeaderboard: monthlyLeaderboard,
    allTimeLeaderboard: allTimeLeaderboard,
    memberWeeklyStats: {},
    memberLastWeekStats: {},
    memberAllTimeStats: {},
    groupMood: groupMood,
    weeklyMood: normalizeGroupMoodForClient_(groupMood, activeParticipants.length),
    memberStatuses: getMemberStatusMap_()
  };
}

function getRecordSheetTable_() {
  const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_RECORDS);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return { headers: [], idx: {}, rows: [] };
  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const headers = values[0].map(function (h) { return String(h || '').trim(); });
  const idx = {};
  headers.forEach(function (header, index) { if (header) idx[header] = index; });
  return { headers: headers, idx: idx, rows: values.slice(1) };
}

function fastCell_(row, idx, header) {
  if (!idx || idx[header] === undefined) return '';
  return normalizeSheetCell_(row[idx[header]], header);
}

function inferInputModeFromFastRow_(row, idx) {
  const direct = String(fastCell_(row, idx, '입력방식') || '').trim();
  if (direct) return direct;
  return inferInputModeFromNote_(fastCell_(row, idx, '메모')) || 'AI 자동인식';
}

function dayLabelFromYmd_(ymd) {
  const text = String(ymd || '');
  const m = text.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()] || '';
}

function makeWeekSeasonLabel_(weekStart) {
  const d = new Date(weekStart);
  const month = d.getMonth() + 1;
  const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
  const weekNo = Math.max(1, Math.ceil((d.getDate() + firstDay.getDay()) / 7));
  const season = month >= 3 && month <= 5 ? '봄 러닝'
    : (month >= 6 && month <= 8 ? '여름 러닝'
    : (month >= 9 && month <= 11 ? '가을 러닝' : '겨울 러닝'));
  return month + '월 ' + weekNo + '주차 ' + season;
}

function makeWeeklyClosingNotice_(now, weeklyProgress, totalParticipants) {
  const day = now.getDay();
  const hour = now.getHours();
  const active = (weeklyProgress || []).filter(function (row) {
    return Number(row.distanceKm || 0) > 0 || Number(row.count || 0) > 0;
  }).length;
  const achieved = (weeklyProgress || []).filter(function (row) {
    return Number(row.percent || 0) >= 100;
  }).length;
  if (day === 0 && hour >= 12) {
    return '오늘은 주간 기록 마감일이에요. 마지막 인증을 잊지 마세요.';
  }
  if (day === 1 && hour < 12) {
    return '새 주가 시작됐어요. 지난주 기록을 확인하고 가볍게 다시 출발해요.';
  }
  if (Number(totalParticipants || 0) > 0 && active === 0) {
    return '이번 주 첫 인증을 기다리고 있어요.';
  }
  if (achieved > 0) {
    return '목표를 달성한 멤버가 있어요. 주간 기록에서 축하 배지를 확인해보세요.';
  }
  return '';
}

function getDashboardData_() {
  const participants = getParticipants_();
  const defaultWeeklyGoalKm = Number(getProp_('WEEKLY_GOAL_KM', '10')) || 10;
  const now = new Date();
  const todayYmd = formatYmd_(now);
  const weekStart = getMonday_(now);
  const weekEnd = addDays_(weekStart, 6);
  const weekStartYmd = formatYmd_(weekStart);
  const weekEndYmd = formatYmd_(weekEnd);
  const lastWeekStart = addDays_(weekStart, -7);
  const lastWeekEnd = addDays_(lastWeekStart, 6);
  const lastWeekStartYmd = formatYmd_(lastWeekStart);
  const lastWeekEndYmd = formatYmd_(lastWeekEnd);

  const participantMap = {};
  const weekById = {};
  const todayById = {};
  const monthById = {};
  const allTimeById = {};
  const memberWeeklyStats = {};
  const memberLastWeekStats = {};
  const memberAllTimeStats = {};

  participants.forEach(function (p) {
    const goalKm = getParticipantGoalKm_(p, defaultWeeklyGoalKm);
    participantMap[p.id] = p;
    weekById[p.id] = emptyTotalForParticipant_(p);
    todayById[p.id] = emptyTotalForParticipant_(p);
    monthById[p.id] = emptyTotalForParticipant_(p);
    allTimeById[p.id] = emptyTotalForParticipant_(p);
    memberWeeklyStats[p.id] = emptyMemberWeeklyStats_(p, weekStart, goalKm);
    memberLastWeekStats[p.id] = emptyMemberLastWeekStats_(p, lastWeekStart);
    memberAllTimeStats[p.id] = emptyMemberAllTimeStats_(p, goalKm);
  });

  const todayRecords = [];
  const weeklyProofPhotos = [];
  const rows = tableRows_(getSpreadsheet_().getSheetByName(APP.SHEET_RECORDS));
  const reactionCountsByRecord = getReactionCountsMap_(1200);

  rows.forEach(function (row) {
    const status = String(row['상태'] || '').toUpperCase();
    const duplicated = toBoolean_(row['중복여부']);
    const participantId = String(row['참가자ID'] || '').trim();
    const participant = participantMap[participantId];
    if (status.indexOf('OK') !== 0 || duplicated || !participant) return;

    const uploadedAt = row['업로드일시'];
    const recordId = String(row['기록ID'] || '');
    const uploadedYmd = dateTimeToYmd_(uploadedAt) || recordIdToYmd_(recordId);
    const activityDate = normalizeDateString_(row['러닝일자']) || uploadedYmd || todayYmd;
    const isToday = uploadedYmd === todayYmd;
    const isThisWeek = activityDate >= weekStartYmd && activityDate <= weekEndYmd;
    const isLastWeek = activityDate >= lastWeekStartYmd && activityDate <= lastWeekEndYmd;

    const distance = numberOrNull_(row['거리(km)']) || 0;
    const seconds = intOrNull_(row['시간(초)']) || 0;
    const paceSeconds = distance ? Math.round(seconds / distance) : intOrNull_(row['평균페이스(초/km)']);
    const proofPhotoFileId = String(row['인증샷파일ID'] || '').trim();
    const proofPhotoUrl = String(row['인증샷URL'] || '').trim();
    const proofPhotoPublic = isProofPhotoPublicValue_(row['인증샷공개여부'], Boolean(proofPhotoFileId));
    const record = {
      recordId: recordId,
      participantId: participantId,
      name: participant.displayName || participant.name,
      emoji: participant.emoji || CUTE_EMOJIS[positiveHash_(participantId) % CUTE_EMOJIS.length],
      activityDate: activityDate,
      uploadedAt: uploadedAt,
      distanceKm: roundOrNull_(distance, 2) || 0,
      durationSeconds: seconds,
      durationText: seconds ? formatDuration_(seconds) : String(row['시간표시'] || ''),
      averagePaceSecondsPerKm: paceSeconds,
      averagePaceText: paceSeconds ? formatPace_(paceSeconds) : String(row['페이스표시'] || ''),
      caloriesKcal: intOrNull_(row['칼로리(kcal)']),
      averageHeartRateBpm: intOrNull_(row['평균심박수(bpm)']),
      cadenceSpm: intOrNull_(row['케이던스(spm)']),
      appName: String(row['앱명'] || ''),
      note: String(row['메모'] || ''),
      inputMode: inferInputModeFromRow_(row),
      reactionCounts: reactionCountsByRecord[recordId] || {},
      hasProofPhoto: Boolean(proofPhotoFileId),
      proofPhotoPublic: proofPhotoPublic,
      proofPhotoFileName: String(row['인증샷파일명'] || '').trim(),
      proofPhotoUrl: proofPhotoUrl,
      proofPhotoFileId: proofPhotoFileId,
      proofPhotoSha256: String(row['인증샷SHA256'] || '').trim()
    };

    addToMemberAllTimeStats_(memberAllTimeStats[participantId], record);
    addToTotal_(allTimeById[participantId], record);
    if (String(activityDate || '').slice(0, 7) === String(todayYmd).slice(0, 7)) {
      addToTotal_(monthById[participantId], record);
    }

    if (isToday) {
      todayRecords.push(record);
      addToTotal_(todayById[participantId], record);
    }
    if (isThisWeek) {
      addToTotal_(weekById[participantId], record);
      addToMemberWeeklyStats_(memberWeeklyStats[participantId], record);
      if (record.hasProofPhoto && record.proofPhotoPublic !== false) weeklyProofPhotos.push(record);
    }
    if (isLastWeek) {
      addToMemberLastWeekStats_(memberLastWeekStats[participantId], record);
    }
  });

  Object.keys(memberAllTimeStats).forEach(function (id) { finalizeMemberAllTimeStats_(memberAllTimeStats[id]); });
  Object.keys(weekById).forEach(function (id) { finalizeTotal_(weekById[id]); });
  Object.keys(todayById).forEach(function (id) { finalizeTotal_(todayById[id]); });
  Object.keys(monthById).forEach(function (id) { finalizeTotal_(monthById[id]); });
  Object.keys(allTimeById).forEach(function (id) { finalizeTotal_(allTimeById[id]); });
  Object.keys(memberWeeklyStats).forEach(function (id) { finalizeMemberWeeklyStats_(memberWeeklyStats[id]); });
  Object.keys(memberLastWeekStats).forEach(function (id) { finalizeMemberLastWeekStats_(memberLastWeekStats[id]); });

  Object.keys(memberWeeklyStats).forEach(function (id) {
    const stats = memberWeeklyStats[id];
    const allTime = memberAllTimeStats[id] || {};
    stats.allTimeCount = Number(allTime.count || 0);
    stats.isFirstRunEver = Boolean(stats.count > 0 && Number(allTime.count || 0) === 1);
    stats.goalAchieved = Number(stats.percent || 0) >= 100;
    stats.congratsText = stats.goalAchieved ? '축하합니다' : '';
    stats.badges = makePraiseBadges_(stats);
  });

  const weeklyProgress = participants.map(function (p) {
    const item = weekById[p.id];
    const goalKm = getParticipantGoalKm_(p, defaultWeeklyGoalKm);
    const percent = goalKm ? Math.round((item.distanceKm / goalKm) * 1000) / 10 : 0;
    const stats = memberWeeklyStats[p.id] || {};
    const allTime = memberAllTimeStats[p.id] || {};
    return Object.assign({}, item, {
      goalKm: goalKm,
      defaultGoalKm: defaultWeeklyGoalKm,
      percent: percent,
      excessPercent: percent > 100 ? Math.round((percent - 100) * 10) / 10 : 0,
      remainingKm: roundOrNull_(Math.max(0, goalKm - item.distanceKm), 2) || 0,
      allTimeCount: Number(allTime.count || 0),
      isFirstRunEver: Boolean(item.count > 0 && Number(allTime.count || 0) === 1),
      goalAchieved: percent >= 100,
      congratsText: percent >= 100 ? '축하합니다' : '',
      badges: stats.badges || []
    });
  });

  const todayRunnerTotals = participants.map(function (p) { return todayById[p.id]; }).filter(function (item) {
    return item && item.count > 0;
  });

  todayRecords.sort(function (a, b) {
    return String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || ''));
  });
  weeklyProofPhotos.sort(function (a, b) {
    const dateCompare = String(b.activityDate || '').localeCompare(String(a.activityDate || ''));
    if (dateCompare) return dateCompare;
    return String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || ''));
  });

  const todayProofPhotos = todayRecords.filter(function (record) { return record.hasProofPhoto && record.proofPhotoPublic !== false; });
  const weeklyLeaderboard = makeLeaderboard_(weekById);
  const monthlyLeaderboard = makeLeaderboard_(monthById);
  const allTimeLeaderboard = makeLeaderboard_(allTimeById);
  const groupMood = buildGroupMood_(participants, weeklyProgress, memberWeeklyStats, todayRunnerTotals, weekStartYmd, weekEndYmd);

  return {
    generatedAt: nowString_(),
    weeklyGoalKm: defaultWeeklyGoalKm,
    defaultWeeklyGoalKm: defaultWeeklyGoalKm,
    today: todayYmd,
    weekStart: weekStartYmd,
    weekEnd: weekEndYmd,
    weekLabel: weekStartYmd + ' ~ ' + weekEndYmd,
    lastWeekStart: lastWeekStartYmd,
    lastWeekEnd: lastWeekEndYmd,
    lastWeekLabel: lastWeekStartYmd + ' ~ ' + lastWeekEndYmd,
    totalParticipants: participants.length,
    weeklyProgress: weeklyProgress,
    todayRecords: todayRecords,
    todayRunnerTotals: todayRunnerTotals,
    todayProofPhotos: todayProofPhotos,
    weeklyProofPhotos: weeklyProofPhotos,
    weeklyLeaderboard: weeklyLeaderboard,
    monthlyLeaderboard: monthlyLeaderboard,
    allTimeLeaderboard: allTimeLeaderboard,
    memberWeeklyStats: memberWeeklyStats,
    memberLastWeekStats: memberLastWeekStats,
    memberAllTimeStats: memberAllTimeStats,
    groupMood: groupMood,
    weeklyMood: normalizeGroupMoodForClient_(groupMood, participants.length),
    memberStatuses: getMemberStatusMap_()
  };
}

function getParticipantGoalKm_(participant, fallbackGoalKm) {
  const fallback = Number(fallbackGoalKm || getProp_('WEEKLY_GOAL_KM', '10')) || 10;
  const personalGoal = numberOrNull_(participant && participant.targetDistanceKm);
  return personalGoal && personalGoal > 0 ? roundOrNull_(personalGoal, 2) : fallback;
}

function buildGroupMood_(participants, weeklyProgress, memberWeeklyStats, todayRunnerTotals, weekStartYmd, weekEndYmd) {
  const totals = {
    totalDistanceKm: 0,
    totalGoalKm: 0,
    totalRuns: 0,
    activeMembers: 0,
    totalDurationSeconds: 0,
    bestDayLabel: '',
    bestDayKm: 0
  };
  const dayMap = {};

  weeklyProgress.forEach(function (item) {
    totals.totalDistanceKm += Number(item.distanceKm || 0);
    totals.totalGoalKm += Number(item.goalKm || 0);
    totals.totalRuns += Number(item.count || 0);
    totals.totalDurationSeconds += Number(item.durationSeconds || 0);
    if (Number(item.count || 0) > 0) totals.activeMembers += 1;
  });

  Object.keys(memberWeeklyStats || {}).forEach(function (id) {
    const stats = memberWeeklyStats[id];
    (stats.days || []).forEach(function (day) {
      if (!dayMap[day.date]) dayMap[day.date] = { label: day.label, distanceKm: 0 };
      dayMap[day.date].distanceKm += Number(day.distanceKm || 0);
    });
  });

  Object.keys(dayMap).forEach(function (date) {
    const day = dayMap[date];
    if (day.distanceKm > totals.bestDayKm) {
      totals.bestDayKm = day.distanceKm;
      totals.bestDayLabel = day.label;
    }
  });

  totals.averagePaceSecondsPerKm = totals.totalDistanceKm ? Math.round(totals.totalDurationSeconds / totals.totalDistanceKm) : null;
  totals.averagePaceText = totals.averagePaceSecondsPerKm ? formatPace_(totals.averagePaceSecondsPerKm) : '';
  totals.totalDistanceKm = roundOrNull_(totals.totalDistanceKm, 2) || 0;
  totals.totalGoalKm = roundOrNull_(totals.totalGoalKm, 2) || 0;
  totals.goalPercent = totals.totalGoalKm ? Math.round((totals.totalDistanceKm / totals.totalGoalKm) * 1000) / 10 : 0;
  totals.totalDurationText = totals.totalDurationSeconds ? formatDuration_(totals.totalDurationSeconds) : '';
  totals.todayCount = (todayRunnerTotals || []).length;
  totals.weekLabel = weekStartYmd + ' ~ ' + weekEndYmd;

  if (totals.goalPercent >= 120) {
    totals.moodEmoji = '🎉';
    totals.moodTitle = '이번 주 분위기 폭발!';
    totals.moodMessage = '목표를 훌쩍 넘긴 에너지예요. 다들 멋져요.';
  } else if (totals.goalPercent >= 100) {
    totals.moodEmoji = '🌈';
    totals.moodTitle = '이번 주 목표 달성!';
    totals.moodMessage = '우리 챌린지가 예쁘게 완주 모드에 들어갔어요.';
  } else if (totals.activeMembers >= Math.max(1, Math.ceil((participants.length || 1) / 2))) {
    totals.moodEmoji = '🌿';
    totals.moodTitle = '꾸준히 움직이는 중';
    totals.moodMessage = '함께 달린 사람이 늘고 있어요. 지금 리듬 좋아요.';
  } else if (totals.totalRuns > 0) {
    totals.moodEmoji = '🫧';
    totals.moodTitle = '가볍게 시작했어요';
    totals.moodMessage = '한 번의 인증도 충분히 좋은 시작이에요.';
  } else {
    totals.moodEmoji = '🌱';
    totals.moodTitle = '첫 러닝을 기다리는 중';
    totals.moodMessage = '이번 주 첫 기록이 올라오면 분위기 카드가 살아나요.';
  }

  return totals;
}

function normalizeGroupMoodForClient_(groupMood, totalParticipants) {
  if (!groupMood) return null;
  return {
    weekLabel: groupMood.weekLabel || '',
    totalDistanceKm: groupMood.totalDistanceKm || 0,
    totalGoalKm: groupMood.totalGoalKm || 0,
    percent: groupMood.goalPercent || 0,
    totalRuns: groupMood.totalRuns || 0,
    totalDurationText: groupMood.totalDurationText || '',
    averagePaceText: groupMood.averagePaceText || '',
    averagePaceSecondsPerKm: groupMood.averagePaceSecondsPerKm || null,
    activeRunners: groupMood.activeMembers || 0,
    totalParticipants: totalParticipants || 0,
    bestDay: groupMood.bestDayLabel ? { label: groupMood.bestDayLabel, distanceKm: groupMood.bestDayKm || 0 } : null,
    moodIcon: groupMood.moodEmoji || '🌱',
    moodTitle: groupMood.moodTitle || '이번 주 러닝 분위기',
    summaryText: groupMood.moodMessage || ''
  };
}

function makePraiseBadges_(stats) {
  const badges = [];
  if (!stats || !stats.count) return badges;
  if (stats.isFirstRunEver) badges.push({ icon: '🌱', label: '첫 러닝' });
  if (stats.percent >= 100) badges.push({ icon: '🥇', label: '축하합니다' });
  if (stats.percent >= 100) badges.push({ icon: '🌈', label: '목표 달성' });
  if (stats.excessPercent > 0) badges.push({ icon: '✨', label: '초과 달성' });
  if (stats.activeDays >= 3) badges.push({ icon: '🐢', label: '꾸준러' });
  if (stats.distanceKm >= 10) badges.push({ icon: '🌸', label: '10km 꽃다발' });
  if (stats.averagePaceSecondsPerKm && stats.averagePaceSecondsPerKm <= 360) badges.push({ icon: '🚀', label: '스피드러' });
  if (stats.caloriesKcal >= 500) badges.push({ icon: '🔥', label: '칼로리 활활' });
  return badges.slice(0, 5);
}

function emptyMemberLastWeekStats_(p, weekStart) {
  const days = [];
  const labels = ['월', '화', '수', '목', '금', '토', '일'];
  for (let i = 0; i < 7; i++) {
    const d = addDays_(weekStart, i);
    days.push({
      date: formatYmd_(d),
      label: labels[i],
      count: 0,
      distanceKm: 0,
      durationSeconds: 0,
      durationText: ''
    });
  }

  return {
    participantId: p.id,
    name: p.displayName || p.name,
    emoji: p.emoji || CUTE_EMOJIS[positiveHash_(p.id) % CUTE_EMOJIS.length],
    weekStart: formatYmd_(weekStart),
    weekEnd: formatYmd_(addDays_(weekStart, 6)),
    weekLabel: formatYmd_(weekStart) + ' ~ ' + formatYmd_(addDays_(weekStart, 6)),
    count: 0,
    activeDays: 0,
    distanceKm: 0,
    durationSeconds: 0,
    durationText: '',
    days: days
  };
}

function addToMemberLastWeekStats_(stats, record) {
  if (!stats || !record) return;
  const day = stats.days.filter(function (d) { return d.date === record.activityDate; })[0];
  if (!day) return;

  const distance = Number(record.distanceKm || 0);
  const seconds = Number(record.durationSeconds || 0);
  stats.count += 1;
  stats.distanceKm += distance;
  stats.durationSeconds += seconds;

  day.count += 1;
  day.distanceKm += distance;
  day.durationSeconds += seconds;
}

function finalizeMemberLastWeekStats_(stats) {
  if (!stats) return;
  stats.distanceKm = roundOrNull_(stats.distanceKm, 2) || 0;
  stats.durationText = stats.durationSeconds ? formatDuration_(stats.durationSeconds) : '';
  stats.days.forEach(function (day) {
    day.distanceKm = roundOrNull_(day.distanceKm, 2) || 0;
    day.durationText = day.durationSeconds ? formatDuration_(day.durationSeconds) : '';
  });
  stats.activeDays = stats.days.filter(function (day) { return day.count > 0; }).length;
}

function emptyMemberAllTimeStats_(p, weeklyGoalKm) {
  return {
    participantId: p.id,
    name: p.displayName || p.name,
    emoji: p.emoji || CUTE_EMOJIS[positiveHash_(p.id) % CUTE_EMOJIS.length],
    goalKm: weeklyGoalKm || getParticipantGoalKm_(p, Number(getProp_('WEEKLY_GOAL_KM', '10')) || 10),
    count: 0,
    activeDays: 0,
    distanceKm: 0,
    durationSeconds: 0,
    durationText: '',
    averagePaceSecondsPerKm: null,
    averagePaceText: '',
    caloriesKcal: 0,
    firstActivityDate: '',
    lastActivityDate: '',
    lastUploadedAt: '',
    longestRunKm: 0,
    longestRunDate: '',
    dayMap: {}
  };
}

function addToMemberAllTimeStats_(stats, record) {
  if (!stats || !record) return;
  const distance = Number(record.distanceKm || 0);
  const seconds = Number(record.durationSeconds || 0);
  const calories = Number(record.caloriesKcal || 0);
  const activityDate = String(record.activityDate || '');
  const uploadedAt = String(record.uploadedAt || '');

  stats.count += 1;
  stats.distanceKm += distance;
  stats.durationSeconds += seconds;
  stats.caloriesKcal += calories;
  if (activityDate) {
    stats.dayMap[activityDate] = true;
    if (!stats.firstActivityDate || activityDate < stats.firstActivityDate) stats.firstActivityDate = activityDate;
    if (!stats.lastActivityDate || activityDate > stats.lastActivityDate) stats.lastActivityDate = activityDate;
  }
  if (!stats.lastUploadedAt || uploadedAt > String(stats.lastUploadedAt || '')) stats.lastUploadedAt = uploadedAt;
  if (distance > Number(stats.longestRunKm || 0)) {
    stats.longestRunKm = distance;
    stats.longestRunDate = activityDate;
  }
}

function finalizeMemberAllTimeStats_(stats) {
  if (!stats) return;
  stats.distanceKm = roundOrNull_(stats.distanceKm, 2) || 0;
  stats.durationText = stats.durationSeconds ? formatDuration_(stats.durationSeconds) : '';
  stats.averagePaceSecondsPerKm = stats.distanceKm ? Math.round(stats.durationSeconds / stats.distanceKm) : null;
  stats.averagePaceText = stats.averagePaceSecondsPerKm ? formatPace_(stats.averagePaceSecondsPerKm) : '';
  stats.caloriesKcal = Math.round(stats.caloriesKcal || 0);
  stats.longestRunKm = roundOrNull_(stats.longestRunKm, 2) || 0;
  stats.activeDays = Object.keys(stats.dayMap || {}).length;
  delete stats.dayMap;
}

function emptyMemberWeeklyStats_(p, weekStart, weeklyGoalKm) {
  const days = [];
  const labels = ['월', '화', '수', '목', '금', '토', '일'];
  for (let i = 0; i < 7; i++) {
    const d = addDays_(weekStart, i);
    days.push({
      date: formatYmd_(d),
      label: labels[i],
      count: 0,
      distanceKm: 0,
      durationSeconds: 0,
      durationText: '',
      averagePaceSecondsPerKm: null,
      averagePaceText: '',
      caloriesKcal: 0,
      heartRateSum: 0,
      heartRateCount: 0,
      averageHeartRateBpm: null,
      cadenceSum: 0,
      cadenceCount: 0,
      averageCadenceSpm: null
    });
  }

  return {
    participantId: p.id,
    name: p.displayName || p.name,
    emoji: p.emoji || CUTE_EMOJIS[positiveHash_(p.id) % CUTE_EMOJIS.length],
    goalKm: weeklyGoalKm,
    weekStart: formatYmd_(weekStart),
    weekEnd: formatYmd_(addDays_(weekStart, 6)),
    weekLabel: formatYmd_(weekStart) + ' ~ ' + formatYmd_(addDays_(weekStart, 6)),
    count: 0,
    activeDays: 0,
    distanceKm: 0,
    durationSeconds: 0,
    durationText: '',
    averagePaceSecondsPerKm: null,
    averagePaceText: '',
    caloriesKcal: 0,
    heartRateSum: 0,
    heartRateCount: 0,
    averageHeartRateBpm: null,
    cadenceSum: 0,
    cadenceCount: 0,
    averageCadenceSpm: null,
    maxDailyKm: 0,
    days: days,
    records: []
  };
}

function addToMemberWeeklyStats_(stats, record) {
  if (!stats || !record) return;
  const day = stats.days.filter(function (d) { return d.date === record.activityDate; })[0];
  if (!day) return;

  const distance = Number(record.distanceKm || 0);
  const seconds = Number(record.durationSeconds || 0);
  const calories = Number(record.caloriesKcal || 0);
  const heartRate = intOrNull_(record.averageHeartRateBpm);
  const cadence = intOrNull_(record.cadenceSpm);

  stats.count += 1;
  stats.distanceKm += distance;
  stats.durationSeconds += seconds;
  stats.caloriesKcal += calories;
  if (heartRate) {
    stats.heartRateSum += heartRate;
    stats.heartRateCount += 1;
  }
  if (cadence) {
    stats.cadenceSum += cadence;
    stats.cadenceCount += 1;
  }

  day.count += 1;
  day.distanceKm += distance;
  day.durationSeconds += seconds;
  day.caloriesKcal += calories;
  if (heartRate) {
    day.heartRateSum += heartRate;
    day.heartRateCount += 1;
  }
  if (cadence) {
    day.cadenceSum += cadence;
    day.cadenceCount += 1;
  }

  stats.records.push({
    activityDate: record.activityDate,
    uploadedAt: record.uploadedAt,
    distanceKm: roundOrNull_(distance, 2) || 0,
    durationSeconds: seconds,
    durationText: record.durationText || (seconds ? formatDuration_(seconds) : ''),
    averagePaceSecondsPerKm: record.averagePaceSecondsPerKm || null,
    averagePaceText: record.averagePaceText || '',
    averageHeartRateBpm: heartRate,
    caloriesKcal: calories || null,
    cadenceSpm: cadence,
    appName: record.appName || '',
    note: record.note || '',
    inputMode: record.inputMode || '',
    hasProofPhoto: Boolean(record.hasProofPhoto),
    proofPhotoFileId: record.proofPhotoFileId || '',
    proofPhotoUrl: record.proofPhotoUrl || ''
  });
}

function finalizeMemberWeeklyStats_(stats) {
  stats.distanceKm = roundOrNull_(stats.distanceKm, 2) || 0;
  stats.durationText = stats.durationSeconds ? formatDuration_(stats.durationSeconds) : '';
  stats.averagePaceSecondsPerKm = stats.distanceKm ? Math.round(stats.durationSeconds / stats.distanceKm) : null;
  stats.averagePaceText = stats.averagePaceSecondsPerKm ? formatPace_(stats.averagePaceSecondsPerKm) : '';
  stats.caloriesKcal = Math.round(stats.caloriesKcal || 0);
  stats.averageHeartRateBpm = stats.heartRateCount ? Math.round(stats.heartRateSum / stats.heartRateCount) : null;
  stats.averageCadenceSpm = stats.cadenceCount ? Math.round(stats.cadenceSum / stats.cadenceCount) : null;
  stats.activeDays = stats.days.filter(function (day) { return day.count > 0; }).length;

  stats.days.forEach(function (day) {
    day.distanceKm = roundOrNull_(day.distanceKm, 2) || 0;
    day.durationText = day.durationSeconds ? formatDuration_(day.durationSeconds) : '';
    day.averagePaceSecondsPerKm = day.distanceKm ? Math.round(day.durationSeconds / day.distanceKm) : null;
    day.averagePaceText = day.averagePaceSecondsPerKm ? formatPace_(day.averagePaceSecondsPerKm) : '';
    day.caloriesKcal = Math.round(day.caloriesKcal || 0);
    day.averageHeartRateBpm = day.heartRateCount ? Math.round(day.heartRateSum / day.heartRateCount) : null;
    day.averageCadenceSpm = day.cadenceCount ? Math.round(day.cadenceSum / day.cadenceCount) : null;
    delete day.heartRateSum;
    delete day.heartRateCount;
    delete day.cadenceSum;
    delete day.cadenceCount;
    stats.maxDailyKm = Math.max(stats.maxDailyKm, day.distanceKm);
  });

  stats.records.sort(function (a, b) {
    const dateCompare = String(b.activityDate || '').localeCompare(String(a.activityDate || ''));
    if (dateCompare) return dateCompare;
    return String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || ''));
  });

  const percent = stats.goalKm ? Math.round((stats.distanceKm / stats.goalKm) * 1000) / 10 : 0;
  stats.percent = percent;
  stats.excessPercent = percent > 100 ? Math.round((percent - 100) * 10) / 10 : 0;
  stats.remainingKm = roundOrNull_(Math.max(0, stats.goalKm - stats.distanceKm), 2) || 0;
  stats.badges = makePraiseBadges_(stats);

  delete stats.heartRateSum;
  delete stats.heartRateCount;
  delete stats.cadenceSum;
  delete stats.cadenceCount;
}

function emptyTotalForParticipant_(p) {
  return {
    participantId: p.id,
    name: p.displayName || p.name,
    emoji: p.emoji || CUTE_EMOJIS[positiveHash_(p.id) % CUTE_EMOJIS.length],
    goalKm: getParticipantGoalKm_(p, Number(getProp_('WEEKLY_GOAL_KM', '10')) || 10),
    count: 0,
    distanceKm: 0,
    durationSeconds: 0,
    durationText: '',
    averagePaceSecondsPerKm: null,
    averagePaceText: '',
    activityDate: '',
    appName: '',
    note: '',
    inputMode: '',
    lastUploadedAt: '',
    hasProofPhoto: false,
    proofPhotoFileName: '',
    proofPhotoUrl: '',
    proofPhotoFileId: '',
    proofPhotoUploadedAt: ''
  };
}

function addToTotal_(total, record) {
  total.count += 1;
  total.distanceKm += Number(record.distanceKm || 0);
  total.durationSeconds += Number(record.durationSeconds || 0);
  const currentUploadedAt = String(record.uploadedAt || '');
  if (!total.lastUploadedAt || currentUploadedAt >= String(total.lastUploadedAt || '')) {
    total.lastUploadedAt = currentUploadedAt;
    total.activityDate = record.activityDate || total.activityDate || '';
    total.appName = record.appName || total.appName || '';
    total.note = record.note || total.note || '';
    total.inputMode = record.inputMode || total.inputMode || '';
  }
  if (record.hasProofPhoto && record.proofPhotoPublic !== false && record.proofPhotoFileId) {
    if (!total.proofPhotoUploadedAt || currentUploadedAt >= String(total.proofPhotoUploadedAt || '')) {
      total.hasProofPhoto = true;
      total.proofPhotoFileName = record.proofPhotoFileName || '';
      total.proofPhotoUrl = record.proofPhotoUrl || '';
      total.proofPhotoFileId = record.proofPhotoFileId || '';
      total.proofPhotoUploadedAt = currentUploadedAt;
    }
  }
}

function finalizeTotal_(total) {
  total.distanceKm = roundOrNull_(total.distanceKm, 2) || 0;
  total.durationText = total.durationSeconds ? formatDuration_(total.durationSeconds) : '';
  total.averagePaceSecondsPerKm = total.distanceKm ? Math.round(total.durationSeconds / total.distanceKm) : null;
  total.averagePaceText = total.averagePaceSecondsPerKm ? formatPace_(total.averagePaceSecondsPerKm) : '';
}

function makeLeaderboard_(totalsById) {
  return Object.keys(totalsById || {})
    .map(function (id) {
      const item = Object.assign({}, totalsById[id]);
      item.distanceKm = roundOrNull_(Number(item.distanceKm || 0), 2) || 0;
      item.count = Number(item.count || 0);
      return item;
    })
    .filter(function (item) { return item.count > 0 || item.distanceKm > 0; })
    .sort(function (a, b) {
      const distanceDiff = Number(b.distanceKm || 0) - Number(a.distanceKm || 0);
      if (Math.abs(distanceDiff) > 0.0001) return distanceDiff;
      return Number(b.count || 0) - Number(a.count || 0);
    })
    .slice(0, 5)
    .map(function (item, index) {
      item.rank = index + 1;
      return item;
    });
}



/***** Admin.gs *****/
function adminGetData(adminCode) {
  try {
    verifyAdminCode_(adminCode);
    ensureSchemaReady_();
    const participants = getAllParticipantsForAdmin_();
    const announcement = getActiveAnnouncement_();
    return {
      ok: true,
      participants: participants,
      records: getRecordsForAdmin_(null, true, 80),
      deletedRecords: getDeletedRecordsForAdmin_(),
      announcement: announcement,
      lightningAttendance: getLightningAttendanceForAdmin_(announcement && announcement.eventId, participants),
      memberStatuses: getMemberStatusMap_(),
      recordRequests: getRecordRequestsForAdmin_(60),
      auditLogs: getAdminAuditLogs_(60),
      dashboard: getDashboardSummaryDataCached_(null, false)
    };
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  }
}

function adminUpdateAnnouncement(adminCode, payload) {
  try {
    verifyAdminCode_(adminCode);
    const result = saveAnnouncement(payload);
    if (!result || !result.ok) return result;
    appendAdminAuditLog_('번개 저장', '번개모임', result.announcement && result.announcement.eventId || '', '번개 모임 정보를 저장', null, result.announcement || payload || {});
    return Object.assign(adminGetData(adminCode), {
      message: '번개 모임 정보를 저장했어요.'
    });
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  }
}

function adminClearAnnouncement(adminCode) {
  const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      verifyAdminCode_(adminCode);
      const before = getActiveAnnouncement_();
      clearAnnouncementProps_(PropertiesService.getScriptProperties());
      invalidateAppCache_();
      appendAdminAuditLog_('번개 비우기', '번개모임', before && before.eventId || '', '번개 모임을 비움', before || {}, {});
      return Object.assign(adminGetData(adminCode), {
        message: '번개 모임을 비웠어요.'
    });
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  } finally {
    lock.releaseLock();
  }
}

function adminSetLightningAttendance(adminCode, participantId, status) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    verifyAdminCode_(adminCode);
    ensureSchemaReady_();
    const id = String(participantId || '').trim();
    if (!id) throw new Error('참가자를 선택해주세요.');
    const participant = findParticipantForAdmin_(id);
    if (!participant) throw new Error('참가자를 찾지 못했습니다.');
    const announcement = getActiveAnnouncement_();
    if (!announcement || !announcement.eventId) throw new Error('현재 등록된 번개 모임이 없어요.');

    const rawStatus = String(status || '').trim();
    const shouldClear = !rawStatus || rawStatus === '삭제' || rawStatus.toLowerCase() === 'clear';
    const cleanStatus = shouldClear ? '' : normalizeLightningAttendanceStatus_(rawStatus);
    if (!shouldClear && !cleanStatus) throw new Error('참석 / 미정 / 불참 중 하나를 선택해주세요.');

    const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_LIGHTNING_RSVP);
    sheet.appendRow([
      makeId_('attend'),
      nowString_(),
      announcement.eventId,
      participant.id,
      participant.displayName || participant.name,
      cleanStatus,
      shouldClear ? '관리자 참석 체크 삭제' : '관리자 참석 체크 수정',
      'ACTIVE'
    ]);
    maybeFormatSheetOnWrite_(sheet, APP.SHEET_LIGHTNING_RSVP);
    invalidateAppCache_();
    appendAdminAuditLog_('번개 참석 수정', '번개참석', participant.id, (participant.displayName || participant.name) + ' · ' + (cleanStatus || '체크 없음'), null, {
      eventId: announcement.eventId,
      participantId: participant.id,
      status: cleanStatus
    });
    return Object.assign(adminGetData(adminCode), {
      message: shouldClear ? '번개 참석 체크를 삭제했어요.' : '번개 참석 체크를 저장했어요.'
    });
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  } finally {
    lock.releaseLock();
  }
}

function adminUpdateParticipant(adminCode, participantId, patch) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    verifyAdminCode_(adminCode);
    const id = String(participantId || '').trim();
    if (!id) throw new Error('참가자ID가 없습니다.');
    const data = patch || {};
    const displayName = cleanNickname_(data.name || data.displayName || '');
    const emoji = String(data.emoji || '').trim().slice(0, 8);
    const goal = data.goalKm === '' || data.goalKm == null ? null : roundOrNull_(numberOrNull_(data.goalKm), 2);
    const order = data.order === '' || data.order == null ? null : intOrNull_(data.order);
    if (displayName && (displayName.length < 2 || displayName.length > 16)) throw new Error('표시 이름은 2~16글자로 입력해주세요.');
    if (goal !== null && (!goal || goal <= 0 || goal > 300)) throw new Error('목표 거리는 0보다 크고 300km 이하로 입력해주세요.');

    ensureSchemaReady_();
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(APP.SHEET_PARTICIPANTS);
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(function (h) { return String(h || '').trim(); });
    const col = function (name) { return headers.indexOf(name) + 1; };
    const idCol = col('참가자ID');
    if (!idCol) throw new Error('참가자 시트의 참가자ID 컬럼을 확인해주세요.');
    let targetRow = 0;
    let oldGoal = '';
    let oldName = '';
    const nameCol = col('표시이름') || col('이름');
    for (let r = 2; r <= values.length; r++) {
      if (String(values[r - 1][idCol - 1] || '').trim() === id) {
        targetRow = r;
        oldGoal = col('목표거리(km)') ? values[r - 1][col('목표거리(km)') - 1] : '';
        oldName = nameCol ? String(values[r - 1][nameCol - 1] || '') : '';
        break;
      }
    }
    if (!targetRow) throw new Error('참가자를 찾지 못했습니다.');

    const set = function (name, value) {
      const c = col(name);
      if (c) sheet.getRange(targetRow, c).setValue(value);
    };
    if (displayName) {
      set('이름', displayName);
      set('표시이름', displayName);
      updateParticipantNameAcrossSheets_(id, displayName);
    }
    if (emoji) set('이모지', emoji);
    if (goal !== null) {
      set('목표거리(km)', goal);
      appendGoalHistory_(id, displayName || oldName, oldGoal, goal, 'admin', '관리자 참가자 목표 변경');
    }
    if (order !== null) set('표시순서', order);
    if (data.active !== undefined && data.active !== null && String(data.active) !== '') set('활성여부', toBoolean_(data.active));

    invalidateAppCache_();
    const participants = getParticipants_();
    const dashboard = rebuildDashboardSummary_(participants);
    cacheInitialData_(participants, dashboard);
    appendAdminAuditLog_('멤버 수정', '참가자', id, (displayName || oldName || id) + ' 멤버 정보 수정', {
      name: oldName,
      goalKm: oldGoal
    }, data);
    return Object.assign(adminGetData(adminCode), {
      message: '참가자 정보를 저장했어요.'
    });
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  } finally {
    lock.releaseLock();
  }
}

function adminDeleteParticipant(adminCode, participantId) {
  return adminSetParticipantActive(adminCode, participantId, false);
}

function adminSetParticipantActive(adminCode, participantId, active) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    verifyAdminCode_(adminCode);
    const id = String(participantId || '').trim();
    if (!id) throw new Error('참가자ID가 없습니다.');
    ensureSchemaReady_();
    const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_PARTICIPANTS);
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(function (h) { return String(h || '').trim(); });
    const idCol = headers.indexOf('참가자ID') + 1;
    const activeCol = headers.indexOf('활성여부') + 1;
    if (!idCol || !activeCol) throw new Error('참가자 시트의 참가자ID/활성여부 컬럼을 확인해주세요.');

    for (let r = 2; r <= values.length; r++) {
      if (String(values[r - 1][idCol - 1] || '').trim() !== id) continue;
      const before = {
        active: values[r - 1][activeCol - 1]
      };
      sheet.getRange(r, activeCol).setValue(Boolean(active));
      invalidateAppCache_();
      refreshDashboardSheet();
      appendAdminAuditLog_(Boolean(active) ? '멤버 활성화' : '멤버 비활성화', '참가자', id, '멤버 활성 상태 변경', before, {
        active: Boolean(active)
      });
      return adminGetData(adminCode);
    }
    throw new Error('참가자를 찾지 못했습니다.');
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  } finally {
    lock.releaseLock();
  }
}

function adminSetAllGoals(adminCode, goalKm) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    verifyAdminCode_(adminCode);
    const goal = roundOrNull_(numberOrNull_(goalKm), 2);
    if (!goal || goal <= 0) throw new Error('목표 거리는 0보다 큰 숫자로 입력해주세요.');
    if (goal > 300) throw new Error('주간 목표는 300km 이하로 입력해주세요.');

    ensureSchemaReady_();
    PropertiesService.getScriptProperties().setProperty('WEEKLY_GOAL_KM', String(goal));
    const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_PARTICIPANTS);
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) throw new Error('등록된 닉네임이 없습니다.');

    const headers = values[0].map(function (h) { return String(h || '').trim(); });
    const idCol = headers.indexOf('참가자ID') + 1;
    const nameCol = headers.indexOf('표시이름') + 1 || headers.indexOf('이름') + 1;
    const goalCol = headers.indexOf('목표거리(km)') + 1;
    const activeCol = headers.indexOf('활성여부') + 1;
    if (!idCol || !goalCol) throw new Error('참가자 시트의 참가자ID/목표거리(km) 컬럼을 확인해주세요.');

    let changed = 0;
    for (let r = 2; r <= values.length; r++) {
      const active = activeCol ? toBoolean_(values[r - 1][activeCol - 1]) : true;
      if (!active) continue;
      const id = String(values[r - 1][idCol - 1] || '').trim();
      const name = nameCol ? String(values[r - 1][nameCol - 1] || '') : '';
      const oldGoal = values[r - 1][goalCol - 1];
      if (!id) continue;
      sheet.getRange(r, goalCol).setValue(goal);
      appendGoalHistory_(id, name, oldGoal, goal, 'admin', '관리자 일괄 목표 변경');
      changed += 1;
    }

    invalidateAppCache_();
    refreshDashboardSheet();
    appendAdminAuditLog_('목표 일괄 변경', '참가자', 'ALL', '활성 참가자 ' + changed + '명 목표를 ' + goal + 'km로 변경', null, {
      goalKm: goal,
      changed: changed
    });
    const data = adminGetData(adminCode);
    data.changed = changed;
    data.message = '활성 참가자 ' + changed + '명의 주간 목표를 ' + goal + 'km로 바꿨어요.';
    return data;
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  } finally {
    lock.releaseLock();
  }
}

function adminRestoreRecord(adminCode, recordId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    verifyAdminCode_(adminCode);
    const targetId = String(recordId || '').trim();
    if (!targetId) throw new Error('복구할 기록ID가 없습니다.');
    ensureSchemaReady_();
    const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_RECORDS);
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(function (h) { return String(h || '').trim(); });
    const idCol = headers.indexOf('기록ID') + 1;
    const statusCol = headers.indexOf('상태') + 1;
    const memoCol = headers.indexOf('메모') + 1;
    if (!idCol || !statusCol) throw new Error('러닝기록 시트의 기록ID/상태 컬럼을 확인해주세요.');

    for (let r = 2; r <= values.length; r++) {
      if (String(values[r - 1][idCol - 1] || '').trim() !== targetId) continue;
      const before = rowValuesToObject_(headers, values[r - 1]);
      sheet.getRange(r, statusCol).setValue('OK_관리자복구');
      if (memoCol) {
        const oldMemo = String(values[r - 1][memoCol - 1] || '');
        sheet.getRange(r, memoCol).setValue((oldMemo ? oldMemo + ' / ' : '') + '관리자 복구 ' + nowString_());
      }
      invalidateAppCache_();
      refreshDashboardSheet();
      appendAdminAuditLog_('기록 복구', '러닝기록', targetId, '삭제 기록 복구', before, {
        status: 'OK_관리자복구'
      });
      return adminGetData(adminCode);
    }
    throw new Error('복구할 기록을 찾지 못했습니다.');
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  } finally {
    lock.releaseLock();
  }
}

function adminUpdateRecord(adminCode, recordId, review) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    verifyAdminCode_(adminCode);
    const targetId = String(recordId || '').trim();
    if (!targetId) throw new Error('수정할 기록ID가 없습니다.');
    const normalized = normalizeReviewedData_(review || {}, '관리자수정');
    const newParticipantId = String((review && review.participantId) || '').trim();
    const newParticipant = newParticipantId ? findParticipantForAdmin_(newParticipantId) : null;
    if (newParticipantId && !newParticipant) throw new Error('변경할 참가자를 찾지 못했습니다.');

    ensureSchemaReady_();
    const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_RECORDS);
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(function (h) { return String(h || '').trim(); });
    const col = function (name) { return headers.indexOf(name) + 1; };
    const idCol = col('기록ID');
    const statusCol = col('상태');
    if (!idCol || !statusCol) throw new Error('러닝기록 시트의 기록ID/상태 컬럼을 확인해주세요.');

    for (let r = 2; r <= values.length; r++) {
      if (String(values[r - 1][idCol - 1] || '').trim() !== targetId) continue;
      const before = rowValuesToObject_(headers, values[r - 1]);
      const set = function (name, value) {
        const c = col(name);
        if (c) sheet.getRange(r, c).setValue(value);
      };
      if (newParticipant) {
        set('참가자ID', newParticipant.id);
        set('이름', newParticipant.displayName || newParticipant.name);
      }
      set('러닝일자', normalized.runningDate || '');
      set('거리(km)', normalized.distanceKm || '');
      set('시간(초)', normalized.durationSeconds || '');
      set('시간표시', normalized.durationText || '');
      set('평균페이스(초/km)', normalized.averagePaceSecondsPerKm || '');
      set('페이스표시', normalized.averagePaceText || '');
      set('칼로리(kcal)', normalized.caloriesKcal || '');
      set('평균심박수(bpm)', normalized.averageHeartRateBpm || '');
      set('고도상승(m)', normalized.elevationGainM || '');
      set('케이던스(spm)', normalized.cadenceSpm || '');
      set('앱명', normalized.appName || '');
      set('상태', 'OK_관리자수정');
      set('신뢰도', normalized.confidence || 1);
      set('경고', uniqueStrings_((normalized.warnings || []).concat(['관리자가 직접 수정'])).join(' / '));
      set('입력방식', '관리자 수정');
      const memoCol = col('메모');
      if (memoCol) {
        const oldMemo = String(values[r - 1][memoCol - 1] || '');
        sheet.getRange(r, memoCol).setValue((oldMemo ? oldMemo + ' / ' : '') + '관리자 수정 ' + nowString_());
      }
      invalidateAppCache_();
      refreshDashboardSheet();
      appendAdminAuditLog_('기록 수정', '러닝기록', targetId, '러닝 기록 세부값 수정', before, normalized);
      return Object.assign(adminGetData(adminCode), {
        message: '기록을 수정했어요.'
      });
    }
    throw new Error('수정할 기록을 찾지 못했습니다.');
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  } finally {
    lock.releaseLock();
  }
}

function adminDeleteRecord(adminCode, recordId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    verifyAdminCode_(adminCode);
    const targetId = String(recordId || '').trim();
    if (!targetId) throw new Error('삭제할 기록ID가 없습니다.');
    ensureSchemaReady_();
    const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_RECORDS);
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(function (h) { return String(h || '').trim(); });
    const idCol = headers.indexOf('기록ID') + 1;
    const statusCol = headers.indexOf('상태') + 1;
    const memoCol = headers.indexOf('메모') + 1;
    if (!idCol || !statusCol) throw new Error('러닝기록 시트의 기록ID/상태 컬럼을 확인해주세요.');
    for (let r = 2; r <= values.length; r++) {
      if (String(values[r - 1][idCol - 1] || '').trim() !== targetId) continue;
      const before = rowValuesToObject_(headers, values[r - 1]);
      sheet.getRange(r, statusCol).setValue('삭제_관리자');
      if (memoCol) {
        const oldMemo = String(values[r - 1][memoCol - 1] || '');
        sheet.getRange(r, memoCol).setValue((oldMemo ? oldMemo + ' / ' : '') + '관리자 삭제 ' + nowString_());
      }
      invalidateAppCache_();
      refreshDashboardSheet();
      appendAdminAuditLog_('기록 삭제', '러닝기록', targetId, '러닝 기록 삭제 처리', before, {
        status: '삭제_관리자'
      });
      return Object.assign(adminGetData(adminCode), {
        message: '기록을 삭제했어요.'
      });
    }
    throw new Error('삭제할 기록을 찾지 못했습니다.');
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  } finally {
    lock.releaseLock();
  }
}

function adminRefreshDashboard(adminCode) {
  try {
    verifyAdminCode_(adminCode);
    invalidateAppCache_();
    refreshDashboardSheet();
    return adminGetData(adminCode);
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  }
}

function adminExportBackup(adminCode) {
  try {
    verifyAdminCode_(adminCode);
    ensureSchemaReady_();
    const ss = getSpreadsheet_();
    const names = [
      APP.SHEET_PARTICIPANTS,
      APP.SHEET_RECORDS,
      APP.SHEET_LIGHTNING_RSVP,
      APP.SHEET_MEMBER_STATUS,
      APP.SHEET_GOAL_HISTORY,
      APP.SHEET_REACTIONS,
      APP.SHEET_RECORD_REQUESTS,
      APP.SHEET_ADMIN_AUDIT
    ];
    const sections = names.map(function (name) {
      const sheet = ss.getSheetByName(name);
      if (!sheet) return '### ' + name + '\n';
      const values = sheet.getDataRange().getValues();
      const csv = values.map(function (row) {
        return row.map(csvCell_).join(',');
      }).join('\n');
      return '### ' + name + '\n' + csv;
    });
    return {
      ok: true,
      fileName: 'running-challenge-backup-' + formatYmd_(new Date()) + '.csv',
      csv: sections.join('\n\n'),
      message: '백업 CSV를 만들었어요.'
    };
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  }
}

function csvCell_(value) {
  const text = value instanceof Date ? Utilities.formatDate(value, getTimezone_(), 'yyyy-MM-dd HH:mm:ss') : String(value == null ? '' : value);
  return '"' + text.replace(/"/g, '""') + '"';
}

function adminSetRecordRequestStatus(adminCode, requestId, status, memo) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    verifyAdminCode_(adminCode);
    ensureSchemaReady_();
    const id = String(requestId || '').trim();
    if (!id) throw new Error('요청ID가 없습니다.');
    const cleanStatus = normalizeRecordRequestStatus_(status);
    const cleanMemo = String(memo || '').trim().slice(0, 200);
    const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_RECORD_REQUESTS);
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(function (h) { return String(h || '').trim(); });
    const idCol = headers.indexOf('요청ID') + 1;
    const statusCol = headers.indexOf('상태') + 1;
    const memoCol = headers.indexOf('처리메모') + 1;
    const handledAtCol = headers.indexOf('처리일시') + 1;
    if (!idCol || !statusCol) throw new Error('수정요청 시트 헤더를 확인해주세요.');

    for (let r = 2; r <= values.length; r++) {
      if (String(values[r - 1][idCol - 1] || '').trim() !== id) continue;
      const before = rowValuesToObject_(headers, values[r - 1]);
      sheet.getRange(r, statusCol).setValue(cleanStatus);
      if (memoCol) sheet.getRange(r, memoCol).setValue(cleanMemo);
      if (handledAtCol) sheet.getRange(r, handledAtCol).setValue(nowString_());
      appendAdminAuditLog_('수정 요청 처리', '수정요청', id, '수정 요청 상태를 ' + cleanStatus + '(으)로 변경', before, {
        status: cleanStatus,
        memo: cleanMemo
      });
      const data = adminGetData(adminCode);
      data.message = '수정 요청 상태를 저장했어요.';
      return data;
    }
    throw new Error('수정 요청을 찾지 못했습니다.');
  } catch (err) {
    return { ok: false, error: errorMessage_(err) };
  } finally {
    lock.releaseLock();
  }
}

function normalizeRecordRequestStatus_(status) {
  const text = String(status || '').trim();
  if (['접수', '확인중', '완료', '보류'].indexOf(text) >= 0) return text;
  return '접수';
}

function getRecordRequestsForAdmin_(limit) {
  const max = Math.max(1, Math.min(Number(limit || 60), 200));
  const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_RECORD_REQUESTS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return tableRows_(sheet).slice().reverse().slice(0, max).map(function (row) {
    return {
      requestId: String(row['요청ID'] || '').trim(),
      createdAt: String(row['요청일시'] || ''),
      recordId: String(row['기록ID'] || '').trim(),
      participantId: String(row['참가자ID'] || '').trim(),
      name: String(row['이름'] || '').trim(),
      message: String(row['요청내용'] || '').trim(),
      status: String(row['상태'] || '접수').trim(),
      memo: String(row['처리메모'] || '').trim(),
      handledAt: String(row['처리일시'] || '')
    };
  });
}

function appendAdminAuditLog_(action, targetType, targetId, summary, beforeValue, afterValue) {
  try {
    ensureSchemaReady_();
    const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_ADMIN_AUDIT);
    sheet.appendRow([
      makeId_('audit'),
      nowString_(),
      String(action || '').slice(0, 80),
      String(targetType || '').slice(0, 80),
      String(targetId || '').slice(0, 120),
      String(summary || '').slice(0, 300),
      safeJsonForAudit_(beforeValue),
      safeJsonForAudit_(afterValue)
    ]);
    maybeFormatSheetOnWrite_(sheet, APP.SHEET_ADMIN_AUDIT);
  } catch (err) {
  }
}

function getAdminAuditLogs_(limit) {
  const max = Math.max(1, Math.min(Number(limit || 60), 200));
  const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_ADMIN_AUDIT);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return tableRows_(sheet).slice().reverse().slice(0, max).map(function (row) {
    return {
      logId: String(row['로그ID'] || '').trim(),
      at: String(row['일시'] || ''),
      action: String(row['작업'] || ''),
      targetType: String(row['대상구분'] || ''),
      targetId: String(row['대상ID'] || ''),
      summary: String(row['요약'] || '')
    };
  });
}

function rowValuesToObject_(headers, values) {
  const out = {};
  (headers || []).forEach(function (header, index) {
    if (!header) return;
    const value = values[index];
    out[header] = value instanceof Date ? Utilities.formatDate(value, getTimezone_(), 'yyyy-MM-dd HH:mm:ss') : value;
  });
  return out;
}

function safeJsonForAudit_(value) {
  if (value == null || value === '') return '';
  try {
    return JSON.stringify(value).slice(0, 4500);
  } catch (err) {
    return String(value).slice(0, 4500);
  }
}

function getAllParticipantsForAdmin_() {
  const rows = tableRows_(getSpreadsheet_().getSheetByName(APP.SHEET_PARTICIPANTS));
  return rows.map(function (row) {
    return {
      id: String(row['참가자ID'] || '').trim(),
      name: String(row['표시이름'] || row['이름'] || '').trim(),
      emoji: stringOrNull_(row['이모지']),
      active: toBoolean_(row['활성여부']),
      goalKm: numberOrNull_(row['목표거리(km)']),
      order: intOrNull_(row['표시순서']),
      createdAt: String(row['생성일시'] || '')
    };
  }).filter(function (p) { return p.id; });
}

function findParticipantForAdmin_(participantId) {
  const target = String(participantId || '').trim();
  if (!target) return null;
  const participants = getAllParticipantsForAdmin_();
  for (let i = 0; i < participants.length; i++) {
    if (participants[i].id === target) {
      return {
        id: participants[i].id,
        name: participants[i].name,
        displayName: participants[i].name,
        emoji: participants[i].emoji,
        active: participants[i].active,
        targetDistanceKm: participants[i].goalKm
      };
    }
  }
  return null;
}

function updateParticipantNameAcrossSheets_(participantId, displayName) {
  const id = String(participantId || '').trim();
  const name = String(displayName || '').trim();
  if (!id || !name) return;
  updateNameColumnForParticipant_(APP.SHEET_RECORDS, id, name);
  updateNameColumnForParticipant_(APP.SHEET_GOAL_HISTORY, id, name);
  updateNameColumnForParticipant_(APP.SHEET_LIGHTNING_RSVP, id, name);
  updateNameColumnForParticipant_(APP.SHEET_MEMBER_STATUS, id, name);
  updateNameColumnForParticipant_(APP.SHEET_DASHBOARD, id, name);
}

function updateNameColumnForParticipant_(sheetName, participantId, displayName) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return;
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (h) { return String(h || '').trim(); });
  const idCol = headers.indexOf('참가자ID') + 1;
  const nameCol = headers.indexOf('이름') + 1;
  if (!idCol || !nameCol) return;
  const names = sheet.getRange(2, nameCol, values.length - 1, 1).getValues();
  let changed = false;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol - 1] || '').trim() !== participantId) continue;
    if (String(names[i - 1][0] || '') === displayName) continue;
    names[i - 1][0] = displayName;
    changed = true;
  }
  if (changed) sheet.getRange(2, nameCol, names.length, 1).setValues(names);
}

function getRecordsForAdmin_(participantId, includeDeleted, limit) {
  const id = String(participantId || '').trim();
  const max = Math.max(1, Math.min(Number(limit || 80), 200));
  const rows = tableRows_(getSpreadsheet_().getSheetByName(APP.SHEET_RECORDS)).slice().reverse();
  const out = [];
  rows.some(function (row) {
    if (out.length >= max) return true;
    const status = String(row['상태'] || '').toUpperCase();
    if (id && String(row['참가자ID'] || '').trim() !== id) return false;
    if (!includeDeleted && status.indexOf('삭제') === 0) return false;
    out.push(adminRecordFromRow_(row));
    return false;
  });
  return out;
}

function adminRecordFromRow_(row) {
  const recordId = String(row['기록ID'] || '').trim();
  const uploadedAt = row['업로드일시'];
  const distance = numberOrNull_(row['거리(km)']) || 0;
  const seconds = intOrNull_(row['시간(초)']) || 0;
  const paceSeconds = distance && seconds ? Math.round(seconds / distance) : intOrNull_(row['평균페이스(초/km)']);
  const proofPhotoFileId = String(row['인증샷파일ID'] || '').trim();
  return {
    recordId: recordId,
    participantId: String(row['참가자ID'] || '').trim(),
    name: String(row['이름'] || '').trim(),
    status: String(row['상태'] || ''),
    activityDate: normalizeDateString_(row['러닝일자']) || dateTimeToYmd_(uploadedAt) || recordIdToYmd_(recordId) || '',
    uploadedAt: String(uploadedAt || ''),
    distanceKm: roundOrNull_(distance, 2) || 0,
    durationSeconds: seconds,
    durationMinutes: seconds ? Math.floor(seconds / 60) : '',
    durationSecondsPart: seconds ? seconds % 60 : '',
    durationText: seconds ? formatDuration_(seconds) : String(row['시간표시'] || ''),
    averagePaceSecondsPerKm: paceSeconds || '',
    averagePaceText: paceSeconds ? formatPace_(paceSeconds) : String(row['페이스표시'] || ''),
    caloriesKcal: intOrNull_(row['칼로리(kcal)']),
    averageHeartRateBpm: intOrNull_(row['평균심박수(bpm)']),
    elevationGainM: intOrNull_(row['고도상승(m)']),
    cadenceSpm: intOrNull_(row['케이던스(spm)']),
    appName: String(row['앱명'] || ''),
    inputMode: inferInputModeFromRow_(row),
    memo: String(row['메모'] || ''),
    warnings: String(row['경고'] || ''),
    confidence: numberOrNull_(row['신뢰도']),
    hasOriginalImage: Boolean(String(row['이미지파일ID'] || '').trim()),
    imageUrl: String(row['이미지URL'] || '').trim(),
    hasProofPhoto: Boolean(proofPhotoFileId),
    proofPhotoPublic: isProofPhotoPublicValue_(row['인증샷공개여부'], Boolean(proofPhotoFileId)),
    proofPhotoFileName: String(row['인증샷파일명'] || '').trim(),
    proofPhotoUrl: String(row['인증샷URL'] || '').trim(),
    proofPhotoFileId: proofPhotoFileId
  };
}

function getDeletedRecordsForAdmin_() {
  const rows = tableRows_(getSpreadsheet_().getSheetByName(APP.SHEET_RECORDS)).slice().reverse();
  return rows.filter(function (row) {
    return String(row['상태'] || '').toUpperCase().indexOf('삭제') === 0;
  }).slice(0, 30).map(function (row) {
    const distance = numberOrNull_(row['거리(km)']) || 0;
    const seconds = intOrNull_(row['시간(초)']) || 0;
    return {
      recordId: String(row['기록ID'] || ''),
      participantId: String(row['참가자ID'] || ''),
      name: String(row['이름'] || ''),
      activityDate: normalizeDateString_(row['러닝일자']) || '',
      distanceKm: roundOrNull_(distance, 2) || 0,
      durationText: seconds ? formatDuration_(seconds) : String(row['시간표시'] || ''),
      deletedAt: String(row['업로드일시'] || ''),
      memo: String(row['메모'] || '')
    };
  });
}



/***** AI_Drive.gs *****/
function extractRunningData_(blob) {
  const apiKey = getRequiredProp_('GEMINI_API_KEY');
  const model = getGeminiModel_();
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  const base64 = Utilities.base64Encode(blob.getBytes());
  const prompt = buildExtractionPrompt_();

  const attempts = [
    {
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { inline_data: { mime_type: blob.getContentType() || 'image/jpeg', data: base64 } }
        ]
      }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' }
    },
    {
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { inline_data: { mime_type: blob.getContentType() || 'image/jpeg', data: base64 } }
        ]
      }],
      generationConfig: { temperature: 0 }
    }
  ];

  let lastError = null;
  for (let i = 0; i < attempts.length; i++) {
    try {
      const response = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-goog-api-key': apiKey },
        payload: JSON.stringify(attempts[i]),
        muteHttpExceptions: true
      });
      const status = response.getResponseCode();
      const text = response.getContentText();
      if (status < 200 || status >= 300) {
        lastError = new Error('Gemini API 오류(' + status + '): ' + trimForLog_(text));
        continue;
      }
      return parseJsonLoose_(getGeminiText_(JSON.parse(text)));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Gemini 응답을 처리하지 못했습니다.');
}

function buildExtractionPrompt_() {
  return [
    '너는 러닝 인증 스크린샷을 읽는 OCR/데이터 추출 엔진이다.',
    '대상 앱: Apple Fitness, Apple Watch Workout, iPhone Fitness, Samsung Health, Garmin, Strava, Nike Run Club, Adidas Running, Runkeeper, Coros, Polar, Suunto, Zepp, Mi Fitness, 러닝머신 기록, 기타 러닝 앱.',
    '이미지에 보이는 값만 추출한다. 추측으로 만들지 않는다.',
    '러닝/달리기/조깅/런닝머신 기록이면 isRunningScreenshot=true. 걷기만 보이거나 운동 기록 화면이 아니면 false.',
    '여러 운동 기록이 보이면 가장 크고 중심에 있는 단일 운동 기록만 사용한다.',
    '거리 단위: km로 환산. miles/mi는 1mi=1.60934km로 환산한다.',
    '시간: durationSeconds 초 단위. 31:08은 1868, 1:02:03은 3723.',
    '페이스: averagePaceSecondsPerKm 초/km. min/mi는 min/km로 환산한다.',
    '평균 심박, 칼로리, 고도상승, 케이던스가 보이면 숫자로 추출한다.',
    '운동 날짜가 보이면 runningDate를 YYYY-MM-DD로 쓴다. 연도를 모르면 null.',
    '숫자가 애매하면 warnings에 이유를 쓴다.',
    '반드시 아래 JSON 키만 사용해서 JSON 객체만 반환한다. 마크다운 금지.',
    '{',
    '  "isRunningScreenshot": true 또는 false,',
    '  "appName": "앱 이름 또는 null",',
    '  "runningDate": "YYYY-MM-DD 또는 null",',
    '  "distanceKm": 숫자 또는 null,',
    '  "durationSeconds": 정수 또는 null,',
    '  "durationText": "보이는 시간 또는 null",',
    '  "averagePaceSecondsPerKm": 정수 또는 null,',
    '  "averagePaceText": "예: 5\'58\"/km 또는 null",',
    '  "caloriesKcal": 정수 또는 null,',
    '  "averageHeartRateBpm": 정수 또는 null,',
    '  "elevationGainM": 정수 또는 null,',
    '  "cadenceSpm": 정수 또는 null,',
    '  "confidence": 0부터 1 사이 숫자,',
    '  "warnings": ["한국어 경고"],',
    '  "rawText": "읽은 핵심 텍스트"',
    '}'
  ].join('\n');
}

function normalizeExtraction_(data) {
  const out = {
    isRunningScreenshot: Boolean(data.isRunningScreenshot),
    appName: stringOrNull_(data.appName),
    runningDate: normalizeDateString_(data.runningDate),
    distanceKm: roundOrNull_(numberOrNull_(data.distanceKm), 2),
    durationSeconds: intOrNull_(data.durationSeconds),
    durationText: stringOrNull_(data.durationText),
    averagePaceSecondsPerKm: intOrNull_(data.averagePaceSecondsPerKm),
    averagePaceText: stringOrNull_(data.averagePaceText),
    caloriesKcal: intOrNull_(data.caloriesKcal),
    averageHeartRateBpm: intOrNull_(data.averageHeartRateBpm),
    elevationGainM: intOrNull_(data.elevationGainM),
    cadenceSpm: intOrNull_(data.cadenceSpm),
    confidence: roundOrNull_(numberOrNull_(data.confidence), 2),
    warnings: Array.isArray(data.warnings) ? data.warnings.map(String) : [],
    rawText: stringOrNull_(data.rawText)
  };

  if (!out.durationSeconds && out.durationText) out.durationSeconds = parseDurationText_(out.durationText);
  if (!out.averagePaceSecondsPerKm && out.averagePaceText) out.averagePaceSecondsPerKm = parsePaceText_(out.averagePaceText);

  // 2개 값이 있으면 나머지 1개를 보정 계산합니다.
  if (!out.averagePaceSecondsPerKm && out.distanceKm && out.durationSeconds) {
    out.averagePaceSecondsPerKm = Math.round(out.durationSeconds / out.distanceKm);
  }
  if (!out.durationSeconds && out.distanceKm && out.averagePaceSecondsPerKm) {
    out.durationSeconds = Math.round(out.distanceKm * out.averagePaceSecondsPerKm);
  }
  if (!out.distanceKm && out.durationSeconds && out.averagePaceSecondsPerKm) {
    out.distanceKm = roundOrNull_(out.durationSeconds / out.averagePaceSecondsPerKm, 2);
  }

  out.durationText = out.durationSeconds ? formatDuration_(out.durationSeconds) : out.durationText;
  out.averagePaceText = out.averagePaceSecondsPerKm ? formatPace_(out.averagePaceSecondsPerKm) : out.averagePaceText;
  if (out.confidence === null) out.confidence = 0;
  return out;
}

function saveImageToDrive_(blob, participant, extracted, recordId) {
  const folder = getDriveFolder_();
  const datePart = extracted.runningDate || Utilities.formatDate(new Date(), getTimezone_(), 'yyyyMMdd');
  const distancePart = extracted.distanceKm ? '_' + extracted.distanceKm + 'km' : '';
  const fileName = safeFileName_(datePart + '_' + participant.displayName + distancePart + '_' + recordId + '.jpg');
  const file = folder.createFile(blob.copyBlob().setName(fileName));

  if (toBoolean_(getProp_('MAKE_IMAGES_PUBLIC', 'false'))) {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }
  return { id: file.getId(), url: file.getUrl(), name: file.getName() };
}

function saveOptionalProofPhotoToDrive_(payload, participant, extracted, recordId) {
  const dataUrl = String((payload && (payload.proofPhotoDataUrl || payload.proofImageDataUrl)) || '').trim();
  if (!dataUrl) return null;

  const image = decodeDataUrl_(dataUrl, (payload && (payload.proofPhotoFileName || payload.proofImageFileName)) || 'running-proof.jpg');
  validateImageSize_(image.bytes);
  const imageHash = sha256Hex_(image.bytes);
  const saved = saveProofPhotoToDrive_(image.blob, participant, extracted, recordId);

  return {
    fileName: image.originalFileName,
    url: saved.url,
    id: saved.id,
    hash: imageHash
  };
}

function saveProofPhotoToDrive_(blob, participant, extracted, recordId) {
  const folder = getDriveFolder_();
  const datePart = extracted.runningDate || Utilities.formatDate(new Date(), getTimezone_(), 'yyyyMMdd');
  const fileName = safeFileName_('proof_' + datePart + '_' + participant.displayName + '_' + recordId + '.jpg');
  const file = folder.createFile(blob.copyBlob().setName(fileName));

  if (toBoolean_(getProp_('MAKE_IMAGES_PUBLIC', 'false'))) {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }
  return { id: file.getId(), url: file.getUrl(), name: file.getName() };
}

function getProofPhotoDataMap(fileIds) {
  try {
    const ids = uniqueStrings_((fileIds || []).map(function (id) { return String(id || '').trim(); })).slice(0, 24);
    if (!ids.length) return { ok: true, photos: {} };

    const allowed = {};
    const rows = tableRows_(getSpreadsheet_().getSheetByName(APP.SHEET_RECORDS));
    rows.forEach(function (row) {
      const status = String(row['상태'] || '').toUpperCase();
      const fileId = String(row['인증샷파일ID'] || '').trim();
      const isPublic = isProofPhotoPublicValue_(row['인증샷공개여부'], Boolean(fileId));
      if (status.indexOf('OK') === 0 && fileId && isPublic) allowed[fileId] = true;
    });

    const photos = {};
    ids.forEach(function (id) {
      if (!allowed[id]) return;
      try {
        const dataUrl = driveFileToDataUrl_(id);
        if (dataUrl) photos[id] = dataUrl;
      } catch (fileErr) {
      }
    });
    return { ok: true, photos: photos };
  } catch (err) {
    return { ok: false, error: errorMessage_(err), photos: {} };
  }
}

function driveFileToDataUrl_(fileId) {
  const file = DriveApp.getFileById(String(fileId || '').trim());
  const blob = file.getBlob();
  const bytes = blob.getBytes();
  const maxInlineBytes = Number(getProp_('MAX_PROOF_PHOTO_INLINE_BYTES', '2600000')) || 2600000;
  if (bytes.length > maxInlineBytes) return '';
  return 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(bytes);
}



/***** Utils.gs *****/
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



/***** Sheets.gs *****/
function ensureSheets_(ss) {
  const participantSheet = getOrCreateSheet_(ss, APP.SHEET_PARTICIPANTS);
  const recordSheet = getOrCreateSheet_(ss, APP.SHEET_RECORDS);
  const dashboardSheet = getOrCreateSheet_(ss, APP.SHEET_DASHBOARD);
  const reactionSheet = getOrCreateSheet_(ss, APP.SHEET_REACTIONS);
  const goalHistorySheet = getOrCreateSheet_(ss, APP.SHEET_GOAL_HISTORY);
  const lightningRsvpSheet = getOrCreateSheet_(ss, APP.SHEET_LIGHTNING_RSVP);
  const memberStatusSheet = getOrCreateSheet_(ss, APP.SHEET_MEMBER_STATUS);
  const recordRequestSheet = getOrCreateSheet_(ss, APP.SHEET_RECORD_REQUESTS);
  const adminAuditSheet = getOrCreateSheet_(ss, APP.SHEET_ADMIN_AUDIT);

  ensureHeader_(participantSheet, HEADERS.PARTICIPANTS);
  ensureHeader_(recordSheet, HEADERS.RECORDS);
  ensureHeader_(dashboardSheet, HEADERS.DASHBOARD);
  ensureHeader_(reactionSheet, HEADERS.REACTIONS);
  ensureHeader_(goalHistorySheet, HEADERS.GOAL_HISTORY);
  ensureHeader_(lightningRsvpSheet, HEADERS.LIGHTNING_RSVP);
  ensureHeader_(memberStatusSheet, HEADERS.MEMBER_STATUS);
  ensureHeader_(recordRequestSheet, HEADERS.RECORD_REQUESTS);
  ensureHeader_(adminAuditSheet, HEADERS.ADMIN_AUDIT);

  formatSheet_(participantSheet, APP.SHEET_PARTICIPANTS);
  formatSheet_(recordSheet, APP.SHEET_RECORDS);
  formatSheet_(dashboardSheet, APP.SHEET_DASHBOARD);
  formatSheet_(reactionSheet, APP.SHEET_REACTIONS);
  formatSheet_(goalHistorySheet, APP.SHEET_GOAL_HISTORY);
  formatSheet_(lightningRsvpSheet, APP.SHEET_LIGHTNING_RSVP);
  formatSheet_(memberStatusSheet, APP.SHEET_MEMBER_STATUS);
  formatSheet_(recordRequestSheet, APP.SHEET_RECORD_REQUESTS);
  formatSheet_(adminAuditSheet, APP.SHEET_ADMIN_AUDIT);
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function backfillParticipantEmojis_(ss) {
  const sheet = ss.getSheetByName(APP.SHEET_PARTICIPANTS);
  if (!sheet || sheet.getLastRow() < 2) return 0;

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (h) { return String(h || '').trim(); });
  const idCol = headers.indexOf('참가자ID') + 1;
  const nameCol = headers.indexOf('표시이름') + 1 || headers.indexOf('이름') + 1;
  const activeCol = headers.indexOf('활성여부') + 1;
  const emojiCol = headers.indexOf('이모지') + 1;
  if (!idCol || !emojiCol) return 0;

  const used = {};
  for (let r = 2; r <= values.length; r++) {
    const row = values[r - 1];
    const active = activeCol ? toBoolean_(row[activeCol - 1]) : true;
    const emoji = String(row[emojiCol - 1] || '').trim();
    if (active && emoji) used[emoji] = true;
  }

  let changed = 0;
  for (let r = 2; r <= values.length; r++) {
    const row = values[r - 1];
    const active = activeCol ? toBoolean_(row[activeCol - 1]) : true;
    const existing = String(row[emojiCol - 1] || '').trim();
    if (!active || existing) continue;

    const seed = String(row[idCol - 1] || '') + String(nameCol ? row[nameCol - 1] || '' : '') + r;
    const emoji = pickNewEmoji_(seed, '', used);
    used[emoji] = true;
    sheet.getRange(r, emojiCol).setValue(emoji);
    changed += 1;
  }
  return changed;
}

function ensureHeader_(sheet, headers) {
  const width = headers.length;
  const current = sheet.getRange(1, 1, 1, width).getValues()[0].map(String);
  const same = headers.every(function (h, idx) { return current[idx] === h; });
  if (!same) sheet.getRange(1, 1, 1, width).setValues([headers]);
}

function formatSheet_(sheet, name) {
  const lastColumn = Math.max(1, sheet.getLastColumn());
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, lastColumn)
    .setFontWeight('bold')
    .setBackground('#fff0f6');

  if (name === APP.SHEET_PARTICIPANTS) {
    sheet.setColumnWidths(1, 1, 170);
    sheet.setColumnWidths(2, 3, 120);
    sheet.setColumnWidths(5, 5, 110);
    sheet.setColumnWidths(10, 1, 80);
  }
  if (name === APP.SHEET_RECORDS) {
    sheet.setColumnWidths(1, 1, 170);
    sheet.setColumnWidths(2, 2, 140);
    sheet.setColumnWidths(4, 2, 110);
    sheet.setColumnWidths(6, 9, 105);
    sheet.setColumnWidths(15, 1, 120);
    sheet.setColumnWidths(16, 4, 180);
    sheet.setColumnWidths(25, 2, 260);
    sheet.setColumnWidths(28, 4, 180);
  }
  if (name === APP.SHEET_DASHBOARD) {
    sheet.setColumnWidths(1, HEADERS.DASHBOARD.length, 125);
  }
  if (name === APP.SHEET_REACTIONS) {
    sheet.setColumnWidths(1, HEADERS.REACTIONS.length, 140);
  }
  if (name === APP.SHEET_GOAL_HISTORY) {
    sheet.setColumnWidths(1, HEADERS.GOAL_HISTORY.length, 140);
  }
  if (name === APP.SHEET_LIGHTNING_RSVP) {
    sheet.setColumnWidths(1, HEADERS.LIGHTNING_RSVP.length, 140);
    sheet.setColumnWidth(6, 100);
  }
  if (name === APP.SHEET_MEMBER_STATUS) {
    sheet.setColumnWidths(1, HEADERS.MEMBER_STATUS.length, 140);
    sheet.setColumnWidth(5, 120);
    sheet.setColumnWidth(6, 220);
  }
  if (name === APP.SHEET_RECORD_REQUESTS) {
    sheet.setColumnWidths(1, HEADERS.RECORD_REQUESTS.length, 140);
    sheet.setColumnWidth(6, 280);
    sheet.setColumnWidth(8, 220);
  }
  if (name === APP.SHEET_ADMIN_AUDIT) {
    sheet.setColumnWidths(1, HEADERS.ADMIN_AUDIT.length, 145);
    sheet.setColumnWidth(6, 260);
    sheet.setColumnWidth(7, 320);
    sheet.setColumnWidth(8, 320);
  }

}

function maybeFormatSheetOnWrite_(sheet, name) {
  if (toBoolean_(getProp_('FORMAT_SHEETS_ON_WRITE', 'false'))) formatSheet_(sheet, name);
}



/***** MemberStatus.gs *****/
function getMemberStatuses() {
  try {
    ensureSchemaReady_();
    return { ok: true, memberStatuses: getMemberStatusMap_() };
  } catch (err) {
    return { ok: false, error: errorMessage_(err), memberStatuses: {} };
  }
}

function setMemberStatus(participantId, status, memo) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensureSchemaReady_();
    const participant = findParticipantById_(participantId);
    if (!participant) throw new Error('상태를 바꾸려면 먼저 닉네임을 선택해주세요.');
    const cleanStatus = normalizeMemberStatus_(status);
    const cleanMemo = String(memo || '').trim().slice(0, 80);
    const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_MEMBER_STATUS);
    sheet.appendRow([
      makeId_('mood'),
      nowString_(),
      participant.id,
      participant.displayName || participant.name,
      cleanStatus,
      cleanMemo,
      formatYmd_(new Date())
    ]);
    maybeFormatSheetOnWrite_(sheet, APP.SHEET_MEMBER_STATUS);
    invalidateAppCache_();
    return {
      ok: true,
      memberStatuses: getMemberStatusMap_(),
      message: cleanStatus ? '오늘 상태를 ' + cleanStatus + '(으)로 저장했어요.' : '오늘 상태를 비웠어요.'
    };
  } catch (err) {
    return { ok: false, error: errorMessage_(err), memberStatuses: getMemberStatusMap_() };
  } finally {
    try { lock.releaseLock(); } catch (unlockErr) {}
  }
}

function getMemberStatusMap_() {
  const result = {};
  try {
    const sheet = getSpreadsheet_().getSheetByName(APP.SHEET_MEMBER_STATUS);
    if (!sheet || sheet.getLastRow() < 2) return result;
    const today = formatYmd_(new Date());
    tableRows_(sheet).forEach(function (row) {
      const date = normalizeDateString_(row['상태일자']) || dateTimeToYmd_(row['변경일시']) || '';
      if (date !== today) return;
      const participantId = String(row['참가자ID'] || '').trim();
      if (!participantId) return;
      const status = normalizeMemberStatus_(row['상태']);
      if (!status) {
        delete result[participantId];
        return;
      }
      result[participantId] = {
        participantId: participantId,
        name: String(row['이름'] || '').trim(),
        status: status,
        memo: String(row['메모'] || '').trim(),
        changedAt: String(row['변경일시'] || ''),
        date: date
      };
    });
  } catch (err) {
  }
  return result;
}

function normalizeMemberStatus_(status) {
  const text = String(status || '').trim();
  if (!text || text === '비우기' || text === 'clear') return '';
  if (['러닝 예정', '휴식', '가벼운 조깅', '부상 회복'].indexOf(text) >= 0) return text;
  const lower = text.toLowerCase();
  if (['run', 'ready', 'plan'].indexOf(lower) >= 0) return '러닝 예정';
  if (['rest', 'off'].indexOf(lower) >= 0) return '휴식';
  if (['easy', 'jog'].indexOf(lower) >= 0) return '가벼운 조깅';
  if (['injury', 'recover'].indexOf(lower) >= 0) return '부상 회복';
  return '';
}



/***** Maintenance.gs *****/
function fixSeongjunJune1RecordDate(adminCode) {
  verifyAdminCode_(adminCode);
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(APP.SHEET_RECORDS);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { ok: true, changedRows: 0, message: '러닝기록이 없습니다.' };

  const headers = values[0].map(function (h) { return String(h || '').trim(); });
  const nameCol = headers.indexOf('이름');
  const runDateCol = headers.indexOf('러닝일자');
  const uploadedAtCol = headers.indexOf('업로드일시');
  const statusCol = headers.indexOf('상태');
  const distanceCol = headers.indexOf('거리(km)');
  if (nameCol < 0 || runDateCol < 0 || uploadedAtCol < 0) {
    throw new Error('러닝기록 시트에 이름/러닝일자/업로드일시 컬럼이 필요합니다.');
  }

  let changed = 0;
  const changedRows = [];
  for (let r = 1; r < values.length; r++) {
    const name = String(values[r][nameCol] || '').trim();
    const runDate = normalizeDateString_(values[r][runDateCol]);
    const uploadedYmd = dateTimeToYmd_(values[r][uploadedAtCol]);
    const status = statusCol >= 0 ? String(values[r][statusCol] || '').toUpperCase() : '';
    const distance = distanceCol >= 0 ? numberOrNull_(values[r][distanceCol]) : null;

    if (name === '성준' && runDate === '2026-06-02' && uploadedYmd === '2026-06-01' && status.indexOf('삭제') !== 0) {
      sheet.getRange(r + 1, runDateCol + 1).setValue('2026-06-01');
      changed += 1;
      changedRows.push({ row: r + 1, name: name, distanceKm: distance, from: '2026-06-02', to: '2026-06-01' });
    }
  }

  return {
    ok: true,
    changedRows: changed,
    rows: changedRows,
    message: changed ? '성준님의 6월 1일 기록 날짜를 보정했습니다.' : '보정할 성준 6월 1일 기록을 찾지 못했습니다. 이미 수정됐을 수 있습니다.'
  };
}

function debugTodayRecords(adminCode) {
  verifyAdminCode_(adminCode);
  const dashboard = getDashboardData_();
  return {
    ok: true,
    today: dashboard.today,
    todayCount: (dashboard.todayRunnerTotals || []).length,
    todayRunnerTotals: dashboard.todayRunnerTotals || [],
    todayRecords: dashboard.todayRecords || []
  };
}



/***** InstallCheck.gs *****/
/**
 * Apps Script 파일이 제대로 붙여넣어졌는지 확인하는 진단 함수입니다.
 *
 * 사용 방법:
 * 1. Apps Script에서 함수 목록의 diagnoseInstall을 실행합니다.
 * 2. 실행 결과의 missing/byFile 항목을 확인합니다.
 * 3. 누락된 파일이 있으면 해당 파일을 다시 붙여넣고 저장합니다.
 */
function diagnoseInstall() {
  const required = [
    { name: 'doGet', file: 'App.gs', why: '웹앱 시작 함수' },
    { name: 'setupOnce', file: 'App.gs', why: '초기 설정 함수' },
    { name: 'getInitialData', file: 'App.gs', why: '초기 화면 데이터 로딩' },
    { name: 'getDashboardSummary', file: 'App.gs', why: '대시보드 새로고침' },
    { name: 'getParticipants_', file: 'Members.gs', why: '참가자 목록 읽기' },
    { name: 'getReactionCountsMap_', file: 'Records.gs', why: '응원 수 집계' },
    { name: 'submitRun', file: 'Records.gs', why: '러닝 인증 저장' },
    { name: 'saveReviewedRun', file: 'Records.gs', why: '수동 확인 후 저장' },
    { name: 'deleteParticipantProofPhoto', file: 'Records.gs', why: '내 인증샷 삭제' },
    { name: 'getProofPhotoDataMap', file: 'AI_Drive.gs', why: '인증샷 표시' },
    { name: 'ensureSheets_', file: 'Sheets.gs', why: '시트 구조 생성/확인' },
    { name: 'getSpreadsheet_', file: 'Utils.gs', why: '스프레드시트 연결' },
    { name: 'tableRows_', file: 'Utils.gs', why: '시트 행 읽기' },
    { name: 'verifyAdminCode_', file: 'Utils.gs', why: '관리자 보호' },
    { name: 'adminGetData', file: 'Admin.gs', why: '관리자 모드 데이터' },
    { name: 'saveAnnouncement', file: 'Lightning.gs', why: '번개 모임 저장' },
    { name: 'setMemberStatus', file: 'MemberStatus.gs', why: '멤버 상태 저장' }
  ];

  const missing = [];
  const present = [];
  required.forEach(function (item) {
    let exists = false;
    try {
      exists = eval('typeof ' + item.name) === 'function';
    } catch (err) {
      exists = false;
    }
    (exists ? present : missing).push(item);
  });

  const byFile = {};
  missing.forEach(function (item) {
    if (!byFile[item.file]) byFile[item.file] = [];
    byFile[item.file].push(item.name + ' - ' + item.why);
  });

  return {
    ok: missing.length === 0,
    message: missing.length
      ? '누락된 함수가 있습니다. byFile 항목의 파일을 다시 붙여넣고 저장하세요.'
      : '필수 함수가 모두 확인되었습니다.',
    missing: missing,
    missingCount: missing.length,
    presentCount: present.length,
    byFile: byFile
  };
}

