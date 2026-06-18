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
