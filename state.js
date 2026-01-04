/**
 * Dungeon Dice - State Module
 * 게임의 전역 상태(Global State)와 오디오 객체를 관리합니다.
 */

// 게임 상태 전역 객체
export let G = {
  players: [],      // 플레이어 정보 배열
  active: 0,        // 현재 턴 플레이어 인덱스
  round: 1,         // 현재 라운드
  phase: 'setup',   // 게임 단계
  board: [],        // 맵 타일 데이터
  decks: {          // 카드 덱 저장소
      action:[], 
      chance:[], 
      item:[]
  },
  dice: [1,1,1,1,1], // 주사위 5개 값
  held: [false,false,false,false,false], // 주사위 홀드 상태
  rolls: 3,         // 남은 굴리기 횟수
  maxRolls: 3,      // 최대 굴리기 횟수
  ai: false,        // AI 모드 활성화 여부
  winner: null,     // 승자 ID
  pendingCard: null, // 현재 처리 중인 카드
  fixDiceMode: false, // 수정구 아이템 사용 여부
  changeDiceMode: false, // 트릭스터 장갑 사용 여부
  lastStandMode: false, // 종료 라운드 모드
  lastStandCount: 0,    // 종료 라운드 남은 턴
  guideMode: true,      // 도움말(코치) 모드
  isIntroFlow: false,   // 인트로 진행 상태
  bgmIndex: 0,          // [수정] BGM 인덱스를 G 객체 내부로 이동 (수정 가능하도록)
  
  // 핵심 흐름 제어 콜백
  callbacks: {
      endTurn: null,
      nextTurn: null,
      checkWinCondition: null
  }
};

// 배경 음악(BGM) 객체
export let bgmAudio = new Audio();

// 인트로(시놉시스) 음악 객체
export let introAudio = new Audio('music/GameIntro.mp3');
introAudio.loop = true; 
introAudio.volume = 0.6;