/**
 * Dungeon Dice Game Logic
 * Ver. Fixed + Custom Exit Rules + BGM Fixed
 */

// --- Constants & Config ---
const PLAYER_COLORS = ['Red', 'Blue', 'Yellow', 'Black'];
const MAX_ROUNDS = 13;
const BLINDFOLD_REQ = 15;

// 타일 정의
const MAP_TILES = [
  {cat:'threeKind', count:6}, {cat:'chance', count:2},
  {cat:'trapLow', count:1}, {cat:'trapMid', count:1}, {cat:'trapHigh', count:2},
  {cat:'fourKind', count:2}, {cat:'fullHouse', count:2},
  {cat:'smallStr', count:1}, {cat:'largeStr', count:1},
  {cat:'sum25', count:1}, {cat:'sum7', count:1}, {cat:'yacht', count:1}
];

const EXIT_POOL = ['allEven', 'allOdd', 'sum15Exact', 'fullHouse', 'largeStr', 'yacht'];

// --- BGM Global Variables ---
// 파일 경로가 정확한지 반드시 확인하세요 (대소문자 구분함)
const BGM_PLAYLIST = ['music/GameOST_001.mp3', 'music/GameOST_002.mp3'];
let bgmAudio = new Audio();
let bgmIndex = 0;
let bgmPlaying = false;

// 카드 덱 정의
const DECK_ACTION = [
  {name:"숨겨진 금괴", count:5, type:'action', req:'sum15', win:'+1점', lose:'없음', effect:(p,s)=>{ if(s) p.score++; }},
  {name:"던전 슬라임", count:4, type:'action', req:'threeKind', win:'+1점', lose:'후퇴', effect:(p,s)=>{ if(s) p.score++; else moveBack(p); }},
  {name:"미믹", count:4, type:'action', req:'sum15', win:'+1점', lose:'후퇴', effect:(p,s)=>{ if(s) p.score++; else moveBack(p); }},
  {name:"함정 카드", count:4, type:'action', req:'threeKind', win:'회피', lose:'-2점', effect:(p,s)=>{ if(!s) p.score-=2; }},
  {name:"흡혈 박쥐", count:2, type:'action', req:'fourKind', win:'+2점', lose:'후퇴', effect:(p,s)=>{ if(s) p.score+=2; else moveBack(p); }},
  {name:"화난 고블린", count:2, type:'action', req:'sum25', win:'+2점', lose:'-2점', effect:(p,s)=>{ if(s) p.score+=2; else p.score-=2; }},
  {name:"해골 병사", count:2, type:'action', req:'sum25', win:'+2점', lose:'-4점', effect:(p,s)=>{ if(s) p.score+=2; else p.score-=4; }},
  {name:"킹 코브라", count:1, type:'item', req:'sum7', win:'획득', lose:'시작점', effect:null}
];

const DECK_CHANCE = [
  {name:"안전한 길", count:6, req:'sum15_18', win:'+1점', lose:'없음', effect:(p,s)=>{ if(s) p.score++; }},
  {name:"강력한 한 방", count:4, req:'sum20', win:'+1점', lose:'-1점', effect:(p,s)=>{ if(s) p.score++; else p.score--; }},
  {name:"바늘 구멍", count:2, req:'sum8', win:'+1점', lose:'-2점', effect:(p,s)=>{ if(s) p.score++; else p.score-=2; }},
  {name:"짝수의 축복", count:2, req:'allEven', win:'+2점', lose:'시작점', effect:(p,s)=>{ if(s) p.score+=2; else moveStart(p); }},
  {name:"홀수의 축복", count:2, req:'allOdd', win:'+2점', lose:'시작점', effect:(p,s)=>{ if(s) p.score+=2; else moveStart(p); }},
  {name:"거인족의 힘", count:2, req:'all4Up', win:'+2점', lose:'시작점', effect:(p,s)=>{ if(s) p.score+=2; else moveStart(p); }},
  {name:"소인국의 덫", count:2, req:'all3Down', win:'+2점', lose:'시작점', effect:(p,s)=>{ if(s) p.score+=2; else moveStart(p); }}
];

