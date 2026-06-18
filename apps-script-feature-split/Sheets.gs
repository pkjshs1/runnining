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
