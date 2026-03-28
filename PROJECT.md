# 프로젝트: 그 길을 묻다 (타자 연습 웹앱)

## 개요
한국어 타자 연습 웹 애플리케이션. 사용자가 텍스트를 보고 따라 입력하면서 타자 실력을 향상시키는 서비스.

## 기술 스택
- **백엔드**: Node.js + Express.js
- **데이터베이스**: PostgreSQL (Render 호스팅)
- **인증**: JWT (jsonwebtoken) + httpOnly 쿠키
- **비밀번호**: bcryptjs 해시
- **프론트엔드**: Vanilla HTML/CSS/JavaScript (프레임워크 없음)
- **배포**: Render (Web Service, 무료 플랜)

## 디렉토리 구조
```
leesanjjangjjang/
├── server.js              # Express 메인 서버 (Render 배포용)
├── package.json           # 의존성 관리
├── render.yaml            # Render 자동 배포 설정
├── .gitignore             # git 제외 파일
├── frontend/              # 정적 프론트엔드 파일
│   ├── index.html         # 메인 타자 연습 페이지
│   ├── login.html         # 로그인 페이지
│   ├── login.css          # 로그인 스타일
│   ├── hoewongaib.html    # 회원가입 페이지
│   ├── hoewongaib.css     # 회원가입 스타일
│   ├── script.js          # 핵심 앱 로직 (타자 연습, 진행 저장, 로그인 상태)
│   ├── config.js          # API URL 설정
│   ├── style.css          # 메인 스타일
│   ├── 이름.txt           # 타자 연습 텍스트 콘텐츠
│   └── 피자.jpg           # 배경 이미지
└── frontend/netlify/      # (레거시) Netlify Functions - 현재 미사용
    └── functions/api.js
```

## 데이터베이스 스키마

### users 테이블
```sql
CREATE TABLE users (
  userid VARCHAR(100) PRIMARY KEY,   -- 사용자 아이디
  name VARCHAR(100) NOT NULL,        -- 이름
  password_hash TEXT NOT NULL         -- bcryptjs 해시된 비밀번호
);
```

### progress 테이블
```sql
CREATE TABLE progress (
  userid VARCHAR(100) NOT NULL,      -- 사용자 아이디
  lesson_id VARCHAR(100) NOT NULL,   -- 레슨 ID (예: 'babylon-lesson-001')
  typed_text TEXT DEFAULT '',        -- 현재 입력 중인 텍스트
  current_index INT DEFAULT 0,       -- 현재 줄 번호
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (userid, lesson_id)
);
```

## API 엔드포인트

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| POST | `/api/register` | X | 회원가입 (userid, password, name) |
| POST | `/api/login` | X | 로그인 → JWT 쿠키 발급 |
| GET | `/api/me` | X | 현재 로그인 정보 조회 |
| GET | `/api/me?reset=all` | X | 전체 진행 상태 리셋 |
| GET | `/api/logout` | X | 로그아웃 (쿠키 삭제) |
| POST | `/api/progress` | O | 진행 저장 (lesson_id, typed_text, current_index) |
| GET | `/api/progress?lesson_id=xxx` | O | 진행 불러오기 |

## 환경 변수 (Render 설정)
```
DATABASE_URL=postgresql://user:password@host:port/dbname
JWT_SECRET=<자동생성 또는 직접 설정>
NODE_ENV=production
```

## 핵심 기능

### 1. 타자 연습
- `이름.txt`에서 텍스트를 줄 단위로 로드
- 사용자가 텍스트를 따라 입력하면 실시간으로 맞춤/오타 색상 표시 (초록/빨강)
- 한 줄 완성 시 자동으로 다음 줄로 이동
- 300초 타이머

### 2. 사용자 인증
- JWT 기반 인증 (httpOnly 쿠키)
- 회원가입: userid, 이름, 비밀번호 → bcryptjs 해시 저장
- 로그인: 비밀번호 검증 → 7일 유효 JWT 발급
- 로그아웃: 쿠키 삭제

### 3. 진행 상태 저장
- 서버 DB에 자동 저장 (디바운스 400ms)
- localStorage 오프라인 폴백
- 줄 완성 시 즉시 서버 저장
- 페이지 재방문 시 서버에서 복원

### 4. 복사 방지
- CSS user-select 비활성화
- 우클릭 방지
- Ctrl+C, Ctrl+X 차단

## 배포 방법 (Render)

### 자동 배포
1. `render.yaml`이 있으므로 https://render.com/deploy 에서 GitHub 레포 연결
2. `DATABASE_URL` 환경변수에 PostgreSQL 연결 문자열 입력
3. Deploy 클릭 → 자동 빌드 및 배포

### 수동 배포
1. Render 대시보드 → New Web Service
2. GitHub 레포 연결
3. Build Command: `npm install`
4. Start Command: `node server.js`
5. 환경변수 설정 (DATABASE_URL, JWT_SECRET, NODE_ENV)

### 현재 배포 URL
- **서비스**: https://leesanjjangjjang.onrender.com
- **DB**: Render PostgreSQL (oregon-postgres.render.com)

## 인증 흐름
```
[회원가입] POST /api/register
    → bcryptjs로 비밀번호 해시
    → users 테이블에 저장

[로그인] POST /api/login
    → DB에서 사용자 조회
    → bcryptjs로 비밀번호 비교
    → JWT 토큰 생성 (7일 유효)
    → httpOnly 쿠키로 전달

[인증 필요 API] auth 미들웨어
    → 쿠키에서 token 추출
    → jwt.verify()로 검증
    → req.user에 사용자 정보 설정

[로그아웃] GET /api/logout
    → 쿠키 삭제 (clearCookie)
```

## 프론트엔드 흐름
```
페이지 로드
  → 이름.txt 파일 로드 (줄 단위 배열)
  → 서버에서 진행 상태 복원
  → 실패 시 localStorage 폴백
  → 현재 줄 화면에 표시

타이핑
  → 입력할 때마다 글자별 맞춤/오타 비교
  → 디바운스로 서버에 진행 저장
  → 한 줄 완성 → 다음 줄 이동 + 즉시 저장

로그인 상태
  → /api/me 호출로 확인
  → 로그인: "OOO님 환영합니다 + 로그아웃 버튼"
  → 비로그인: "로그인 + 회원가입 링크"
```

## 알려진 이슈
- Render 무료 플랜: 15분 미접속 시 슬립 모드 (재접속 시 30초~1분 로딩)
- `frontend/netlify/` 폴더는 이전 Netlify 배포 잔여물 (현재 미사용)
- 루트 디렉토리에 불필요한 빈 파일 존재 (`{`, `cd`, `git`, `mkdir`)
- `myapp-key.pem` 개인키가 레포에 포함됨 (보안 위험)
