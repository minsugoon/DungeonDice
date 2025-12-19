/**
 * Dungeon Dice Main Logic
 * PDF Rule Implementation - Coach System Patch
 */
import { CONST, MAP_TILES_CONFIG, EXIT_POOL, DECK_ACTION_DEF, DECK_CHANCE_DEF, DECK_ITEM_DEF, BGM_PLAYLIST } from './data.js';
import { _, rand, checkMatch, formatReq, buildDecks } from './utils.js';

// 게임 상태 전역 변수
let G = {
  players: [], active: 0, round: 1, phase: 'setup', 
  board: [], decks: {action:[], chance:[], item:[]},
  dice: [1,1,1,1,1], held: [false,false,false,false,false], 
  rolls: 3, maxRolls: 3, 
  ai: false, winner: null,
  pendingCard: null, 
  fixDiceMode: false, 
  changeDiceMode: false,
  lastStandMode: false, 
  lastStandCount: 0,
  guideMode: true // [신규] 가이드 모드 상태
};

// 오디오 객체
let bgmAudio = new Audio();
let bgmIndex = 0;

// 인트로 음악 객체
let introAudio = new Audio('music/GameIntro.mp3');
introAudio.loop = true; 
introAudio.volume = 0.6; 

// --- 초기화 및 설정 ---

function initGame(){
  const pc = document.querySelector('input[name="pCount"]:checked').value;
  G.ai = _('aiMode').checked;
  const pCount = parseInt(pc);
  
  // 데이터 초기화
  G.players = [];
  G.winner = null;
  G.round = 1;
  G.lastStandMode = false;
  G.lastStandCount = 0;
  
  for(let i=0; i<pCount; i++){
    G.players.push({
      id:i, name: (G.ai && i===1)? "AI Bot" : `P-${i+1}`,
      x:2, y:2, prevIdx:12,
      score:0, inv:[], 
      blind: true, 
      poison: false, 
      escaped: false, failed: false
    });
  }

  // 맵 타일 배치
  let tiles = [];
  MAP_TILES_CONFIG.forEach(t => { for(let i=0; i<t.count; i++) tiles.push(t.cat); });
  tiles.sort(()=>Math.random()-0.5);

  G.board = new Array(25).fill(null);
  const center = 12;
  const corners = [0,4,20,24];
  
  G.board[center] = {cat:'start', isExit:false};
  
  const exitTiles = [...EXIT_POOL].sort(()=>Math.random()-0.5).slice(0,4);
  corners.forEach((idx, i) => {
    G.board[idx] = {cat:exitTiles[i], isExit:true};
  });
  
  let tIdx = 0;
  for(let i=0; i<25; i++){
    if(!G.board[i]) G.board[i] = {cat:tiles[tIdx++], isExit:false};
  }

  // 덱 생성
  G.decks.action = buildDecks(DECK_ACTION_DEF);
  G.decks.chance = buildDecks(DECK_CHANCE_DEF);
  G.decks.item = buildDecks(DECK_ITEM_DEF);

  // 화면 전환 및 인트로 음악 재생
  _('setupModal').style.display = 'none';
  _('storyModal').style.display = 'flex'; 
  
  introAudio.play().catch(e => console.log("인트로 음악 재생 실패:", e));
  
  updateCoach(); // [신규] 코치 업데이트
}

function enterDungeon() {
  introAudio.pause();
  introAudio.currentTime = 0;

  _('storyModal').style.display = 'none';
  
  renderBoard();
  renderPlayers();
  
  _('gameLog').innerHTML = '';
  _('roundDisp').innerText = `R 1 / ${CONST.MAX_ROUNDS}`;
  log(`게임 시작! 두건을 해제하세요 (합 ${CONST.BLINDFOLD_REQ}↑)`);
  
  startTurn(0);
  playBGM();
}

// --- 코치 시스템 (신규 기능) ---

