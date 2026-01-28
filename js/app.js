// ==============================
// 定数
// ==============================
const STORAGE_KEY = 'taskReminderAlarm_tasks';
const ALARM_SOUND = new Audio('assets/alarm.mp3');

// ==============================
// 状態
// ==============================
let tasks = [];
let firedTaskIds = new Set();
let recognition = null;
let recognizing = false;

// ==============================
// DOM
// ==============================
const minutesInput = document.getElementById('minutesInput');
const timeInput = document.getElementById('timeInput');
const taskInput = document.getElementById('taskInput');
const preAlarmSelect = document.getElementById('preAlarmSelect');
const micBtn = document.querySelector('.mic-btn');
const addBtn = document.querySelector('.add-btn');
const taskList = document.querySelector('.task-list');

// ==============================
// 初期化
// ==============================
requestNotificationPermission();
loadFromStorage();
setupSpeechRecognition();
render();

// ==============================
// 音声認識セットアップ
// ==============================
function setupSpeechRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.warn('SpeechRecognition not supported');
    micBtn.disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'ja-JP';
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onstart = () => {
    recognizing = true;
    micBtn.style.backgroundColor = '#ffcccc';
  };

  recognition.onend = () => {
    recognizing = false;
    micBtn.style.backgroundColor = '';
  };

  recognition.onerror = (e) => {
    console.error('Speech error', e);
  };

  recognition.onresult = (e) => {
    const text = e.results[0][0].transcript;
    handleVoiceText(text);
  };

  micBtn.addEventListener('click', () => {
    if (recognizing) {
      recognition.stop();
    } else {
      recognition.start();
    }
  });
}

// ==============================
// 音声テキスト解析
// ==============================
function handleVoiceText(text) {
  let work = text;

  // --- タイマー（分後） ---
  const minMatch = work.match(/(\d+)\s*分後/);
  if (minMatch) {
    minutesInput.value = minMatch[1];
    work = work.replace(minMatch[0], '');
  }

  // --- アラーム（時刻） ---
  const timeMatch = work.match(/(\d+)\s*時\s*(\d+)?\s*分?/);
  if (timeMatch) {
    const h = timeMatch[1].padStart(2, '0');
    const m = (timeMatch[2] || '0').padStart(2, '0');
    timeInput.value = `${h}:${m}`;
    work = work.replace(timeMatch[0], '');
  }

  // --- 不要語を軽く除去 ---
  work = work
    .replace(/に|を|で|へ|タイマー|アラーム|教えて/g, '')
    .replace(/、|,/g, ' ')
    .trim();

  // --- 用件 ---
  if (work) {
    taskInput.value = work;
  }
}

// ==============================
// 追加
// ==============================
addBtn.addEventListener('click', () => {
  const minutes = minutesInput.value.trim();
  const timeValue = timeInput.value;
  const taskText = taskInput.value.trim();

  if (!minutes && !timeValue) {
    alert('「今から◯分後」か「時刻指定」のどちらかを入力してください');
    return;
  }

  const now = new Date();

  // 分数 → タイマー
  if (minutes) {
    const target = new Date(now.getTime() + Number(minutes) * 60000);
    tasks.push(createTask('timer', target, taskText));
  }

  // 時刻 → アラーム
  if (timeValue) {
    const [h, m] = timeValue.split(':').map(Number);
    let target = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      h,
      m,
      0
    );
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }

    // 本アラーム
    tasks.push(createTask('alarm', target, taskText));

    // 前アラーム
    const preMin = Number(preAlarmSelect.value || 0);
    if (preMin > 0) {
      const preTarget = new Date(target.getTime() - preMin * 60000);
      if (preTarget > now) {
        const preText = taskText
          ? `${taskText} ${preMin}分前アラーム`
          : `${preMin}分前アラーム`;
        tasks.push(createTask('alarm', preTarget, preText));
      }
    }
  }

  saveToStorage();

  // 入力エリア初期化
  minutesInput.value = 0;
  timeInput.value = '';
  preAlarmSelect.value = 0;
  taskInput.value = '';

  render();
});

// ==============================
// 描画 + 発火判定
// ==============================
function render() {
  const now = new Date();

  tasks.sort((a, b) => new Date(a.targetTime) - new Date(b.targetTime));
  taskList.innerHTML = '';

  tasks.forEach(task => {
    const target = new Date(task.targetTime);
    const diff = target - now;

    if (diff <= 0 && !firedTaskIds.has(task.id)) {
      firedTaskIds.add(task.id);
      fireAlarm(task);
    }

    const li = document.createElement('li');

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-row-btn';
    deleteBtn.textContent = '削除';
    deleteBtn.addEventListener('click', () => {
      tasks = tasks.filter(t => t.id !== task.id);
      firedTaskIds.delete(task.id);
      saveToStorage();
      render();
    });

    const timeSpan = document.createElement('span');
    timeSpan.className = 'time';
    timeSpan.textContent = formatTime(target);

    const remainSpan = document.createElement('span');
    remainSpan.className = 'remain';
    remainSpan.textContent = calcRemain(target, now);

    const taskSpan = document.createElement('span');
    taskSpan.className = 'task';
    taskSpan.textContent = task.task || '(空)';

    const typeSpan = document.createElement('span');
    typeSpan.className = `type ${task.type}`;
    typeSpan.textContent = task.type === 'timer' ? 'タイマー' : 'アラーム';

    li.append(deleteBtn, timeSpan, remainSpan, taskSpan, typeSpan);
    taskList.appendChild(li);
  });
}

// ==============================
// ユーティリティ
// ==============================
function createTask(type, target, task) {
  return {
    id: crypto.randomUUID(),
    type,
    targetTime: target.toISOString(),
    task: task || '(空)'
  };
}

function fireAlarm(task) {
  if (Notification.permission === 'granted') {
    new Notification('時間です', {
      body: task.task === '(空)' ? '用件なし' : task.task
    });
  }
  ALARM_SOUND.currentTime = 0;
  ALARM_SOUND.play().catch(() => {});
}

setInterval(render, 1000);

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function loadFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    tasks = JSON.parse(raw);
  } catch {
    tasks = [];
  }
}

function formatTime(date) {
  return date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function calcRemain(target, now) {
  const diff = target - now;
  if (diff <= 0) return '残り 00:00:00';

  const sec = Math.floor(diff / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  return `残り ${String(h).padStart(2, '0')}:` +
         `${String(m).padStart(2, '0')}:` +
         `${String(s).padStart(2, '0')}`;
}