const DECK_ITEM = [
  {name:"시간의 모래시계", count:2, desc:"기회 소진 시 전체 재굴림 (보유)", id:"reroll_all"},
  {name:"요정의 가루", count:2, desc:"주사위 1개 재굴림 (보유)", id:"reroll_one"},
  {name:"트릭스터의 장갑", count:2, desc:"주사위 1개 눈 변경 (보유)", id:"change_one"},
  {name:"신비한 해독제", count:2, desc:"중독 상태 즉시 치료 (보유)", id:"antidote"},
  {name:"예언자의 수정구", count:2, desc:"주사위 3개 고정 후 시작 (보유)", id:"fix_three"}
];

let G = {
  players: [], active: 0, round: 1, phase: 'setup', 
  board: [], decks: {action:[], chance:[], item:[]},
  dice: [1,1,1,1,1], held: [false,false,false,false,false], rolls: 3,
  ai: false, winner: null
};

const _ = (id) => document.getElementById(id);
const rand = (n) => Math.floor(Math.random()*n);

function buildDecks(){
  const expand = (def) => {
    let arr = [];
    def.forEach(c => { for(let i=0; i<c.count; i++) arr.push({...c}); });
    return arr.sort(()=>Math.random()-0.5);
  };
  G.decks.action = expand(DECK_ACTION);
  G.decks.chance = expand(DECK_CHANCE);
  G.decks.item = expand(DECK_ITEM);
}

function initGame(){
  const pc = document.querySelector('input[name="pCount"]:checked').value;
  G.ai = _('aiMode').checked;
  const pCount = parseInt(pc);
  
  G.players = [];
  G.winner = null;
  G.round = 1;
  
  for(let i=0; i<pCount; i++){
    G.players.push({
      id:i, name: (G.ai && i===1)? "AI Bot" : `Player ${i+1}`,
      x:2, y:2, prevIdx:12,
      score:0, inv:[], blind:true, poison:false, escaped:false, failed:false
    });
  }

  let tiles = [];
  MAP_TILES.forEach(t => { for(let i=0; i<t.count; i++) tiles.push(t.cat); });
  tiles.sort(()=>Math.random()-0.5);

  G.board = new Array(25).fill(null);
  const center = 12;
  const corners = [0,4,20,24];
  
  G.board[center] = {cat:'start', isExit:false};
  corners.forEach(idx => {
    const cat = EXIT_POOL[rand(EXIT_POOL.length)];
    G.board[idx] = {cat:cat, isExit:true};
  });
  
  let tIdx = 0;
  for(let i=0; i<25; i++){
    if(!G.board[i]) G.board[i] = {cat:tiles[tIdx++], isExit:false};
  }

  buildDecks();
  renderBoard();
  renderPlayers();
  
  _('setupModal').style.display = 'none';
  _('gameLog').innerHTML = '';
  _('roundDisp').innerText = `Round 1 / ${MAX_ROUNDS}`;
  log(`게임이 시작되었습니다. (두건 해제 조건: 합 ${BLINDFOLD_REQ} 이상)`);
  
  startTurn(0);
  
  // BGM 자동 재생 시도
  playBGM();
}

function startTurn(pid){
  G.active = pid;
  const p = G.players[pid];
  
  if(G.round > MAX_ROUNDS) { endGame(); return; }
  if(p.escaped || p.failed) { nextTurn(); return; }

  G.phase = 'roll';
  G.rolls = 3;
  G.dice = [1,1,1,1,1];
  G.held.fill(false);
  
  renderDice(); 
  renderBoard(); 
  renderPlayers(); 
  updateUI();
  
  if(p.poison){
    log(`${p.name}: ☠️독에 중독되었습니다! 4 of a Kind가 나와야 해독됩니다.`);
  } else if(p.blind){
    G.rolls = 1; 
    log(`${p.name}: 🕶️앞이 보이지 않습니다. 주사위 합 ${BLINDFOLD_REQ} 이상 필요!`);
  } else {
    log(`${p.name}의 턴.`);
    if(G.board[p.y*5+p.x].cat === 'start'){
       log("Hint: 이동 가능한 타일 족보를 확인하세요.");
    }
  }

  if(G.ai && p.id === 1) setTimeout(aiPlay, 1000);
}

function rollDice(){
  if(G.rolls <= 0) return;
  
  const dies = document.querySelectorAll('.die');
  dies.forEach((d,i)=>{ if(!G.held[i]) d.classList.add('rolling'); });
  
  setTimeout(()=>{
    for(let i=0; i<5; i++){
      if(!G.held[i]) G.dice[i] = rand(6)+1;
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
        _('rollInfo').innerText = `결과: [${G.dice.join(',')}] 합: ${sum} (목표: ${BLINDFOLD_REQ})`;
    }
    
    if(G.ai && G.active===1 && G.rolls>0) setTimeout(aiPlay, 800);
  }, 500);
}

