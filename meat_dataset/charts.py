"""대시보드 차트 생성: build_figures(tables) -> [(제목, figure)]"""
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

SP = {"pork": "돼지고기", "beef": "쇠고기"}
COL = {"pork": "#e07a5f", "beef": "#3d405b"}
CH = {"C1": "대형마트·SSM", "C2": "정육점·전통시장", "C3": "온라인·새벽배송", "C4": "외식·식당"}
NEED = {1: ["fact_meat_weekly", "dim_calendar"], 2: ["fact_meat_weekly", "dim_calendar"], 3: ["fact_meat_weekly", "dim_calendar"],
        4: ["fact_meat_weekly", "dim_calendar", "dim_region"], 5: ["fact_meat_weekly"], 6: ["fact_supply_weekly"],
        7: ["fact_meat_weekly"], 8: ["fact_distribution_flow_monthly", "dim_region"]}


def build_figures(t):
    """필요한 테이블이 없는 차트는 건너뛰고 (번호, 제목, fig 또는 None, 누락 테이블)을 돌려준다."""
    figs = []
    missing = {i: [n for n in need if n not in t] for i, need in NEED.items()}
    f = cal = reg = fl = sup = None
    if "fact_meat_weekly" in t:
        f = t["fact_meat_weekly"]
    if "dim_calendar" in t:
        cal = t["dim_calendar"]
        if f is not None:
            f = f.merge(cal[["week_start", "weeks_to_holiday", "iso_year"]], on="week_start")
    reg, fl, sup = t.get("dim_region"), t.get("fact_distribution_flow_monthly"), t.get("fact_supply_weekly")

    def add(i, build):
        if missing[i]:
            figs.append((i, None, missing[i]))
            return
        figs.append((i, build(), []))
    def b1():
        nat = f.groupby(["week_start", "species", "data_type"]).consumption_kg.sum().reset_index()
        fig = go.Figure()
        for s in SP:
            for dt, dash in (("actual", "solid"), ("forecast", "dot")):
                d = nat[(nat.species == s) & (nat.data_type == dt)]
                if dt == "forecast":
                    d = pd.concat([nat[(nat.species == s) & (nat.data_type == "actual")].tail(1), d])
                fig.add_scatter(x=d.week_start, y=d.consumption_kg / 1000, name=f"{SP[s]} ({'실적' if dt == 'actual' else '예측'})",
                                line=dict(color=COL[s], dash=dash))
        for h in cal[cal.holiday_name.notna()].itertuples():
            fig.add_vline(x=h.week_start, line_width=1, line_dash="dash", line_color="#aaa",
                          annotation_text="설" if h.holiday_name == "seollal" else "추석", annotation_position="top")
        fig.update_layout(title="1. 주간 전국 소비량(톤) - 명절 직전 급등과 계절성", yaxis_title="톤/주")
        return fig

    add(1, b1)

    def b2():
        nat = f.groupby(["week_start", "species", "data_type"]).consumption_kg.sum().reset_index()
        nat2 = nat.groupby(["week_start", "species"]).consumption_kg.sum().reset_index().merge(cal[["week_start", "weeks_to_holiday"]], on="week_start")
        fig = go.Figure()
        for s in SP:
            g = nat2[nat2.species == s]
            base = g[g.weeks_to_holiday.isna()].consumption_kg.mean()
            idx = (g.groupby("weeks_to_holiday").consumption_kg.mean() / base * 100).sort_index()
            fig.add_bar(x=[f"{int(k)}주 전" if k > 0 else ("명절 주" if k == 0 else "명절 다음 주") for k in idx.index], y=idx.values,
                        name=SP[s], marker_color=COL[s])
        fig.add_hline(y=100, line_dash="dash")
        fig.update_layout(title="2. 명절 효과 - 일반 주를 100으로 본 소비 지수", barmode="group", xaxis=dict(categoryorder="array", categoryarray=["3주 전", "2주 전", "1주 전", "명절 주", "명절 다음 주"]))
        return fig

    add(2, b2)

    def b3():
        a = f[f.data_type == "actual"].merge(cal[["week_start"]].assign(q=pd.to_datetime(cal.week_start).dt.to_period("Q").astype(str)), on="week_start")
        fig = make_subplots(rows=1, cols=2, subplot_titles=[SP[s] for s in SP], shared_yaxes=True)
        for i, s in enumerate(SP, 1):
            t = a[a.species == s].groupby(["q", "channel_id"]).consumption_kg.sum().unstack()
            t = t.div(t.sum(axis=1), axis=0) * 100
            for c in t.columns:
                fig.add_scatter(x=t.index, y=t[c], name=CH[c], legendgroup=c, showlegend=i == 1, row=1, col=i, mode="lines+markers")
        fig.update_layout(title="3. 유통 채널 비중(%) 추이 - 온라인 상승, 정육점·전통시장 하락")
        return fig

    add(3, b3)

    def b4():
        b = f[(f.data_type == "actual") & (f.iso_year == 2026)].merge(reg[["region_id", "tier"]], on="region_id")
        t = b.groupby(["tier", "channel_id"]).consumption_kg.sum().unstack()
        t = t.div(t.sum(axis=1), axis=0) * 100
        tn = {"capital": "수도권", "metro": "광역시·세종", "province": "도 지역", "jeju": "제주"}
        fig = go.Figure()
        for c in t.columns:
            fig.add_bar(x=[tn[i] for i in t.index], y=t[c], name=CH[c])
        fig.update_layout(title="4. 지역 구분별 채널 구성(%) - 2026 실적", barmode="stack")
        return fig

    add(4, b4)

    def b5():
        p = f[(f.data_type == "actual") & (f.channel_id == "C1")].groupby(["week_start", "species", "origin"]).retail_price_krw_kg.mean().reset_index()
        fig = make_subplots(rows=1, cols=2, subplot_titles=["삼겹살(P01) 마트 소매가", "한우·수입 등심(B01) 마트 소매가"])
        for i, cid in enumerate(["P01", "B01"], 1):
            d = f[(f.data_type == "actual") & (f.channel_id == "C1") & (f.cut_id == cid)].groupby(["week_start", "origin"]).retail_price_krw_kg.mean().reset_index()
            for o, nm in (("domestic", "국산"), ("import", "수입")):
                x = d[d.origin == o]
                fig.add_scatter(x=x.week_start, y=x.retail_price_krw_kg, name=nm, legendgroup=o, showlegend=i == 1, row=1, col=i,
                                line=dict(color="#c0392b" if o == "domestic" else "#2980b9"))
        fig.update_layout(title="5. 소매가(원/kg) - 국산·수입 가격차와 이벤트 급등(한우 설·추석, ASF)")
        return fig

    add(5, b5)

    def b6():
        sup2 = sup.copy()
        fig = go.Figure()
        for s in SP:
            d = sup2[sup2.species == s]
            fig.add_scatter(x=d.week_start, y=d.import_volume_kg / 1000, name=f"{SP[s]} 수입량(톤)", line=dict(color=COL[s]))
        fig.update_layout(title="6. 주간 수입량(톤) - 2025-04 쇠고기 수입 차질이 보임")
        return fig

    add(6, b6)

    def b7():
        k = ["region_id", "cut_id", "channel_id", "origin"]
        s = f[f.data_type == "actual"].sort_values(k + ["week_start"]).copy()
        s["med"] = s.groupby(k).consumption_kg.transform(lambda x: x.rolling(9, center=True, min_periods=5).median())
        s["r"] = s.consumption_kg / s.med
        cnt = s[(s.r < 0.55) | ((s.r > 1.8) & (s.r <= 5))].groupby("week_start").size()
        unit = s[s.r > 5].groupby("week_start").size()
        fig = go.Figure()
        fig.add_bar(x=cnt.index, y=cnt.values, name="급등락 행 수", marker_color="#e07a5f")
        fig.add_scatter(x=unit.index, y=unit.values * 20, mode="markers", name=f"단위 오류 후보(x20 표기, 총 {int(unit.sum())}건)",
                        marker=dict(color="black", symbol="x", size=9))
        fig.update_layout(title="7. 이상치 탐지 - 롤링 중앙값 대비 급등락 행이 몰린 주 (이벤트 구간 식별)")
        return fig

    add(7, b7)

    def b8():
        q = fl[(fl.data_type == "actual") & (fl.month >= "2026")].merge(reg[["region_id", "tier"]], on="region_id")
        g = q.groupby("flow_id").agg(margin=("margin_krw_kg", "mean"), lead=("lead_time_days", "mean"), name=("to_stage", "first")).reset_index()
        fig = make_subplots(specs=[[{"secondary_y": True}]])
        fig.add_bar(x=g.flow_id + " " + g.name, y=g.margin, name="평균 마진(원/kg)", marker_color="#81b29a")
        fig.add_scatter(x=g.flow_id + " " + g.name, y=g.lead, name="소요일", mode="lines+markers", line=dict(color="#3d405b"), secondary_y=True)
        fig.update_layout(title="8. 유통 단계별 마진과 소요일 (2026 실적)")
        return fig

    add(8, b8)
    return figs
