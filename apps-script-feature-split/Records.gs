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
