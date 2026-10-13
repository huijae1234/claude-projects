import { createRoot } from 'react-dom/client';
import { App } from '../web/App';
import { setApiBackend } from '../web/api';
import { createStaticBackend } from './backend';
import recordings from './recordings.json';
import type { Recordings } from './recording';

// 아티팩트: 서버 없이 같은 도구 코드를 브라우저에서 돌린다.
// AI 응답은 미리 실행해 둔 실제 Claude 응답을 쓰고, 처음 보는 입력만 뷰어의 Claude에게 묻는다.
setApiBackend(createStaticBackend(recordings as unknown as Recordings));
createRoot(document.getElementById('root')!).render(<App />);
