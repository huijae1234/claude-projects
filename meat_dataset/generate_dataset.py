"""가상 육류 소비·유통 데이터셋 생성기.

사용법: python generate_dataset.py [--out DIR]
시드가 고정되어 있어 같은 환경에서는 항상 같은 CSV가 만들어진다.
"""
import argparse
import hashlib
import json
import sys
from datetime import timedelta
from pathlib import Path

import numpy as np
import pandas as pd

import config as cfg
from dictionary import DICTIONARY, SOURCES, TABLE_DESC

W = cfg.N_WEEKS
REGIONS = cfg.REGIONS
R = len(REGIONS)
H = len(cfg.CHANNELS)
C = 5
O = 2
YEAR_WEEKS = 365.25 / 7
REGION_IDS = np.array([r[0] for r in REGIONS])
CHANNEL_IDS = np.array([c[0] for c in cfg.CHANNELS])

FACT_COLS = ["week_start", "species", "region_id", "cut_id", "channel_id", "origin", "consumption_kg",
             "sales_krw", "wholesale_price_krw_kg", "retail_price_krw_kg", "data_type"]


# ------------------------------------------------------------------ 달력
def holiday_week(week_start):
    """명절까지 남은 주 수 k (3~-1)와 명절 이름. 해당 없으면 ("", None)."""
    for name, dates in cfg.HOLIDAYS.items():
        for d in dates:
            k = (d - week_start).days // 7
            if -1 <= k <= 3:
                return name, k
    return "", None


class Calendar:
    def __init__(self):
        self.week_start = [cfg.START + timedelta(days=7 * i) for i in range(W)]
        thursday = [d + timedelta(days=3) for d in self.week_start]
        self.thursday = thursday
        self.iso_year = np.array([d.year for d in thursday])
        self.month = [f"{d.year}-{d.month:02d}" for d in thursday]
        self.doy = np.array([d.timetuple().tm_yday for d in thursday], dtype=float)
        self.t = np.arange(W) / YEAR_WEEKS
        self.is_forecast = np.array([d > cfg.LAST_ACTUAL_WEEK for d in self.week_start])
        hol = [holiday_week(d) for d in self.week_start]
        self.holiday_name = [h[0] if h[1] == 0 else "" for h in hol]
        self.weeks_to_holiday = [h[1] for h in hol]
        self.hol_eff = {
            s: np.array([cfg.PARAMS[s]["hol_eff"].get(h[1], 0.0) if h[1] is not None else 0.0 for h in hol])
            for s in cfg.SPECIES
        }
        self.samgyeopsal = np.array(
            [any(0 <= (d - ws).days <= 6 for d in cfg.SAMGYEOPSAL_DAYS) for ws in self.week_start])


def seasonal(doy, amp, peak):
    return 1.0 + amp * np.cos(2 * np.pi * (doy - peak) / 365.25)


def ar1(rng, w, size, phi, sigma):
    e = rng.normal(0, sigma, (w, *size))
    x = np.empty_like(e)
    x[0] = e[0] / np.sqrt(1 - phi ** 2)
    for i in range(1, w):
        x[i] = phi * x[i - 1] + e[i]
    return x


# ------------------------------------------------------------------ 이벤트 (비공개 명세 적용)
def event_index(ev, cal, kind):
    n = ev["weeks"]
    start = next(i for i, d in enumerate(cal.week_start) if d >= ev["start"])
    idx = np.arange(start, min(start + n, W))
    shape = ev.get("wholesale_shape", ev["shape"]) if kind == "wholesale" else ev["shape"]
    i = np.arange(len(idx))
    if shape == "flat":
        p = np.ones(len(idx))
    elif shape == "tri":
        p = 1 - np.abs(2 * (i + 0.5) / n - 1)
    else:
        p = np.exp(-i / (n / 3))
    return idx, p


