/**
 * Dungeon Dice Main Logic
 * PDF Rule Implementation - Intro Music Patch
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
  lastStandCount: 0 
};

// 오디오 객체
let bgmAudio = new Audio();
let bgmIndex = 0;

// [신규] 인트로 음악 객체 생성
let introAudio = new Audio('music/GameIntro.mp3');
introAudio.loop = true; // 반복 재생 설정
introAudio.volume = 0.6; // 적절한 기본 볼륨

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
  
  // [신규] 인트로 음악 재생 (사용자 인터랙션 직후라 재생 가능)
  introAudio.play().catch(e => console.log("인트로 음악 재생 실패:", e));
}

// [수정] 던전 입장 (게임 시작)
function enterDungeon() {
  // [신규] 인트로 음악 정지
  introAudio.pause();
  introAudio.currentTime = 0;

  _('storyModal').style.display = 'none';
  
  renderBoard();
  renderPlayers();
  
  _('gameLog').innerHTML = '';
  _('roundDisp').innerText = `R 1 / ${CONST.MAX_ROUNDS}`;
  log(`게임 시작! 두건을 해제하세요 (합 ${CONST.BLINDFOLD_REQ}↑)`);
  
  startTurn(0);
  
  // 메인 BGM 재생
  playBGM();
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
  updateUI();
  
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
    updateUI();
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
    updateUI();
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

// Helper: Tile Texts
function getTileTexts(cat) {
  switch(cat){
    case 'start': return {t:'START', s:''};
    case 'yacht': return {t:'요트', s:'아이템'}; 
    case 'chance': return {t:'Chance', s:'카드'};
    default: return {t: formatReq(cat), s: ''};
  }
}

function renderBoard(){
  const board = _('board');
  board.innerHTML = '';
  const p = G.players[G.active];
  const moves = (G.phase==='move') ? getValidMoves(p.x,p.y) : [];

  G.board.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = `tile ${t.cat === 'start' ? 'start' : ''} ${t.isExit ? 'exit' : ''}`;
    if(moves.includes(i)) { el.classList.add('movable'); el.onclick = () => movePlayer(i); }

    let {t: title, s: sub} = getTileTexts(t.cat);
    if (t.isExit) { sub = title; title = 'EXIT'; }

    el.innerHTML = `<div class="tile-cat">${title}</div><div class="tile-sub">${sub}</div>`;
    
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

// [신규] 룰북 모달 제어 함수
function openRules() { _('ruleModal').style.display = 'flex'; }
function closeRules() { _('ruleModal').style.display = 'none'; }

// Event Listeners
// _('btnHeaderRules').addEventListener('click', ()=>alert(`[규칙]\n1. 합 ${CONST.BLINDFOLD_REQ} 이상 두건 해제\n2. 족보에 맞춰 이동 (일반 우선)\n3. 매칭 없을 시 찬스 이동 (강제)\n4. EXIT 도착 시 +2점`));
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
_('btnHeaderRules').addEventListener('click', openRules);      // 헤더 '룰북' 버튼
_('btnCloseRulesTop').addEventListener('click', closeRules);   // 모달 상단 X 버튼
_('btnCloseRulesBottom').addEventListener('click', closeRules);// 모달 하단 닫기 버튼