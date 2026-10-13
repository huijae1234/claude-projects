"""데이터 로더: 구글 드라이브 폴더의 시트를 읽고, 설정이 없으면 로컬 CSV를 읽는다.

설정 (환경변수 또는 .streamlit/secrets.toml 이 아닌 source_config.json):
  {"folder_id": "<드라이브 폴더 ID>", "service_account_file": "secrets/service_account.json"}
폴더의 시트 제목 앞부분이 테이블 이름이 된다. 예) "fact_meat_weekly", "fact_import_monthly (v2)" -> fact_import_monthly
시트가 새로 추가되거나 수정되면(modifiedTime 변경) 그 시트만 다시 읽는다.
"""
import json
import re
from pathlib import Path

import pandas as pd

BASE = Path(__file__).parent
CONFIG = BASE / "source_config.json"
CHUNK_ROWS = 40_000
SHEET_MIME = "application/vnd.google-apps.spreadsheet"


def load_config():
    if CONFIG.exists():
        return json.loads(CONFIG.read_text(encoding="utf-8"))
    return None


def table_name(title):
    return re.split(r"[\s(]", title.strip(), maxsplit=1)[0]


def _services(cfg):
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    creds = service_account.Credentials.from_service_account_file(
        BASE / cfg["service_account_file"],
        scopes=["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/spreadsheets.readonly"])
    return build("drive", "v3", credentials=creds, cache_discovery=False), build("sheets", "v4", credentials=creds, cache_discovery=False)


def list_remote(cfg):
    """폴더 안 시트 목록: [{id, title, table, modified}]"""
    drive, _ = _services(cfg)
    files, token = [], None
    while True:
        r = drive.files().list(q=f"'{cfg['folder_id']}' in parents and mimeType='{SHEET_MIME}' and trashed=false",
                               fields="nextPageToken, files(id,name,modifiedTime)", pageSize=200, pageToken=token).execute()
        files += r["files"]
        token = r.get("nextPageToken")
        if not token:
            break
    return [dict(id=f["id"], title=f["name"], table=table_name(f["name"]), modified=f["modifiedTime"]) for f in files]


def read_sheet(cfg, sheet_id):
    """첫 시트를 청크 단위로 읽어 DataFrame으로 만든다 (헤더 1행)."""
    _, sheets = _services(cfg)
    meta = sheets.spreadsheets().get(spreadsheetId=sheet_id, fields="sheets(properties(title,gridProperties))").execute()
    p = meta["sheets"][0]["properties"]
    title, rows = p["title"], p["gridProperties"]["rowCount"]
    values = []
    for start in range(1, rows + 1, CHUNK_ROWS):
        rng = f"'{title}'!{start}:{min(start + CHUNK_ROWS - 1, rows)}"
        r = sheets.spreadsheets().values().get(spreadsheetId=sheet_id, range=rng, valueRenderOption="UNFORMATTED_VALUE").execute()
        values += r.get("values", [])
    if not values:
        return pd.DataFrame()
    header, body = values[0], values[1:]
    width = len(header)
    body = [row + [None] * (width - len(row)) for row in body]
    return pd.DataFrame(body, columns=header).replace("", pd.NA)


def read_local():
    out = BASE / "output"
    return {p.stem: pd.read_csv(p, encoding="utf-8-sig") for p in sorted(out.glob("*.csv")) if p.stem != "data_dictionary"}


def local_signature():
    return tuple((p.name, p.stat().st_mtime_ns) for p in sorted((BASE / "output").glob("*.csv")))