function checkStatusEffects(){
  const p = G.players[G.active];
  const sum = G.dice.reduce((a,b)=>a+b,0);
  const match4 = checkMatch('fourKind', G.dice);
  
  if(p.blind){
    if(sum >= BLINDFOLD_REQ){
      p.blind = false;
      log(`<span style="color:${varColor('green')}">두건 해제 성공! (합 ${sum})</span>`);
      
      G.rolls = 3; 
      G.dice = [1,1,1,1,1];
      G.held.fill(false);
      G.phase = 'roll';
      
      renderDice();
      renderBoard(); 
      renderPlayers(); 
      updateUI(); 
      
      log("주사위가 초기화되었습니다. 이동을 위해 굴리세요!");
    } else if(G.rolls === 0){
      log(`해제 실패... (합 ${sum})`);
      endTurn();
    }
  } else if(p.poison){
    if(match4){
      p.poison = false;
      log(`<span style="color:${varColor('green')}">해독 성공!</span>`);
      updateUI();
      renderPlayers(); 
    } else if(G.rolls === 0){
      log(`해독 실패... 턴 종료.`);
      endTurn();
    }
  }
}

function confirmAction(){
  const p = G.players[G.active];
  if(p.blind || p.poison) { return; } 
  
  const moves = getValidMoves(p.x, p.y);
  if(moves.length === 0){
    log("이동 가능한 타일이 없습니다.");
    endTurn(); 
  } else {
    G.phase = 'move';
    log("이동할 타일을 선택하세요.");
    renderBoard();
    updateUI();
  }
}

function getValidMoves(cx, cy){
  if (G.rolls === 3) return []; // 굴림 강제

  const moves = [];
  const neighbors = [[0,-1],[0,1],[-1,0],[1,0]]; 
  
  neighbors.forEach(([dx,dy])=>{
    const nx = cx+dx, ny = cy+dy;
    if(nx<0||nx>4||ny<0||ny>4) return;
    const idx = ny*5 + nx;
    
    const activePlayers = G.players.filter(p=>!p.escaped && !p.failed);
    const occupants = activePlayers.filter(p=>p.x===nx && p.y===ny).length;
    const limit = (G.players.length === 2) ? 1 : 2;
    if(occupants >= limit) return;

    const tile = G.board[idx];
    if(checkMatch(tile.cat, G.dice)) moves.push(idx);
  });
  return moves;
}

function movePlayer(idx){
  if(G.phase !== 'move') return;
  const p = G.players[G.active];
  const moves = getValidMoves(p.x, p.y);
  if(!moves.includes(idx)) return;
  
  p.prevIdx = p.y*5 + p.x;
  p.x = idx%5; 
  p.y = Math.floor(idx/5);
  
  renderBoard(); 
  handleTileEvent(idx);
}

function handleTileEvent(idx){
  const tile = G.board[idx];
  const p = G.players[G.active];

  if(tile.isExit){
    p.escaped = true;
    p.score += 5;
    log(`🎉 <b>${p.name} 탈출 성공!</b> (+5점)`);
    checkWinCondition(); 
    return;
  }

  if(['fourKind','fullHouse','smallStr','largeStr','sum25','sum7','sum15Exact','allEven','allOdd'].includes(tile.cat)){
    drawCard('action');
  } else if(tile.cat === 'yacht'){
    drawCard('item');
  } else if(tile.cat === 'chance'){
    drawCard('chance');
  } else {
    endTurn();
  }
}

function drawCard(type){
  let deck = G.decks[type];
  if(deck.length === 0) { buildDecks(); deck = G.decks[type]; }
  const card = deck.pop(); 
  showCardModal(card, type);
}

