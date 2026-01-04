
/**
 * Dungeon Dice Utils Module
 * 족보 판정 및 헬퍼 함수
 */

export const _ = (id) => document.getElementById(id);
export const rand = (n) => Math.floor(Math.random()*n);

// [Rule 41, 94, 104] 족보 판정 로직
export function checkMatch(req, dice) {
  const counts = {};
  let sum=0, even=0, odd=0, up4=0, down3=0, down2=0;
  
  dice.forEach(d=>{ 
    counts[d]=(counts[d]||0)+1; 
    sum+=d; 
    if(d%2===0) even++; else odd++; 
    if(d>=4) up4++; 
    if(d<=3) down3++;
    if(d<=2) down2++;
  });
  
  const vals = Object.values(counts);
  const max = Math.max(...vals);
  // 중복 제거 후 정렬 (스트레이트 판정용)
  const u = [...new Set(dice)].sort((a,b)=>a-b).join('');

  switch(req){
    case 'chance': return true; // 찬스 타일은 조건 없이 이동 가능 (카드 뽑을 때 판정)
    
    // 타일 & 카드 조건 매핑
    case 'threeKind': return max >= 3;
    case 'fourKind': return max >= 4;
    case 'yacht': return max === 5;
    case 'fullHouse': return (vals.includes(3) && vals.includes(2)) || max === 5;
    
    case 'smallStr': // 4연속
      return u.includes('1234') || u.includes('2345') || u.includes('3456');
    case 'largeStr': // 5연속
      return u.includes('12345') || u.includes('23456');
      
    case 'sum25': return sum >= 25;
    case 'sum7': return sum <= 7;
    case 'sum8': return sum <= 8;
    case 'sum15': return sum >= 15;
    case 'sum15Exact': return sum === 15;
    case 'sum15_18': return sum >= 15 && sum <= 18;
    case 'sum20': return sum >= 20;
    
    case 'allEven': return even === 5;
    case 'allOdd': return odd === 5;
    case 'all4Up': return up4 === 5;
    case 'all3Down': return down3 === 5;
    case 'all2Down': return down2 === 5; // 트릭스터 장갑 조건

    // 함정 타일 (단순 숫자 포함 여부)
    case 'trapLow': return counts[1] || counts[2];
    case 'trapMid': return counts[3] || counts[4];
    case 'trapHigh': return counts[5] || counts[6];
    
    default: return false; 
  }
}

export function formatReq(req){
  const map = { 
    threeKind:'3 Kind', fourKind:'4 Kind', fullHouse:'풀하우스',
    sum15:'합 15↑', sum20:'합 20↑', sum25:'합 25↑', sum7:'합 7↓', sum8:'합 8↓',
    sum15Exact:'합 15', sum15_18:'합 15~18',
    allEven:'모두 짝수', allOdd:'모두 홀수', all4Up:'모두 4↑', all3Down:'모두 3↓', all2Down:'모두 2↓',
    trapLow:'1 or 2', trapMid:'3 or 4', trapHigh:'5 or 6'
  };
  return map[req] || req;
}

export function buildDecks(def) {
  let arr = [];
  def.forEach(c => { for(let i=0; i<c.count; i++) arr.push({...c}); });
  return arr.sort(()=>Math.random()-0.5);
}
