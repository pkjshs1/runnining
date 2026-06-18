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
