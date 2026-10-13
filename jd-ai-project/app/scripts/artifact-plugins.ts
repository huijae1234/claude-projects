import type { Plugin } from 'vite';

/**
 * 아티팩트 뷰어에서 쓸 수 없는 것을 빌드 결과에서 정리한다.
 *  - 인라인 모듈 스크립트 안의 `</script` 문자열이 HTML을 깨지 않도록 이스케이프
 * (아티팩트는 외부 스크립트·CSS를 쓸 수 없어 전부 인라인이어야 한다. vite-plugin-singlefile이 그 일을 한다.)
 */
export function viewportScrollFix(): Plugin {
  return {
    name: 'artifact-escape-script-end',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // <script type="module">…</script> 안쪽에만 적용: 본문 안의 "</script" 를 안전하게 바꾼다
        return html.replace(/(<script[^>]*>)([\s\S]*?)(<\/script>)/g, (_m, open: string, body: string, close: string) => {
          return `${open}${body.replace(/<\/script/gi, '<\\/script')}${close}`;
        });
      },
    },
  };
}
