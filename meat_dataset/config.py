"""가상 육류 소비·유통 데이터셋 설정값.

[앵커] 실제 통계에 근사시킨 값. 출처는 각 항목 주석 참고.
[가정] 공식 통계가 없어 모델링 편의로 둔 값.
EVENTS 는 비공개 명세다. 데이터 파일과 구글 시트에는 내보내지 않는다.
"""
from datetime import date

SEED = 20261008
START = date(2024, 1, 1)               # 월요일
N_WEEKS = 157                          # 주 시작일 2024-01-01 ~ 2026-12-28
LAST_ACTUAL_WEEK = date(2026, 9, 21)   # 이 주까지 actual, 이후는 forecast (목요일 기준 10월부터)
POP_TOTAL = 51_700_000                 # [앵커] 총인구 약 5,170만 명 (시도 인구는 이 값에 맞춰 정규화)

SPECIES = ["pork", "beef"]
SPECIES_KO = {"pork": "돼지고기", "beef": "쇠고기"}
ORIGINS = ["domestic", "import"]

# 설·추석 양력 날짜 (웹 검색으로 확인)
HOLIDAYS = {
    "seollal": [date(2024, 2, 10), date(2025, 1, 29), date(2026, 2, 17)],
    "chuseok": [date(2024, 9, 17), date(2025, 10, 6), date(2026, 9, 25)],
}
SAMGYEOPSAL_DAYS = [date(2024, 3, 3), date(2025, 3, 3), date(2026, 3, 3)]

# ---------------------------------------------------------------- 지역
# id, 시도명, 약칭, 권역, 인구(천 명, 2024 근사), 구분(tier), 한우 산지 여부
REGIONS = [
    ("R01", "서울특별시", "서울", "수도권", 9330, "capital", False),
    ("R02", "부산광역시", "부산", "영남", 3290, "metro", False),
    ("R03", "대구광역시", "대구", "영남", 2370, "metro", False),
    ("R04", "인천광역시", "인천", "수도권", 3030, "capital", False),
    ("R05", "광주광역시", "광주", "호남", 1410, "metro", False),
    ("R06", "대전광역시", "대전", "충청", 1440, "metro", False),
    ("R07", "울산광역시", "울산", "영남", 1100, "metro", False),
    ("R08", "세종특별자치시", "세종", "충청", 390, "metro", False),
    ("R09", "경기도", "경기", "수도권", 13640, "capital", False),
    ("R10", "강원특별자치도", "강원", "강원", 1520, "province", True),
    ("R11", "충청북도", "충북", "충청", 1590, "province", True),
    ("R12", "충청남도", "충남", "충청", 2130, "province", True),
    ("R13", "전북특별자치도", "전북", "호남", 1760, "province", True),
    ("R14", "전라남도", "전남", "호남", 1800, "province", True),
    ("R15", "경상북도", "경북", "영남", 2540, "province", True),
    ("R16", "경상남도", "경남", "영남", 3230, "province", False),
    ("R17", "제주특별자치도", "제주", "제주", 670, "jeju", False),
]
# 1인당 소비 지역 계수 (순서는 REGIONS), 정규화되므로 상대값만 의미 있음  [가정]
REGION_PC = {
    "pork": [.97, 1.02, .98, 1.00, .98, 1.00, 1.00, 1.00, 1.00, 1.06, 1.04, 1.04, 1.00, 1.02, 1.00, 1.00, 1.04],
    "beef": [1.10, 1.00, .98, 1.00, 1.00, 1.02, 1.02, 1.05, 1.04, .96, .96, .95, .94, .94, .96, .96, .98],
}
# 지역 소매가 계수 [가정]
REGION_PRICE = [1.04, 1.00, .99, 1.01, .98, 1.00, 1.00, 1.01, 1.01, .99, .98, .98, .97, .97, .97, .98, 1.07]
# 채널 순서 [마트, 정육점·시장, 온라인, 외식] 별 지역 구분 가중치 [가정]
TIER_CHANNEL = {
    "capital": [1.00, 0.90, 1.25, 1.00],
    "metro": [1.00, 1.00, 1.00, 1.00],
    "province": [0.95, 1.30, 0.78, 1.00],
    "jeju": [0.90, 1.20, 0.85, 1.15],
}
FOODSERVICE_REGION_MULT = {"R01": 1.10, "R02": 1.10, "R10": 1.05}   # 관광·유흥 수요 지역
# 지역 x 부위 가중치 (제주 흑돼지 삼겹살·목살)
REGION_CUT_MULT = {("pork", "R17", 0): 1.2, ("pork", "R17", 1): 1.2}
# 국산 비중 로짓 보정: 한우 산지, 제주 돼지
DOM_ODDS_REGION = {("beef", True): 1.25, ("pork", "R17"): 1.30}

# ---------------------------------------------------------------- 채널
CHANNELS = [
    ("C1", "대형마트·SSM", "Hypermarket/SSM"),
    ("C2", "정육점·전통시장", "Butcher/Traditional market"),
    ("C3", "온라인·새벽배송", "Online/Dawn delivery"),
    ("C4", "외식·식당", "Foodservice"),
]
# 도매가 대비 소매가 배율 (외식은 식당 납품가)  [가정]
MARKUP = [1.40, 1.43, 1.33, 1.15]

