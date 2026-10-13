"""정적 HTML 대시보드: python dashboard.py -> dashboard.html"""
from pathlib import Path

from charts import build_figures
from data_source import read_local

figs = build_figures(read_local())
html = ["<html><head><meta charset='utf-8'><title>육류 소비·유통 인사이트</title></head>",
        "<body style='font-family:sans-serif;max-width:1100px;margin:auto'><h1>가상 육류 소비·유통 데이터 인사이트</h1>"]
first = True
for i, fg, miss in figs:
    if fg is None:
        continue
    fg.update_layout(template="plotly_white", height=430, legend=dict(orientation="h", y=-0.2))
    html.append(fg.to_html(full_html=False, include_plotlyjs="cdn" if first else False))
    first = False
html.append("</body></html>")
(Path(__file__).parent / "dashboard.html").write_text("\n".join(html), encoding="utf-8")
print("saved dashboard.html")