function updateCoach(){
    if(!G.guideMode) return;
    
    const p = G.players[G.active];
    // 게임 시작 전이면 리턴
    if(!p) return;

    const coach = _('coachText');
    const rolls = G.rolls;
    
    // 1. AI 턴
    if(G.ai && G.active === 1) {
        coach.innerText = "AI가 전략을 고민 중입니다...";
        return;
    }

    // 2. 특수 상태 (중독/두건)
    if(p.poison) {
        coach.innerHTML = "☠️독에 걸렸습니다! <b>같은 숫자 4개(4 Kind)</b> 이상을 노려 해독하세요!";
        return;
    }
    if(p.blind) {
        if(rolls === 3) coach.innerText = "🕶️앞이 안 보입니다. 합 15 이상을 목표로 굴리세요!";
        else coach.innerText = "높은 숫자인 주사위는 남기고(Hold), 나머지는 다시 굴리세요!";
        return;
    }

    // 3. 일반 진행 단계
    if (G.phase === 'roll') {
        if (rolls === 3) {
            coach.innerText = "🚩 당신의 턴입니다! [굴리기] 버튼을 눌러주세요.";
        } else if (rolls > 0) {
            // 족보 힌트
            if(checkMatch('yacht', G.dice)) coach.innerHTML = "✨와우! <b>요트(같은 숫자 5개)</b>입니다! 어디든 갈 수 있어요!";
            else if(checkMatch('fourKind', G.dice)) coach.innerHTML = "🔥4개가 같습니다! 이동하거나 <b>요트</b>를 노려보세요.";
            else if(checkMatch('fullHouse', G.dice)) coach.innerHTML = "🏠풀하우스! 이동 조건을 만족했습니다.";
            else coach.innerText = "원하는 주사위를 클릭해 잠그고(Hold), 다시 굴려보세요.";
        } else {
            // 굴림 횟수 소진
            coach.innerText = "✋굴림 횟수 끝! 이동할 타일을 선택하거나, 갈 곳이 없으면 턴을 종료하세요.";
        }
    } else if (G.phase === 'move') {
        coach.innerHTML = "✨반짝이는 <b>타일</b>을 클릭하여 이동하세요.";
    }
}

// --- 턴 진행 로직 ---

function startTurn(pid){
  G.active = pid;
  const p = G.players[pid];
  
  if(G.round > CONST.MAX_ROUNDS) { endGame(); return; }
  
  if(p.escaped || p.failed) { nextTurn(); return; }

  if(G.lastStandMode) {
      if(G.lastStandCount <= 0){
          log("모든 추가 턴이 종료되었습니다.");
          endGame();
          return;
      }
      G.lastStandCount--; 
      log(`🚨 <b>마지막 기회!</b> (남은 턴: ${G.lastStandCount})`);
  }

  G.phase = 'roll';
  G.maxRolls = 3; 
  G.rolls = 3;
  G.dice = [1,1,1,1,1];
  G.held.fill(false);
  G.fixDiceMode = false;
  G.changeDiceMode = false;
  
  renderDice(); 
  renderBoard(); 
  renderPlayers(); 
  updateUI(); // updateCoach 포함됨
  
  if(p.poison){
    log(`<span style="color:#ff6b6b">${p.name}: ☠️중독됨! (해독: 4 Kind/Yacht)</span>`);
  } else if(p.blind){
    G.rolls = 1; 
    log(`${p.name}: 🕶️두건 상태 (목표: 합 ${CONST.BLINDFOLD_REQ}↑)`);
  } else {
    log(`${p.name}의 턴.`);
  }

  if(G.ai && p.id === 1) setTimeout(aiPlay, 1000);
}

function rollDice(){
  if(G.rolls <= 0) return;
  if(G.changeDiceMode) return;

  const currentPlayer = G.active;
  const dies = document.querySelectorAll('.die');
  dies.forEach((d,i)=>{ if(!G.held[i]) d.classList.add('rolling'); });
  
  setTimeout(()=>{
    if(G.active !== currentPlayer) return;

    for(let i=0; i<5; i++){
      if(!G.held[i]) G.dice[i] = rand(6)+1;
    }
    
    if(G.fixDiceMode) {
       G.dice[0]=6; G.dice[1]=6; G.dice[2]=5; 
       G.held[0]=true; G.held[1]=true; G.held[2]=true;
       G.fixDiceMode = false; 
       log("수정구 효과: 주사위 3개 고정됨!");
    }

    G.rolls--;
    dies.forEach(d=>d.classList.remove('rolling'));
    renderDice();
    checkStatusEffects(); 
    updateUI(); // updateCoach 포함됨
    renderBoard();
    
    const p = G.players[G.active];
    if(p.blind){
       const sum = G.dice.reduce((a,b)=>a+b,0);
       _('rollInfo').innerText = `합: ${sum} / 목표: ${CONST.BLINDFOLD_REQ}`;
    }
    
    if(G.ai && G.active===1) setTimeout(aiPlay, 800);

  }, 500);
}

