/**
 * 러닝 챌린지 Google Apps Script 웹앱 v42
 * - PIN/초대코드 없음
 * - 새 닉네임 등록 → 참가자 DB 자동 추가
 * - 닉네임 클릭 → 러닝 인증 사진 업로드 → Gemini 분석 → 신뢰도 낮으면 확인/수동입력 → Google Sheets 저장
 * - Google Drive에 원본 인증샷 저장
 * - 웹앱 대시보드 공유 지원: 배포URL?view=dashboard
 * - 개인별 최근 기록 수정/삭제 지원
 * - 오늘 달린 기록 업로드일 기준 표시, 이모지 다시 뽑기, 개인별 이번 주/지난주 기록 지원
 * - 선택 인증샷, 개인 이미지 카드, 모바일 대시보드 순서, 캐시 기반 초기 로딩 개선
 * - 브라우저 즉시 캐시, 요약 대시보드 선로딩, 개인 통계 지연 로딩, 인증샷만 삭제 지원
 * - 목표 진행률 색상, 업로드 완료 요약, 수정 요청, 관리자 변경 이력, 주간 마감 안내 지원
 */

const APP = Object.freeze({
  SHEET_PARTICIPANTS: '참가자',
  SHEET_RECORDS: '러닝기록',
  SHEET_DASHBOARD: '대시보드',
  SHEET_REACTIONS: '응원',
  SHEET_GOAL_HISTORY: '목표변경',
  SHEET_LIGHTNING_RSVP: '번개참석',
  SHEET_MEMBER_STATUS: '멤버상태',
  SHEET_RECORD_REQUESTS: '수정요청',
  SHEET_ADMIN_AUDIT: '관리자변경',
  ANNOUNCEMENT_TEXT_PROP: 'ANNOUNCEMENT_TEXT',
  ANNOUNCEMENT_CREATED_AT_PROP: 'ANNOUNCEMENT_CREATED_AT',
  ANNOUNCEMENT_DATE_PROP: 'ANNOUNCEMENT_DATE',
  ANNOUNCEMENT_EVENT_ID_PROP: 'LIGHTNING_EVENT_ID',
  ANNOUNCEMENT_EVENT_DATE_PROP: 'LIGHTNING_EVENT_DATE',
  ANNOUNCEMENT_EVENT_TIME_PROP: 'LIGHTNING_EVENT_TIME',
  ANNOUNCEMENT_LOCATION_PROP: 'LIGHTNING_LOCATION',
  ANNOUNCEMENT_CAPACITY_PROP: 'LIGHTNING_CAPACITY',
  ANNOUNCEMENT_SUPPLIES_PROP: 'LIGHTNING_SUPPLIES',
  ANNOUNCEMENT_MEMO_PROP: 'LIGHTNING_MEMO',
  ANNOUNCEMENT_MAP_LINK_PROP: 'LIGHTNING_MAP_LINK',
  DEFAULT_GEMINI_MODEL: 'gemini-2.5-flash',
  DEFAULT_MAX_UPLOAD_BYTES: 8 * 1024 * 1024,
  DEFAULT_TIMEZONE: 'Asia/Seoul',
  CACHE_TTL_SECONDS: 180
});

const APP_META = Object.freeze({
  VERSION: 'v42',
  UPDATED_AT: ''
});

const CUTE_EMOJIS = Object.freeze([
  '🌼', '🌸', '🌷', '🌻', '🌺', '🪻', '🍀', '🌿', '🌱', '🍓',
  '🍑', '🍊', '🍋', '🍒', '🥝', '🫐', '🥕', '🥐', '🍪', '🧁',
  '🍩', '🍭', '🍬', '🐰', '🐻', '🐼', '🐨', '🐹', '🐱', '🐶',
  '🦊', '🐧', '🐥', '🦄', '🐢', '🐬', '🦋', '🐝', '🐞', '🐿️',
  '🦔', '🦦', '🦭', '⭐', '🌙', '☁️', '🌈', '✨', '💫', '🫧',
  '🎀', '🧸', '🛼', '🎈', '🎠', '🚲', '👟', '🏃‍♀️', '🏃‍♂️', '🥇'
]);

const DASHBOARD_SNAPSHOT = Object.freeze({
  MARKER: 'DASHBOARD_JSON_V1',
  START_COLUMN: 13,
  CHUNK_SIZE: 40000,
  MAX_CHUNKS: 8
});

const HEADERS = Object.freeze({
  PARTICIPANTS: [
    '참가자ID',
    '이름',
    '표시이름',
    '개인PIN',
    '활성여부',
    '목표거리(km)',
    '목표횟수',
    '표시순서',
    '생성일시',
    '이모지'
  ],
  RECORDS: [
    '기록ID',
    '업로드일시',
    '러닝일자',
    '참가자ID',
    '이름',
    '거리(km)',
    '시간(초)',
    '시간표시',
    '평균페이스(초/km)',
    '페이스표시',
    '칼로리(kcal)',
    '평균심박수(bpm)',
    '고도상승(m)',
    '케이던스(spm)',
    '앱명',
    '원본파일명',
    '이미지URL',
    '이미지파일ID',
    '이미지SHA256',
    '중복여부',
    '상태',
    'Gemini모델',
    '신뢰도',
    '경고',
    '추출JSON',
    '메모',
    '입력방식',
    '인증샷파일명',
    '인증샷URL',
    '인증샷파일ID',
    '인증샷SHA256',
    '인증샷공개여부'
  ],
  DASHBOARD: [
    '구분',
    '참가자ID',
    '이름',
    '기록수',
    '거리(km)',
    '시간',
    '평균페이스',
    '기간',
    '달성률(%)',
    '초과율(%)',
    '마지막업로드'
  ],
  REACTIONS: [
    '응원ID',
    '생성일시',
    '기록ID',
    '대상참가자ID',
    '보낸참가자ID',
    '리액션'
  ],
  GOAL_HISTORY: [
    '변경ID',
    '변경일시',
    '참가자ID',
    '이름',
    '이전목표(km)',
    '새목표(km)',
    '변경자',
    '메모'
  ],
  LIGHTNING_RSVP: [
    '참석ID',
    '응답일시',
    '번개ID',
    '참가자ID',
    '이름',
    '참석여부',
    '메모',
    '상태'
  ],
  MEMBER_STATUS: [
    '상태ID',
    '변경일시',
    '참가자ID',
    '이름',
    '상태',
    '메모',
    '상태일자'
  ],
  RECORD_REQUESTS: [
    '요청ID',
    '요청일시',
    '기록ID',
    '참가자ID',
    '이름',
    '요청내용',
    '상태',
    '처리메모',
    '처리일시'
  ],
  ADMIN_AUDIT: [
    '로그ID',
    '일시',
    '작업',
    '대상구분',
    '대상ID',
    '요약',
    '변경전JSON',
    '변경후JSON'
  ],
});
