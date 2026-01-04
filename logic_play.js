/**
 * Dungeon Dice - Play Logic Module
 * 이동 규칙, 타일 이벤트, 카드 처리, 아이템 사용을 담당합니다.
 */
import { CONST, EXIT_POOL, DECK_ACTION_DEF, DECK_CHANCE_DEF, DECK_ITEM_DEF } from './data.js';
import { _, rand, checkMatch, formatReq, buildDecks } from './utils.js';
import { G } from './state.js';
import { renderBoard, renderPlayers, updateUI, log, showCardModal, renderDice } from './ui.js';

// --- 이동 로직 ---

export function getValidMoves(cx, cy){
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

export function confirmAction(){
  const p = G.players[G.active];
  if(p.blind || p.poison) { return; } 
  
  const moves = getValidMoves(p.x, p.y);
  if(moves.length === 0){
    log("이동 가능한 타일이 없어 턴을 종료합니다.");
    if(G.callbacks.endTurn) G.callbacks.endTurn(); 
  } else {
    G.phase = 'move';
    log("이동할 타일을 선택하세요.");
    renderBoard(); 
    updateUI(); 
  }
}

export function movePlayer(idx){
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

export function handleTileEvent(idx){
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

    if(G.callbacks.checkWinCondition) G.callbacks.checkWinCondition(); 
    return;
  }
  
  const cat = tile.cat;
  
  if(cat === 'yacht') { drawCard('item'); return; }
  if(cat === 'chance') { drawCard('chance'); return; }
  
  const actionTiles = ['fourKind','fullHouse','smallStr','largeStr','sum25','sum7','sum15Exact','allEven','allOdd'];
  if(actionTiles.includes(cat)) { drawCard('action'); return; }
  
  if(G.callbacks.endTurn) G.callbacks.endTurn();
}

export function drawCard(type){
  let deck = G.decks[type];
  if(deck.length === 0) { 
      if(type==='action') G.decks.action = buildDecks(DECK_ACTION_DEF);
      if(type==='chance') G.decks.chance = buildDecks(DECK_CHANCE_DEF);
      if(type==='item') G.decks.item = buildDecks(DECK_ITEM_DEF);
      deck = G.decks[type]; 
  }
  const card = deck.pop();
  G.pendingCard = { ...card, type: type }; 
  showCardModal(card, type, resolveCardRoll);
}

export function resolveCardRoll(card, type){
  const roll = [rand(6)+1, rand(6)+1, rand(6)+1, rand(6)+1, rand(6)+1];
  const success = checkMatch(card.req, roll);
  
  // [수정] 결과 주사위 시각화 (HTML 생성)
  // flex: none과 min-width를 추가하여 크기가 30px로 고정되도록 설정
  let diceHTML = '<div style="display:flex; gap:5px; justify-content:center; margin:10px 0;">';
  roll.forEach(val => {
      diceHTML += `<div class="die" style="width:30px; height:30px; min-width:30px; font-size:16px; line-height:30px; flex:none;">${val}</div>`;
  });
  diceHTML += '</div>';

  _('cardResult').innerHTML = `${diceHTML}<div style="margin-top:5px;">▼<br><b style="font-size:16px; color:${success?'#51cf66':'#ff6b6b'}">${success?'성공!':'실패...'}</b></div>`;
  
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
  btn.onclick = () => { 
      _('cardModal').style.display = 'none'; 
      if(G.callbacks.endTurn) G.callbacks.endTurn(); 
  };
  acts.appendChild(btn);
  
  // AI 플레이어 자동 확인
  if(p.isAI) setTimeout(()=>btn.click(), 1500);
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

export function openInventory(){
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

export function useItem(idx){
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