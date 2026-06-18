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
