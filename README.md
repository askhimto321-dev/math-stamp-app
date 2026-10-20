# 수학 도장노트

수학 선생님들이 함께 쓰는 수업 기록 앱입니다.

- 수업마다 학생 이름을 눌러 **도장 · 결석** 기록 (날짜 · 교재 페이지가 도장에 표시됨)
- **포트폴리오 점수** 자동 계산 (도장 급간 + 중간고사 오답노트 · 모의고사 풀이 업로드 · 피드백 등 추가 항목)
- **최소 성취수준 보장지도(최성보)** 대상 자동 판정과 지도 기록
- 2022 개정 교육과정 **공통수학2 · 미적분Ⅰ · 기하** 단원
- 여러 선생님이 **실시간으로 함께** 기록 (반 코드 → 만든 선생님이 승인)
- 권한: 만든 사람 / 담당 교사(모두 수정) / 협력 교사(수업 · 도장만)
- **수정 기록**: 누가 언제 무엇을 바꿨는지 남음
- **오프라인**: 와이파이가 끊겨도 도장을 찍으면, 연결될 때 자동 저장
- 휴대폰 **홈 화면에 설치**해서 앱처럼 사용 (PWA)
- 엑셀용 복사 · CSV 저장, 학기 넘기기(보관 · 명단 복사)
- 소셜 로그인 후 **회원가입**(약관 동의 · 학교 · 담당 과목), 내 계정에서 로그아웃 · 다른 계정 · **회원 탈퇴**, 반 **주인 넘기기**

---

## 처음 설정하기 (한 번만, 약 30분)

준비물: GitHub 계정, Google 계정. 모두 무료로 시작할 수 있습니다.

### 1단계. Supabase(서버) 만들기

1. https://supabase.com 에 GitHub 계정으로 가입합니다.
2. **New project** → 이름: `math-stamp`, 비밀번호는 아무거나 길게, **Region: Northeast Asia (Seoul)** 을 고르고 만듭니다.
3. 왼쪽 메뉴 **SQL Editor** → **New query** → 이 저장소의 `supabase/schema.sql` 내용을 **전부** 복사해 붙여 넣고 **Run** 을 누릅니다. `Success` 가 나오면 됩니다.

> **이미 1단계를 마친 프로젝트라면**: 회원가입·탈퇴 기능이 추가되었습니다. SQL Editor 에서 `supabase/002_signup.sql` 도 한 번 실행하세요.
> (새로 만드는 프로젝트는 `schema.sql` 에 이미 들어 있어 따로 실행할 필요가 없습니다.)

### (선택) DB 자동 업데이트 설정 — 한 번만

설정해 두면 `supabase/schema.sql` 이 바뀔 때마다 GitHub 가 Supabase 에 자동으로 적용합니다. SQL 을 직접 붙여 넣을 필요가 없어집니다.

1. Supabase 프로젝트 화면 위쪽 **Connect** → **Connection String** 탭 → **Session pooler** 의 주소를 복사합니다.
   (`postgresql://postgres.프로젝트ID:[YOUR-PASSWORD]@aws-…pooler.supabase.com:5432/postgres`)
2. `[YOUR-PASSWORD]` 부분을 프로젝트 만들 때 정한 **DB 비밀번호**로 바꿉니다. 대괄호도 지웁니다.
   비밀번호를 잊었다면 **Project Settings → Database → Reset database password** 로 새로 만드세요.
3. GitHub 저장소 **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `SUPABASE_DB_URL`
   - Secret: 2번에서 만든 주소 → **Add secret**
4. **Actions → Update Supabase database → Run workflow** 로 한 번 실행해 초록색 체크를 확인합니다.

### 2단계. 앱에 서버 주소 넣기

1. Supabase 왼쪽 아래 **Project Settings → API** (또는 **Data API**) 로 갑니다.
2. **Project URL** 과 **anon public** 키를 복사합니다. (`service_role` 키는 절대 쓰지 마세요.)
3. GitHub 저장소에서 `public/config.js` 파일을 열고 연필 아이콘(편집)을 눌러 두 값을 바꾼 뒤 **Commit changes** 를 누릅니다.

```js
window.APP_CONFIG = {
  supabaseUrl: 'https://abcdefgh.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...'
};
```

### 3단계. 웹 주소 열기 (GitHub Pages)

1. GitHub 저장소 → **Settings → Pages** → **Source** 를 **GitHub Actions** 로 바꿉니다.
2. **Actions** 탭에서 `Deploy to GitHub Pages` 가 초록색으로 끝나면, 앱 주소는
   `https://askhimto321-dev.github.io/math-stamp-app/` 입니다.

