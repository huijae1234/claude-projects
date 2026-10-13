import { describe, expect, it } from 'vitest';
import { parseRegulationText } from './regulation';
import { CsvFormatError } from './seed';

describe('parseRegulationText — 붙여넣은 조문을 조 단위로 나누기', () => {
  it('제N조 단위로 나눈다', () => {
    const r = parseRegulationText({
      title: '시험 고시',
      text: '제1조 보존료 사용량은 1.0g/kg 이하로 한다.\n제2조 시험 성적서를 구비하여야 한다.\n제3조 시행일 전 제조품은 판매할 수 있다.',
    });
    expect(r.articles.map((a) => a.no)).toEqual(['제1조', '제2조', '제3조']);
    expect(r.articles[0]!.text).toBe('보존료 사용량은 1.0g/kg 이하로 한다.');
    expect(r.title).toBe('시험 고시');
  });

  it('"제1조(목적)" 같은 조 제목을 조 번호에 붙이고, "제3조의2"도 한 조로 본다', () => {
    const r = parseRegulationText({ text: '제1조(목적) 이 고시는 기준을 정한다.\n제3조의2(특례) 압착유는 종전 기준을 따른다.' });
    expect(r.articles.map((a) => a.no)).toEqual(['제1조(목적)', '제3조의2(특례)']);
    expect(r.articles[1]!.text).toBe('압착유는 종전 기준을 따른다.');
  });

  it('본문 속 "제1조에 따라" 같은 인용은 새 조로 나누지 않는다', () => {
    const r = parseRegulationText({ text: '제1조 기준을 정한다.\n제2조 제1조에 따라 사용량을 줄이는 경우 성적서를 구비한다.' });
    expect(r.articles).toHaveLength(2);
    expect(r.articles[1]!.text).toContain('제1조에 따라');
  });

  it('"제 2 조"처럼 띄어 써도 알아본다', () => {
    const r = parseRegulationText({ text: '제 1 조 가.\n제 2 조 나.' });
    expect(r.articles.map((a) => a.no)).toEqual(['제1조', '제2조']);
  });

  it('조문 머리가 없으면 전체를 "본문" 하나로 본다', () => {
    const r = parseRegulationText({ text: '알레르기 표시 글자 크기는 원재료명 글자 크기 이상이어야 한다.' });
    expect(r.articles).toEqual([{ no: '본문', text: '알레르기 표시 글자 크기는 원재료명 글자 크기 이상이어야 한다.' }]);
  });

  it('줄바꿈·여러 칸 공백은 한 칸으로 정리한다 (인용 대조가 공백 차이로 틀리지 않게)', () => {
    const r = parseRegulationText({ text: '제1조 보존료의   사용량은\n최종 제품 기준으로 한다.' });
    expect(r.articles[0]!.text).toBe('보존료의 사용량은 최종 제품 기준으로 한다.');
  });

  it('입력 검증: 빈 내용, 너무 긴 내용, 잘못된 시행일', () => {
    expect(() => parseRegulationText({ text: '   ' })).toThrow(CsvFormatError);
    expect(() => parseRegulationText({ text: '가'.repeat(20_001) })).toThrow(/너무 깁니다/);
    expect(() => parseRegulationText({ text: '제1조 가', effective_date: '2027/01/01' })).toThrow(/YYYY-MM-DD/);
  });

  it('제목·시행일이 없으면 기본값을 쓰고, 직접 입력임을 표시한다', () => {
    const r = parseRegulationText({ text: '제1조 가.' });
    expect(r).toMatchObject({ id: 'CUSTOM', title: '직접 입력한 조문', effective_date: '미상' });
    expect(r.notice).toContain('직접');
  });
});
