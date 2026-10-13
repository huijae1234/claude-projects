import { CsvFormatError, type Regulation } from './seed';

export const MAX_REGULATION_CHARS = 20_000;

/** "제3조", "제 3 조", "제3조의2" 같은 조문 머리를 찾는다. 줄 맨 앞이나 공백 뒤에 와야 한다. */
const ARTICLE_HEAD = /(^|\n|\s)(제\s*\d+\s*조(?:\s*의\s*\d+)?)/g;

/**
 * 사용자가 붙여넣은 고시·법령 조문을 조 단위로 나눈다.
 * 조문 머리가 하나도 없으면 전체를 "본문" 한 덩어리로 본다.
 * 같은 조 번호가 다시 나오면(예: 본문 속 "제1조에 따라") 새 조로 보지 않는다.
 */
export function parseRegulationText(input: { title?: string; effective_date?: string; text: string }): Regulation {
  const text = input.text.replace(/\r\n/g, '\n').trim();
  if (text.length === 0) throw new CsvFormatError('조문 내용이 비어 있습니다.');
  if (text.length > MAX_REGULATION_CHARS) {
    throw new CsvFormatError(`조문이 너무 깁니다(${text.length}자). ${MAX_REGULATION_CHARS}자 이하로 나눠 붙여넣어 주세요.`);
  }
  const date = input.effective_date?.trim() ?? '';
  if (date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new CsvFormatError(`시행일은 YYYY-MM-DD 형식이어야 합니다: "${date}"`);
  }

  // 조문 머리 위치를 찾되, 바로 뒤에 "에 따라/에서/의 규정" 등이 붙는 본문 속 인용은 제외한다.
  const heads: Array<{ no: string; start: number; bodyStart: number }> = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(ARTICLE_HEAD)) {
    const raw = m[2]!;
    const no = raw.replace(/\s+/g, '');
    const start = m.index! + m[1]!.length;
    const after = text.slice(start + raw.length, start + raw.length + 6);
    if (/^\s*(에|의\s*규정|에서|에도|및|부터|까지|과|와)/.test(after)) continue;
    if (seen.has(no)) continue;
    seen.add(no);
    heads.push({ no, start, bodyStart: start + raw.length });
  }

  const articles =
    heads.length === 0
      ? [{ no: '본문', text: squash(text) }]
      : heads.map((h, i) => {
          const end = i + 1 < heads.length ? heads[i + 1]!.start : text.length;
          // "제1조(목적)" 처럼 제목 괄호가 붙어 있으면 본문에서 떼어 조 번호에 붙인다
          let body = text.slice(h.bodyStart, end);
          let no = h.no;
          const titleMatch = /^\s*\(([^)]{1,30})\)/.exec(body);
          if (titleMatch) {
            no = `${h.no}(${titleMatch[1]})`;
            body = body.slice(titleMatch[0].length);
          }
          return { no, text: squash(body) };
        }).filter((a) => a.text.length > 0);

  if (articles.length === 0) throw new CsvFormatError('조문 내용을 찾지 못했습니다.');
  return {
    id: 'CUSTOM',
    title: input.title?.trim() || '직접 입력한 조문',
    notice: '사용자가 직접 붙여넣은 조문입니다.',
    effective_date: date || '미상',
    articles,
  };
}

const squash = (t: string) => t.replace(/[ \t]+/g, ' ').replace(/\n+/g, ' ').trim();
