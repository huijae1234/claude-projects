import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { SAMPLE_CATALOG, type SampleTool, defaultKey, samplesFor } from './samples';

export function useRun<T>() {
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: T; cancelled?: boolean }>({ loading: false });
  const abortRef = useRef<AbortController | null>(null);

  /** fn은 받은 signal을 fetch에 넘기면 cancel()로 중단할 수 있다. 새로 실행하면 이전 요청은 중단한다. */
  const run = useCallback(async (fn: (signal: AbortSignal) => Promise<T>) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ loading: true });
    try {
      const data = await fn(ctrl.signal);
      if (!ctrl.signal.aborted) setState({ loading: false, data });
    } catch (e) {
      if (ctrl.signal.aborted) setState({ loading: false, cancelled: true });
      else setState({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  }, []);
  const cancel = useCallback(() => abortRef.current?.abort(), []);
  useEffect(() => () => abortRef.current?.abort(), []); // 화면에서 사라지면 요청도 중단
  return { ...state, run, cancel };
}

/**
 * 코드 계산(미리보기, 즉시)과 AI 해석(전체, 수십 초)을 동시에 요청한다.
 * 미리보기가 먼저 도착하면 화면에 바로 보여주고, AI 결과는 도착하는 대로 채운다.
 */
export function usePreviewRun<P, F>() {
  const pre = useRun<P>();
  const full = useRun<F>();
  const { run: runPre, cancel: cancelPre } = pre;
  const { run: runFull, cancel: cancelFull } = full;
  const start = useCallback(
    (previewFn: (signal: AbortSignal) => Promise<P>, fullFn: (signal: AbortSignal) => Promise<F>) => {
      void runPre(previewFn);
      void runFull(fullFn);
    },
    [runPre, runFull],
  );
  const cancel = useCallback(() => {
    cancelPre();
    cancelFull();
  }, [cancelPre, cancelFull]);
  return {
    preview: pre.data,
    full: full.data,
    loading: full.loading,
    error: full.error ?? pre.error,
    cancelled: full.cancelled,
    start,
    cancel,
  };
}

/** AI 결과가 아직 안 왔을 때 그 자리에 보여주는 안내 */
export function AiWait({ children = 'AI가 해석하는 중입니다. 위의 코드 계산 결과는 이미 확정된 값입니다.' }: { children?: ReactNode }) {
  return <p className="ai-wait">{children}</p>;
}

/** 시작 후 경과 초. active가 꺼지면 0으로 돌아간다. */
function useElapsed(active: boolean): number {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!active) {
      setSec(0);
      return;
    }
    const t0 = Date.now();
    const id = setInterval(() => setSec(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(id);
  }, [active]);
  return sec;
}

export const NOTICE_PREFIX = '[안내] ';

export function RunStatus({
  loading, error, cancelled, onCancel, typical = '30~60초', what = 'Claude가 분석 중입니다',
}: {
  loading: boolean; error?: string; cancelled?: boolean; onCancel?: () => void; typical?: string; what?: string;
}) {
  const sec = useElapsed(loading);
  if (loading) {
    return (
      <p className="status" role="status">
        {what}… <b className="elapsed">{sec}초 경과</b> <span className="muted">(보통 {typical})</span>
        {onCancel && <button className="ghost mini" onClick={onCancel}>취소</button>}
      </p>
    );
  }
  // "[안내] "로 시작하는 메시지는 고장이 아니라 알려 주는 말이라 오류 모양을 쓰지 않는다
  if (error?.startsWith(NOTICE_PREFIX)) return <p className="status notice" role="status">{error.slice(NOTICE_PREFIX.length)}</p>;
  if (error) return <p className="status error" role="alert">오류: {error}</p>;
  if (cancelled) return <p className="status muted">취소했습니다.</p>;
  return null;
}

export function Badge({ tone, children }: { tone: 'red' | 'orange' | 'yellow' | 'green' | 'gray' | 'blue'; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function CopyButton({ text, label = '복사' }: { text: string; label?: string }) {
  const [done, setDone] = useState<'ok' | 'fail' | null>(null);
  return (
    <button
      className="ghost"
      onClick={() => {
        // 복사가 막힌 환경(일부 앱 화면)에서는 실패를 알리고 직접 선택하게 한다
        const flash = (v: 'ok' | 'fail') => {
          setDone(v);
          setTimeout(() => setDone(null), 1800);
        };
        if (!navigator.clipboard) return flash('fail');
        navigator.clipboard.writeText(text).then(() => flash('ok'), () => flash('fail'));
      }}
    >
      {done === 'ok' ? '복사됨' : done === 'fail' ? '복사 안 됨 · 직접 선택하세요' : label}
    </button>
  );
}

/** 아티팩트에서 AI 결과가 어디서 왔는지 (미리 실행한 기록 / 지금 Claude로 분석) */
export interface AiMeta {
  source: 'recorded' | 'live';
  recorded_at?: string;
}
export const metaOf = (x: unknown): AiMeta | undefined => (x as { _meta?: AiMeta } | undefined)?._meta;

export function Disclaimer({ meta }: { meta?: AiMeta }) {
  return (
    <p className="disclaimer">
      {meta?.source === 'recorded' && <span className="source-tag">{meta.recorded_at ?? ''} 실제 Claude로 미리 실행한 응답 · 숫자 계산은 지금 이 화면에서 다시 했습니다</span>}
      {meta?.source === 'live' && <span className="source-tag live">지금 Claude로 분석한 결과입니다</span>}
      AI가 만든 초안입니다. 최종 판단과 조치는 담당자가 확인 후 결정하세요.
    </p>
  );
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