function checkStatusEffects(){
  const p = G.players[G.active];
  const sum = G.dice.reduce((a,b)=>a+b,0);
  const match4 = checkMatch('fourKind', G.dice);
  
  if(p.blind){
    if(sum >= CONST.BLINDFOLD_REQ){
      p.blind = false;
      log(`<span style="color:#51cf66">두건 해제 성공!</span>`);
      G.rolls = 3; G.dice = [1,1,1,1,1]; G.held.fill(false); G.phase = 'roll';
      renderDice(); renderBoard(); renderPlayers(); updateUI(); 
      log("주사위가 초기화되었습니다. 이동하세요.");
    } else if(G.rolls === 0){
      log(`두건 해제 실패.`);
      endTurn();
    }
  } else if(p.poison){
    if(match4){
      p.poison = false;
      log(`<span style="color:#51cf66">해독 성공!</span>`);
      G.rolls = 3; G.dice = [1,1,1,1,1]; G.held.fill(false);
      log("해독되어 정상 행동이 가능합니다.");
      updateUI(); renderPlayers(); 
    } else if(G.rolls === 0){
      log(`해독 실패. 턴 종료.`);
      endTurn();
    }
  }
}

// --- 이동 로직 ---

function confirmAction(){
  const p = G.players[G.active];
  if(p.blind || p.poison) { return; } 
  
  const moves = getValidMoves(p.x, p.y);
  if(moves.length === 0){
    log("이동 가능한 타일이 없어 턴을 종료합니다.");
    endTurn(); 
  } else {
    G.phase = 'move';
    log("이동할 타일을 선택하세요.");
    renderBoard(); 
    updateUI(); // updateCoach 포함됨
  }
}

function getValidMoves(cx, cy){
  if (G.rolls === G.maxRolls) return []; 

  const neighbors = [[0,-1],[0,1],[-1,0],[1,0]]; 
  const normalMoves = [];
  const chanceMoves = [];
  
  neighbors.forEach(([dx,dy])=>{
    const nx = cx+dx, ny = cy+dy;
    if(nx<0||nx>4||ny<0||ny>4) return;
    
    const idx = ny*5 + nx;
    const tile = G.board[idx];
    
    const occupants = G.players.filter(p=>!p.escaped && !p.failed && p.x===nx && p.y===ny).length;
    const limit = (G.players.length === 2) ? 1 : 2; 
    
    const isStartR1 = (idx === 12 && G.round === 1);
    
    if(!isStartR1 && occupants >= limit) return; 

    if(checkMatch(tile.cat, G.dice)) {
        if(tile.cat === 'chance') {
            chanceMoves.push(idx);
        } else {
            normalMoves.push(idx);
        }
    }
  });

  if(normalMoves.length > 0) return normalMoves;
  if(chanceMoves.length > 0) return chanceMoves;

  return [];
}

function movePlayer(idx){
  if(G.phase !== 'move') return;
  const p = G.players[G.active];
  
  if(!getValidMoves(p.x,p.y).includes(idx)) return;
  
  p.prevIdx = p.y*5 + p.x;
  p.x = idx%5; 
  p.y = Math.floor(idx/5);
  
  renderBoard(); 
  handleTileEvent(idx);
}

// --- 타일 이벤트 및 카드 로직 ---

function handleTileEvent(idx){
  const tile = G.board[idx];
  const p = G.players[G.active];

  if(tile.isExit){
    p.escaped = true;
    p.score += CONST.EXIT_SCORE; 
    log(`🎉 <b>${p.name} 탈출 성공!</b> (+2점)`);
    
    if(!G.lastStandMode) {
        G.lastStandMode = true;
        const remainingPlayers = G.players.filter(pl => !pl.escaped && !pl.failed).length;
        G.lastStandCount = remainingPlayers;
        log(`<div style="background:rgba(255,0,0,0.3); padding:4px; border-radius:4px;">🚨 <b>누군가 탈출했습니다!</b><br>남은 플레이어는 <b>1턴씩</b>만 더 진행하고 종료합니다.</div>`);
    }

    checkWinCondition(); 
    return;
  }
  
  const cat = tile.cat;
  
  if(cat === 'yacht') { drawCard('item'); return; }
  if(cat === 'chance') { drawCard('chance'); return; }
  
  const actionTiles = ['fourKind','fullHouse','smallStr','largeStr','sum25','sum7','sum15Exact','allEven','allOdd'];
  if(actionTiles.includes(cat)) { drawCard('action'); return; }
  
  endTurn();
}