def event_select(ev, s):
    if ev.get("species") not in (None, s):
        return None
    ri = [i for i, r in enumerate(REGIONS) if r[0] in ev["regions"]] if "regions" in ev else list(range(R))
    ci = [i for i, c in enumerate(cfg.CUTS[s]) if c[0] in ev["cuts"]] if "cuts" in ev else list(range(C))
    hi = [i for i, c in enumerate(cfg.CHANNELS) if c[0] in ev["channels"]] if "channels" in ev else list(range(H))
    oi = [cfg.ORIGINS.index(o) for o in ev["origins"]] if "origins" in ev else list(range(O))
    if not (ri and ci and hi and oi):
        return None
    return ri, ci, hi, oi


def apply_price_events(shock, s, cal):
    for ev in cfg.EVENTS:
        sel = event_select(ev, s)
        if sel is None or "wholesale" not in ev:
            continue
        _, ci, _, _ = sel
        idx, p = event_index(ev, cal, "wholesale")
        for origin, peak in ev["wholesale"].items():
            o = cfg.ORIGINS.index(origin)
            shock[np.ix_(idx, ci, [o])] *= (1 + (peak - 1) * p)[:, None, None]
    return shock


def apply_array_events(arr, s, cal, key):
    for ev in cfg.EVENTS:
        if key not in ev:
            continue
        sel = event_select(ev, s)
        if sel is None:
            continue
        ri, ci, hi, oi = sel
        idx, p = event_index(ev, cal, "cons")
        arr[np.ix_(idx, ri, ci, hi, oi)] *= (1 + (ev[key] - 1) * p)[:, None, None, None, None]
    return arr


