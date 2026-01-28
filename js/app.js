// ==============================
// 定数
// ==============================
const STORAGE_KEY = 'taskReminderAlarm_tasks';
const ALARM_SOUND = new Audio('assets/test.mp3');

// ==============================
// 状態
// ==============================
let tasks = [];
let firedTaskIds = new Set(); // 発火済みID

// ==============================
// DOM
// ==============================
const minutesInput = document.querySelector('input[type="number"]');
const timeInput = document.querySelector('input[type="time"]');
const taskInput = document.querySelector('.task-row input[type="text"]');
const addBtn = document.querySelector('.add-btn');
const deleteBtn = document.querySelector('.delete-btn');
const taskList = document.querySelector('.task-list');

// ==============================
// 初期化
// ==============================
requestNotificationPermission();
loadFromStorage();
render();

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
  let targetTime;
  let type;

  if (minutes) {
    type = 'timer';
    targetTime = new Date(now.getTime() + Number(minutes) * 60000);
  } else {
    type = 'alarm';
    const [h, m] = timeValue.split(':').map(Number);
    targetTime = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      h,
      m,
      0
    );
    if (targetTime <= now) {
      targetTime.setDate(targetTime.getDate() + 1);
    }
  }

  tasks.push({
    id: crypto.randomUUID(),
    type,
    targetTime: targetTime.toISOString(),
    task: taskText || '(空)'
  });

  saveToStorage();

  minutesInput.value = '';
  timeInput.value = '';
  taskInput.value = '';

  render();
});

// ==============================
// 削除
// ==============================
deleteBtn.addEventListener('click', () => {
  const checkedIds = Array.from(
    document.querySelectorAll('.task-list input[type="checkbox"]:checked')
  ).map(cb => cb.dataset.id);

  tasks = tasks.filter(t => !checkedIds.includes(t.id));
  checkedIds.forEach(id => firedTaskIds.delete(id));

  saveToStorage();
  render();
});

// ==============================
// 描画 + 発火判定
// ==============================
function render() {
  const now = new Date();

  tasks.sort(
    (a, b) => new Date(a.targetTime) - new Date(b.targetTime)
  );

  taskList.innerHTML = '';

  tasks.forEach(task => {
    const target = new Date(task.targetTime);
    const diff = target - now;

    // ===== 発火判定（1回だけ） =====
    if (diff <= 0 && !firedTaskIds.has(task.id)) {
      firedTaskIds.add(task.id);
      fireAlarm(task);
    }

    const li = document.createElement('li');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.id = task.id;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'time';
    timeSpan.textContent = formatTime(target);

    const remainSpan = document.createElement('span');
    remainSpan.className = 'remain';
    remainSpan.textContent = calcRemain(target, now);

    const taskSpan = document.createElement('span');
    taskSpan.className = 'task';
    taskSpan.textContent = task.task;

    const typeSpan = document.createElement('span');
    typeSpan.className = `type ${task.type}`;
    typeSpan.textContent =
      task.type === 'timer' ? 'タイマー' : 'アラーム';

    li.append(
      checkbox,
      timeSpan,
      remainSpan,
      taskSpan,
      typeSpan
    );

    taskList.appendChild(li);
  });
}

// ==============================
// アラーム発火
// ==============================
function fireAlarm(task) {
  // 通知
  if (Notification.permission === 'granted') {
    new Notification('時間です', {
      body: task.task === '(空)' ? '用件なし' : task.task
    });
  }

  // 音
  ALARM_SOUND.currentTime = 0;
  ALARM_SOUND.play().catch(() => {});
}

// ==============================
// 1秒更新
// ==============================
setInterval(render, 1000);

// ==============================
// Notification
// ==============================
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// ==============================
// localStorage
// ==============================
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

// ==============================
// ヘルパー
// ==============================
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
