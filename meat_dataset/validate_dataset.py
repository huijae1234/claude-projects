"""생성된 CSV 검증: python validate_dataset.py [--dir DIR]"""
import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

import config as cfg
from dictionary import DICTIONARY

EXPECTED_ROWS = {
    "fact_meat_weekly": 213_520, "fact_supply_weekly": 314, "fact_import_monthly": 360,
    "fact_distribution_flow_monthly": 7_344, "mart_monthly_summary": 4_896, "mart_weekly_national": 6_280,
    "dim_region": 17, "dim_cut": 10, "dim_channel": 4, "dim_calendar": 157,
}
KEYS = {
    "fact_meat_weekly": ["week_start", "region_id", "cut_id", "channel_id", "origin"],
    "fact_supply_weekly": ["week_start", "species"],
    "fact_import_monthly": ["month", "species", "country"],
    "fact_distribution_flow_monthly": ["month", "species", "region_id", "flow_id"],
    "mart_monthly_summary": ["month", "species", "region_id", "channel_id"],
    "mart_weekly_national": ["week_start", "species", "cut_id", "channel_id"],
    "dim_region": ["region_id"], "dim_cut": ["cut_id"], "dim_channel": ["channel_id"], "dim_calendar": ["week_start"],
}
FIRST_FORECAST_WEEK = "2026-09-28"
# 수입 차질로 한우 도매가가 함께 오르는 이벤트: 가격 상승에 따른 소비 감소와 대체 수요가 상쇄되어 순효과 방향이 정해져 있지 않다
COMPANION_EVENTS = {"beef_import_substitution"}
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))


