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