function drawCard(type){
  let deck = G.decks[type];
  if(deck.length === 0) { 
      if(type==='action') G.decks.action = buildDecks(DECK_ACTION_DEF);
      if(type==='chance') G.decks.chance = buildDecks(DECK_CHANCE_DEF);
      if(type==='item') G.decks.item = buildDecks(DECK_ITEM_DEF);
      deck = G.decks[type]; 
  }
  const card = deck.pop();
  G.pendingCard = { ...card, type: type }; 
  showCardModal(card, type);
}

function showCardModal(card, type){
  const modal = _('cardModal');
  const acts = _('cardActions');
  
  _('cardType').innerText = type.toUpperCase() + " CARD";
  _('cardName').innerText = card.name;
  _('cardVisual').className = `card-visual card-${type}`;
  acts.innerHTML = '';
  _('cardResult').innerHTML = '';

  let btnText = "주사위 굴리기";
  
  if(type === 'item'){
      _('cardDesc').innerHTML = `획득 조건: <b>${formatReq(card.req)}</b><br><br>효과: ${card.desc}`;
      btnText = "획득 시도 (1회)";
  } else if(type === 'chance'){
      _('cardDesc').innerHTML = `조건: ${formatReq(card.req)}<br>성공: ${card.win} / 실패: ${card.lose}`;
      btnText = "운 시험 (리롤 불가)";
  } else { 
      _('cardDesc').innerHTML = `방어 조건: ${formatReq(card.req)}<br>성공: ${card.win} / 실패: ${card.lose}`;
      btnText = "방어 굴림";
  }

  const btn = document.createElement('button');
  btn.className = 'action';
  btn.innerText = btnText;
  btn.onclick = () => resolveCardRoll(card, type);
  acts.appendChild(btn);
  
  modal.style.display = 'flex';
  if(G.ai && G.active === 1) setTimeout(()=>btn.click(), 1500);
}

function resolveCardRoll(card, type){
  const roll = [rand(6)+1, rand(6)+1, rand(6)+1, rand(6)+1, rand(6)+1];
  const success = checkMatch(card.req, roll);
  
  _('cardResult').innerHTML = `[${roll.join(',')}]<br>▼<br><b style="color:${success?'#4f4':'#f44'}">${success?'성공':'실패'}</b>`;
  
  const p = G.players[G.active];
  const acts = _('cardActions');
  acts.innerHTML = '';

  if(type === 'item'){
      if(success){
          if(p.inv.length >= 2) { 
              log("가방이 꽉 차서 아이템을 버렸습니다.");
          } else {
              p.inv.push(card);
              log(`${card.name} 획득!`);
          }
      } else {
          log("아이템 획득 실패.");
      }
  } 
  else {
      const result = card.effect(p, success);
      
      if(result === 'BACK') moveBack(p);
      else if(result === 'START') moveStart(p);
      else if(result === 'GET_COBRA') {
          p.inv.push({name:"킹 코브라", id:"cobra", desc:"사용 시 상대방 중독"});
          log("킹 코브라 획득!");
      }
      
      log(`${card.name}: ${success ? card.win : card.lose}`);
  }
  
  renderPlayers(); 
  
  const btn = document.createElement('button');
  btn.innerText = "확인";
  btn.onclick = () => { _('cardModal').style.display = 'none'; endTurn(); };
  acts.appendChild(btn);
  
  if(G.ai && G.active===1) setTimeout(()=>btn.click(), 1500);
}

// --- 유틸리티 및 아이템 사용 ---

function moveBack(p){ 
    p.x = p.prevIdx%5; p.y = Math.floor(p.prevIdx/5); 
    log("이전 칸으로 밀려났습니다."); 
    renderBoard(); 
}
function moveStart(p){ 
    p.x = 2; p.y = 2; 
    log("START 지점으로 이동당했습니다."); 
    renderBoard(); 
}

