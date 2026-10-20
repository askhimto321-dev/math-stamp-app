// 2022 개정 교육과정 단원 (공통수학2 · 미적분Ⅰ · 기하)
export const SUBJECTS = {
  cm2: { name: '공통수학2', kind: '공통과목', units: [
    ['Ⅰ. 도형의 방정식', ['평면좌표', '직선의 방정식', '원의 방정식', '도형의 이동']],
    ['Ⅱ. 집합과 명제', ['집합', '명제']],
    ['Ⅲ. 함수와 그래프', ['함수', '유리함수와 무리함수']]] },
  calc1: { name: '미적분Ⅰ', kind: '일반선택', units: [
    ['Ⅰ. 함수의 극한과 연속', ['함수의 극한', '함수의 연속']],
    ['Ⅱ. 미분', ['미분계수와 도함수', '도함수의 활용']],
    ['Ⅲ. 적분', ['부정적분과 정적분', '정적분의 활용']]] },
  geo: { name: '기하', kind: '진로선택', units: [
    ['Ⅰ. 이차곡선', ['포물선', '타원', '쌍곡선', '이차곡선과 직선']],
    ['Ⅱ. 공간도형과 공간좌표', ['직선과 평면의 위치 관계', '삼수선의 정리와 정사영', '공간좌표']],
    ['Ⅲ. 벡터', ['벡터의 연산', '벡터의 성분과 내적', '벡터를 이용한 도형의 방정식']]] }
};
export function unitLabel(subj, code) {
  if (!code) return '';
  const [i, j] = code.split('-').map(Number), u = SUBJECTS[subj]?.units[i];
  return u ? (u[0] + (u[1][j] ? ' · ' + u[1][j] : '')) : '';
}
export function subUnit(subj, code) {
  if (!code) return '';
  const [i, j] = code.split('-').map(Number);
  return SUBJECTS[subj]?.units[i]?.[1][j] || '';
}

export function defaultScoring() {
  return { stamp: { enabled: true, mode: 'rate', excludeAbsent: true, floor: 5,
    bands: [{ min: 90, score: 10 }, { min: 80, score: 9 }, { min: 70, score: 8 }, { min: 60, score: 7 }, { min: 50, score: 6 }] }, items: [] };
}
export const ITEM_TEMPLATES = {
  wrong: { name: '중간고사 오답노트', type: 'check', on: 5, off: 0 },
  mock: { name: '홈페이지 모의고사 풀이 업로드', type: 'level', levels: [{ label: '3회 이상', score: 5 }, { label: '2회', score: 4 }, { label: '1회', score: 3 }, { label: '0회', score: 0 }] },
  feedback: { name: '피드백', type: 'level', levels: [{ label: '상', score: 5 }, { label: '중', score: 4 }, { label: '하', score: 3 }] },
  custom: { name: '', type: 'number', max: 10 }
};