# ---------------------------------------------------------------- 부위
CUTS = {
    "pork": [("P01", "삼겹살", "pork belly"), ("P02", "목살", "pork neck"), ("P03", "앞다리", "pork shoulder"),
             ("P04", "뒷다리", "pork hind leg"), ("P05", "갈비", "pork ribs")],
    "beef": [("B01", "등심", "sirloin"), ("B02", "안심", "tenderloin"), ("B03", "갈비", "short rib"),
             ("B04", "양지", "brisket"), ("B05", "사태", "shank")],
}

PARAMS = {
    "pork": dict(
        pc_2024=30.6,        # [앵커] (국내 생산 113.2만 t + 수입 45.2만 t) / 5,170만 명
        pc_growth=0.007,     # [가정] 연 증가율
        dom_share_2024=0.72,  # [앵커] 2024 돼지고기 자급률 72.0%
        season=(0.05, 205),  # (진폭, 정점 연중일) 여름 캠핑·휴가철
        hol_eff={3: 0.03, 2: 0.10, 1: 0.22, 0: 0.05, -1: -0.08},   # 명절까지 남은 주 -> 소비 증감
        extra_samgyeopsal=0.04,
        share=[.32, .17, .20, .19, .12],
        cut_season=[(.12, 200), (.10, 200), (.08, 340), (.05, 340), (.06, 280)],
        hol_mult=[0.9, 1.0, 1.0, 1.2, 1.8],
        samgyeopsal_mult=[1.30, 1.10, 1.0, 1.0, 1.0],
        dom_share=[.62, .70, .78, .80, .75],
        # 2024-01 기준 대형마트 소매가 (원/kg). 국산 삼겹살 약 2,650원/100g, 수입 냉동 삼겹살 약 1,450원/100g 수준  [앵커]
        retail_dom=[26000, 21500, 10500, 8800, 13500],
        retail_imp=[14200, 12000, 6200, 5200, 9000],
        price_trend=[0.035, 0.020],        # 연 가격 상승률 (국산, 수입)
        price_hol=0.08,
        ar_sigma=[0.014, 0.010],
        eps=[0.45, 0.45],                  # 자기 가격 탄력성(절댓값)
        ch_share_0=[.40, .18, .12, .30],   # [가정] 2024-01 채널 비중
        ch_share_1=[.37, .13, .21, .29],   # 2026-12
        ch_hol=[1.15, 1.0, 1.5, 0.3],
        ch_cut=[[1.0, .95, 1.05, 1.3], [1.0, 1.0, 1.0, 1.2], [1.05, 1.1, .9, .8], [1.1, 1.1, .9, .7], [1.0, 1.0, 1.1, 1.1]],
        dom_odds_ch=[1.05, 1.15, 1.0, 0.8],
        stock_target_kg=100_000_000,      # [가정] 재고 약 10만 t
        meat_per_head_kg=59.6,           # [앵커] 113.2만 t / 약 1,900만 두
    ),
    "beef": dict(
        pc_2024=14.9,        # [앵커] (국내 생산 32.1만 t + 수입 44.6만 t) / 5,170만 명
        pc_growth=0.015,
        dom_share_2024=0.419,  # [앵커] 2024 쇠고기 자급률 41.9%
        season=(0.04, 130),
        hol_eff={3: 0.05, 2: 0.30, 1: 0.55, 0: 0.10, -1: -0.18},
        extra_samgyeopsal=0.0,
        share=[.25, .08, .22, .22, .23],
        cut_season=[(.08, 130), (.05, 130), (.06, 270), (.12, 15), (.10, 15)],
        hol_mult=[1.1, 1.0, 1.4, 0.7, 0.6],
        samgyeopsal_mult=[1.0] * 5,
        dom_share=[.50, .60, .30, .40, .38],
        # 한우 등심 1등급 2025-10 약 10,200원/100g (전년 대비 +4.2%) 에서 역산  [앵커]
        retail_dom=[96000, 118000, 62000, 44000, 40000],
        retail_imp=[38000, 52000, 35000, 20000, 18000],
        price_trend=[0.042, 0.030],
        price_hol=0.25,
        ar_sigma=[0.010, 0.009],
        eps=[0.9, 1.1],
        ch_share_0=[.30, .22, .12, .36],
        ch_share_1=[.28, .17, .20, .35],
        ch_hol=[1.15, 1.0, 1.5, 0.3],
        ch_cut=[[1.0, 1.05, 1.1, 1.1], [.9, 1.0, 1.1, 1.3], [1.0, 1.05, 1.15, 1.05], [1.05, 1.05, .9, 1.1], [1.05, 1.05, .95, 1.0]],
        dom_odds_ch=[1.0, 1.35, 0.95, 0.72],
        stock_target_kg=70_000_000,
        meat_per_head_kg=310.0,          # [앵커] 32.1만 t / 약 100만 두
    ),
}
DOM_TREND_LOGIT = -0.04     # 연간 국산 비중 로짓 변화 (수입 비중 서서히 증가)  [가정]
SUBSTITUTION_SIGMA = 0.6    # 국산/수입 가격비에 대한 대체 탄력성  [가정]
FOODSERVICE_SEASON = (0.05, 355)   # 외식 채널 연말 성수기

