// ==============================
// 定数
// ==============================
const STORAGE_KEY = 'taskReminderAlarm_tasks';
const ALARM_SOUND = new Audio('assets/alarm.mp3');
let alarmTimeoutId = null;

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

const alarmOverlay = document.getElementById('alarmOverlay');
const alarmTaskText = document.getElementById('alarmTaskText');
const overlayStopBtn = document.getElementById('overlayStopBtn');

// ==============================
// 初期化
// ==============================
requestNotificationPermission();
loadFromStorage();
setupSpeechRecognition();
render();

// ==============================
// 音声認識
// ==============================
function setupSpeechRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
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

  recognition.onresult = (e) => {
    handleVoiceText(e.results[0][0].transcript);
  };

  micBtn.addEventListener('click', () => {
    recognizing ? recognition.stop() : recognition.start();
  });
}

// ==============================
// 音声解析
// ==============================
function handleVoiceText(text) {
  let work = text.trim();

  const triggerRe = /(でセット|で設定|で登録)$/;
  const shouldAdd = triggerRe.test(work);
  if (shouldAdd) {
    work = work.replace(triggerRe, '').trim();
  }

  const minMatch = work.match(/(\d+)\s*分後/);
  if (minMatch) {
    minutesInput.value = minMatch[1];
    work = work.replace(minMatch[0], '');
  }

  const timeMatch = work.match(/(\d+)\s*時\s*(\d+)?\s*分?/);
  if (timeMatch) {
    const h = timeMatch[1].padStart(2, '0');
    const m = (timeMatch[2] || '0').padStart(2, '0');
    timeInput.value = `${h}:${m}`;
    work = work.replace(timeMatch[0], '');
  }

  work = work.replace(/に|を|で|へ|タイマー|アラーム|教えて/g, '').trim();
  if (work) taskInput.value = work;

  if (shouldAdd) {
    addBtn.click();
  }
}

// ==============================
// 追加
// ==============================
addBtn.addEventListener('click', () => {
  const minutes = minutesInput.value.trim();
  const timeValue = timeInput.value;
  const taskText = taskInput.value.trim();
  const now = new Date();

  if (!minutes && !timeValue) {
    alert('「今から◯分後」か「時刻指定」のどちらかを入力してください');
    return;
  }

  if (minutes) {
    const target = new Date(now.getTime() + Number(minutes) * 60000);
    tasks.push(createTask('timer', target, taskText, Number(minutes)));
  }

  if (timeValue) {
    const [h, m] = timeValue.split(':').map(Number);
    let target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
    if (target <= now) target.setDate(target.getDate() + 1);

    tasks.push(createTask('alarm', target, taskText));

    const preMin = Number(preAlarmSelect.value || 0);
    if (preMin > 0) {
      const preTarget = new Date(target.getTime() - preMin * 60000);
      if (preTarget > now) {
        tasks.push(createTask('alarm', preTarget, `${taskText} ${preMin}分前`));
      }
    }
  }

  saveToStorage();

  minutesInput.value = '';
  timeInput.value = '';
  preAlarmSelect.value = 0;
  taskInput.value = '';

  render();
});

// ==============================
// 描画
// ==============================
function render() {
  const now = new Date();
  tasks.sort((a, b) => new Date(a.targetTime) - new Date(b.targetTime));
  taskList.innerHTML = '';

  tasks.forEach(task => {
    const targetTime = new Date(task.targetTime);

    if (now >= targetTime && !firedTaskIds.has(task.id)) {
      firedTaskIds.add(task.id);
      ALARM_SOUND.loop = true;
      ALARM_SOUND.play();

      showAlarmOverlay(task.task);

      if (alarmTimeoutId) clearTimeout(alarmTimeoutId);
      alarmTimeoutId = setTimeout(stopAlarm, 60000);
    }

    const li = document.createElement('li');

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '削除';
    deleteBtn.addEventListener('click', () => {
      tasks = tasks.filter(t => t.id !== task.id);
      firedTaskIds.delete(task.id);
      saveToStorage();
      render();
    });

    const timeSpan = document.createElement('span');
    timeSpan.style.display = 'inline-block';
    timeSpan.style.width = '3.5em';
    timeSpan.style.textAlign = 'right';
    if (task.type === 'timer' && task.minutes != null) {
      timeSpan.textContent = `${task.minutes}分`;
    } else {
      timeSpan.textContent = formatTime(new Date(task.targetTime));
    }

    const remainSpan = document.createElement('span');
    remainSpan.style.display = 'inline-block';
    remainSpan.style.width = '6em';
    remainSpan.style.textAlign = 'right';
    remainSpan.textContent = calcRemain(new Date(task.targetTime), now);

    const taskSpan = document.createElement('span');
    taskSpan.textContent = task.task || '(空)';

    li.append(deleteBtn, timeSpan, remainSpan, taskSpan);
    taskList.appendChild(li);
  });
}

// ==============================
// 共通
// ==============================
function createTask(type, target, task, minutes = null) {
  return {
    id: crypto.randomUUID(),
    type,
    targetTime: target.toISOString(),
    task,
    minutes
  };
}

function calcRemain(target, now) {
  const diff = target - now;
  if (diff <= 0) return '残り 0:00';

  const sec = Math.floor(diff / 1000);
  const totalMin = Math.floor(sec / 60);
  const s = sec % 60;

  return `残り ${totalMin}:${String(s).padStart(2,'0')}`;
}

function formatTime(date) {
  return date.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' });
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function loadFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) tasks = JSON.parse(raw);
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

setInterval(render, 1000);

// ==============================
// アラーム停止
// ==============================
function stopAlarm() {
  if (alarmTimeoutId) {
    clearTimeout(alarmTimeoutId);
    alarmTimeoutId = null;
  }
  ALARM_SOUND.pause();
  ALARM_SOUND.currentTime = 0;
  ALARM_SOUND.loop = false;
  hideAlarmOverlay();
}

function showAlarmOverlay(taskText) {
  alarmTaskText.textContent = taskText || '(空)';
  alarmOverlay.classList.remove('hidden');
}

function hideAlarmOverlay() {
  alarmOverlay.classList.add('hidden');
}

const stopAlarmBtn = document.getElementById('stopAlarmBtn');
if (stopAlarmBtn) {
  stopAlarmBtn.addEventListener('click', stopAlarm);
}

overlayStopBtn.addEventListener('click', stopAlarm);
