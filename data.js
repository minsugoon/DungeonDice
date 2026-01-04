/**
 * Dungeon Dice Data Module
 * PDF 룰북 기반 데이터 정의
 */

export const CONST = {
  MAX_ROUNDS: 13,
  BLINDFOLD_REQ: 15,
  EXIT_SCORE: 2, // [Rule 84] 탈출 점수 +2
  COLORS: ['Red', 'Blue', 'Yellow', 'Black']
};

// [Page 5] 던전 타일 (21개)
export const MAP_TILES_CONFIG = [
  {cat:'threeKind', count:6}, 
  {cat:'chance', count:2},
  {cat:'trapLow', count:1},  // 주사위 1,2
  {cat:'trapMid', count:1},  // 주사위 3,4
  {cat:'trapHigh', count:2}, // 주사위 5,6
  {cat:'fourKind', count:2}, 
  {cat:'fullHouse', count:2},
  {cat:'smallStr', count:1}, // 4연속
  {cat:'largeStr', count:1}, // 5연속
  {cat:'sum25', count:1}, 
  {cat:'sum7', count:1}, 
  {cat:'yacht', count:1}
];

// [Page 5-6] EXIT 타일 풀 (난이도 높음)
export const EXIT_POOL = ['fullHouse', 'sum15Exact', 'allEven', 'allOdd', 'largeStr', 'sum25', 'sum7', 'yacht'];

// [Page 9-10] 액션 카드
export const DECK_ACTION_DEF = [
  {name:"숨겨진 금괴", count:5, req:'sum15', win:'+1점', lose:'없음', effect:(p,s)=>{ if(s) p.score++; }},
  {name:"던전 슬라임", count:4, req:'threeKind', win:'+1점', lose:'후퇴', effect:(p,s)=>{ if(s) p.score++; else return 'BACK'; }},
  {name:"미믹", count:4, req:'sum15', win:'+1점', lose:'후퇴', effect:(p,s)=>{ if(s) p.score++; else return 'BACK'; }},
  {name:"함정 카드", count:4, req:'threeKind', win:'회피', lose:'-2점', effect:(p,s)=>{ if(!s) p.score-=2; }},
  {name:"흡혈 박쥐 떼", count:2, req:'fourKind', win:'+2점', lose:'후퇴', effect:(p,s)=>{ if(s) p.score+=2; else return 'BACK'; }},
  {name:"화난 고블린", count:2, req:'sum25', win:'+2점', lose:'-2점', effect:(p,s)=>{ if(s) p.score+=2; else p.score-=2; }},
  {name:"해골 병사", count:2, req:'sum25', win:'+2점', lose:'-4점', effect:(p,s)=>{ if(s) p.score+=2; else p.score-=4; }},
  {name:"킹 코브라", count:1, req:'sum7', win:'획득', lose:'시작점', effect:(p,s)=>{ if(s) return 'GET_COBRA'; else return 'START'; }}
];

// [Page 14-16] 찬스 카드 (리롤 불가)
export const DECK_CHANCE_DEF = [
  {name:"안전한 길", count:6, req:'sum15_18', win:'+0점', lose:'후퇴', effect:(p,s)=>{ if(s) {/*0점*/} else return 'BACK'; }},
  {name:"강력한 한 방", count:4, req:'sum20', win:'+1점', lose:'-1점', effect:(p,s)=>{ if(s) p.score++; else p.score--; }},
  {name:"바늘 구멍", count:2, req:'sum8', win:'+1점', lose:'-2점', effect:(p,s)=>{ if(s) p.score++; else p.score-=2; }},
  {name:"짝수의 축복", count:2, req:'allEven', win:'+2점', lose:'시작점', effect:(p,s)=>{ if(s) p.score+=2; else return 'START'; }},
  {name:"홀수의 축복", count:2, req:'allOdd', win:'+2점', lose:'시작점', effect:(p,s)=>{ if(s) p.score+=2; else return 'START'; }},
  {name:"망가진 덫", count:2, req:'all4Up', win:'+2점', lose:'시작점', effect:(p,s)=>{ if(s) p.score+=2; else return 'START'; }},
  {name:"착한 고블린", count:2, req:'all3Down', win:'+2점', lose:'시작점', effect:(p,s)=>{ if(s) p.score+=2; else return 'START'; }}
];

// [Page 11-13] 아이템 카드 (획득 조건 존재)
export const DECK_ITEM_DEF = [
  {name:"시간의 모래시계", count:2, req:'allEven', desc:"다음 턴 굴림 +1회", id:"reroll_plus"},
  {name:"요정의 가루", count:2, req:'allOdd', desc:"주사위 1개 재굴림", id:"reroll_one"},
  {name:"예언자의 수정구", count:2, req:'all4Up', desc:"시작 시 3개 고정", id:"fix_three"},
  {name:"트릭스터의 장갑", count:2, req:'all2Down', desc:"주사위 1개 눈 변경", id:"change_one"},
  {name:"신비한 해독제", count:2, req:'fourKind', desc:"중독 즉시 치료", id:"antidote"}
];

// BGM 목록
export const BGM_PLAYLIST = ['music/GameOST_001.mp3', 'music/GameOST_002.mp3'];