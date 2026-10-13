"""문제 발굴소 로컬 서버.

브라우저는 이 서버(/api/ask)만 부르고, Anthropic API 키는 .env에서만 읽습니다.
키가 브라우저 코드나 화면에 노출되지 않습니다. 외부 패키지 없이 파이썬만으로 동작합니다.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 8765
API_URL = "https://api.anthropic.com/v1/messages"


def load_env():
    path = os.path.join(ROOT, ".env")
    env = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip().strip('"').strip("'")
    return env


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))

    def _json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] in ("/", "/index.html"):
            with open(os.path.join(ROOT, "index.html"), "rb") as f:
                body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self._json(404, {"error": "not_found"})

    def do_POST(self):
        if self.path != "/api/ask":
            return self._json(404, {"error": "not_found"})
        env = load_env()
        key = env.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            return self._json(503, {"error": "no_key"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 200_000:
                return self._json(400, {"error": "bad_request"})
            prompt = json.loads(self.rfile.read(length).decode("utf-8")).get("prompt", "")
            if not isinstance(prompt, str) or not prompt.strip():
                return self._json(400, {"error": "bad_request"})
        except (ValueError, UnicodeDecodeError):
            return self._json(400, {"error": "bad_request"})

        payload = {
            "model": env.get("MODEL") or "claude-sonnet-5-5",
            "max_tokens": 2000,
            "stream": True,
            "messages": [{"role": "user", "content": prompt}],
        }
        req = urllib.request.Request(
            API_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "content-type": "application/json",
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
            },
            method="POST",
        )
        try:
            resp = urllib.request.urlopen(req, timeout=300)
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:300]
            sys.stderr.write("Anthropic API 오류 %s: %s\n" % (e.code, detail))
            return self._json(e.code if e.code in (401, 429) else 502, {"error": "upstream", "status": e.code})
        except Exception as e:  # 네트워크 오류 등
            sys.stderr.write("Anthropic API 연결 실패: %s\n" % e)
            return self._json(502, {"error": "upstream"})

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()
        try:
            for line in resp:
                self.wfile.write(line)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # 브라우저에서 멈추기를 누른 경우
        finally:
            resp.close()
        self.close_connection = True


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("문제 발굴소 서버가 켜졌어요: http://localhost:%d  (끄려면 Ctrl+C)" % PORT)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n서버를 껐어요.")