### 4단계. 로그인 주소 등록

Supabase → **Authentication → URL Configuration**

- **Site URL**: `https://askhimto321-dev.github.io/math-stamp-app/`
- **Redirect URLs** 에 같은 주소를 추가

### 5단계. Google 로그인 켜기

1. https://console.cloud.google.com → 새 프로젝트 만들기
2. **API 및 서비스 → OAuth 동의 화면**: 외부(External), 앱 이름 `수학 도장노트`, 이메일 입력 후 저장
3. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID** → 유형: **웹 애플리케이션**
   - **승인된 리디렉션 URI**: `https://(내 프로젝트 주소).supabase.co/auth/v1/callback`
4. 만들어진 **클라이언트 ID / 클라이언트 보안 비밀번호** 를
   Supabase → **Authentication → Sign In / Providers → Google** 에 붙여 넣고 켭니다.
5. OAuth 동의 화면에서 **앱 게시(프로덕션으로 푸시)** 를 눌러야 다른 선생님도 로그인할 수 있습니다.

### 6단계. 카카오 로그인 켜기 (선택)

1. https://developers.kakao.com → **내 애플리케이션 → 애플리케이션 추가하기**
2. **앱 키 → REST API 키** 를 복사해 둡니다.
3. **카카오 로그인 → 활성화 ON**, **Redirect URI** 에 `https://(내 프로젝트 주소).supabase.co/auth/v1/callback` 등록
4. **카카오 로그인 → 동의항목**: 닉네임 · 프로필 사진을 ‘필수 동의’로 설정
5. **보안 → Client Secret** 코드를 만들고 **활성화**
6. Supabase → **Providers → Kakao** 에 REST API 키(Client ID)와 Client Secret 을 넣고 켭니다.

> 카카오 ‘이메일’ 동의항목은 비즈 앱으로 전환해야 받을 수 있습니다. 이메일 없이 쓰려면
> Supabase 카카오 설정의 **Allow users without an email** 을 켜 주세요.
> 카카오가 번거로우면 Google 로그인만 써도 됩니다.

---

## 다른 선생님과 함께 쓰기

1. 반을 만들면 6자리 **반 코드**가 생깁니다. (반·설정 → 초대 문구 복사)
2. 동료 선생님이 앱에 로그인한 뒤 **코드로 참여** 에 코드를 입력합니다.
3. 만든 선생님이 **반·설정** 에서 **승인** 합니다. 처음에는 협력 교사(수업 · 도장만)이고, 담당 교사로 바꿀 수 있습니다.

## 휴대폰에 설치하기

- **안드로이드(크롬)**: 앱 주소를 열면 나오는 ‘설치’ 버튼, 또는 메뉴 → ‘앱 설치’
- **아이폰(사파리)**: 아래쪽 공유 버튼 → ‘홈 화면에 추가’

## 개인정보 안내

- 학생 정보는 **번호와 이름만** 저장합니다.
- 반에 승인된 선생님만 그 반의 기록을 볼 수 있도록 데이터베이스 규칙(RLS)으로 막혀 있습니다.
- 서버는 서울 지역 Supabase 에 저장됩니다. 학교에서 공식 사용 전에는 학교 정보보호 담당자와 교육청 지침을 확인하세요.

## 문제 해결

| 증상 | 해결 |
|---|---|
| “서버 연결이 아직 설정되지 않았습니다” | 2단계 `public/config.js` 값을 확인하세요. |
| 로그인 후 다시 로그인 화면 | 4단계 Redirect URLs 에 앱 주소가 정확히 들어갔는지 확인하세요. 끝의 `/` 까지 같아야 합니다. |
| Google “액세스 차단됨” | 5단계 리디렉션 URI, 앱 게시 여부를 확인하세요. |
| 도장이 다른 선생님 화면에 안 보임 | Supabase → Database → Publications → `supabase_realtime` 에 표들이 켜져 있는지 확인하세요. (schema.sql 이 자동으로 켭니다) |
| “권한이 없습니다” 알림 | 협력 교사는 점수 · 명단 · 최성보를 고칠 수 없습니다. 만든 선생님께 담당 교사 권한을 요청하세요. |

## 개발자용

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # dist/ 에 결과물
```

- `src/store.js`: Supabase 연결 · 오프라인 대기열 · 실시간 동기화
- `src/main.js`: 화면
- `supabase/schema.sql`: 표 · 권한 규칙 · 수정 기록 트리거