function showCardModal(card, type){
  const p = G.players[G.active];
  const modal = _('cardModal');
  const vis = _('cardVisual');
  const acts = _('cardActions');
  
  _('cardType').innerText = type.toUpperCase() + " CARD";
  _('cardName').innerText = card.name;
  
  vis.className = `card-visual card-${type}`;
  acts.innerHTML = '';
  _('cardResult').innerHTML = '';

  if(type === 'item'){
    _('cardDesc').innerHTML = `<br><b>${card.desc}</b>`;
    const btn = document.createElement('button');
    btn.className = 'primary';
    btn.innerText = "가져가기";
    btn.onclick = () => {
      p.inv.push(card);
      log(`${p.name}: ${card.name} 획득.`);
      modal.style.display = 'none';
      endTurn();
    };
    acts.appendChild(btn);
  } else {
    _('cardDesc').innerHTML = `조건: ${formatReq(card.req)}<br>성공: ${card.win} / 실패: ${card.lose}`;
    const btn = document.createElement('button');
    btn.className = 'action';
    btn.innerText = "판정 굴림 (1회)";
    btn.onclick = () => {
      resolveCard(card);
    };
    acts.appendChild(btn);
  }
  
  modal.style.display = 'flex';
  
  if(G.ai && G.active === 1){
    setTimeout(()=>{
       if(acts.firstChild) acts.firstChild.click();
    }, 1500);
  }
}

function resolveCard(card){
  const roll = [rand(6)+1, rand(6)+1, rand(6)+1, rand(6)+1, rand(6)+1];
  const success = checkMatch(card.req, roll);
  
  const resDiv = _('cardResult');
  resDiv.innerHTML = `결과: [${roll.join(', ')}] -> <b style="color:${success?'#4f4':'#f44'}">${success?'성공':'실패'}</b>`;
  
  const p = G.players[G.active];
  
  if(card.name === "킹 코브라"){
    if(success){
       p.inv.push({name:"킹 코브라", id:"cobra", desc:"사용 시 상대방 중독"});
       log("킹 코브라 포획 성공!");
    } else {
       moveStart(p);
    }
  } else {
    card.effect(p, success);
    log(`${card.name} 결과: ${success ? card.win : card.lose}`);
  }
  
  renderPlayers(); 

  const acts = _('cardActions');
  acts.innerHTML = '';
  const btn = document.createElement('button');
  btn.innerText = "확인";
  btn.onclick = () => {
    _('cardModal').style.display = 'none';
    endTurn(); 
  };
  acts.appendChild(btn);
  
  if(G.ai && G.active===1) setTimeout(()=>btn.click(), 1500);
}

function moveBack(p){
  p.x = p.prevIdx%5; 
  p.y = Math.floor(p.prevIdx/5);
  log(`${p.name}: 이전 칸으로 후퇴.`);
  renderBoard();
}
function moveStart(p){
  p.x = 2; p.y = 2;
  log(`${p.name}: 시작 지점으로 강제 이동.`);
  renderBoard();
}

function openInventory(){
  const p = G.players[G.active];
  const list = _('invList');
  list.innerHTML = '';
  if(p.inv.length === 0) list.innerHTML = "인벤토리가 비어있습니다.";
  
  p.inv.forEach((item, idx) => {
    const el = document.createElement('span');
    el.className = 'inv-item';
    el.innerText = item.name;
    el.onclick = () => useItem(idx);
    list.appendChild(el);
  });
  _('inventoryModal').style.display = 'flex';
}

function useItem(idx){
  const p = G.players[G.active];
  const item = p.inv[idx];
  
  if(item.id === 'reroll_all'){
    G.rolls = 5; 
    log("시간의 모래시계 사용! 굴림 기회 초기화.");
  } else if(item.id === 'reroll_one'){
    G.rolls++;
    log("요정의 가루 사용! 굴림 기회 +1.");
  } else if(item.id === 'antidote'){
    if(p.poison) { p.poison = false; log("해독제 사용! 중독 해제."); }
    else { alert("중독 상태가 아닙니다."); return; }
  } else if(item.id === 'cobra'){
    const targets = G.players.filter(pl => pl.id !== p.id && !pl.escaped);
    if(targets.length > 0){
      const t = targets[0]; 
      t.poison = true;
      log(`킹 코브라 사용! ${t.name}을(를) 중독시켰습니다.`);
    }
  }
  
  p.inv.splice(idx, 1);
  _('inventoryModal').style.display = 'none';
  updateUI();
  renderPlayers();
}

function varColor(name){
  if(name==='green') return '#51cf66';
  return '#fff';
}