function openInventory(){
  const p = G.players[G.active];
  const list = _('invList');
  list.innerHTML = '';
  if(p.inv.length === 0) list.innerHTML = "<span style='color:#777; font-size:12px;'>비어있음</span>";
  
  p.inv.forEach((item, idx) => {
    const el = document.createElement('div');
    el.className = 'inv-item';
    el.innerHTML = `<b>${item.name}</b><br><span style="font-size:10px">${item.desc}</span>`;
    el.onclick = () => useItem(idx);
    list.appendChild(el);
  });
  _('inventoryModal').style.display = 'flex';
}

function useItem(idx){
  const p = G.players[G.active];
  const item = p.inv[idx];
  
  if(item.id === 'reroll_plus') {
      if(G.rolls <= 0) { alert("굴림 기회가 없을 땐 사용할 수 없습니다."); return; }
      G.rolls++; 
      log("모래시계: 굴림 횟수 +1");
  } 
  else if(item.id === 'reroll_one') {
      if(G.rolls <= 0) { alert("굴림 기회가 필요합니다."); return; }
      G.rolls++; 
      log("요정의 가루: 주사위 다시 굴리기 기회 추가");
  }
  else if(item.id === 'fix_three') {
      if(G.rolls < 3) { alert("턴 시작 전에만 사용 가능합니다."); return; }
      G.fixDiceMode = true;
      log("수정구: 다음 굴림 시 주사위 3개가 고정됩니다.");
  }
  else if(item.id === 'change_one') {
      if(G.rolls > 0) { alert("주사위를 모두 확정한 후(Hold) 사용하세요."); return; }
      G.changeDiceMode = true;
      log("트릭스터: 주사위 1개를 클릭하여 눈을 변경하세요.");
      _('inventoryModal').style.display = 'none';
      p.inv.splice(idx, 1); 
      updateUI();
      return; 
  }
  else if(item.id === 'antidote') {
      if(!p.poison) { alert("중독 상태가 아닙니다."); return; }
      p.poison = false; 
      log("해독제: 중독이 치료되었습니다!");
  }
  else if(item.id === 'cobra') {
       const targets = G.players.filter(pl => pl.id !== p.id && !pl.escaped);
       if(targets.length > 0){ 
           const target = targets[0]; 
           target.poison = true; 
           log(`${target.name}에게 코브라 독을 썼습니다!`); 
       }
  }
  
  p.inv.splice(idx, 1);
  _('inventoryModal').style.display = 'none';
  updateUI(); renderPlayers();
}

function handleDieClick(index, element){
    const p = G.players[G.active];
    
    if(G.changeDiceMode) {
        G.dice[index] = (G.dice[index] % 6) + 1;
        element.innerText = G.dice[index];
        G.changeDiceMode = false; 
        log("주사위 눈을 변경했습니다.");
        renderDice();
        return;
    }

    if(G.phase !== 'roll' || p.blind || G.rolls >= 3) return;
    G.held[index] = !G.held[index];
    element.className = `die ${G.held[index]?'held':''}`;
    
    // [신규] 주사위 홀드 시 코치 업데이트
    updateCoach();
}

// --- 시스템 및 렌더링 ---

function nextTurn(){
  const nextId = (G.active + 1) % G.players.length;
  if(nextId === 0) { 
      G.round++; 
      _('roundDisp').innerText = `R ${G.round} / ${CONST.MAX_ROUNDS}`; 
  }
  startTurn(nextId);
}

function endTurn(){ 
  G.held.fill(false); 
  nextTurn(); 
}

function endGame(){
  const sorted = [...G.players].sort((a,b)=>{
      if(a.escaped !== b.escaped) return a.escaped ? -1 : 1; 
      return b.score - a.score; 
  });
  
  G.winner = sorted[0].id;
  let msg = "<b>[게임 종료]</b><br>";
  sorted.forEach((p,i)=> {
      const status = p.escaped ? "(탈출)" : "(실패)";
      const winTag = (i===0) ? "👑WIN" : "";
      msg += `${i+1}위: ${p.name} ${status} - ${p.score}점 ${winTag}<br>`;
  });
  
  _('gameLog').innerHTML = msg;
  _('statusIndicator').innerText = "게임 종료";
  _('turnIndicator').innerText = "결과 발표";
  _('btnRoll').disabled = true; _('btnAction').disabled = true;
  _('btnEnd').innerText = "재시작"; _('btnEnd').disabled = false;
  _('btnEnd').onclick = ()=>location.reload();
  
  renderPlayers(); 
}

