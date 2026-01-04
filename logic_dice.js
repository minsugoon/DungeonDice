/**
 * Dungeon Dice - Dice & AI Logic Module
 * 주사위 굴리기, 상태 이상 확인, AI 플레이 로직을 담당합니다.
 */
import { CONST } from './data.js';
import { _, rand, checkMatch } from './utils.js';
import { G } from './state.js';
import { renderDice, renderBoard, renderPlayers, updateUI, log } from './ui.js';
import { confirmAction, getValidMoves, movePlayer } from './logic_play.js';

// --- 주사위 관련 ---

export function rollDice(){
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

    // 텍스트 업데이트
    const p = G.players[G.active];
    if(p.blind){
       const sum = G.dice.reduce((a,b)=>a+b,0);
       _('rollInfo').innerText = `현재 주사위 합: ${sum}`;
    } else {
       _('rollInfo').innerText = ''; 
    }

    checkStatusEffects(); 
    updateUI(); 
    renderBoard();
    
    // [수정] 현재 플레이어가 AI인지 확인
    if(p.isAI) setTimeout(aiPlay, 800);

  }, 500);
}

export function handleDieClick(index, element){
    const p = G.players[G.active];
    
    // 트릭스터 장갑 아이템 사용 시
    if(G.changeDiceMode) {
        G.dice[index] = (G.dice[index] % 6) + 1;
        element.innerText = G.dice[index];
        G.changeDiceMode = false; 
        log("주사위 눈을 변경했습니다.");
        renderDice();
        return;
    }

    // 플레이어 HOLD 제한: 3회 남았을 때 불가
    if(G.phase !== 'roll' || p.blind || G.rolls >= 3) return;
    
    G.held[index] = !G.held[index];
    element.className = `die ${G.held[index]?'held':''}`;
    
    updateUI(); 
}

export function checkStatusEffects(){
  const p = G.players[G.active];
  const sum = G.dice.reduce((a,b)=>a+b,0);
  const match4 = checkMatch('fourKind', G.dice);
  
  if(p.blind){
    if(sum >= CONST.BLINDFOLD_REQ){
      p.blind = false;
      log(`<span style="color:#51cf66">두건 해제 성공!</span>`);
      
      G.rolls = 3; 
      G.held.fill(false); 
      G.phase = 'roll';
      
      renderDice(); renderBoard(); renderPlayers(); updateUI(); 
      log("시야가 확보되었습니다! 턴을 시작합니다.");
    } else if(G.rolls === 0){
      log(`두건 해제 실패.`);
      if(G.callbacks.endTurn) G.callbacks.endTurn(); 
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
      if(G.callbacks.endTurn) G.callbacks.endTurn();
    }
  }
}

// --- AI 로직 ---

export function aiPlay(){
  const p = G.players[G.active];
  // [수정] AI가 아니면 중단
  if(!p.isAI) return; 

  if(G.phase === 'roll'){
    if(p.blind || p.poison){ 
        if(G.rolls > 0) {
            // [AI HOLD 제한]
            if (G.rolls < 3) {
                aiDecideHold(p);
            } else {
                G.held.fill(false); 
            }
            renderDice();    
            setTimeout(rollDice, 500); 
        } else {
            if(G.callbacks.endTurn) G.callbacks.endTurn(); 
        }
        return; 
    }
    
    const moves = getValidMoves(p.x, p.y);
    const isStrongHand = checkMatch('yacht', G.dice) || checkMatch('largeStr', G.dice) || checkMatch('fourKind', G.dice);
    
    if(moves.length > 0 && (isStrongHand || G.rolls === 0)){
      confirmAction(); 
      setTimeout(aiPlay, 1000);
    } 
    else if(G.rolls > 0) {
        if (G.rolls < 3) {
            aiDecideHold(p); 
        } else {
            G.held.fill(false); 
        }
        renderDice();    
        setTimeout(rollDice, 800); 
    } 
    else {
        if(G.callbacks.endTurn) G.callbacks.endTurn(); 
    }
  } 
  else if(G.phase === 'move'){
    const moves = getValidMoves(p.x, p.y);
    if(moves.length > 0) {
        movePlayer(moves[rand(moves.length)]);
    }
    else if(G.callbacks.endTurn) G.callbacks.endTurn();
  }
}

function aiDecideHold(p) {
    G.held.fill(false);

    if (p.blind) {
        G.dice.forEach((d, i) => {
            if (d >= 4) G.held[i] = true;
        });
        return;
    }

    if (p.poison) {
        const counts = [0,0,0,0,0,0,0];
        G.dice.forEach(d => counts[d]++);
        const maxFreq = Math.max(...counts);
        const targetNum = counts.indexOf(maxFreq); 
        
        if(maxFreq >= 2) { 
            G.dice.forEach((d, i) => {
                if (d === targetNum) G.held[i] = true;
            });
        }
        return;
    }

    const uniqueSorted = [...new Set(G.dice)].sort((a,b)=>a-b).join('');
    // 스트레이트 로직 (생략 가능, 빈도 전략 우선)

    const counts = [0,0,0,0,0,0,0];
    G.dice.forEach(d => counts[d]++);
    
    let maxFreq = 0;
    let targetNum = 0;
    
    for(let i=6; i>=1; i--) {
        if(counts[i] > maxFreq) {
            maxFreq = counts[i];
            targetNum = i;
        }
    }

    if (maxFreq >= 2) {
        G.dice.forEach((d, i) => {
            if (d === targetNum) G.held[i] = true;
        });
        
        if (maxFreq === 3) {
            for(let i=1; i<=6; i++) {
                if (i !== targetNum && counts[i] >= 2) {
                    G.dice.forEach((d, idx) => { if(d === i) G.held[idx] = true; });
                }
            }
        }
    }
}