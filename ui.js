/**
 * Dungeon Dice - UI Module
 * 화면 렌더링, DOM 조작, 모달 제어, 로그 출력을 담당합니다.
 */
import { CONST, BGM_PLAYLIST } from './data.js';
import { _, formatReq } from './utils.js';
import { G, bgmAudio } from './state.js'; 
import { getValidMoves } from './logic_play.js';

// --- 렌더링 함수 ---

export function renderBoard(){
  const board = _('board');
  board.innerHTML = '';
  const p = G.players[G.active];
  const moves = (G.phase==='move' && p) ? getValidMoves(p.x, p.y) : [];

  G.board.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = `tile ${t.cat === 'start' ? 'start' : ''} ${t.isExit ? 'exit' : ''}`;
    
    const tooltipText = getTileTooltip(t.cat);
    const tt = document.createElement('div');
    tt.className = 'custom-tooltip';
    tt.innerText = (t.isExit ? "[탈출구] " : "") + tooltipText;
    el.appendChild(tt);

    if(moves.includes(i)) { 
        el.classList.add('movable'); 
        el.dataset.idx = i; 
        // [수정] 차단 코드(onclick) 삭제 -> main.js의 이벤트 위임이 처리함
    } else {
        el.onclick = (e) => {
            e.stopPropagation();
            document.querySelectorAll('.custom-tooltip.show').forEach(t => {
                if(t !== tt) t.classList.remove('show');
            });
            tt.classList.toggle('show');
            if(tt.classList.contains('show')) setTimeout(() => tt.classList.remove('show'), 2000);
        };
    }

    let {t: title, s: sub} = getTileTexts(t.cat);
    if (t.isExit) { sub = title; title = 'EXIT'; }

    const content = document.createElement('div');
    content.style.width = '100%';
    content.innerHTML = `<div class="tile-cat">${title}</div><div class="tile-sub">${sub}</div>`;
    el.appendChild(content);
    
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

export function renderDice(){
  const area = _('diceArea');
  area.innerHTML = '';
  G.dice.forEach((v,i)=>{
    const d = document.createElement('div');
    d.className = `die ${G.held[i]?'held':''}`;
    d.innerText = v; 
    d.dataset.idx = i; 
    area.appendChild(d);
  });
}

export function renderPlayers(){
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

export function updateUI(){
  const p = G.players[G.active];
  if(G.winner !== null){ return; } 
  
  _('statusIndicator').innerText = `${p.name}`;
  _('turnIndicator').innerText = G.phase==='roll' ? `굴리기 (${G.rolls})` : "이동 선택";
  
  const hasRolled = G.rolls < G.maxRolls;
  
  _('btnRoll').disabled = (G.phase !== 'roll' || G.rolls <= 0);
  _('btnAction').disabled = p.blind || p.poison || !(G.phase === 'roll' && hasRolled);
  _('btnEnd').disabled = p.blind || p.poison || G.rolls > 0 || G.phase === 'move';
  _('btnItem').disabled = (p.inv.length === 0) || (G.ai && G.active === 1);
  
  if(p.isAI){
    _('btnRoll').disabled = true;
    _('btnAction').disabled = true;
    _('btnEnd').disabled = true;
    _('btnItem').disabled = true;
  }
  updateCoach();
}

export function log(msg){
  const box = _('gameLog');
  box.innerHTML += `<div class="log-entry">${msg}</div>`;
  box.scrollTop = box.scrollHeight;
}

// [수정] showCardModal: 이미지 카드 지원
export function showCardModal(card, type, resolveCallback){
  const modal = _('cardModal');
  const acts = _('cardActions');
  const cardVisual = _('cardVisual');
  
  // 이미지가 있는 경우 (액션 카드)
  if (card.img) {
      // 상단 텍스트 숨기기
      _('cardType').style.display = 'none';
      
      // 이미지 전용 클래스 및 HTML 주입
      cardVisual.className = 'card-visual-img-container'; 
      cardVisual.innerHTML = `<img src="${card.img}" class="card-img-responsive" alt="${card.name}">`;
      
      // 기존 텍스트 엘리먼트 내용은 비워둠 (오류 방지)
  } 
  // 이미지가 없는 경우 (찬스/아이템 카드 - 기존 방식 유지)
  else {
      _('cardType').style.display = 'block';
      _('cardType').innerText = type.toUpperCase() + " CARD";
      
      cardVisual.className = `card-visual card-${type}`;
      cardVisual.innerHTML = `
        <div id="cardName" class="visual-title">${card.name}</div>
        <div id="cardDesc" class="visual-desc"></div>
      `;
      
      // 설명 텍스트 구성
      let descHtml = "";
      if(type === 'item'){
          descHtml = `획득 조건: <b>${formatReq(card.req)}</b><br><br>효과: ${card.desc}`;
      } else { 
          descHtml = `조건: ${formatReq(card.req)}<br>성공: ${card.win} / 실패: ${card.lose}`;
      }
      _('cardDesc').innerHTML = descHtml;
  }

  acts.innerHTML = '';
  _('cardResult').innerHTML = '';

  let btnText = (type === 'item') ? "획득 시도 (1회)" : 
                (type === 'chance') ? "운 시험 (리롤 불가)" : "방어 굴림";

  const btn = document.createElement('button');
  btn.className = 'action';
  btn.innerText = btnText;
  btn.onclick = () => resolveCallback(card, type);
  acts.appendChild(btn);
  
  modal.style.display = 'flex';
  
  const p = G.players[G.active];
  if(p.isAI) setTimeout(()=>btn.click(), 1500);
}

export function updateCoach(){
    if(!G.guideMode) return;
    const p = G.players[G.active];
    if(!p) return;

    const coach = _('coachText');
    const rolls = G.rolls;
    
    if(p.isAI) {
        coach.innerText = `${p.name}가 전략을 고민 중입니다...`;
        return;
    }
    if(p.poison) {
        coach.innerHTML = "☠️독에 걸렸습니다! <b>같은 숫자 4개(4 Kind)</b> 이상을 노려 해독하세요!";
        return;
    }
    if(p.blind) {
        if(rolls === 3) coach.innerText = "🕶️앞이 안 보입니다. 합 15 이상을 목표로 굴리세요!";
        else coach.innerText = "높은 숫자인 주사위는 남기고(Hold), 나머지는 다시 굴리세요!";
        return;
    }
    if (G.phase === 'roll') {
        if (rolls === 3) {
            coach.innerText = "🚩 당신의 턴입니다! [굴리기] 버튼을 눌러주세요.";
        } else if (rolls > 0) {
            coach.innerText = "원하는 주사위를 클릭해 잠그고(Hold), 다시 굴려보세요.";
        } else {
            coach.innerText = "✋굴림 횟수 끝! 이동할 타일을 선택하거나, 갈 곳이 없으면 턴을 종료하세요.";
        }
    } else if (G.phase === 'move') {
        coach.innerHTML = "✨반짝이는 <b>타일</b>을 클릭하여 이동하세요.";
    }
}

function getTileTexts(cat) {
  switch(cat){
    case 'start': return {t:'START', s:''};
    case 'yacht': return {t:'요트', s:'아이템'}; 
    case 'chance': return {t:'찬스카드', s:'카드'}; 
    case 'threeKind': return {t:'트리플', s:''};    
    case 'fourKind': return {t:'포카드', s:'액션'}; 
    case 'fullHouse': return {t:'풀하우스', s:'액션'};
    case 'smallStr': return {t:'4연속 숫자', s:'액션'}; 
    case 'largeStr': return {t:'5연속 숫자', s:'액션'}; 
    case 'sum25': return {t:'합 25↑', s:'액션'};
    case 'sum7': return {t:'합 7↓', s:'액션'};
    case 'sum8': return {t:'합 8↓', s:'액션'}; 
    case 'sum15': return {t:'합 15', s:''}; 
    case 'sum15_18': return {t:'합 15~18', s:''};
    case 'allEven': return {t:'모두 짝수', s:'액션'};
    case 'allOdd': return {t:'모두 홀수', s:'액션'};
    case 'trapLow': return {t:'주사위 1,2', s:''};
    case 'trapMid': return {t:'주사위 3,4', s:''};
    case 'trapHigh': return {t:'주사위 5,6', s:''};
    default: return {t: formatReq(cat), s: ''};
  }
}

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

export function playBGM() {
  if (bgmAudio.src && bgmAudio.paused && bgmAudio.currentTime > 0) {
      bgmAudio.play().catch(e => console.log(e));
      return;
  }
  if (!bgmAudio.src || bgmAudio.src === '') {
      bgmAudio.src = BGM_PLAYLIST[G.bgmIndex];
      bgmAudio.volume = parseFloat(_('bgmVolume').value);
  }
  bgmAudio.play().catch(e => console.log("Auto-play blocked"));
  bgmAudio.onended = () => {
      G.bgmIndex = (G.bgmIndex + 1) % BGM_PLAYLIST.length; 
      bgmAudio.src = BGM_PLAYLIST[G.bgmIndex];
      bgmAudio.play();
  };
}