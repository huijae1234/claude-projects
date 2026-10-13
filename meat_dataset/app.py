"""분석 대시보드: streamlit run app.py
구글 드라이브 폴더(source_config.json)를 읽고, 시트가 추가·수정되면 자동으로 반영한다.
설정이 없으면 output/*.csv 를 읽는다.
"""
import pandas as pd
import streamlit as st

from charts import build_figures
from data_source import list_remote, load_config, local_signature, read_local, read_sheet

KNOWN = {"fact_meat_weekly", "fact_supply_weekly", "fact_import_monthly", "fact_distribution_flow_monthly",
         "mart_monthly_summary", "mart_weekly_national", "dim_region", "dim_cut", "dim_channel", "dim_calendar", "data_dictionary"}
REFRESH_SECONDS = 30

st.set_page_config(page_title="육류 소비·유통 분석", layout="wide")
cfg = load_config()


@st.cache_data(show_spinner="시트를 읽는 중...")
def cached_sheet(sheet_id, modified):
    return read_sheet(cfg, sheet_id)


@st.cache_data
def cached_local(signature):
    return read_local()


def load_all():
    """(tables, 원본 정보 목록, 오류) - 수정 시각이 바뀐 시트만 다시 읽는다."""
    if cfg is None:
        return cached_local(local_signature()), [], "로컬 CSV (source_config.json 없음)"
    try:
        remote = list_remote(cfg)
    except Exception as e:  # 인증·권한 문제는 화면에 그대로 알린다
        return cached_local(local_signature()), [], f"구글 연결 실패 -> 로컬 CSV 사용 중: {e}"
    tables, info = {}, []
    for r in sorted(remote, key=lambda r: r["modified"]):   # 같은 이름이 여럿이면 가장 최근 수정본 사용
        df = cached_sheet(r["id"], r["modified"])
        tables[r["table"]] = df
        info.append(dict(시트=r["title"], 테이블=r["table"], 행=len(df), 열=len(df.columns), 수정=r["modified"][:19].replace("T", " ")))
    return tables, info, "구글 드라이브 폴더"


@st.fragment(run_every=REFRESH_SECONDS)
def body():
    tables, info, source = load_all()
    with st.sidebar:
        st.subheader("데이터 소스")
        st.write(source)
        st.caption(f"{REFRESH_SECONDS}초마다 변경을 확인합니다.")
        if st.button("지금 새로고침"):
            st.cache_data.clear()
            st.rerun()
        st.dataframe(pd.DataFrame(info or [dict(테이블=k, 행=len(v), 열=len(v.columns)) for k, v in tables.items()]),
                     hide_index=True, use_container_width=True)

    tab1, tab2, tab3 = st.tabs(["인사이트 차트", "새로 추가된 시트", "테이블 미리보기"])
    with tab1:
        for i, fig, miss in build_figures(tables):
            if fig is None:
                st.info(f"차트 {i}: 필요한 테이블이 아직 없습니다 -> {', '.join(miss)}")
            else:
                fig.update_layout(template="plotly_white", height=430, legend=dict(orientation="h", y=-0.2))
                st.plotly_chart(fig, use_container_width=True, key=f"fig{i}")
    with tab2:
        extra = {k: v for k, v in tables.items() if k not in KNOWN}
        if not extra:
            st.info("기본 테이블 외의 새 시트가 없습니다. 드라이브 폴더에 시트를 추가하면 여기에 자동으로 나타납니다.")
        for name, df in extra.items():
            st.subheader(f"{name} ({len(df):,}행)")
            num = df.apply(pd.to_numeric, errors="coerce")
            num_cols = [c for c in df.columns if num[c].notna().mean() > 0.9]
            date_cols = [c for c in df.columns if pd.to_datetime(df[c], errors="coerce", format="mixed").notna().mean() > 0.9 and c not in num_cols]
            cat_cols = [c for c in df.columns if c not in num_cols and c not in date_cols]
            if num_cols:
                y = st.selectbox("값 컬럼", num_cols, key=f"y{name}")
                if date_cols:
                    x = st.selectbox("날짜 컬럼", date_cols, key=f"x{name}")
                    g = st.selectbox("구분 컬럼(선택)", ["(없음)"] + cat_cols, key=f"g{name}")
                    d = df.assign(**{x: pd.to_datetime(df[x], errors="coerce", format="mixed"), y: num[y]})
                    if g == "(없음)":
                        st.line_chart(d.groupby(x)[y].sum())
                    else:
                        st.line_chart(d.groupby([x, g])[y].sum().unstack())
            st.dataframe(df.head(200), use_container_width=True)
    with tab3:
        name = st.selectbox("테이블", sorted(tables))
        st.dataframe(tables[name].head(500), use_container_width=True)


st.title("육류 소비·유통 분석 대시보드")
body()