# ------------------------------------------------------------------ 육종별 시뮬레이션
def simulate_species(s, cal, rng, noisy, b):
    """하향식으로 전국 총량 -> 시도·부위 -> 채널 -> 국산/수입 순서로 배분한다."""
    P = cfg.PARAMS[s]

    def nz(sigma, shape):
        if not noisy:
            return 1.0
        return np.exp(rng.normal(-0.5 * sigma ** 2, sigma, shape))

    # 1) 전국 주간 총량: 추세 x 계절성 x 명절 효과, 연도별 1인당 목표에 맞춰 보정
    shape = ((1 + P["pc_growth"] * cal.t) * seasonal(cal.doy, *P["season"])
             * (1 + cal.hol_eff[s] + P["extra_samgyeopsal"] * cal.samgyeopsal))
    N = np.empty(W)
    for y in np.unique(cal.iso_year):
        m = cal.iso_year == y
        target = P["pc_2024"] * (1 + P["pc_growth"]) ** (y - 2024) * cfg.POP_TOTAL * m.sum() / YEAR_WEEKS
        N[m] = shape[m] * target / shape[m].sum()
    N = N * nz(0.025, W)

    # 2) 시도 x 부위 가중치
    pop = np.array([r[4] for r in REGIONS], float)
    reg = pop / pop.sum() * np.array(cfg.REGION_PC[s])
    reg_w = reg[None, :] * nz(0.03, (W, R))
    rc = np.ones((R, C))
    for (sp, rid, ci), mult in cfg.REGION_CUT_MULT.items():
        if sp == s:
            rc[list(REGION_IDS).index(rid), ci] = mult
    cut = np.array(P["share"]) * np.stack([seasonal(cal.doy, a, p) for a, p in P["cut_season"]], axis=1)
    cut = cut * (1 + cal.hol_eff[s][:, None] * np.array(P["hol_mult"])[None, :])
    cut = cut * (1 + cal.samgyeopsal[:, None] * (np.array(P["samgyeopsal_mult"])[None, :] - 1))
    cut = cut * nz(0.04, (W, C))
    w_rc = reg_w[:, :, None] * cut[:, None, :] * rc[None]
    w_rc = w_rc / w_rc.sum(axis=(1, 2), keepdims=True)

    # 3) 채널 비중: 시간에 따라 변하고 지역·부위·명절에 따라 달라짐
    tt = cal.t / cal.t.max()
    base = (1 - tt)[:, None] * np.array(P["ch_share_0"]) + tt[:, None] * np.array(P["ch_share_1"])
    tier = np.array([cfg.TIER_CHANNEL[r[5]] for r in REGIONS], float)
    tier[:, 3] *= np.array([cfg.FOODSERVICE_REGION_MULT.get(r[0], 1.0) for r in REGIONS])
    hol = 1 + cal.hol_eff[s][:, None] * np.array(P["ch_hol"])[None, :]
    hol[:, 3] *= seasonal(cal.doy, *cfg.FOODSERVICE_SEASON)
    ch = (base[:, None, None, :] * tier[None, :, None, :] * np.array(P["ch_cut"])[None, None, :, :]
          * hol[:, None, None, :] * nz(0.03, (W, 1, 1, H)))
    ch = ch / ch.sum(axis=-1, keepdims=True)
    T = N[:, None, None, None] * w_rc[..., None] * ch          # (W, R, C, H)

    # 4) 도매가: 기준가 x 추세 x 계절 x 명절 x (AR(1) 노이즈 x 이벤트 충격)
    retail0 = np.stack([P["retail_dom"], P["retail_imp"]], axis=1).astype(float)       # (C, O)
    wh0 = retail0 / cfg.MARKUP[0]
    trend = np.log1p(np.array(P["price_trend"]))[None, :] * cal.t[:, None]               # (W, O)
    season_p = np.stack([np.log(seasonal(cal.doy, 0.4 * a, p)) for a, p in P["cut_season"]], axis=1)   # (W, C)
    hol_p = np.zeros((W, O))
    hol_p[:, 0] = P["price_hol"] * cal.hol_eff[s]
    log_dev = np.zeros((W, C, O))
    shock = np.ones((W, C, O))
    if noisy:
        sig = np.array(P["ar_sigma"])
        log_dev = 0.6 * ar1(rng, W, (O,), 0.85, sig)[:, None, :] + 0.8 * ar1(rng, W, (C, O), 0.85, sig)
        shock = apply_price_events(shock, s, cal)
    dev = np.exp(log_dev) * shock
    wh = wh0[None] * np.exp(trend[:, None, :] + season_p[:, :, None] + hol_p[:, None, :]) * dev   # (W, C, O)
    i1 = np.maximum(np.arange(W) - 1, 0)
    i2 = np.maximum(np.arange(W) - 2, 0)
    wh_lag = 0.6 * wh[i1] + 0.4 * wh[i2]                                                  # 소매가는 도매가를 1~2주 늦게 따라감

    # 5) 국산/수입 분할: 부위 기본 비중 + 수입 증가 추세 + 채널·지역 보정 + 가격비 대체
    d0 = np.log(np.array(P["dom_share"]) / (1 - np.array(P["dom_share"])))
    reg_adj = np.zeros(R)
    for i, r in enumerate(REGIONS):
        if s == "beef" and r[6]:
            reg_adj[i] += np.log(cfg.DOM_ODDS_REGION[("beef", True)])
        if s == "pork" and r[0] == "R17":
            reg_adj[i] += np.log(cfg.DOM_ODDS_REGION[("pork", "R17")])
    zbase = (d0[None, None, :, None] + (cfg.DOM_TREND_LOGIT * cal.t)[:, None, None, None]
             + np.log(P["dom_odds_ch"])[None, None, None, :] + reg_adj[None, :, None, None])
    sub = -cfg.SUBSTITUTION_SIGMA * (np.log(dev[:, :, 0]) - np.log(dev[:, :, 1]))        # (W, C)
    dom_share = 1 / (1 + np.exp(-(zbase + sub[:, None, :, None] + b)))

    # 6) 소비량: 자기 가격 탄력성과 행 단위 노이즈, 이벤트 효과
    cons = np.stack([T * dom_share, T * (1 - dom_share)], axis=-1)                      # (W, R, C, H, O)
    cons = cons * nz(0.05, (W, R, C, H, O))
    cons = cons * dev[:, None, :, None, :] ** (-np.array(P["eps"]))
    if noisy:
        cons = apply_array_events(cons, s, cal, "cons")

    # 7) 지역 가격 계수와 채널 마진
    pf = np.array(cfg.REGION_PRICE)
    wholesale = wh[:, None, :, :] * pf[None, :, None, None] * nz(0.008, (W, R, 1, 1))
    retail = (wh_lag[:, None, :, None, :] * pf[None, :, None, None, None]
              * np.array(cfg.MARKUP)[None, None, None, :, None] * nz(0.01, (W, R, 1, 1, 1)))
    if noisy:
        retail = apply_array_events(retail, s, cal, "retail")
    return dict(cons=cons, wholesale=wholesale, retail=retail, T=T, zbase=zbase)


