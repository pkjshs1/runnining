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