function checkMatch(req, dice){
  const counts = {};
  let sum = 0;
  let even=0, odd=0, up4=0, down3=0;
  dice.forEach(d=>{
    counts[d]=(counts[d]||0)+1; 
    sum+=d;
    if(d%2===0) even++; else odd++;
    if(d>=4) up4++;
    if(d<=3) down3++;
  });
  const vals = Object.values(counts);
  const max = Math.max(...vals);
  
  const u = [...new Set(dice)].sort().join('');

  switch(req){
    case 'chance': return true;
    case 'threeKind': return max>=3;
    case 'fourKind': return max>=4;
    case 'fullHouse': return (vals.includes(3)&&vals.includes(2)) || max===5; 
    case 'yacht': return max===5;
    case 'smallStr': return u.includes('1234')||u.includes('2345')||u.includes('3456');
    case 'largeStr': return u.includes('12345')||u.includes('23456');
    case 'sum25': return sum>=25;
    case 'sum7': return sum<=7;
    case 'sum15Exact': return sum===15;
    case 'trapLow': return counts[1]||counts[2];
    case 'trapMid': return counts[3]||counts[4];
    case 'trapHigh': return counts[5]||counts[6];
    case 'sum15': return sum>=15;
    case 'sum15_18': return sum>=15 && sum<=18;
    case 'sum20': return sum>=20;
    case 'sum8': return sum<=8;
    case 'allEven': return even===5;
    case 'allOdd': return odd===5;
    case 'all4Up': return up4===5;
    case 'all3Down': return down3===5;
    default: return false; 
  }
}

function formatReq(req){
  const map = {
    threeKind:'같은 눈 3개', fourKind:'같은 눈 4개', sum15:'합 15↑', 
    sum20:'합 20↑', allEven:'모두 짝수', allOdd:'모두 홀수', sum15Exact:'합 정확히 15'
  };
  return map[req] || req;
}

function nextTurn(){
  const nextId = (G.active + 1) % G.players.length;
  if(nextId === 0) {
    G.round++;
    _('roundDisp').innerText = `Round ${G.round} / ${MAX_ROUNDS}`;
  }
  startTurn(nextId);
}

function endTurn(){
  G.held.fill(false);
  nextTurn();
}

function endGame(){
  const sorted = [...G.players].sort((a,b)=>b.score - a.score);
  const winner = sorted[0];
  G.winner = winner.id;
  
  let msg = "<b>게임 종료</b><br>";
  sorted.forEach((p,i)=> msg += `${i+1}위: ${p.name} (${p.score}점)<br>`);
  _('gameLog').innerHTML = msg;
  
  renderPlayers(); 
  updateUI(); 
}

function checkWinCondition(){
  const escaped = G.players.some(p => p.escaped); 
  if(escaped) endGame(); 
  else nextTurn();
}

function aiPlay(){
  if(G.phase === 'roll'){
    const p = G.players[1];
    if(p.blind){
       if(G.rolls > 0) rollDice();
       else endTurn(); 
       return;
    }

    const moves = getValidMoves(p.x, p.y);
    if(moves.length > 0){
      confirmAction(); 
      setTimeout(aiPlay, 1000);
    } else {
      if(G.rolls > 0) rollDice(); else endTurn();
    }
  } else if(G.phase === 'move'){
    const moves = getValidMoves(G.players[1].x, G.players[1].y);
    if(moves.length > 0){
      movePlayer(moves[rand(moves.length)]);
    } else endTurn();
  }
}

// --- UI Rendering ---