def calibrate(s, cal):
    """2024년 국산 비중이 앵커(자급률)에 맞도록 로짓 상수를 이분탐색으로 찾는다."""
    res = simulate_species(s, cal, None, False, 0.0)
    m = cal.iso_year == 2024
    T, z = res["T"][m], res["zbase"][m]
    target = cfg.PARAMS[s]["dom_share_2024"]
    lo, hi = -4.0, 4.0
    for _ in range(60):
        mid = (lo + hi) / 2
        share = (T / (1 + np.exp(-(z + mid)))).sum() / T.sum()
        lo, hi = (mid, hi) if share < target else (lo, mid)
    return (lo + hi) / 2


# ------------------------------------------------------------------ 테이블 조립
def build_dims(cal):
    pop = np.array([r[4] for r in REGIONS], float)
    pop = np.round(pop / pop.sum() * cfg.POP_TOTAL).astype(int)
    dim_region = pd.DataFrame({
        "region_id": REGION_IDS, "region_name": [r[1] for r in REGIONS], "region_short": [r[2] for r in REGIONS],
        "area": [r[3] for r in REGIONS], "tier": [r[5] for r in REGIONS], "population": pop})
    dim_cut = pd.DataFrame([
        dict(cut_id=c[0], species=s, species_ko=cfg.SPECIES_KO[s], cut_name_ko=c[1], cut_name_en=c[2])
        for s in cfg.SPECIES for c in cfg.CUTS[s]])
    dim_channel = pd.DataFrame(cfg.CHANNELS, columns=["channel_id", "channel_name_ko", "channel_name_en"])
    iso = [d.isocalendar() for d in cal.thursday]
    dim_calendar = pd.DataFrame({
        "week_start": [d.isoformat() for d in cal.week_start],
        "week_end": [(d + timedelta(days=6)).isoformat() for d in cal.week_start],
        "iso_year": [i[0] for i in iso], "iso_week": [i[1] for i in iso], "month": cal.month,
        "quarter": [f"{d.year}Q{(d.month - 1) // 3 + 1}" for d in cal.thursday],
        "data_type": np.where(cal.is_forecast, "forecast", "actual"),
        "holiday_name": cal.holiday_name,
        "weeks_to_holiday": pd.array(cal.weeks_to_holiday, dtype="Int64"),
        "is_samgyeopsal_day_week": cal.samgyeopsal.astype(int),
        "is_summer_vacation_season": [int((d.month == 7 and d.day >= 20) or (d.month == 8 and d.day <= 20)) for d in cal.thursday],
        "is_family_month": [int(d.month == 5) for d in cal.thursday]})
    return dim_region, dim_cut, dim_channel, dim_calendar


def round10(x):
    return (np.round(x / 10) * 10).astype(np.int64)