function checkWinCondition(){ 
    if(G.players.every(p => p.escaped || p.failed)) endGame();
    else nextTurn();
}

function aiPlay(){
  if(G.active !== 1) return; 
  const p = G.players[1];

  if(G.phase === 'roll'){
    if(p.blind || p.poison){ 
        if(G.rolls > 0) {
            rollDice(); 
        } else {
            if(G.active === 1) endTurn(); 
        }
        return; 
    }
    
    const moves = getValidMoves(p.x, p.y);
    
    if(moves.length > 0){
      confirmAction(); 
      setTimeout(aiPlay, 1000);
    } else {
      if(G.rolls > 0) {
          rollDice(); 
      } else {
          endTurn(); 
      }
    }
  } else if(G.phase === 'move'){
    const moves = getValidMoves(p.x, p.y);
    if(moves.length > 0) movePlayer(moves[rand(moves.length)]);
    else endTurn();
  }
}

// [수정] 타일 이름 한글화 함수
function getTileTexts(cat) {
  switch(cat){
    case 'start': return {t:'START', s:''};
    case 'yacht': return {t:'요트', s:'아이템'}; 
    case 'chance': return {t:'찬스카드', s:'카드'}; // Chance -> 찬스카드
    case 'threeKind': return {t:'트리플', s:''};    // 3Kind -> 트리플
    case 'fourKind': return {t:'포카드', s:'액션'}; // 4Kind -> 포카드
    case 'fullHouse': return {t:'풀하우스', s:'액션'};
    case 'smallStr': return {t:'4연속 숫자', s:'액션'}; // smallStr -> 4연속 숫자
    case 'largeStr': return {t:'5연속 숫자', s:'액션'}; // largeStr -> 5연속 숫자
    case 'sum25': return {t:'합 25↑', s:'액션'};
    case 'sum7': return {t:'합 7↓', s:'액션'};
    case 'sum8': return {t:'합 8↓', s:'액션'}; // 찬스 카드용 조건 등
    case 'sum15': return {t:'합 15', s:''}; // EXIT 타일용
    case 'sum15_18': return {t:'합 15~18', s:''};
    case 'allEven': return {t:'모두 짝수', s:'액션'};
    case 'allOdd': return {t:'모두 홀수', s:'액션'};
    case 'trapLow': return {t:'주사위 1,2', s:''};
    case 'trapMid': return {t:'주사위 3,4', s:''};
    case 'trapHigh': return {t:'주사위 5,6', s:''};
    default: return {t: formatReq(cat), s: ''};
  }
}

// [신규] 마우스 오버 시 보여줄 툴팁 텍스트 생성 함수
function getTileTooltip(cat) {
  switch(cat){
    case 'start': return "시작 지점입니다.";
    case 'yacht': return "조건: 같은 숫자 5개\n효과: 아이템 카드 획득";
    case 'chance': return "조건: 일반 이동 불가 시 강제 이동\n효과: 찬스 카드 1장 획득 (리롤 불가 굴림)";
    case 'threeKind': return "조건: 같은 숫자 3개 이상\n효과: 이동 완료 (추가 효과 없음)";
    case 'fourKind': return "조건: 같은 숫자 4개 이상\n효과: 액션 카드 1장 획득 (방어 굴림)";
    case 'fullHouse': return "조건: 같은 숫자 3개 + 2개\n효과: 액션 카드 1장 획득";
    case 'smallStr': return "조건: 연속된 숫자 4개 (예: 1-2-3-4)\n효과: 액션 카드 1장 획득";
    case 'largeStr': return "조건: 연속된 숫자 5개 (예: 2-3-4-5-6)\n효과: 액션 카드 1장 획득";
    case 'sum25': return "조건: 주사위 합 25 이상\n효과: 액션 카드 1장 획득";
    case 'sum7': return "조건: 주사위 합 7 이하\n효과: 액션 카드 1장 획득";
    case 'allEven': return "조건: 모든 주사위가 짝수\n효과: 액션 카드 1장 획득";
    case 'allOdd': return "조건: 모든 주사위가 홀수\n효과: 액션 카드 1장 획득";
    case 'sum15': return "조건: 주사위 합 정확히 15\n효과: 없음 (EXIT 전용)";
    case 'trapLow': return "조건: 1 또는 2 포함\n효과: 이동 완료";
    case 'trapMid': return "조건: 3 또는 4 포함\n효과: 이동 완료";
    case 'trapHigh': return "조건: 5 또는 6 포함\n효과: 이동 완료";
    default: return "조건: " + formatReq(cat);
  }
}

