/**
 * 아티팩트 게시용 파일 만들기.
 * 1) vite로 화면 전체를 HTML 파일 하나로 빌드 (dist-artifact/index.html)
 * 2) Artifact 도구가 요구하는 "본문 조각"(doctype·html·head·body 없이 title, style, 내용, script)으로 바꿔 저장
 *    → dist-artifact/artifact.html
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
await build({ configFile: `${root}vite.artifact.config.ts`, logLevel: 'warn' });

const full = readFileSync(`${root}dist-artifact/index.html`, 'utf8');
const title = /<title>[^<]*<\/title>/.exec(full)?.[0];
const fonts = [...full.matchAll(/<link[^>]+fonts\.(?:googleapis|gstatic)\.com[^>]*>/g)].map((m) => m[0]);
const styles = [...full.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]);
const scripts = [...full.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]);
if (!title || styles.length === 0 || scripts.length === 0) throw new Error('빌드 결과에서 title/style/script를 찾지 못했습니다');

const fragment = [title, ...fonts, ...styles, '<div id="root"></div>', ...scripts].join('\n') + '\n';
writeFileSync(`${root}dist-artifact/artifact.html`, fragment, 'utf8');
const kb = (f: string) => `${(statSync(`${root}dist-artifact/${f}`).size / 1024).toFixed(0)}KB`;
console.log(`dist-artifact/index.html ${kb('index.html')} · artifact.html ${kb('artifact.html')} (스타일 ${styles.length}개, 스크립트 ${scripts.length}개)`);
