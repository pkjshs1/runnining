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