def build_fact(final, cal, rng):
    frames = []
    for s in cfg.SPECIES:
        cons, wh, rt = final[s]["cons"], final[s]["wholesale"], final[s]["retail"]
        wi, ri, ci, hi, oi = np.indices(cons.shape).reshape(5, -1)
        cut_ids = np.array([c[0] for c in cfg.CUTS[s]])
        df = pd.DataFrame({
            "week_idx": wi, "species": s, "region_id": REGION_IDS[ri], "cut_id": cut_ids[ci],
            "channel_id": CHANNEL_IDS[hi], "origin": np.array(cfg.ORIGINS)[oi],
            "consumption_kg": np.round(cons.ravel(), 1),
            "wholesale_price_krw_kg": round10(wh[wi, ri, ci, oi]),
            "retail_price_krw_kg": round10(rt.ravel())})
        frames.append(df)
    fact = pd.concat(frames, ignore_index=True)
    fact = fact.sort_values(["week_idx", "species", "cut_id", "region_id", "channel_id", "origin"], ignore_index=True)
    fact["sales_krw"] = np.round(fact["consumption_kg"] * fact["retail_price_krw_kg"]).astype(np.int64)
    fact["week_start"] = np.array([d.isoformat() for d in cal.week_start])[fact["week_idx"].to_numpy()]
    fact["month"] = np.array(cal.month)[fact["week_idx"].to_numpy()]
    fact["data_type"] = np.where(cal.is_forecast[fact["week_idx"].to_numpy()], "forecast", "actual")
    fact["wholesale_price_krw_kg"] = fact["wholesale_price_krw_kg"].astype("Int64")
    fact["retail_price_krw_kg"] = fact["retail_price_krw_kg"].astype("Int64")

    # 입력 오류형 이상치 (실적 구간에만, 라벨은 남기지 않음)
    q = cfg.QUALITY_ERRORS
    pool = np.flatnonzero(fact["data_type"].to_numpy() == "actual")
    pick = rng.choice(pool, size=sum(q.values()), replace=False)
    unit, miss_r, miss_w = np.split(pick, [q["unit_error"], q["unit_error"] + q["missing_retail"]])
    fact.loc[unit, "consumption_kg"] = np.round(fact.loc[unit, "consumption_kg"] * 10, 1)
    fact.loc[miss_r, "retail_price_krw_kg"] = pd.NA
    fact.loc[miss_w, "wholesale_price_krw_kg"] = pd.NA
    return fact


def build_supply(final, cal, rng):
    """수급 항등식: 국내 생산 + 수입 = 소비 + 재고 증감 (재고 증감은 절반씩 배분)."""
    rows = []
    phi, sig = cfg.STOCK_AR
    for s in cfg.SPECIES:
        P = cfg.PARAMS[s]
        cons = final[s]["cons"]
        dom = cons[..., 0].sum(axis=(1, 2, 3))
        imp = cons[..., 1].sum(axis=(1, 2, 3))
        ar = ar1(rng, W, (), phi, sig)
        slaughter_noise = np.exp(rng.normal(0, cfg.SLAUGHTER_NOISE, W))
        for i in np.flatnonzero(cal.is_forecast):      # 예측 구간은 노이즈 없이 서서히 평균으로 복귀
            ar[i] = phi * ar[i - 1]
            slaughter_noise[i] = 1.0
        stock = P["stock_target_kg"] * seasonal(cal.doy, *cfg.STOCK_SEASON) * np.exp(ar)
        delta = stock - np.concatenate([stock[:1], stock[:-1]])
        output = dom + 0.5 * delta
        imports = imp + 0.5 * delta
        rows.append(pd.DataFrame({
            "week_start": [d.isoformat() for d in cal.week_start], "species": s,
            "slaughter_heads": np.round(output / P["meat_per_head_kg"] * slaughter_noise).astype(np.int64),
            "domestic_output_kg": np.round(output).astype(np.int64),
            "import_volume_kg": np.round(imports).astype(np.int64),
            "import_share_pct": np.round(imports / (output + imports) * 100, 2),
            "ending_stock_kg": np.round(stock).astype(np.int64),
            "data_type": np.where(cal.is_forecast, "forecast", "actual")}))
    out = pd.concat(rows, ignore_index=True)
    out["_order"] = out["species"].map({s: i for i, s in enumerate(cfg.SPECIES)})
    return out.sort_values(["week_start", "_order"], ignore_index=True).drop(columns="_order")