// [수정] renderBoard 함수 (커스텀 툴팁 적용)
function renderBoard(){
  const board = _('board');
  board.innerHTML = '';
  const p = G.players[G.active];
  const moves = (G.phase==='move') ? getValidMoves(p.x,p.y) : [];

  G.board.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = `tile ${t.cat === 'start' ? 'start' : ''} ${t.isExit ? 'exit' : ''}`;
    
    // [기존] el.title = getTileTooltip(t.cat); -> 제거 또는 유지(PC용 보조)
    // 모바일 겸용 커스텀 툴팁 추가
    const tooltipText = getTileTooltip(t.cat);
    
    // 툴팁 요소 생성
    const tt = document.createElement('div');
    tt.className = 'custom-tooltip';
    tt.innerText = (t.isExit ? "[탈출구] " : "") + tooltipText;
    el.appendChild(tt);

    // [이동 가능한 타일일 때] -> 클릭 시 이동
    if(moves.includes(i)) { 
        el.classList.add('movable'); 
        el.onclick = (e) => {
            e.stopPropagation(); // 툴팁 이벤트 전파 방지
            movePlayer(i);
        };
    } 
    // [이동 불가능한 타일일 때] -> 클릭 시 툴팁 토글
    else {
        el.onclick = (e) => {
            e.stopPropagation();
            // 다른 열린 툴팁 모두 닫기
            document.querySelectorAll('.custom-tooltip.show').forEach(t => {
                if(t !== tt) t.classList.remove('show');
            });
            // 현재 툴팁 토글
            tt.classList.toggle('show');
            
            // 2초 뒤 자동으로 닫기 (선택사항)
            if(tt.classList.contains('show')) {
                setTimeout(() => tt.classList.remove('show'), 2000);
            }
        };
    }

    let {t: title, s: sub} = getTileTexts(t.cat);
    if (t.isExit) { sub = title; title = 'EXIT'; }

    // 타일 내용물 (툴팁이 텍스트 위에 오지 않도록 순서 주의)
    const content = document.createElement('div');
    content.style.width = '100%';
    content.innerHTML = `<div class="tile-cat">${title}</div><div class="tile-sub">${sub}</div>`;
    el.appendChild(content);
    
    // 미플 렌더링 (기존 코드 유지)
    G.players.forEach(pl => {
      if(!pl.escaped && !pl.failed && (pl.y*5+pl.x) === i){
        const status = pl.blind ? 'off' : 'on';
        const imgSrc = `images/Meeple_${CONST.COLORS[pl.id]}_${status}.png`;
        const m = document.createElement('div');
        m.className = `meeple ${pl.poison?'poison':''}`;
        m.style.backgroundImage = `url('${imgSrc}')`;
        if(pl.id===0) m.style.left='5%';
        if(pl.id===1) m.style.right='5%';
        if(pl.id===2) {m.style.top='5%'; m.style.left='5%';}
        if(pl.id===3) {m.style.top='5%'; m.style.right='5%';}
        el.appendChild(m);
      }
    });
    board.appendChild(el);
  });
}

// [추가] 빈 공간 클릭 시 모든 툴팁 닫기 (UX 향상)
document.addEventListener('click', () => {
    document.querySelectorAll('.custom-tooltip.show').forEach(t => t.classList.remove('show'));
});

function renderDice(){
  const area = _('diceArea');
  area.innerHTML = '';
  G.dice.forEach((v,i)=>{
    const d = document.createElement('div');
    d.className = `die ${G.held[i]?'held':''}`;
    d.innerText = v; 
    d.onclick = () => handleDieClick(i, d);
    area.appendChild(d);
  });
}

