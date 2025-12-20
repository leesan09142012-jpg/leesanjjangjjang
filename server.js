const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));
app.use(express.json());
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

const db = mysql.createConnection({
  host: 'myapp-database.ct6i6k0ou217.ap-southeast-2.rds.amazonaws.com', // 1단계에서 복사한 RDS 엔드포인트
  user: 'leesan',      // 1단계에서 설정한 마스터 사용자 이름
  password: 'leesan09141', // 1단계에서 설정한 마스터 암호
  database: 'myappdb'
});


db.connect(err => {
  if (err) {
    console.error('데이터베이스 연결 오류:', err);
  } else {
    console.log('MySQL 데이터베이스에 성공적으로 연결되었습니다.');
    db.query('SELECT DATABASE() AS db', (_, r) => console.log('Connected DB:', r?.[0]?.db));
  }
});

// ================== 라우트 ==================

// 회원가입
app.post('/api/register', async (req, res) => {
  const { userid, password, name } = req.body;
  if (!userid || !password || !name) {
    return res.status(400).json({ ok: false, msg: '모든 필드를 입력해야 합니다.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const insertSql = 'INSERT INTO users (userid, name, password_hash) VALUES (?, ?, ?)';
    db.query(insertSql, [userid, name, hashedPassword], (err) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ ok: false, msg: '이미 존재하는 아이디입니다.' });
        }
        console.error('회원가입 중 오류 발생:', err);
        return res.status(500).json({ ok: false, msg: '서버 오류가 발생했습니다.' });
      }
      console.log(`새로운 사용자 등록: ${userid}`);
      res.status(201).json({ ok: true, msg: '회원가입 성공!' });
    });
  } catch (error) {
    console.error('비밀번호 해시 중 오류 발생:', error);
    res.status(500).json({ ok: false, msg: '서버 오류가 발생했습니다.' });
  }
});

// 로그인
app.post('/api/login', (req, res) => {
  const { userid, password } = req.body;
  const sql = 'SELECT * FROM users WHERE userid = ?';
  db.query(sql, [userid], async (err, results) => {
    if (err) {
      console.error('로그인 오류:', err);
      return res.status(500).json({ ok: false, msg: '서버 오류' });
    }
    if (results.length === 0) {
      return res.status(401).json({ ok: false, msg: '아이디 또는 비밀번호가 잘못되었습니다.' });
    }

    const user = results[0];
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({ ok: false, msg: '아이디 또는 비밀번호가 잘못되었습니다.' });
    }

    req.session.isLoggedIn = true;
    req.session.userid = user.userid;
    req.session.name = user.name;
    return res.status(200).json({ ok: true, msg: '로그인 성공!' });
  });
});

// 현재 로그인 정보
app.get('/api/me', (req, res) => {
  if (req.session?.isLoggedIn) {
    return res.json({
      ok: true,
      userid: req.session.userid,
      name: req.session.name
    });
  }
  res.json({ ok: false });
});

// 로그아웃
app.get('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('세션 삭제 오류:', err);
      return res.status(500).json({ ok: false, msg: '로그아웃 오류' });
    }
    res.status(200).json({ ok: true, msg: '로그아웃 성공!' });
  });
});

// 진행 저장(업서트)
app.post('/api/progress', (req, res) => {
  if (!req.session?.isLoggedIn) {
    return res.status(401).json({ ok: false, msg: '로그인이 필요합니다.' });
  }
  const userid = req.session.userid;
  const { lesson_id, typed_text, current_index } = req.body;
  if (!lesson_id) return res.status(400).json({ ok: false, msg: 'lesson_id가 필요합니다.' });

  const sql = `
    INSERT INTO progress (userid, lesson_id, typed_text, current_index)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE typed_text = VALUES(typed_text), current_index = VALUES(current_index), updated_at = CURRENT_TIMESTAMP
  `;
  db.query(sql, [userid, lesson_id, typed_text || '', current_index || 0], (err) => {
    if (err) {
      console.error('진행 저장 오류:', err);
      return res.status(500).json({ ok: false, msg: '서버 오류' });
    }
    res.json({ ok: true });
  });
});

// 진행 불러오기
app.get('/api/progress', (req, res) => {
  if (!req.session?.isLoggedIn) {
    return res.status(401).json({ ok: false, msg: '로그인이 필요합니다.' });
  }
  const userid = req.session.userid;
  const { lesson_id } = req.query;
  if (!lesson_id) return res.status(400).json({ ok: false, msg: 'lesson_id가 필요합니다.' });

  const sql = 'SELECT typed_text, current_index, updated_at FROM progress WHERE userid=? AND lesson_id=?';
  db.query(sql, [userid, lesson_id], (err, rows) => {
    if (err) {
      console.error('진행 조회 오류:', err);
      return res.status(500).json({ ok: false, msg: '서버 오류' });
    }
    if (rows.length === 0) return res.json({ ok: true, typed_text: '', current_index: 0 });

    res.json({
        ok: true,
        typed_text: rows[0].typed_text,
        current_index: rows[0].current_index,
        updated_at: rows[0].updated_at
    });
  });
});

// 루트
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// 서버 시작 (모든 라우트 선언 뒤)
app.listen(port, () => {
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});