def build_import_monthly(final, supply, cal, rng, wim):
    month_keys = list(dict.fromkeys(cal.month))
    forecast_month = {m: bool(cal.is_forecast[cal.month.index(m)]) for m in month_keys}
    sup = supply.copy()
    sup["month"] = sup["week_start"].map(dict(zip([d.isoformat() for d in cal.week_start], cal.month)))
    monthly = sup.groupby(["month", "species"])["import_volume_kg"].sum()
    rows = []
    for s in cfg.SPECIES:
        wh_imp = final[s]["wholesale"][:, :, :, 1].mean(axis=(1, 2))
        idx_week = wh_imp / wh_imp[:52].mean()
        month_idx = pd.Series(idx_week).groupby(np.array(cal.month)).mean()
        countries = cfg.IMPORT_COUNTRIES[s]
        for mi, m in enumerate(month_keys):
            w = np.array([share * (1 + cfg.IMPORT_COUNTRY_TREND.get((s, name), 0.0)) ** (mi / 12) for name, share in countries])
            if not forecast_month[m]:
                w = w * np.exp(rng.normal(0, 0.05, len(w)))
            w = w / w.sum()
            for (name, _), share in zip(countries, w):
                noise = 1.0 if forecast_month[m] else np.exp(rng.normal(0, 0.02))
                rows.append(dict(
                    month=m, species=s, country=name,
                    import_volume_kg=int(round(monthly[(m, s)] * share)),
                    import_share_pct=round(share * 100, 2),
                    cif_price_usd_kg=round(cfg.CIF_BASE_USD[s] * month_idx[m] ** 0.6
                                           * cfg.CIF_COUNTRY_FACTOR[s][name] * noise, 3),
                    weeks_in_month=wim[m],
                    data_type="forecast" if forecast_month[m] else "actual"))
    out = pd.DataFrame(rows)
    out["_order"] = out["species"].map({s: i for i, s in enumerate(cfg.SPECIES)})
    return out.sort_values(["month", "_order"], ignore_index=True, kind="stable").drop(columns="_order")


def month_type(month):
    return "forecast" if month >= "2026-10" else "actual"


def build_marts(fact, dim_region, wim):
    pop = dim_region.set_index("region_id")["population"]
    key = ["month", "species", "region_id", "channel_id"]
    mm = fact.groupby(key, sort=True).agg(consumption_kg=("consumption_kg", "sum"), sales_krw=("sales_krw", "sum")).reset_index()
    imp = fact[fact["origin"] == "import"].groupby(key)["consumption_kg"].sum().rename("import_kg").reset_index()
    mm = mm.merge(imp, on=key, how="left")
    mm["avg_retail_price_krw_kg"] = np.round(mm["sales_krw"] / mm["consumption_kg"]).astype(np.int64)
    mm["per_capita_kg"] = np.round(mm["consumption_kg"] / mm["region_id"].map(pop), 4)
    mm["import_share_pct"] = np.round(mm["import_kg"] / mm["consumption_kg"] * 100, 2)
    mm["consumption_kg"] = np.round(mm["consumption_kg"], 1)
    mm["weeks_in_month"] = mm["month"].map(wim)
    mm["data_type"] = mm["month"].map(month_type)
    mm = mm[["month", "species", "region_id", "channel_id", "consumption_kg", "sales_krw",
             "avg_retail_price_krw_kg", "per_capita_kg", "import_share_pct", "weeks_in_month", "data_type"]]

    key = ["week_start", "species", "cut_id", "channel_id"]
    wk = fact.groupby(key, sort=True).agg(consumption_kg=("consumption_kg", "sum"), sales_krw=("sales_krw", "sum"),
                                          data_type=("data_type", "first")).reset_index()
    imp = fact[fact["origin"] == "import"].groupby(key)["consumption_kg"].sum().rename("import_kg").reset_index()
    wk = wk.merge(imp, on=key, how="left")
    wk["avg_retail_price_krw_kg"] = np.round(wk["sales_krw"] / wk["consumption_kg"]).astype(np.int64)
    wk["import_share_pct"] = np.round(wk["import_kg"] / wk["consumption_kg"] * 100, 2)
    wk["consumption_kg"] = np.round(wk["consumption_kg"], 1)
    wk = wk[["week_start", "species", "cut_id", "channel_id", "consumption_kg", "sales_krw",
             "avg_retail_price_krw_kg", "import_share_pct", "data_type"]]
    return mm, wk


