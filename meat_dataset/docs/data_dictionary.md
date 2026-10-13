# 가상 육류 소비·유통 데이터셋 데이터 사전

기간: 2024-01 ~ 2026-12 (2026-09 주까지 actual, 이후 forecast). 한국 시장, 돼지고기·쇠고기.

## fact_meat_weekly

주 x 시도 x 부위 x 채널 x 국산/수입 단위의 소비량·판매액·가격 (핵심 사실 테이블) (213,520행)

| 컬럼 | 한글명 | 타입 | 단위 | 설명 |
|---|---|---|---|---|
| `week_start` | 주 시작일 | date | YYYY-MM-DD | 월요일 시작 주의 시작 날짜 |
| `species` | 육종 | string | - | pork(돼지고기) / beef(쇠고기) |
| `region_id` | 시도 ID | string | - | dim_region 참조 |
| `cut_id` | 부위 ID | string | - | dim_cut 참조 |
| `channel_id` | 채널 ID | string | - | dim_channel 참조 |
| `origin` | 원산지 구분 | string | - | domestic(국산) / import(수입) |
| `consumption_kg` | 소비량 | float | kg | 해당 주 소비(판매) 물량. 소수의 입력 오류 행이 포함될 수 있음 |
| `sales_krw` | 판매액 | int | 원 | 소비량 x 소매가격 |
| `wholesale_price_krw_kg` | 도매가격 | int | 원/kg | 해당 주 도매 단계 가격. 일부 결측 있음 |
| `retail_price_krw_kg` | 소매가격 | int | 원/kg | 채널별 판매가(외식은 납품가). 도매가 대비 1~2주 지연 반영. 일부 결측 있음 |
| `data_type` | 실적/예측 | string | - | actual(실적) / forecast(예측, 2026-09-28 주부터) |

## fact_supply_weekly

주 x 육종 단위의 도축 두수·국내 생산·수입량·재고 (전국) (314행)

| 컬럼 | 한글명 | 타입 | 단위 | 설명 |
|---|---|---|---|---|
| `week_start` | 주 시작일 | date | YYYY-MM-DD | 월요일 시작 주의 시작 날짜 |
| `species` | 육종 | string | - | pork / beef |
| `slaughter_heads` | 도축 두수 | int | 두 | 전국 주간 도축 두수 (돼지, 한육우) |
| `domestic_output_kg` | 국내 생산량 | int | kg | 도축 두수에서 환산한 국내산 공급 물량 |
| `import_volume_kg` | 수입량 | int | kg | 해당 주 수입(통관) 물량 |
| `import_share_pct` | 수입 비중 | float | % | 수입량 / (국내 생산 + 수입량) x 100 |
| `ending_stock_kg` | 기말 재고 | int | kg | 주말 기준 재고 (모델 가정치) |
| `data_type` | 실적/예측 | string | - | actual / forecast |

## fact_import_monthly

월 x 육종 x 수입국 단위의 수입량·수입단가 (360행)

| 컬럼 | 한글명 | 타입 | 단위 | 설명 |
|---|---|---|---|---|
| `month` | 월 | string | YYYY-MM | 귀속 월 (주의 목요일이 속한 달) |
| `species` | 육종 | string | - | pork / beef |
| `country` | 수입국 | string | - | 수입 원산국 (국가 비중은 모델 가정치) |
| `import_volume_kg` | 수입량 | int | kg | 월간 수입 물량 |
| `import_share_pct` | 국가 비중 | float | % | 해당 육종 월간 수입량 중 이 국가의 비중 |
| `cif_price_usd_kg` | 수입단가(CIF) | float | USD/kg | 수입 평균 단가 (모델 가정치) |
| `weeks_in_month` | 월 귀속 주 수 | int | 주 | 4 또는 5. 월 합계를 월끼리 비교할 때 이 값으로 나눠 주 평균으로 환산 |
| `data_type` | 실적/예측 | string | - | actual / forecast |

## fact_distribution_flow_monthly

월 x 육종 x 시도 x 유통 흐름 단위의 물량·마진·소요일 (7,344행)