function renderBoard(){
  const board = _('board');
  board.innerHTML = '';
  
  const p = G.players[G.active];
  const moves = (G.phase==='move') ? getValidMoves(p.x,p.y) : [];

  G.board.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = `tile ${t.cat === 'start' ? 'start' : ''} ${t.isExit ? 'exit' : ''}`;
    if(moves.includes(i)) {
      el.classList.add('movable');
      el.onclick = () => movePlayer(i);
    }

    let mainText = "";
    let subText = ""; 

    let displayName = t.cat;
    if(t.cat==='threeKind') displayName='3 Kind';
    else if(t.cat==='fourKind') displayName='4 Kind';
    else if(t.cat==='fullHouse') displayName='Full House';
    else if(t.cat==='trapLow') displayName='주사위[1,2]';
    else if(t.cat==='trapMid') displayName='주사위[3,4]';
    else if(t.cat==='trapHigh') displayName='주사위[5,6]';
    else if(t.cat==='smallStr') displayName='S.Straight';
    else if(t.cat==='largeStr') displayName='L.Straight';
    else if(t.cat==='sum25') displayName='Sum 25↑';
    else if(t.cat==='sum7') displayName='Sum 7↓';
    else if(t.cat==='allEven') displayName='All Even';
    else if(t.cat==='allOdd') displayName='All Odd';
    else if(t.cat==='sum15Exact') displayName='Sum = 15';
    else if(t.cat==='yacht') displayName='Yacht';
    else if(t.cat==='chance') displayName='Chance';
    else if(t.cat==='start') displayName='START';

    if (t.isExit) {
        mainText = 'EXIT';
        subText = displayName; 
    } else {
        mainText = displayName;
        if(['fourKind','fullHouse','smallStr','largeStr','sum25','sum7','sum15Exact','allEven','allOdd'].includes(t.cat)) subText = "Action Card";
        else if(t.cat === 'yacht') subText = "Item Card";
        else if(t.cat === 'chance') subText = "Chance Card";
        else if(t.cat === 'start') subText = `합 ${BLINDFOLD_REQ}↑`;
    }

    el.innerHTML = `<div class="tile-cat">${mainText}</div>`;
    if(subText) el.innerHTML += `<div class="tile-sub">${subText}</div>`;
    
    G.players.forEach(pl => {
      if(!pl.escaped && !pl.failed && (pl.y*5+pl.x) === i){
        const m = document.createElement('div');
        const color = PLAYER_COLORS[pl.id];
        const status = pl.blind ? 'off' : 'on';
        const imgSrc = `images/Meeple_${color}_${status}.png`;
        m.className = `meeple ${pl.poison?'poison':''}`;
        m.style.backgroundImage = `url('${imgSrc}')`;
        if(pl.id===0) m.style.left='4px';
        if(pl.id===1) m.style.right='4px';
        if(pl.id===2) {m.style.top='4px'; m.style.left='4px';}
        if(pl.id===3) {m.style.top='4px'; m.style.right='4px';}
        el.appendChild(m);
      }
    });
    board.appendChild(el);
  });
}

function renderDice(){
  const area = _('diceArea');
  area.innerHTML = '';
  const p = G.players[G.active];
  
  G.dice.forEach((v,i)=>{
    const d = document.createElement('div');
    d.className = `die ${G.held[i]?'held':''}`;
    d.innerText = v;
    d.onclick = () => {
      if(G.phase !== 'roll') return;
      if(p.blind) return; 
      if(G.rolls >= 3) return;
      G.held[i] = !G.held[i];
      d.className = `die ${G.held[i]?'held':''}`;
    };
    area.appendChild(d);
  });
}

