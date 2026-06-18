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
