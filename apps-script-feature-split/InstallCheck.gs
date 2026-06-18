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