function renderPlayers(){
  const list = _('playerList');
  list.innerHTML = '';
  G.players.forEach(p => {
    const row = document.createElement('div');
    row.className = `player-row ${p.id === G.active ? 'active' : ''}`;
    const status = p.blind ? 'off' : 'on';
    const imgSrc = `images/Meeple_${CONST.COLORS[p.id]}_${status}.png`;
    
    let nameHtml = `${p.name}`;
    if(G.winner === p.id) nameHtml += ` <span style="color:var(--gold)">WIN</span>`;
    if(p.poison) nameHtml += ` ☠️`;
    
    row.innerHTML = `<div style="display:flex;align-items:center"><span class="p-badge" style="background-image:url('${imgSrc}')"></span>${nameHtml}</div><div>${p.score}점</div>`;
    list.appendChild(row);
  });
}

function updateUI(){
  const p = G.players[G.active];
  if(G.winner !== null){ return; } 
  
  _('statusIndicator').innerText = `${p.name}`;
  _('turnIndicator').innerText = G.phase==='roll' ? `굴리기 (${G.rolls})` : "이동 선택";
  
  const hasRolled = G.rolls < G.maxRolls;
  
  _('btnRoll').disabled = (G.phase !== 'roll' || G.rolls <= 0);
  _('btnAction').disabled = p.blind || p.poison || !(G.phase === 'roll' && hasRolled);
  _('btnEnd').disabled = p.blind || p.poison || !( (G.phase === 'roll' && hasRolled) || G.phase === 'move' );
  
  _('btnAction').onclick = confirmAction;
  _('btnItem').disabled = (p.inv.length === 0) || (G.ai && G.active === 1);
  _('btnEnd').onclick = endTurn;
  
  if(G.ai && G.active === 1){
    _('btnRoll').disabled = true;
    _('btnAction').disabled = true;
    _('btnEnd').disabled = true;
    _('btnItem').disabled = true;
  }

  // [신규] 코치 업데이트
  updateCoach();
}

function log(msg){
  const box = _('gameLog');
  box.innerHTML += `<div class="log-entry">${msg}</div>`;
  box.scrollTop = box.scrollHeight;
}

function playBGM() {
  if (bgmAudio.src && bgmAudio.paused && bgmAudio.currentTime > 0) {
      bgmAudio.play().catch(e => console.log(e));
      return;
  }
  if (!bgmAudio.src || bgmAudio.src === '') {
      bgmAudio.src = BGM_PLAYLIST[bgmIndex];
      bgmAudio.volume = parseFloat(_('bgmVolume').value);
  }
  bgmAudio.play().catch(e => console.log("Auto-play blocked"));
  bgmAudio.onended = () => {
      bgmIndex = (bgmIndex + 1) % BGM_PLAYLIST.length;
      bgmAudio.src = BGM_PLAYLIST[bgmIndex];
      bgmAudio.play();
  };
}

// 룰북 모달 제어 함수
function openRules() { _('ruleModal').style.display = 'flex'; }
function closeRules() { _('ruleModal').style.display = 'none'; }

// Event Listeners
_('btnStartGame').addEventListener('click', initGame);
_('btnItem').addEventListener('click', openInventory);
_('btnCloseInv').addEventListener('click', ()=>_('inventoryModal').style.display='none');
_('btnRoll').addEventListener('click', rollDice);
_('btnRestartMain').addEventListener('click', ()=>confirm("재시작?")&&location.reload());
_('btnBgmPlay').addEventListener('click', playBGM);
_('btnBgmPause').addEventListener('click', ()=>bgmAudio.pause());
_('bgmVolume').addEventListener('input', function(){ bgmAudio.volume=this.value; });

_('btnEnterDungeon').addEventListener('click', enterDungeon);
_('btnSkipStory').addEventListener('click', enterDungeon);
_('btnHeaderRules').addEventListener('click', openRules);      
_('btnCloseRulesTop').addEventListener('click', closeRules);   
_('btnCloseRulesBottom').addEventListener('click', closeRules);

// [신규] 코치 닫기/켜기 버튼
_('btnCloseCoach').addEventListener('click', () => {
    G.guideMode = false;
    _('gameCoach').classList.add('hidden');
    _('btnHelpToggle').style.display = 'inline-block';
});
_('btnHelpToggle').addEventListener('click', () => {
    G.guideMode = true;
    _('gameCoach').classList.remove('hidden');
    _('btnHelpToggle').style.display = 'none';
    updateCoach();
});