function renderPlayers(){
  const list = _('playerList');
  list.innerHTML = '';
  G.players.forEach(p => {
    const row = document.createElement('div');
    row.className = `player-row ${p.id === G.active ? 'active' : ''}`;
    const color = PLAYER_COLORS[p.id];
    const status = p.blind ? 'off' : 'on';
    const imgSrc = `images/Meeple_${color}_${status}.png`;
    let stateTxt = p.blind ? "두건" : (p.poison ? "중독" : "이동가능");
    if(p.escaped) stateTxt = "탈출";
    let winHtml = (G.winner === p.id) ? '<span class="win-text">WIN</span>' : '';
    row.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <div class="p-badge" style="background-image:url('${imgSrc}')"></div>
        ${p.name}${winHtml}
      </div>
      <div style="font-size:11px;">${stateTxt} | ${p.score}점</div>
    `;
    list.appendChild(row);
  });
}

function updateUI(){
  const p = G.players[G.active];
  if(G.winner !== null){
    _('statusIndicator').innerText = "게임 종료";
    _('turnIndicator').innerText = "결과 확인";
    _('btnRoll').disabled = true;
    _('btnAction').disabled = true;
    const btnEnd = _('btnEnd');
    btnEnd.innerText = "다시 시작하기";
    btnEnd.disabled = false;
    btnEnd.className = "restart"; 
    btnEnd.onclick = () => {
        if(confirm("게임을 다시 시작하시겠습니까?")) location.reload();
    };
    return;
  }
  const btnEnd = _('btnEnd');
  if(btnEnd.innerText !== "턴 종료") {
      btnEnd.innerText = "턴 종료";
      btnEnd.className = "";
      btnEnd.onclick = endTurn;
  }
  _('statusIndicator').innerText = `${p.name} 턴`;
  _('turnIndicator').innerText = G.phase==='roll' ? `주사위 굴리기 (남은 횟수: ${G.rolls})` : "이동 선택";
  const hasRolled = G.rolls < 3;
  const unlocked = !p.blind;
  _('btnRoll').disabled = (G.phase !== 'roll' || G.rolls <= 0);
  if (!unlocked) {
      _('btnAction').disabled = true;
      _('btnEnd').disabled = true;
  } else {
      _('btnAction').disabled = !(G.phase === 'roll' && hasRolled);
      _('btnEnd').disabled = !( (G.phase === 'roll' && hasRolled) || G.phase === 'move' );
  }
  _('btnAction').onclick = confirmAction;
  _('btnItem').disabled = (p.inv.length === 0);
  let hint = "";
  if(p.blind) hint = `두건을 벗으려면 주사위 합이 ${BLINDFOLD_REQ} 이상이어야 합니다.`;
  else if(p.poison) hint = "중독 상태! 4 Kind가 필요합니다.";
  _('rollInfo').innerText = hint;
}

function resetGame(){
    if(confirm("게임을 처음부터 다시 시작하시겠습니까?")) location.reload();
}

function log(msg){
  const box = _('gameLog');
  box.innerHTML += `<div class="log-entry">${msg}</div>`;
  box.scrollTop = box.scrollHeight;
}

function toggleRules(){
  alert(`
  [던전 다이스 규칙]
  1. 승리: 13라운드 내 탈출 후 고득점
  2. 두건: 시작 시 시야 차단. 주사위 합 ${BLINDFOLD_REQ} 이상으로 해제.
  3. 이동: 상하좌우. 타일 족보 만족 시 이동.
  4. EXIT: 모서리 4곳. 특정 족보(짝수/홀수/합15 등) 만족 시 탈출 (+5점).
  `);
}

// --- BGM Logic (Corrected) ---

function playBGM() {
  if (bgmAudio.src && bgmAudio.paused && bgmAudio.currentTime > 0) {
      bgmAudio.play().catch(e => console.log("BGM 재생 실패 (사용자 인터랙션 필요):", e));
      return;
  }
  if (!bgmAudio.src || bgmAudio.src === '') {
      bgmAudio.src = BGM_PLAYLIST[bgmIndex];
      bgmAudio.volume = parseFloat(_('bgmVolume').value);
      // 에러 핸들링: 파일 못 찾을 경우
      bgmAudio.onerror = () => {
          console.error(`BGM 파일을 찾을 수 없습니다: ${bgmAudio.src}`);
          log("⚠️ 배경음악 파일을 찾을 수 없습니다 (music 폴더 확인).");
      };
  }
  
  bgmAudio.play().catch(e => {
      console.log("자동 재생 정책에 의해 차단됨 (정상):", e);
  });
  bgmPlaying = true;
  
  bgmAudio.onended = () => {
      bgmIndex = (bgmIndex + 1) % BGM_PLAYLIST.length;
      bgmAudio.src = BGM_PLAYLIST[bgmIndex];
      bgmAudio.play();
  };
}

function pauseBGM() {
  bgmAudio.pause();
  bgmPlaying = false;
}

function stopBGM() {
  bgmAudio.pause();
  bgmAudio.currentTime = 0; 
  bgmPlaying = false;
}

function setVolume() {
  const vol = this.value; 
  bgmAudio.volume = vol;
  _('volLabel').innerText = Math.round(vol * 100) + '%';
}

// --- Initialization Events ---
_('btnHeaderRules').addEventListener('click', toggleRules);
_('btnStartGame').addEventListener('click', initGame);
_('btnItem').addEventListener('click', openInventory);
_('btnCloseInv').addEventListener('click', ()=>_('inventoryModal').style.display='none');
_('btnRoll').addEventListener('click', rollDice);
_('btnAction').addEventListener('click', confirmAction);
_('btnEnd').addEventListener('click', endTurn);
_('btnRestartMain').addEventListener('click', resetGame);

// BGM Listeners
_('btnBgmPlay').addEventListener('click', playBGM);
_('btnBgmPause').addEventListener('click', pauseBGM);
_('btnBgmStop').addEventListener('click', stopBGM);
_('bgmVolume').addEventListener('input', setVolume);