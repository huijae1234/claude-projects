# 가상 육류 소비·유통 데이터셋

한국 시장의 **돼지고기·쇠고기 소비·유통 흐름**을 흉내 낸 **가상 데이터셋**과, 이를 보는 대시보드입니다. 분석·시각화 연습용이며 실제 통계가 아닙니다.

## 데이터

기간 2024-01 ~ 2026-12 (2026-09 주까지 실적, 이후 예측). 시드가 고정되어 있어 같은 코드로 항상 같은 CSV가 만들어집니다.

| 테이블 | 단위 | 행 수 |
|---|---|---|
| `fact_meat_weekly` | 주 × 시도 × 부위 × 채널 × 국산/수입의 소비량·판매액·가격 | 213,520 |
| `fact_supply_weekly` | 주 × 육종: 도축 두수, 국내 생산, 수입, 재고 | 314 |
| `fact_import_monthly` | 월 × 육종 × 수입국: 수입량·단가 | 360 |
| `fact_distribution_flow_monthly` | 유통 단계별 흐름 | |
| `dim_*` | 지역, 부위, 채널, 달력 | |
| `mart_*` | 주간 전국, 월간 요약 | |

일부러 **입력 오류 행과 결측**을 섞어 두어 검증·정제 연습에 쓸 수 있습니다. 컬럼 설명은 [docs/data_dictionary.md](docs/data_dictionary.md), 파일별 행 수와 해시는 `output/manifest.json`에 있습니다.

## 구성

```
generate_dataset.py   데이터 생성기 (python generate_dataset.py --out output)
validate_dataset.py   생성 결과 검증
charts.py, app.py     차트와 Streamlit 대시보드
dashboard.py          정적 HTML 대시보드 생성 → dashboard.html
data_source.py        로컬 CSV 또는 Google Drive에서 읽기
output/               생성된 CSV
```

## 실행

```bash
pip install streamlit plotly pandas
python generate_dataset.py --out output
python validate_dataset.py
streamlit run app.py        # 대시보드
python dashboard.py         # 정적 dashboard.html
```

Google Drive에서 읽으려면 [SETUP_GOOGLE.md](SETUP_GOOGLE.md)를 보세요. 서비스 계정 키(`secrets/`)는 저장소에 올라가지 않습니다.

이 데이터를 쓰는 실제 API 연동 대시보드는 `meat-supply-dashboard` 저장소입니다.
