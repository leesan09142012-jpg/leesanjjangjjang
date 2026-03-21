const express = require('express');
const serverless = require('serverless-http');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'secret-key';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Render PostgreSQL 연결
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 테이블 자동 생성
let dbReady = false;
async function initDB() {
  if (dbReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      userid VARCHAR(100) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      password_hash TEXT NOT NULL
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS progress (
      userid VARCHAR(100) NOT NULL,
      lesson_id VARCHAR(100) NOT NULL,
      typed_text TEXT DEFAULT '',
      current_index INT DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (userid, lesson_id)
    )
  `);
  dbReady = true;
}

// JWT 인증 미들웨어
function auth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ ok: false, msg: '로그인이 필요합니다.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ ok: false, msg: '로그인이 필요합니다.' });
  }
}

// DB 초기화 미들웨어
app.use(async (req, res, next) => {
  try { await initDB(); } catch (err) { console.error('DB init error:', err); }
  next();
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
    await db.query(
      'INSERT INTO users (userid, name, password_hash) VALUES ($1, $2, $3)',
      [userid, name, hashedPassword]
    );
    res.status(201).json({ ok: true, msg: '회원가입 성공!' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, msg: '이미 존재하는 아이디입니다.' });
    }
    console.error('회원가입 오류:', err);
    res.status(500).json({ ok: false, msg: '서버 오류가 발생했습니다.' });
  }
});

// 로그인
app.post('/api/login', async (req, res) => {
  const { userid, password } = req.body;
  try {
    const { rows } = await db.query('SELECT * FROM users WHERE userid = $1', [userid]);
    if (rows.length === 0) {
      return res.status(401).json({ ok: false, msg: '아이디 또는 비밀번호가 잘못되었습니다.' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ ok: false, msg: '아이디 또는 비밀번호가 잘못되었습니다.' });
    }

    const token = jwt.sign({ userid: user.userid, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    return res.status(200).json({ ok: true, msg: '로그인 성공!' });
  } catch (err) {
    console.error('로그인 오류:', err);
    res.status(500).json({ ok: false, msg: '서버 오류' });
  }
});

// 현재 로그인 정보
app.get('/api/me', (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.json({ ok: false });
  try {
    const user = jwt.verify(token, JWT_SECRET);
    return res.json({ ok: true, userid: user.userid, name: user.name });
  } catch {
    return res.json({ ok: false });
  }
});

// 로그아웃
app.get('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true, msg: '로그아웃 성공!' });
});

// 진행 저장
app.post('/api/progress', auth, async (req, res) => {
  const userid = req.user.userid;
  const { lesson_id, typed_text, current_index } = req.body;
  if (!lesson_id) return res.status(400).json({ ok: false, msg: 'lesson_id가 필요합니다.' });

  try {
    await db.query(`
      INSERT INTO progress (userid, lesson_id, typed_text, current_index, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (userid, lesson_id)
      DO UPDATE SET typed_text = $3, current_index = $4, updated_at = CURRENT_TIMESTAMP
    `, [userid, lesson_id, typed_text || '', current_index || 0]);
    res.json({ ok: true });
  } catch (err) {
    console.error('진행 저장 오류:', err);
    res.status(500).json({ ok: false, msg: '서버 오류' });
  }
});

// 진행 불러오기
app.get('/api/progress', auth, async (req, res) => {
  const userid = req.user.userid;
  const { lesson_id } = req.query;
  if (!lesson_id) return res.status(400).json({ ok: false, msg: 'lesson_id가 필요합니다.' });

  try {
    const { rows } = await db.query(
      'SELECT typed_text, current_index, updated_at FROM progress WHERE userid=$1 AND lesson_id=$2',
      [userid, lesson_id]
    );
    if (rows.length === 0) return res.json({ ok: true, typed_text: '', current_index: 0 });
    res.json({
      ok: true,
      typed_text: rows[0].typed_text,
      current_index: rows[0].current_index,
      updated_at: rows[0].updated_at
    });
  } catch (err) {
    console.error('진행 조회 오류:', err);
    res.status(500).json({ ok: false, msg: '서버 오류' });
  }
});

module.exports.handler = serverless(app);
