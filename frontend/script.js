document.addEventListener('DOMContentLoaded', () => {
  // ====== 설정 ======
  const lessonId = 'babylon-lesson-001'; // ★ 이 페이지(텍스트) 고유 ID로 바꿔줘
  const textFilePath = '이름.txt';       // 텍스트 파일 경로

  // ====== 엘리먼트 ======
  const displayEl   = document.getElementById('text-display');
  const inputEl     = document.getElementById('text-input');
  const messageEl   = document.getElementById('message');
  const timerEl     = document.getElementById('timer');
  const startBtn    = document.getElementById('startBtn');
  const lineNumberEl= document.getElementById('line-number');
  const startMsg    = document.getElementById('start-message');  // 시작 안내
  const userStatus  = document.getElementById('userStatus');

  // ====== 상태 ======
  let texts = [];
  let currentIndex = 0;
  let targetText = '';
  let time = 300;
  let timerInterval = null;

  // ====== 유틸 ======
  const debounce = (fn, delay = 400) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
  };

  const saveProgressDebounced = debounce(saveProgressToServer, 400);

  // ====== 상단 사용자 표시 ======
  if (userStatus) refreshUserStatus(userStatus);

  // ====== 시작 버튼: 안내 숨김 ======
  if (startBtn && startMsg) {
    startBtn.addEventListener('click', () => {
      if (!Array.isArray(texts) || texts.length === 0) {
        alert('콘텐츠를 아직 불러오지 못했습니다. 잠시 후 다시 시도하세요.');
        return;
      }
      startMsg.style.display = 'none';
      startBtn.style.display = 'none'; // ✅ 추가: 시작 버튼을 숨깁니다.
      inputEl.disabled = false;
      inputEl.focus();
      targetText = texts[currentIndex] || '';
      updateDisplay();
      // 타이머 시작
      if (timerInterval) clearInterval(timerInterval);
      time = 300;
      timerInterval = setInterval(() => {
        time--;
        timerEl.textContent = `${time}초 남음`;
        if (time <= 0) {
          clearInterval(timerInterval);
          endGame();
        }
      }, 1000);
    });
  }

  // ====== 입력 처리 ======
  if (inputEl) {
    inputEl.disabled = true; // 시작 전 비활성화
    inputEl.addEventListener('input', () => {
      updateDisplay();
      saveProgressDebounced(); // DB로 자동 저장(디바운스)
    });
  }

  // ====== 초기 로드: 텍스트 파일 로드 → 서버 진행 복원 → (폴백) 로컬 복원 ======
  loadTexts(textFilePath)
    .then(async loaded => {
      texts = loaded;
      // 서버에서 진행 상태 복원
      await restoreProgressFromServer();
      // 서버 실패/비로그인 시 로컬 폴백
      if (!inputEl.value) {
        restoreFromLocal();
      }
      // 첫 화면 그리기(시작 전에도 현재 줄 보여주면 좋음)
      targetText = texts[currentIndex] || '';
      updateDisplay();
    })
    .catch(err => console.error('파일을 불러오는 중 오류 발생:', err));

  // ====== 함수들 ======
  async function loadTexts(path) {
    const res = await fetch(path, { credentials: 'include' });
    const data = await res.text();
    return data.split('\n').map(line => line.trim());
  }

  function updateDisplay() {
    const typed = inputEl.value || '';
    let html = '';
    for (let i = 0; i < targetText.length; i++) {
      if (i < typed.length) {
        const cls = (typed[i] === targetText[i]) ? 'correct' : 'incorrect';
        html += `<span class="${cls}">${targetText[i]}</span>`;
      } else {
        html += targetText[i];
      }
    }
    displayEl.innerHTML = html;

    // 현재 줄 번호
    if (lineNumberEl) {
      lineNumberEl.textContent = ` ${currentIndex + 1} / ${texts.length}줄`;
    }

    // 한 줄 완성 → 다음 줄로
    if (typed === targetText && targetText.length > 0) {
      messageEl.textContent = '✅ 잘했어요! 다음 문단으로 이동합니다...';
      setTimeout(() => {
        currentIndex = (currentIndex + 1) % texts.length;
        targetText = texts[currentIndex] || '';
        inputEl.value = '';
        messageEl.textContent = '';
        // 진행 저장(즉시)
        saveProgressToServer();
        // 로컬 캐시도 동기화(폴백용)
        localStorage.setItem('currentIndex:' + lessonId, String(currentIndex));
        localStorage.setItem('typedText:' + lessonId, inputEl.value);
        updateDisplay();
      }, 1200);
    }
  }

  function endGame() {
    inputEl.disabled = true;
    messageEl.textContent = '⏰ 시간이 다 되었습니다!';
    // 👇 타이머 종료 시 서버에 현재 진행 상황을 저장하는 함수 호출
    saveProgressToServer();
  }

  // ==== 서버 저장/복원 ====
  async function saveProgressToServer() {
    try {
      const body = {
        lesson_id: lessonId,
        typed_text: inputEl.value || '',
        current_index: currentIndex
      };
      const res = await fetch(API_URL + '/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!data.ok) {
        // 서버 거절 → 로컬 폴백
        localStorage.setItem('currentIndex:' + lessonId, String(currentIndex));
        localStorage.setItem('typedText:' + lessonId, inputEl.value || '');
      } else {
        // 성공 시 로컬에도 캐시(선택)
        localStorage.setItem('currentIndex:' + lessonId, String(currentIndex));
        localStorage.setItem('typedText:' + lessonId, inputEl.value || '');
      }
    } catch (e) {
      // 네트워크 오류 → 로컬 폴백
      localStorage.setItem('currentIndex:' + lessonId, String(currentIndex));
      localStorage.setItem('typedText:' + lessonId, inputEl.value || '');
      console.warn('서버 저장 실패 → localStorage 임시 저장', e);
    }
  }

  async function restoreProgressFromServer() {
    try {
      const res = await fetch(`${API_URL}/api/progress?lesson_id=${encodeURIComponent(lessonId)}`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (data.ok) {
        // 서버 값 반영
        currentIndex = Number(data.current_index) || 0;
        targetText = texts[currentIndex] || '';
        const serverTyped = data.typed_text || '';

        // 로컬과 비교해 더 긴 걸 채택(오프라인 작업 폴백 대비)
        const localTyped = localStorage.getItem('typedText:' + lessonId);
        const chosen = (localTyped && localTyped.length > serverTyped.length) ? localTyped : serverTyped;
        inputEl.value = chosen;

        // 로컬 캐시 동기화
        localStorage.setItem('currentIndex:' + lessonId, String(currentIndex));
        localStorage.setItem('typedText:' + lessonId, inputEl.value || '');
      }
    } catch (e) {
      console.warn('서버 복원 실패 → localStorage 폴백', e);
    }
  }

  // ==== 로컬 폴백 복원 ====
  function restoreFromLocal() {
    const savedTexts = localStorage.getItem('texts'); // 예전 캐시 호환
    if (savedTexts && texts.length === 0) {
      try {
        texts = JSON.parse(savedTexts);
      } catch {}
    }
    const savedIdx = localStorage.getItem('currentIndex:' + lessonId);
    if (savedIdx !== null) currentIndex = parseInt(savedIdx, 10) || 0;

    const savedTyped = localStorage.getItem('typedText:' + lessonId);
    if (savedTyped) inputEl.value = savedTyped;
  }

  // ==== 로그인 상태 표시 ====
  async function refreshUserStatus(box) {
    try {
      const res = await fetch(API_URL + '/api/me', { credentials: 'include' });
      const data = await res.json();
      if (data.ok) {
        const displayName = (data.name && data.name.trim()) ? data.name : data.userid;
        box.innerHTML = `
          <span><strong>${displayName}</strong>님 환영합니다!</span>
          <button id="logoutBtn" type="button">로그아웃</button>
        `;
        document.getElementById('logoutBtn').addEventListener('click', async () => {
          await fetch(API_URL + '/api/logout', { credentials: 'include' });
          refreshUserStatus(box);
        });
      } else {
        box.innerHTML = `
          <a href="login.html">로그인</a>
          <a href="hoewongaib.html">회원가입</a>
        `;
      }
    } catch (e) {
      console.error(e);
    }
  }
  // script.js

// ... (다른 코드는 그대로) ...

  // ==== 로그인 상태 표시 ====
  
  // ▼▼▼ 이 코드를 추가하세요 ▼▼▼
  // ====== 복사 방지 기능 ======
  // 마우스 우클릭 방지
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
  
  // 키보드 단축키(Ctrl+C, Ctrl+X) 방지
   document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && (e.key === 'c' || e.key === 'x')) {
      e.preventDefault();
      alert('이 페이지의 내용은 복사할 수 없습니다.');
    }
  });

}); // DOMContentLoaded 이벤트 리스너의 닫는 부분