def main(data_dir):
    t = {n: pd.read_csv(data_dir / f"{n}.csv", encoding="utf-8-sig") for n in EXPECTED_ROWS}
    fact, cal = t["fact_meat_weekly"], t["dim_calendar"]
    pop = t["dim_region"]["population"].sum()

    # 구조
    for n, rows in EXPECTED_ROWS.items():
        check(f"행 수 {n}", len(t[n]) == rows, f"{len(t[n]):,} (기대 {rows:,})")
    check("fact 20만 행 이상", len(fact) >= 200_000, f"{len(fact):,}")
    for n, keys in KEYS.items():
        check(f"키 중복 없음 {n}", not t[n].duplicated(keys).any(), f"중복 {t[n].duplicated(keys).sum()}건")
    dict_cols = {}
    for tb, col, *_ in DICTIONARY:
        dict_cols.setdefault(tb, []).append(col)
    for n in t:
        check(f"데이터 사전 커버리지 {n}", list(t[n].columns) == dict_cols.get(n), "")

    # 결측
    nulls = fact.isna().sum()
    bad_cols = nulls[(nulls > 0) & ~nulls.index.isin(["wholesale_price_krw_kg", "retail_price_krw_kg"])]
    check("fact 결측은 가격 컬럼의 의도된 소량뿐", bad_cols.empty and nulls.sum() / len(fact) <= 0.0012,
          f"결측 {int(nulls.sum())}건 ({nulls.sum() / len(fact):.4%})")
    for n in t:
        if n in ("fact_meat_weekly", "dim_calendar"):
            continue
        check(f"결측 없음 {n}", t[n].isna().sum().sum() == 0, "")

    # 실적/예측 경계
    fc = cal[cal["data_type"] == "forecast"]
    check("예측 주 14주, 첫 주 2026-09-28", len(fc) == 14 and fc["week_start"].min() == FIRST_FORECAST_WEEK,
          f"{len(fc)}주, 시작 {fc['week_start'].min()}")
    check("fact 예측 구분 일치", ((fact["week_start"] >= FIRST_FORECAST_WEEK) == (fact["data_type"] == "forecast")).all(), "")
    check("월 단위 예측은 2026-10 이후", ((t["mart_monthly_summary"]["month"] >= "2026-10")
                                   == (t["mart_monthly_summary"]["data_type"] == "forecast")).all(), "")

    # 연간 1인당 소비량 / 국산 비중 (앵커)
    fy = fact.merge(cal[["week_start", "iso_year"]], on="week_start")
    for s in cfg.SPECIES:
        P = cfg.PARAMS[s]
        for y in (2024, 2025, 2026):
            n_weeks = (cal["iso_year"] == y).sum()
            exp = P["pc_2024"] * (1 + P["pc_growth"]) ** (y - 2024) * n_weeks / (365.25 / 7)
            got = fy[(fy["species"] == s) & (fy["iso_year"] == y)]["consumption_kg"].sum() / pop
            check(f"1인당 연 소비량 {s} {y}", abs(got / exp - 1) <= 0.10, f"{got:.2f}kg (기대 {exp:.2f}kg, {got / exp - 1:+.1%})")
    d24 = fy[(fy["iso_year"] == 2024)].groupby(["species", "origin"])["consumption_kg"].sum().unstack()
    for s in cfg.SPECIES:
        share = d24.loc[s, "domestic"] / d24.loc[s].sum()
        tgt = cfg.PARAMS[s]["dom_share_2024"]
        check(f"2024 국산 비중 {s}", abs(share - tgt) <= 0.03, f"{share:.1%} (앵커 {tgt:.1%})")
    # 2025는 쇠고기 수입 차질 이벤트의 영향을 받으므로 이벤트가 없는 2024와 2026의 같은 기간(1~9월 실적 주)을 비교한다
    def dom_share_period(year):
        d = fy[(fy["iso_year"] == year) & (fy["week_start"].str[5:] < "09-22") & (fy["data_type"] == "actual")]
        g = d.groupby(["species", "origin"])["consumption_kg"].sum().unstack()
        return g["domestic"] / g.sum(axis=1)
    p24, p26 = dom_share_period(2024), dom_share_period(2026)
    for s in cfg.SPECIES:
        check(f"국산 비중 감소 추세 {s}", p26[s] < p24[s], f"2024 1~9월 {p24[s]:.1%} -> 2026 1~9월 {p26[s]:.1%}")

    # 판매액 = 소비량 x 소매가
    ok = fact["retail_price_krw_kg"].notna()
    rel = (fact.loc[ok, "sales_krw"] - fact.loc[ok, "consumption_kg"] * fact.loc[ok, "retail_price_krw_kg"]).abs() / fact.loc[ok, "sales_krw"].clip(lower=1)
    check("판매액 = 소비량 x 소매가", (rel > 0.02).mean() <= 0.002, f"2% 초과 불일치 {(rel > 0.02).sum()}건 (입력 오류 행 포함)")
    check("가격 범위 정상", fact["retail_price_krw_kg"].dropna().between(3_000, 250_000).all(), "")

    # 집계 일치
    m1 = fact.assign(month=fact["week_start"].map(dict(zip(cal["week_start"], cal["month"]))))
    a = m1.groupby(["month", "species"])["consumption_kg"].sum()
    b = t["mart_monthly_summary"].groupby(["month", "species"])["consumption_kg"].sum()
    check("mart_monthly = fact 월 합계", ((a - b).abs() / a).max() < 1e-5, f"최대 오차 {((a - b).abs() / a).max():.2e}")
    a = fact.groupby(["week_start", "species"])["consumption_kg"].sum()
    b = t["mart_weekly_national"].groupby(["week_start", "species"])["consumption_kg"].sum()
    check("mart_weekly = fact 주 합계", ((a - b).abs() / a).max() < 1e-5, f"최대 오차 {((a - b).abs() / a).max():.2e}")
    sup = t["fact_supply_weekly"].sort_values(["species", "week_start"]).copy()
    sup["delta"] = sup.groupby("species")["ending_stock_kg"].diff().fillna(0)
    sup = sup.merge(a.rename("cons").reset_index(), on=["week_start", "species"])
    resid = ((sup["domestic_output_kg"] + sup["import_volume_kg"] - sup["cons"] - sup["delta"]).abs() / sup["cons"])
    # 수급표는 입력 오류가 들어가기 전 소비량으로 만들어져 있어, 오차는 주입된 단위 오류 행(x10)에서만 생긴다
    check("수급 항등식 (생산+수입=소비+재고증감)", (resid > 0.03).mean() <= 0.05 and resid.median() < 0.002,
          f"중앙 오차 {resid.median():.2%}, 3% 초과 {(resid > 0.03).sum()}주 (단위 오류 행 영향)")
    for n in ("mart_monthly_summary", "fact_import_monthly", "fact_distribution_flow_monthly"):
        wim = t[n].groupby("month")["weeks_in_month"].first()
        expect = cal.groupby("month").size()
        check(f"weeks_in_month 일치 {n}", wim.isin([4, 5]).all() and (wim == expect.reindex(wim.index)).all(),
              f"4주 {int((wim == 4).sum())}개월, 5주 {int((wim == 5).sum())}개월")
    flow = t["fact_distribution_flow_monthly"]
    f1 = flow[flow["flow_id"].isin(["F3", "F4", "F5", "F6"])].groupby(["month", "species"])["volume_kg"].sum()
    mm = t["mart_monthly_summary"].groupby(["month", "species"])["consumption_kg"].sum()
    check("유통 흐름 물량 > 소비량 (감모 반영)", ((f1 / mm) > 1.0).all() and ((f1 / mm) < 1.03).all(),
          f"비율 {(f1 / mm).min():.3f}~{(f1 / mm).max():.3f}")

    # 패턴
    nat = fact.groupby(["week_start", "species"])["consumption_kg"].sum().reset_index().merge(cal, on="week_start")
    for s in cfg.SPECIES:
        d = nat[nat["species"] == s]
        base = d[d["weeks_to_holiday"].isna()]["consumption_kg"].mean()
        r1 = d[d["weeks_to_holiday"] == 1]["consumption_kg"].mean() / base
        need = 1.12 if s == "pork" else 1.25
        check(f"명절 직전 주 소비 상승 {s}", r1 >= need, f"일반 주 대비 {r1:.2f}배 (기준 {need}배 이상)")
    p = fact[(fact["cut_id"] == "P01")].groupby("week_start")["consumption_kg"].sum()
    weeks = list(p.index)
    ratios = []
    for _, row in cal[cal["is_samgyeopsal_day_week"] == 1].iterrows():
        i = weeks.index(row["week_start"])
        around = [p.iloc[j] for j in (i - 2, i - 1, i + 1, i + 2) if 0 <= j < len(p)]
        ratios.append(p.iloc[i] / np.mean(around))
    check("삼겹살데이 주 삼겹살 소비 상승", np.mean(ratios) >= 1.15, f"인접 주 대비 평균 {np.mean(ratios):.2f}배")

    act = fact[(fact["data_type"] == "actual") & fact["wholesale_price_krw_kg"].notna()].copy()
    act["wxp"] = act["wholesale_price_krw_kg"].astype(float) * act["consumption_kg"]
    agg = act.groupby(["week_start", "species", "cut_id", "origin"]).agg(c=("consumption_kg", "sum"), w=("wxp", "sum")).reset_index()
    agg["p"] = agg["w"] / agg["c"]
    for s in cfg.SPECIES:
        d = agg[agg["species"] == s].copy()
        d["series"] = d["cut_id"] + d["origin"]
        d = d.sort_values(["series", "week_start"])
        d["dlp"] = d.groupby("series")["p"].transform(lambda x: np.log(x).diff())
        d["dlc"] = d.groupby("series")["c"].transform(lambda x: np.log(x).diff())
        d = d.dropna().merge(cal[["week_start", "weeks_to_holiday"]], on="week_start")
        d = d[d["weeks_to_holiday"].isna()]
        for col in ("dlp", "dlc"):
            d[col] = d[col] - d.groupby("week_start")[col].transform("mean")
        slope = (d["dlp"] * d["dlc"]).sum() / (d["dlp"] ** 2).sum()
        check(f"가격 상승 시 소비 감소 {s}", slope < -0.15, f"주간 변화율 회귀 기울기 {slope:.2f}")

    ch = fact.groupby(["species", "channel_id", "week_start"])["consumption_kg"].sum().reset_index()
    for s in cfg.SPECIES:
        d = ch[ch["species"] == s].pivot(index="week_start", columns="channel_id", values="consumption_kg")
        share = d["C3"] / d.sum(axis=1)
        check(f"온라인 비중 우상향 {s}", share.iloc[100:143].mean() - share.iloc[:26].mean() >= 0.03,
              f"초반 26주 {share.iloc[:26].mean():.1%} -> 후반 {share.iloc[100:143].mean():.1%}")

    # 이벤트가 실제로 데이터에 반영됐는지 (개발자용 점검, 라벨은 데이터에 없음)
    for ev in cfg.EVENTS:
        if "cons" not in ev:
            continue
        sel = fact[fact["data_type"] == "actual"]
        if ev.get("species"):
            sel = sel[sel["species"] == ev["species"]]
        for key, col in (("regions", "region_id"), ("cuts", "cut_id"), ("channels", "channel_id"), ("origins", "origin")):
            if key in ev:
                sel = sel[sel[col].isin(ev[key])]
        series = sel.groupby("week_start")["consumption_kg"].sum()
        weeks = list(series.index)
        start = next(i for i, w in enumerate(weeks) if w >= ev["start"].isoformat())
        n = ev["weeks"]
        inside = series.iloc[start:start + n].mean()
        outside = pd.concat([series.iloc[max(start - 4, 0):start], series.iloc[start + n:start + n + 4]]).mean()
        ratio = inside / outside
        if ev["name"] in COMPANION_EVENTS:
            continue
        mean_profile = 0.5 if ev["shape"] == "tri" else 1.0
        expected = (ev["cons"] - 1) * mean_profile        # 주입한 평균 효과
        ok_dir = (ratio - 1) * expected > 0 and abs(ratio - 1) >= 0.4 * abs(expected)
        check(f"이벤트 반영 {ev['name']}", ok_dir, f"이벤트 주 평균 / 전후 4주 평균 = {ratio:.2f} (주입 평균 효과 {expected:+.1%})")

    width = max(len(n) for n, _, _ in results)
    for n, ok, d in results:
        print(f"[{'PASS' if ok else 'FAIL'}] {n:<{width}}  {d}")
    failed = [n for n, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} 통과" + (f", 실패: {failed}" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=str(Path(__file__).parent / "output"))
    sys.exit(main(Path(ap.parse_args().dir)))