# ---------------------------------------------------------------- 수입
IMPORT_COUNTRIES = {
    "pork": [("미국", .25), ("독일", .15), ("스페인", .14), ("캐나다", .12), ("브라질", .10), ("기타", .24)],
    "beef": [("미국", .52), ("호주", .38), ("뉴질랜드", .04), ("기타", .06)],
}
IMPORT_COUNTRY_TREND = {   # 연간 상대 비중 변화율 [가정]
    ("pork", "스페인"): 0.05, ("pork", "브라질"): 0.08, ("pork", "미국"): -0.03,
    ("beef", "호주"): 0.03, ("beef", "미국"): -0.02,
}
CIF_BASE_USD = {"pork": 3.5, "beef": 6.9}   # [가정] 평균 수입단가
CIF_COUNTRY_FACTOR = {
    "pork": {"미국": 1.0, "독일": .95, "스페인": .97, "캐나다": 1.05, "브라질": .90, "기타": 1.0},
    "beef": {"미국": 1.12, "호주": 1.0, "뉴질랜드": .98, "기타": .90},
}

# ---------------------------------------------------------------- 유통 흐름
FLOWS = [
    ("F1", "도축장·수입업체", "공판장·도매시장"),
    ("F2", "도축장·수입업체", "대형유통 물류센터"),
    ("F3", "공판장·도매시장", "정육점·전통시장"),
    ("F4", "공판장·도매시장", "외식·급식 업체"),
    ("F5", "대형유통 물류센터", "대형마트·SSM 점포"),
    ("F6", "대형유통 물류센터", "온라인·새벽배송 거점"),
]
FLOW_MARGIN_RATE = {"F1": .035, "F2": .020, "F3": .120, "F4": .080, "F5": .180, "F6": .220}   # 도매가 대비 단계 마진율 [가정]
FLOW_LEAD_DAYS = {"F1": 1.2, "F2": 0.9, "F3": 1.6, "F4": 1.1, "F5": 1.0, "F6": 0.7}
FLOW_LOSS = {"F3": 1.015, "F4": 1.010, "F5": 1.010, "F6": 1.020}
DIRECT_SUPPLY_SHARE = (0.70, 0.80)   # 대형유통 직납 비중 (2024-01 -> 2026-12)

# ---------------------------------------------------------------- 데이터 품질 이상 (비공개)
QUALITY_ERRORS = dict(unit_error=80, missing_retail=80, missing_wholesale=40)   # 전체의 약 0.09%

# ---------------------------------------------------------------- 비공개 이벤트 명세
# shape: tri(삼각), flat(균일), decay(초반 급등 후 감쇠)
EVENTS = [
    dict(name="asf_gyeonggi_gangwon", start=date(2024, 9, 2), weeks=6, shape="tri", species="pork",
         regions=["R09", "R10"], cons=0.78, wholesale={"domestic": 1.12, "import": 1.03}, wholesale_shape="decay"),
    dict(name="chuseok_hanwoo_price", start=date(2024, 9, 2), weeks=3, shape="tri", species="beef",
         cuts=["B01", "B03"], wholesale={"domestic": 1.10}),
    dict(name="consumer_sentiment_dip", start=date(2024, 12, 9), weeks=6, shape="tri", species=None,
         channels=["C4"], cons=0.88),
    dict(name="samgyeopsal_day_promo", start=date(2025, 3, 3), weeks=1, shape="flat", species="pork",
         cuts=["P01", "P02"], channels=["C1"], origins=["domestic"], cons=1.9, retail=0.85),
    dict(name="beef_import_disruption", start=date(2025, 3, 31), weeks=6, shape="tri", species="beef",
         origins=["import"], cons=0.62, wholesale={"import": 1.07, "domestic": 1.09}),
    dict(name="beef_import_substitution", start=date(2025, 3, 31), weeks=6, shape="tri", species="beef",
         origins=["domestic"], cons=1.07),
    dict(name="heat_wave_pork", start=date(2025, 7, 14), weeks=6, shape="tri", species="pork",
         cons=0.95, wholesale={"domestic": 1.10}, wholesale_shape="decay"),
    dict(name="seollal_hanwoo_price_spike", start=date(2026, 1, 26), weeks=4, shape="tri", species="beef",
         cuts=["B01", "B03"], wholesale={"domestic": 1.16}),
    dict(name="online_outage", start=date(2026, 6, 15), weeks=2, shape="flat", species=None,
         channels=["C3"], cons=0.55),
    dict(name="online_outage_rebound", start=date(2026, 6, 15), weeks=2, shape="flat", species=None,
         channels=["C1", "C2"], cons=1.07),
]

# ---------------------------------------------------------------- 재고·공급 [가정]
STOCK_AR = (0.90, 0.012)      # (phi, sigma)
STOCK_SEASON = (0.08, 60)
SLAUGHTER_NOISE = 0.015
