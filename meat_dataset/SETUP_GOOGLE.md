# 구글 시트 직접 연결 설정 (1회)

1. https://console.cloud.google.com 에서 프로젝트를 만들고 **Google Drive API**, **Google Sheets API**를 사용 설정합니다.
2. IAM 및 관리자 > 서비스 계정 > 계정 만들기 > 키 추가 > JSON 으로 키 파일을 받습니다.
3. 받은 파일을 `meat_dataset/secrets/service_account.json` 으로 저장합니다. (git 등에 올리지 마세요)
4. 키 파일 안의 `client_email` 주소를 드라이브 폴더 `육류 가상 데이터셋 (2024-2026)`에 **뷰어**로 공유합니다.
5. `meat_dataset/source_config.json` 을 만듭니다.
   ```json
   {"folder_id": "<드라이브 폴더 ID>", "service_account_file": "secrets/service_account.json"}
   ```
6. 실행: `streamlit run app.py`

## 사용 규칙
- 폴더에 넣은 구글 시트의 **제목 앞 단어**가 테이블 이름입니다. (`fact_meat_weekly`, `fact_meat_weekly (v2)` 모두 `fact_meat_weekly`)
- 같은 이름이 여러 개면 가장 최근에 수정한 시트를 씁니다.
- 첫 번째 시트의 1행은 헤더여야 합니다.
- CSV 파일은 드라이브에 올린 뒤 "Google 스프레드시트로 열기"로 변환해야 읽힙니다.
- 기본 테이블이 아닌 새 시트는 앱의 "새로 추가된 시트" 탭에 자동으로 나타나고, 날짜·값 컬럼을 골라 바로 그래프로 볼 수 있습니다.
- 앱은 30초마다 폴더를 확인하고 수정 시각이 바뀐 시트만 다시 읽습니다.
