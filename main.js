/**
 * Dungeon Dice - Main Entry Module
 * 게임 초기화, 턴 관리, 이벤트 리스너 설정을 담당합니다.
 */
import { CONST, MAP_TILES_CONFIG, EXIT_POOL, DECK_ACTION_DEF, DECK_CHANCE_DEF, DECK_ITEM_DEF } from './data.js';
import { _, buildDecks } from './utils.js';
import { G, introAudio, bgmAudio } from './state.js';
import { renderBoard, renderPlayers, renderDice, updateUI, log, playBGM, updateCoach } from './ui.js';
import { rollDice, handleDieClick, aiPlay } from './logic_dice.js';
import { confirmAction, movePlayer, openInventory, getValidMoves } from './logic_play.js';

// --- 게임 초기화 및 흐름 제어 ---

function initGame(){
  const pc = document.querySelector('input[name="pCount"]:checked').value;
  const pCount = parseInt(pc);
  
  // AI 선택 체크박스 확인
  const aiCheck2 = _('ai_p2').checked;
  const aiCheck3 = _('ai_p3').checked;
  const aiCheck4 = _('ai_p4').checked;
  
  // 데이터 초기화
  G.players = [];
  G.winner = null;
  G.round = 1;
  G.lastStandMode = false;
  G.lastStandCount = 0;
  G.isIntroFlow = false;
  
  for(let i=0; i<pCount; i++){
    let isAi = false;
    // 플레이어 인덱스(0부터 시작)에 따라 AI 여부 설정 (1P=0은 항상 사람)
    if(i === 1 && aiCheck2) isAi = true;
    if(i === 2 && aiCheck3) isAi = true;
    if(i === 3 && aiCheck4) isAi = true;

    G.players.push({
      id:i, 
      name: isAi ? `AI-${i+1}` : `P-${i+1}`,
      isAI: isAi, // 개별 AI 플래그
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
  
  updateCoach(); 
}

function enterDungeon() {
  introAudio.pause();
  introAudio.currentTime = 0;

  _('storyModal').style.display = 'none';
  _('introRuleModal').style.display = 'flex';
  G.isIntroFlow = true; 
}

function closeIntroRule() {
    _('introRuleModal').style.display = 'none';
    if (G.isIntroFlow) {
        G.isIntroFlow = false;
        startGameFlow();
    }
}

function startGameFlow() {
    renderBoard();
    renderPlayers();
    
    _('gameLog').innerHTML = '';
    _('roundDisp').innerText = `R 1 / ${CONST.MAX_ROUNDS}`;
    log(`게임 시작! 두건을 해제하세요 (합 ${CONST.BLINDFOLD_REQ}↑)`);
    
    startTurn(0);
    playBGM();
}

// --- 턴 관리 ---

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

  // isAI 속성을 확인하여 AI 턴 실행
  if(p.isAI) setTimeout(aiPlay, 1000);
}

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

function tryEndTurn() {
    const p = G.players[G.active];
    const moves = getValidMoves(p.x, p.y);

    if (moves.length > 0) {
        G.phase = 'move'; 
        renderBoard();    
        updateUI();       

        const coach = _('coachText');
        if(coach) {
            coach.innerHTML = "<span style='color:#ff6b6b'>🚫 이동 가능 타일이 있어 턴 종료 버튼 사용 불가.</span>";
            coach.style.animation = 'none';
            coach.offsetHeight; 
            coach.style.animation = 'float 2s ease-in-out infinite';
        }
    } else {
        endTurn();
    }
}

// [수정] 게임 종료 함수 (모달 띄우기 및 타일 효과 제거)
function endGame(){
  G.phase = 'gameover'; // 페이즈 변경으로 타일 선택 효과 제거
  renderBoard(); 

  const sorted = [...G.players].sort((a,b)=>{
      if(a.escaped !== b.escaped) return a.escaped ? -1 : 1; 
      return b.score - a.score; 
  });
  
  G.winner = sorted[0].id;
  
  // 결과 모달 내용 구성
  const list = _('resultList');
  list.innerHTML = '';
  
  sorted.forEach((p, i) => {
      const isWin = (i === 0);
      const status = p.escaped ? "탈출 성공" : "실패";
      
      const div = document.createElement('div');
      div.className = `result-item ${isWin ? 'winner' : ''}`;
      
      let rankText = `${i+1}등`;
      if(isWin) rankText = "👑 WIN";
      
      div.innerHTML = `
        <div style="display:flex; align-items:center;">
            <span class="result-rank">${rankText}</span>
            <span>${p.name}</span>
        </div>
        <div style="text-align:right;">
            <div style="font-size:0.9em; color:${p.escaped?'#51cf66':'#ff6b6b'}">${status}</div>
            <div style="color:var(--gold)">${p.score}점</div>
        </div>
      `;
      list.appendChild(div);
  });

  // 모달 표시
  _('resultModal').style.display = 'flex';
  
  // 기존 로그 등은 백그라운드용으로 유지
  _('statusIndicator').innerText = "게임 종료";
  _('turnIndicator').innerText = "결과 발표";
  _('btnRoll').disabled = true; _('btnAction').disabled = true;
  _('btnEnd').disabled = true; _('btnItem').disabled = true;
  
  renderPlayers(); 
}

function checkWinCondition(){ 
    if(G.players.every(p => p.escaped || p.failed)) endGame();
    else nextTurn();
}

function updateSetupUI() {
    const pcInput = document.querySelector('input[name="pCount"]:checked');
    if (!pcInput) return;
    const pCount = parseInt(pcInput.value);
    
    const lbl2 = _('ai_p2').parentElement;
    const lbl3 = _('ai_p3').parentElement;
    const lbl4 = _('ai_p4').parentElement;
    
    lbl2.style.display = 'flex';
    lbl3.style.display = 'flex';
    lbl4.style.display = 'flex';
    
    if (pCount === 2) {
        lbl3.style.display = 'none';
        lbl4.style.display = 'none';
        _('ai_p3').checked = false;
        _('ai_p4').checked = false;
    } else if (pCount === 3) {
        lbl4.style.display = 'none';
        _('ai_p4').checked = false;
    }
}

G.callbacks.endTurn = endTurn;
G.callbacks.nextTurn = nextTurn;
G.callbacks.checkWinCondition = checkWinCondition;

// --- 이벤트 리스너 ---

function openRules() { _('ruleModal').style.display = 'flex'; }
function closeRules() { _('ruleModal').style.display = 'none'; }
function openIntroRule() { _('introRuleModal').style.display = 'flex'; }

_('btnStartGame').addEventListener('click', initGame);
_('btnItem').addEventListener('click', openInventory);
_('btnCloseInv').addEventListener('click', ()=>_('inventoryModal').style.display='none');
_('btnRoll').addEventListener('click', rollDice);
_('btnRestartMain').addEventListener('click', ()=>confirm("재시작?")&&location.reload());
_('btnRestartResult').addEventListener('click', ()=>location.reload()); // [신규] 결과창 재시작 버튼 연결
_('btnBgmPlay').addEventListener('click', playBGM);
_('btnBgmPause').addEventListener('click', ()=>bgmAudio.pause());
_('bgmVolume').addEventListener('input', function(){ bgmAudio.volume=this.value; });

_('btnEnterDungeon').addEventListener('click', enterDungeon);
_('btnSkipStory').addEventListener('click', enterDungeon);

_('btnHeaderRules').addEventListener('click', openRules);      
_('btnCloseRulesTop').addEventListener('click', closeRules);   
_('btnCloseRulesBottom').addEventListener('click', closeRules);

_('btnIntroRule').addEventListener('click', openIntroRule);
_('btnCloseIntroRule').addEventListener('click', closeIntroRule);

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

_('btnAction').onclick = confirmAction;
_('btnEnd').onclick = tryEndTurn;

_('board').addEventListener('click', (e) => {
    const tile = e.target.closest('.tile.movable');
    if (tile && tile.dataset.idx) {
        movePlayer(parseInt(tile.dataset.idx));
    }
});

_('diceArea').addEventListener('click', (e) => {
    const die = e.target.closest('.die');
    if (die && die.dataset.idx) {
        handleDieClick(parseInt(die.dataset.idx), die);
    }
});

const pCountRadios = document.querySelectorAll('input[name="pCount"]');
pCountRadios.forEach(radio => {
    radio.addEventListener('change', updateSetupUI);
});

updateSetupUI();