def build_flows(fact, dim_region, rng, wim):
    piv = fact.groupby(["month", "species", "region_id", "channel_id"])["consumption_kg"].sum().unstack("channel_id")
    piv = piv.reset_index()
    months = sorted(piv["month"].unique())
    mi = piv["month"].map({m: i for i, m in enumerate(months)}).to_numpy()
    direct = cfg.DIRECT_SUPPLY_SHARE[0] + (cfg.DIRECT_SUPPLY_SHARE[1] - cfg.DIRECT_SUPPLY_SHARE[0]) * mi / (len(months) - 1)
    f = {
        "F5": piv["C1"] * cfg.FLOW_LOSS["F5"], "F6": piv["C3"] * cfg.FLOW_LOSS["F6"],
        "F3": piv["C2"] * cfg.FLOW_LOSS["F3"], "F4": piv["C4"] * cfg.FLOW_LOSS["F4"]}
    f["F2"] = direct * (f["F5"] + f["F6"])
    f["F1"] = f["F3"] + f["F4"] + (1 - direct) * (f["F5"] + f["F6"])

    ok = fact["wholesale_price_krw_kg"].notna()
    fw = fact[ok].assign(w=lambda d: d["wholesale_price_krw_kg"].astype(float) * d["consumption_kg"])
    avg_wh = (fw.groupby(["month", "species"])["w"].sum() / fw.groupby(["month", "species"])["consumption_kg"].sum())
    wh = pd.Series([avg_wh[(m, s)] for m, s in zip(piv["month"], piv["species"])])
    tier = dim_region.set_index("region_id")["tier"]
    lead_mult = {"capital": 1.0, "metro": 1.05, "province": 1.25, "jeju": 1.6}
    rl = piv["region_id"].map(tier).map(lead_mult).to_numpy()
    forecast = (piv["month"].map(month_type) == "forecast").to_numpy()

    rows = []
    for fid, frm, to in cfg.FLOWS:
        noise_m = np.where(forecast, 1.0, np.exp(rng.normal(0, 0.05, len(piv))))
        noise_l = np.where(forecast, 1.0, np.exp(rng.normal(0, 0.05, len(piv))))
        trend = 1 - 0.10 * mi / (len(months) - 1) if fid == "F6" else 1.0
        rows.append(pd.DataFrame({
            "month": piv["month"], "species": piv["species"], "region_id": piv["region_id"],
            "flow_id": fid, "from_stage": frm, "to_stage": to,
            "volume_kg": np.round(f[fid]).astype(np.int64),
            "margin_krw_kg": np.round(wh * cfg.FLOW_MARGIN_RATE[fid] * noise_m).astype(np.int64),
            "lead_time_days": np.round(cfg.FLOW_LEAD_DAYS[fid] * rl * trend * noise_l, 2),
            "weeks_in_month": piv["month"].map(wim),
            "data_type": np.where(forecast, "forecast", "actual")}))
    out = pd.concat(rows, ignore_index=True)
    out["_order"] = out["species"].map({s: i for i, s in enumerate(cfg.SPECIES)})
    return out.sort_values(["month", "_order", "region_id", "flow_id"], ignore_index=True).drop(columns="_order")