| 컬럼 | 한글명 | 타입 | 단위 | 설명 |
|---|---|---|---|---|
| `month` | 월 | string | YYYY-MM | 귀속 월 |
| `species` | 육종 | string | - | pork / beef |
| `region_id` | 도착 시도 ID | string | - | 물량이 도착하는 시도 |
| `flow_id` | 유통 흐름 ID | string | - | F1~F6 |
| `from_stage` | 출발 단계 | string | - | 유통 단계 명칭 |
| `to_stage` | 도착 단계 | string | - | 유통 단계 명칭 |
| `volume_kg` | 물량 | int | kg | 해당 흐름의 월간 물량 (소비량에 감모를 더해 역산) |
| `margin_krw_kg` | 단계 마진 | int | 원/kg | 해당 단계에서 붙는 마진 (모델 가정치) |
| `lead_time_days` | 소요일 | float | 일 | 단계 간 평균 리드타임 (모델 가정치) |
| `weeks_in_month` | 월 귀속 주 수 | int | 주 | 4 또는 5. 월 합계를 월끼리 비교할 때 이 값으로 나눠 주 평균으로 환산 |
| `data_type` | 실적/예측 | string | - | actual / forecast |

## mart_monthly_summary

월 x 육종 x 시도 x 채널 요약 (fact_meat_weekly 집계) (4,896행)

| 컬럼 | 한글명 | 타입 | 단위 | 설명 |
|---|---|---|---|---|
| `month` | 월 | string | YYYY-MM | 귀속 월 |
| `species` | 육종 | string | - | pork / beef |
| `region_id` | 시도 ID | string | - | dim_region 참조 |
| `channel_id` | 채널 ID | string | - | dim_channel 참조 |
| `consumption_kg` | 소비량 | float | kg | 월간 합계 |
| `sales_krw` | 판매액 | int | 원 | 월간 합계 |
| `avg_retail_price_krw_kg` | 평균 소매가격 | int | 원/kg | 판매액 / 소비량 |
| `per_capita_kg` | 1인당 소비량 | float | kg/인 | 월간 소비량 / 시도 인구 |
| `import_share_pct` | 수입 비중 | float | % | 수입산 소비량 / 전체 소비량 x 100 |
| `weeks_in_month` | 월 귀속 주 수 | int | 주 | 4 또는 5. 월 합계를 월끼리 비교할 때 이 값으로 나눠 주 평균으로 환산 |
| `data_type` | 실적/예측 | string | - | actual / forecast |

## mart_weekly_national

주 x 부위 x 채널 전국 합계 (fact_meat_weekly 집계) (6,280행)

| 컬럼 | 한글명 | 타입 | 단위 | 설명 |
|---|---|---|---|---|
| `week_start` | 주 시작일 | date | YYYY-MM-DD | 월요일 시작 주의 시작 날짜 |
| `species` | 육종 | string | - | pork / beef |
| `cut_id` | 부위 ID | string | - | dim_cut 참조 |
| `channel_id` | 채널 ID | string | - | dim_channel 참조 |
| `consumption_kg` | 소비량 | float | kg | 전국 합계 |
| `sales_krw` | 판매액 | int | 원 | 전국 합계 |
| `avg_retail_price_krw_kg` | 평균 소매가격 | int | 원/kg | 판매액 / 소비량 |
| `import_share_pct` | 수입 비중 | float | % | 수입산 소비량 / 전체 소비량 x 100 |
| `data_type` | 실적/예측 | string | - | actual / forecast |

## dim_region

17개 시도 기준표 (17행)

| 컬럼 | 한글명 | 타입 | 단위 | 설명 |
|---|---|---|---|---|
| `region_id` | 시도 ID | string | - | R01~R17 |
| `region_name` | 시도명 | string | - | 정식 명칭 |
| `region_short` | 약칭 | string | - | 서울, 부산 등 |
| `area` | 권역 | string | - | 수도권·강원·충청·호남·영남·제주 |
| `tier` | 지역 구분 | string | - | capital(수도권) / metro(광역시·세종) / province(도) / jeju |
| `population` | 인구 | int | 명 | 2024년 근사치, 합계를 5,170만 명으로 정규화한 값 |

