import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { SAMPLE_CATALOG, type SampleTool, defaultKey, samplesFor } from './samples';

export function useRun<T>() {
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: T }>({ loading: false });
  const run = useCallback(async (fn: () => Promise<T>) => {
    setState({ loading: true });
    try {
      setState({ loading: false, data: await fn() });
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  }, []);
  return { ...state, run };
}

export function RunStatus({ loading, error }: { loading: boolean; error?: string }) {
  if (loading) return <p className="status">Claude가 분석 중입니다… (보통 10~30초)</p>;
  if (error) return <p className="status error" role="alert">오류: {error}</p>;
  return null;
}

export function Badge({ tone, children }: { tone: 'red' | 'orange' | 'yellow' | 'green' | 'gray' | 'blue'; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function CopyButton({ text, label = '복사' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="ghost"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? '복사됨' : label}
    </button>
  );
}

export function Disclaimer() {
  return <p className="disclaimer">AI가 만든 초안입니다. 최종 판단과 조치는 담당자가 확인 후 결정하세요.</p>;
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const UPLOAD = '__upload';

const countRows = (csv: string) => Math.max(0, csv.trim().split('\n').length - 1);

/** 샘플 선택 + 내 CSV 업로드. 드롭다운에는 이 탭에 맞는 종류의 샘플만 보인다. */
export function CsvPicker({
  tool,
  onChange,
  requiredHint,
}: {
  tool: SampleTool;
  onChange: (csv: string, label: string) => void;
  requiredHint: string;
}) {
  const [selected, setSelected] = useState<string>(defaultKey(tool));
  const [uploadName, setUploadName] = useState('');
  const [info, setInfo] = useState('샘플 불러오는 중…');
  const [problem, setProblem] = useState('');

  const load = useCallback(
    async (key: string) => {
      const entry = SAMPLE_CATALOG.find((s) => s.key === key);
      if (!entry) return;
      setSelected(key); // 불러오기 실패해도 드롭다운은 선택값을 유지한다
      setProblem('');
      setInfo('샘플 불러오는 중…');
      try {
        const csv = await api<string>(entry.url);
        setInfo(`샘플: ${entry.label} (${countRows(csv)}행)`);
        onChange(csv, entry.label);
      } catch (e) {
        setInfo(`샘플: ${entry.label}`);
        setProblem(`샘플 내용을 불러오지 못했습니다: ${e instanceof Error ? e.message : e}. 서버가 켜져 있는지 확인하세요.`);
        onChange('', entry.label);
      }
    },
    [onChange],
  );

  // 처음 열릴 때 이 탭의 기본 샘플을 불러온다
  useEffect(() => {
    void load(defaultKey(tool));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  return (
    <div>
      <div className="row">
        <select value={selected} onChange={(e) => e.target.value !== UPLOAD && void load(e.target.value)} aria-label="샘플 데이터 선택">
          {samplesFor(tool).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          {uploadName && <option value={UPLOAD}>업로드: {uploadName}</option>}
        </select>
        <label className="ghost file">
          내 CSV 올리기
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (f.size > MAX_UPLOAD_BYTES) {
                setProblem(`파일이 너무 큽니다(${(f.size / 1048576).toFixed(1)}MB). 최대 5MB까지 가능합니다.`);
                return;
              }
              setProblem('');
              setUploadName(f.name);
              setSelected(UPLOAD);
              setInfo(`업로드: ${f.name}`);
              onChange(await f.text(), f.name);
            }}
          />
        </label>
      </div>
      <p className="kv">{info}</p>
      <p className="kv">이 탭에 필요한 컬럼: {requiredHint}</p>
      {problem && <p className="status error" role="alert">{problem}</p>}
    </div>
  );
}