# ------------------------------------------------------------------ 출력
def write_docs(out_dir, tables):
    dd = pd.DataFrame(DICTIONARY, columns=["table_name", "column_name", "name_ko", "dtype", "unit", "description"])
    dd.to_csv(out_dir / "data_dictionary.csv", index=False, encoding="utf-8-sig")
    lines = ["# 가상 육류 소비·유통 데이터셋 데이터 사전", "",
             "기간: 2024-01 ~ 2026-12 (2026-09 주까지 actual, 이후 forecast). 한국 시장, 돼지고기·쇠고기.", ""]
    for name, desc in TABLE_DESC.items():
        lines += [f"## {name}", "", f"{desc} ({len(tables[name]):,}행)", "",
                  "| 컬럼 | 한글명 | 타입 | 단위 | 설명 |", "|---|---|---|---|---|"]
        for t, col, ko, dt, unit, d in DICTIONARY:
            if t == name:
                lines.append(f"| `{col}` | {ko} | {dt} | {unit} | {d} |")
        lines.append("")
    lines.append(SOURCES)
    docs = out_dir.parent / "docs" if out_dir.name == "output" else out_dir / "docs"
    docs.mkdir(parents=True, exist_ok=True)
    (docs / "data_dictionary.md").write_text("\n".join(lines), encoding="utf-8")


def main(out_dir):
    out_dir.mkdir(parents=True, exist_ok=True)
    cal = Calendar()
    rng = np.random.default_rng(cfg.SEED)
    final = {}
    for s in cfg.SPECIES:
        b = calibrate(s, cal)
        clean = simulate_species(s, cal, None, False, b)
        noisy = simulate_species(s, cal, rng, True, b)
        final[s] = {k: np.where(cal.is_forecast.reshape(-1, *[1] * (clean[k].ndim - 1)), clean[k], noisy[k])
                    for k in ("cons", "wholesale", "retail")}

    dim_region, dim_cut, dim_channel, dim_calendar = build_dims(cal)
    supply = build_supply(final, cal, np.random.default_rng(cfg.SEED + 1))
    wim = pd.Series(cal.month).value_counts().to_dict()
    imports = build_import_monthly(final, supply, cal, np.random.default_rng(cfg.SEED + 2), wim)
    fact = build_fact(final, cal, np.random.default_rng(cfg.SEED + 3))
    mart_monthly, mart_weekly = build_marts(fact, dim_region, wim)
    flows = build_flows(fact, dim_region, np.random.default_rng(cfg.SEED + 4), wim)

    tables = {
        "fact_meat_weekly": fact[FACT_COLS],
        "fact_supply_weekly": supply,
        "fact_import_monthly": imports,
        "fact_distribution_flow_monthly": flows,
        "mart_monthly_summary": mart_monthly,
        "mart_weekly_national": mart_weekly,
        "dim_region": dim_region, "dim_cut": dim_cut, "dim_channel": dim_channel, "dim_calendar": dim_calendar,
    }
    manifest = {}
    for name, df in tables.items():
        path = out_dir / f"{name}.csv"
        df.to_csv(path, index=False, encoding="utf-8-sig")
        manifest[name] = dict(rows=len(df), columns=list(df.columns), sha256=hashlib.sha256(path.read_bytes()).hexdigest())
        print(f"{name:34s} {len(df):>9,} rows  {path.stat().st_size / 1e6:6.2f} MB")
    write_docs(out_dir, tables)
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(Path(__file__).parent / "output"))
    main(Path(ap.parse_args().out))