## dim_cut

부위 기준표 (돼지 5 + 소 5) (10행)

| 컬럼 | 한글명 | 타입 | 단위 | 설명 |
|---|---|---|---|---|
| `cut_id` | 부위 ID | string | - | P01~P05(돼지), B01~B05(소) |
| `species` | 육종 | string | - | pork / beef |
| `species_ko` | 육종(한글) | string | - | 돼지고기 / 쇠고기 |
| `cut_name_ko` | 부위명 | string | - | 삼겹살, 등심 등 |
| `cut_name_en` | 부위명(영문) | string | - | 영문 명칭 |

## dim_channel

유통 채널 기준표 (4행)

| 컬럼 | 한글명 | 타입 | 단위 | 설명 |
|---|---|---|---|---|
| `channel_id` | 채널 ID | string | - | C1~C4 |
| `channel_name_ko` | 채널명 | string | - | 한글 명칭 |
| `channel_name_en` | 채널명(영문) | string | - | 영문 명칭 |

## dim_calendar

주 단위 달력과 명절·성수기 플래그 (157행)

| 컬럼 | 한글명 | 타입 | 단위 | 설명 |
|---|---|---|---|---|
| `week_start` | 주 시작일 | date | YYYY-MM-DD | 월요일 |
| `week_end` | 주 종료일 | date | YYYY-MM-DD | 일요일 |
| `iso_year` | ISO 연도 | int | - | 주의 목요일이 속한 연도 |
| `iso_week` | ISO 주차 | int | - | 1~53 |
| `month` | 귀속 월 | string | YYYY-MM | 주의 목요일이 속한 달 |
| `quarter` | 분기 | string | - | 예: 2025Q3 |
| `data_type` | 실적/예측 | string | - | actual / forecast |
| `holiday_name` | 명절 | string | - | 명절 당일이 속한 주에만 seollal(설) / chuseok(추석), 그 외 빈 값 |
| `weeks_to_holiday` | 명절까지 남은 주 | int | 주 | 명절 3주 전(3)부터 명절 다음 주(-1)까지, 해당 없으면 빈 값 |
| `is_samgyeopsal_day_week` | 삼겹살데이 주 | int | 0/1 | 3월 3일이 포함된 주 |
| `is_summer_vacation_season` | 여름 휴가철 | int | 0/1 | 목요일이 7/20~8/20에 속하는 주 |
| `is_family_month` | 가정의 달 | int | 0/1 | 목요일이 5월에 속하는 주 |

## 수치의 근거 구분

**실제 통계에 맞춘 값 (앵커)**
- 2024년 1인당 소비량: 돼지고기 약 30.6kg, 쇠고기 약 14.9kg (국내 생산+수입 공급량을 5,170만 명으로 나눈 값)
- 2024년 쇠고기 자급률 41.9%, 국내 생산 약 32.1만 톤, 수입 약 44.6만 톤
- 2024년 돼지고기 자급률 72.0%, 국내 생산 약 113.2만 톤, 수입 약 45.2만 톤
- 2024년 도축 두수: 돼지 약 1,890만~1,900만 두, 한육우 약 98만~106만 두
- 가격 수준: 한우 등심 1등급 약 10,200원/100g (2025-10), 국산 삼겹살 약 2,650~2,740원/100g, 수입 냉동 삼겹살 약 1,525원/100g (2025-10)
- 명절 양력 날짜: 설 2024-02-10, 2025-01-29, 2026-02-17 / 추석 2024-09-17, 2025-10-06, 2026-09-25

**모델 가정치 (공식 통계 없음)**
- 채널별 소비 비중과 그 변화, 시도별 소비 계수, 부위별 비중, 도매·소매 마진, 재고 수준, 수입국 비중, 수입단가, 유통 단계별 마진·소요일
- 계절성 크기, 가격 탄력성, 명절 효과의 크기

이 데이터셋은 분석 서비스 개발과 연습을 위한 **가상 데이터**이며 실제 통계가 아닙니다.
