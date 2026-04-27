/* ================================================
   FOCUSRANK — Main Script
   Système de productivité gamifiée pour étudiants
   ================================================ */

'use strict';

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  // XP accordé par action
  xp: {
    task:     10,
    pomodoro: 25,
    dailyGoal: 50,
    streakBonus: 0.10 // +10% si streak
  },

  // Niveaux : { level: xpRequise }
  levels: [
    { level: 1,  xp: 0 },
    { level: 2,  xp: 100 },
    { level: 3,  xp: 250 },
    { level: 4,  xp: 450 },
    { level: 5,  xp: 700 },
    { level: 6,  xp: 1000 },
    { level: 7,  xp: 1350 },
    { level: 8,  xp: 1750 },
    { level: 9,  xp: 2200 },
    { level: 10, xp: 2700 },
    { level: 11, xp: 3300 },
    { level: 12, xp: 4000 },
    { level: 13, xp: 4800 },
    { level: 14, xp: 5700 },
    { level: 15, xp: 6700 }
  ],

  // Rangs
  ranks: [
    { name: 'Bronze',   icon: '🥉', minLevel: 1,  color: '#cd7f32' },
    { name: 'Silver',   icon: '🥈', minLevel: 3,  color: '#a8a9ad' },
    { name: 'Gold',     icon: '🥇', minLevel: 5,  color: '#fbbf24' },
    { name: 'Platinum', icon: '💠', minLevel: 8,  color: '#67e8f9' },
    { name: 'Diamond',  icon: '💎', minLevel: 11, color: '#a78bfa' },
    { name: 'Master',   icon: '👑', minLevel: 14, color: '#f9a8d4' }
  ],

  // Templates de tâches générées automatiquement
  taskTemplates: [
    '📖 Lire le cours',
    '✍️ Faire un résumé',
    '📝 Faire des exercices',
    '🔁 Réviser les erreurs'
  ],

  // Micro-tâches (mode difficile)
  microTemplates: [
    '📄 Lire 1 page',
    '✍️ Résumer 1 page',
    '🔢 Faire 2 exercices'
  ]
};

// ============================================================
// STATE — données de l'application (chargées depuis localStorage)
// ============================================================

const defaultState = {
  // Profil
  totalXP:   0,
  level:     1,
  // Streak
  streak:    0,
  bestStreak: 0,
  lastActiveDate: null,
  // Tâches
  tasks: [],
  nextTaskId: 1,
  // Pomodoro
  timerWork:  25,
  timerBreak: 5,
  timerRunning: false,
  timerPhase: 'work',  // 'work' | 'break'
  timerSeconds: 25 * 60,
  sessionsToday: 0,
  // Objectif du jour
  goalTasks:    4,
  goalSessions: 2,
  dailyGoalAwarded: false,
  // Stats journalières
  today: {
    date: null,
    tasksCompleted: 0,
    sessionsCompleted: 0,
    xpGained: 0,
    studySeconds: 0
  },
  // Historique hebdomadaire (7 jours)
  weekHistory: [], // [{date, tasks, sessions, studyMinutes}]
  // Records
  totalTasksEver:    0,
  totalSessionsEver: 0,
  totalStudySeconds: 0,
  // Options
  soundEnabled: true,
  notifEnabled: false
};

let state = {};

// ============================================================
// PERSISTENCE
// ============================================================

function loadState() {
  try {
    const saved = localStorage.getItem('focusrank_state');
    if (saved) {
      state = Object.assign({}, defaultState, JSON.parse(saved));
    } else {
      state = Object.assign({}, defaultState);
    }
  } catch (e) {
    state = Object.assign({}, defaultState);
  }
  // Toujours recréer le timer à l'état initial (non en cours)
  state.timerRunning = false;
}

function saveState() {
  try {
    localStorage.setItem('focusrank_state', JSON.stringify(state));
  } catch (e) {
    console.warn('FocusRank: impossible de sauvegarder', e);
  }
}

// ============================================================
// DATE UTILITIES
// ============================================================

function todayStr() {
  return new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
}

function dayDiff(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  return Math.round((d2 - d1) / 86400000);
}

/** Vérifie et initialise la journée si nécessaire */
function checkDayReset() {
  const today = todayStr();

  if (state.today.date !== today) {
    // Nouvelle journée — archiver dans weekHistory
    if (state.today.date) {
      archiveDay(state.today);
    }

    // Vérifier le streak
    if (state.lastActiveDate) {
      const diff = dayDiff(state.lastActiveDate, today);
      if (diff === 1) {
        // Streak continue
      } else if (diff > 1) {
        // Streak brisé
        state.streak = 0;
      }
    }

    // Reset journée
    state.today = {
      date: today,
      tasksCompleted: 0,
      sessionsCompleted: 0,
      xpGained: 0,
      studySeconds: 0
    };
    state.sessionsToday = 0;
    state.dailyGoalAwarded = false;
    saveState();
  }
}

function archiveDay(dayData) {
  if (!state.weekHistory) state.weekHistory = [];
  // Garder seulement 7 jours
  state.weekHistory = state.weekHistory.filter(d => d.date !== dayData.date);
  state.weekHistory.push({
    date: dayData.date,
    tasks: dayData.tasksCompleted,
    sessions: dayData.sessionsCompleted,
    studyMinutes: Math.round(dayData.studySeconds / 60)
  });
  if (state.weekHistory.length > 7) {
    state.weekHistory = state.weekHistory.slice(-7);
  }
}

/** Marque le joueur comme actif aujourd'hui et gère le streak */
function markActiveToday() {
  const today = todayStr();
  if (state.lastActiveDate === today) return; // déjà marqué

  if (state.lastActiveDate) {
    const diff = dayDiff(state.lastActiveDate, today);
    if (diff === 1) {
      state.streak += 1;
    } else if (diff > 1) {
      state.streak = 1;
    } else if (diff === 0) {
      // même jour, ne rien faire
      return;
    }
  } else {
    state.streak = 1;
  }

  state.lastActiveDate = today;
  if (state.streak > state.bestStreak) state.bestStreak = state.streak;
  saveState();
  updateStreakUI();
}

// ============================================================
// XP & NIVEAUX
// ============================================================

function getLevel(xp) {
  let lvl = 1;
  for (const entry of CONFIG.levels) {
    if (xp >= entry.xp) lvl = entry.level;
    else break;
  }
  return lvl;
}

function getLevelEntry(level) {
  return CONFIG.levels.find(e => e.level === level) || CONFIG.levels[0];
}

function getNextLevelEntry(level) {
  return CONFIG.levels.find(e => e.level === level + 1) || null;
}

function getRank(level) {
  let rank = CONFIG.ranks[0];
  for (const r of CONFIG.ranks) {
    if (level >= r.minLevel) rank = r;
  }
  return rank;
}

function addXP(amount, source = '') {
  // Bonus streak
  let bonus = 1;
  if (state.streak > 0) bonus = 1 + CONFIG.xp.streakBonus;
  const finalXP = Math.round(amount * bonus);

  const prevLevel = state.level;
  state.totalXP += finalXP;
  state.today.xpGained += finalXP;
  state.level = getLevel(state.totalXP);

  saveState();

  // Popup XP
  showXpPopup(`+${finalXP} XP${bonus > 1 ? ' 🔥' : ''}`);

  // Level up ?
  if (state.level > prevLevel) {
    setTimeout(() => showLevelUp(state.level), 500);
  }

  updateXpBar();
  updateRankUI();
  updateProfileUI();
  updateStatsUI();
}

function showXpPopup(text) {
  const popup = document.getElementById('xp-popup');
  popup.textContent = text;
  popup.classList.remove('hidden');
  playSound('xp');

  // Re-trigger animation
  popup.style.animation = 'none';
  popup.offsetHeight; // reflow
  popup.style.animation = '';

  clearTimeout(popup._timeout);
  popup._timeout = setTimeout(() => popup.classList.add('hidden'), 1500);
}

function showLevelUp(level) {
  const rank = getRank(level);
  document.getElementById('levelup-new').textContent = level;
  document.getElementById('levelup-rank').textContent = rank.name;
  document.getElementById('levelup-overlay').classList.remove('hidden');
  playSound('levelup');
}

// ============================================================
// UI UPDATE FUNCTIONS
// ============================================================

function updateXpBar() {
  const lvl = state.level;
  const currentEntry = getLevelEntry(lvl);
  const nextEntry = getNextLevelEntry(lvl);

  const currentXP = state.totalXP;
  let pct = 100;
  let xpText = `${currentXP} XP (MAX)`;

  if (nextEntry) {
    const xpInLevel = currentXP - currentEntry.xp;
    const xpNeeded  = nextEntry.xp - currentEntry.xp;
    pct = Math.min(100, Math.round((xpInLevel / xpNeeded) * 100));
    xpText = `${currentXP - currentEntry.xp} / ${xpNeeded} XP`;
  }

  // Header
  document.getElementById('xp-bar-fill').style.width = pct + '%';
  document.getElementById('xp-text').textContent = xpText;
  document.getElementById('level-num').textContent = lvl;

  // Profile
  document.getElementById('profile-xp-bar').style.width = pct + '%';
  document.getElementById('profile-xp-label').textContent = xpText;
  document.getElementById('profile-level-label').textContent = lvl;
  document.getElementById('profile-level').textContent = lvl;
  document.getElementById('profile-total-xp').textContent = currentXP.toLocaleString();
}

function updateRankUI() {
  const rank = getRank(state.level);
  document.getElementById('rank-icon').textContent = rank.icon;
  document.getElementById('rank-name').textContent = rank.name;
  document.getElementById('profile-rank-name').textContent = rank.name + ' Scholar';
  document.getElementById('avatar-rank-icon').textContent = rank.icon;
  document.getElementById('profile-avatar').textContent = rank.icon;
}

function updateStreakUI() {
  document.getElementById('streak-count').textContent = state.streak;
}

function updateTaskProgress() {
  const total     = state.tasks.length;
  const completed = state.tasks.filter(t => t.completed).length;
  document.getElementById('task-progress-label').textContent = `${completed}/${total} terminé`;

  // Daily goal
  const goalT = state.goalTasks;
  const pct = goalT > 0 ? Math.min(100, Math.round((state.today.tasksCompleted / goalT) * 100)) : 0;
  document.getElementById('goal-tasks-bar').style.width = pct + '%';
  document.getElementById('goal-tasks-text').textContent = `${state.today.tasksCompleted}/${goalT}`;
}

function updateSessionGoal() {
  const goalS = state.goalSessions;
  const pct = goalS > 0 ? Math.min(100, Math.round((state.sessionsToday / goalS) * 100)) : 0;
  document.getElementById('goal-sessions-bar').style.width = pct + '%';
  document.getElementById('goal-sessions-text').textContent = `${state.sessionsToday}/${goalS}`;
  document.getElementById('session-count-display').textContent = state.sessionsToday;
}

function updateStatsUI() {
  const s = state.today;
  const hours   = Math.floor(s.studySeconds / 3600);
  const minutes = Math.floor((s.studySeconds % 3600) / 60);
  document.getElementById('stat-time').textContent     = `${hours}h ${String(minutes).padStart(2,'0')}m`;
  document.getElementById('stat-tasks').textContent    = s.tasksCompleted;
  document.getElementById('stat-sessions').textContent = s.sessionsCompleted;
  document.getElementById('stat-xp-today').textContent = s.xpGained;

  // Today's date
  const d = new Date();
  document.getElementById('today-date').textContent =
    d.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' });

  // Records
  document.getElementById('rec-streak').textContent   = state.bestStreak + ' jours';
  document.getElementById('rec-tasks').textContent    = state.totalTasksEver;
  document.getElementById('rec-sessions').textContent = state.totalSessionsEver;
  const totalH = Math.round(state.totalStudySeconds / 3600);
  document.getElementById('rec-time').textContent     = totalH + 'h';
}

// ============================================================
// TASK SYSTEM
// ============================================================

function renderTasks() {
  const list = document.getElementById('task-list');
  if (state.tasks.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🎮</span>
        <p>Aucune mission. Génère des tâches ci-dessus !</p>
      </div>`;
    updateTaskProgress();
    return;
  }

  list.innerHTML = '';
  state.tasks.forEach(task => {
    const item = createTaskElement(task);
    list.appendChild(item);

    // Micro-tâches
    if (task.microExpanded && task.microTasks && task.microTasks.length > 0) {
      const micro = createMicroTasksElement(task);
      list.appendChild(micro);
    }
  });
  updateTaskProgress();
}

function createTaskElement(task) {
  const div = document.createElement('div');
  div.className = `task-item${task.completed ? ' completed' : ''}`;
  div.dataset.id = task.id;

  div.innerHTML = `
    <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} />
    <span class="task-text">${escapeHtml(task.text)}</span>
    <span class="task-xp-badge">+10 XP</span>
    <div class="task-actions">
      ${!task.completed ? `<button class="btn-microtask" title="Mode Micro-Task">⚡ Micro</button>` : ''}
      <button class="btn-delete-task" title="Supprimer">✕</button>
    </div>
  `;

  // Checkbox
  div.querySelector('.task-checkbox').addEventListener('change', () => {
    toggleTask(task.id);
  });

  // Micro-task
  const microBtn = div.querySelector('.btn-microtask');
  if (microBtn) {
    microBtn.addEventListener('click', () => expandMicroTasks(task.id));
  }

  // Delete
  div.querySelector('.btn-delete-task').addEventListener('click', () => {
    deleteTask(task.id);
  });

  return div;
}

function createMicroTasksElement(task) {
  const container = document.createElement('div');
  container.className = 'micro-tasks';
  container.dataset.parent = task.id;

  task.microTasks.forEach((mt, idx) => {
    const mtDiv = document.createElement('div');
    mtDiv.className = `micro-task-item${mt.completed ? ' completed' : ''}`;
    mtDiv.innerHTML = `
      <input type="checkbox" class="task-checkbox" ${mt.completed ? 'checked' : ''} style="width:16px;height:16px" />
      <span>${escapeHtml(mt.text)}</span>
    `;
    mtDiv.querySelector('.task-checkbox').addEventListener('change', () => {
      toggleMicroTask(task.id, idx);
    });
    container.appendChild(mtDiv);
  });

  return container;
}

function generateTasks(objective) {
  if (!objective.trim()) return;

  CONFIG.taskTemplates.forEach(template => {
    state.tasks.push({
      id: state.nextTaskId++,
      text: template + (objective ? ' — ' + objective : ''),
      completed: false,
      microExpanded: false,
      microTasks: null
    });
  });

  saveState();
  renderTasks();
}

function toggleTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  // Animate
  const el = document.querySelector(`.task-item[data-id="${id}"]`);
  if (el) el.classList.add('completing');

  task.completed = !task.completed;

  if (task.completed) {
    state.today.tasksCompleted++;
    state.totalTasksEver++;
    markActiveToday();
    addXP(CONFIG.xp.task, 'task');
    checkDailyGoal();
  } else {
    state.today.tasksCompleted = Math.max(0, state.today.tasksCompleted - 1);
  }

  saveState();
  setTimeout(() => renderTasks(), 300);
  updateStatsUI();
}

function toggleMicroTask(parentId, idx) {
  const task = state.tasks.find(t => t.id === parentId);
  if (!task || !task.microTasks) return;

  const mt = task.microTasks[idx];
  mt.completed = !mt.completed;

  if (mt.completed) {
    addXP(5, 'microtask'); // micro tâche = 5 XP
  }

  saveState();
  renderTasks();
}

function expandMicroTasks(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  task.microExpanded = !task.microExpanded;
  if (!task.microTasks) {
    task.microTasks = CONFIG.microTemplates.map(text => ({ text, completed: false }));
  }

  saveState();
  renderTasks();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  saveState();
  renderTasks();
}

function clearAllTasks() {
  if (confirm('Effacer toutes les missions ?')) {
    state.tasks = [];
    saveState();
    renderTasks();
  }
}

function checkDailyGoal() {
  if (state.dailyGoalAwarded) return;

  const tasksOk    = state.today.tasksCompleted    >= state.goalTasks;
  const sessionsOk = state.sessionsToday           >= state.goalSessions;

  if (tasksOk && sessionsOk) {
    state.dailyGoalAwarded = true;
    saveState();
    addXP(CONFIG.xp.dailyGoal, 'dailyGoal');
    showXpPopup('🎯 Objectif du jour ! +50 XP');
  }
}

// ============================================================
// POMODORO TIMER
// ============================================================

let timerInterval  = null;
let studyInterval  = null; // pour compter les secondes d'étude
let totalSeconds   = 25 * 60;
let currentSeconds = 25 * 60;
let phase          = 'work'; // 'work' | 'break'
let isRunning      = false;
const CIRCUMFERENCE = 2 * Math.PI * 88; // 553.0

function initTimer() {
  totalSeconds   = state.timerWork * 60;
  currentSeconds = totalSeconds;
  phase          = 'work';
  isRunning      = false;
  updateTimerDisplay();
  updateRingProgress(1);
}

function startTimer() {
  if (isRunning) return;
  isRunning = true;

  timerInterval = setInterval(() => {
    currentSeconds--;
    updateTimerDisplay();
    updateRingProgress(currentSeconds / totalSeconds);

    // Compter secondes d'étude uniquement en phase travail
    if (phase === 'work') {
      state.today.studySeconds++;
      state.totalStudySeconds++;
      // Sauvegarder toutes les minutes
      if (currentSeconds % 60 === 0) saveState();
    }

    if (currentSeconds <= 0) {
      onPhaseEnd();
    }
  }, 1000);
}

function pauseTimer() {
  isRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
}

function resetTimer() {
  pauseTimer();
  initTimer();
}

function onPhaseEnd() {
  pauseTimer();
  playSound('session');
  sendNotification();

  if (phase === 'work') {
    // Fin de session de travail
    state.sessionsToday++;
    state.today.sessionsCompleted++;
    state.totalSessionsEver++;
    markActiveToday();
    addXP(CONFIG.xp.pomodoro, 'pomodoro');
    updateSessionGoal();
    updateSessionDots();
    checkDailyGoal();
    saveState();

    // Passer en pause
    phase = 'break';
    totalSeconds   = state.timerBreak * 60;
    currentSeconds = totalSeconds;
    updatePhaseLabel();
  } else {
    // Fin de pause — revenir en travail
    phase = 'work';
    totalSeconds   = state.timerWork * 60;
    currentSeconds = totalSeconds;
    updatePhaseLabel();
  }

  updateTimerDisplay();
  updateRingProgress(1);
  // Auto-démarrer la prochaine phase
  startTimer();
}

function updateTimerDisplay() {
  const m = Math.floor(currentSeconds / 60);
  const s = currentSeconds % 60;
  const str = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

  document.getElementById('time-display').textContent = str;
  document.getElementById('focus-time-display').textContent = str;

  // Titre de la page
  document.title = isRunning ? `${str} — FocusRank` : 'FocusRank';
}

function updateRingProgress(ratio) {
  const offset = CIRCUMFERENCE * (1 - ratio);
  const ring = document.getElementById('main-ring');
  const focusRing = document.getElementById('focus-ring');
  if (ring)      ring.style.strokeDashoffset      = offset;
  if (focusRing) focusRing.style.strokeDashoffset = offset;

  // Couleur selon phase
  const cls = phase === 'break' ? 'break-phase' : '';
  if (ring)      { ring.className.baseVal      = `ring-progress ${cls}`; }
  if (focusRing) { focusRing.className.baseVal = `ring-progress ${cls}`; }
}

function updatePhaseLabel() {
  const label = phase === 'work' ? 'TRAVAIL' : 'PAUSE';
  document.getElementById('timer-phase-label').textContent = label;
  document.getElementById('focus-timer-label').textContent = label;
}

function updateSessionDots() {
  const count = state.sessionsToday % 4;
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`dot-${i}`);
    if (dot) dot.classList.toggle('active', i < count);
  }
}

function setTimerMode(work, breakMin) {
  state.timerWork  = work;
  state.timerBreak = breakMin;
  saveState();
  resetTimer();
}

function sendNotification() {
  if (!state.notifEnabled) return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    const msg = phase === 'work'
      ? '🍅 Session terminée ! Prends une pause.'
      : '⚡ Pause terminée ! Au travail !';
    new Notification('FocusRank', { body: msg, icon: '' });
  }
}

// ============================================================
// FOCUS MODE
// ============================================================

function enterFocusMode() {
  // Récupérer la tâche en cours (première non-terminée)
  const currentTask = state.tasks.find(t => !t.completed);
  document.getElementById('focus-current-task').textContent =
    currentTask ? currentTask.text : 'Aucune tâche active';

  document.getElementById('focus-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  updateTimerDisplay();
  updateRingProgress(currentSeconds / totalSeconds);
  updatePhaseLabel();
}

function exitFocusMode() {
  document.getElementById('focus-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

// ============================================================
// DAILY GOAL UI
// ============================================================

function showGoalSetup() {
  document.getElementById('goal-setup').classList.toggle('hidden');
  document.getElementById('goal-display').classList.toggle('hidden');
}

function saveGoal() {
  const t = parseInt(document.getElementById('goal-tasks-input').value) || 4;
  const s = parseInt(document.getElementById('goal-sessions-input').value) || 2;
  state.goalTasks    = Math.max(1, t);
  state.goalSessions = Math.max(0, s);
  state.dailyGoalAwarded = false;
  saveState();
  showGoalSetup(); // fermer
  updateTaskProgress();
  updateSessionGoal();
}

// ============================================================
// CHARTS (Chart.js)
// ============================================================

let activityChart  = null;
let sessionsChart  = null;

function buildChartData() {
  // Construire les 7 derniers jours
  const days   = [];
  const tasks  = [];
  const sessions = [];
  const studyMins = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const str = d.toISOString().split('T')[0];
    const label = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
    days.push(label);

    // Trouver dans l'historique
    const hist = state.weekHistory.find(h => h.date === str);
    if (hist) {
      tasks.push(hist.tasks);
      sessions.push(hist.sessions);
      studyMins.push(hist.studyMinutes);
    } else if (str === state.today.date) {
      // Aujourd'hui
      tasks.push(state.today.tasksCompleted);
      sessions.push(state.today.sessionsCompleted);
      studyMins.push(Math.round(state.today.studySeconds / 60));
    } else {
      tasks.push(0);
      sessions.push(0);
      studyMins.push(0);
    }
  }

  return { days, tasks, sessions, studyMins };
}

function initCharts() {
  const { days, tasks, sessions, studyMins } = buildChartData();

  const chartDefaults = {
    responsive: true,
    plugins: {
      legend: {
        labels: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 11 } }
      }
    },
    scales: {
      x: { ticks: { color: '#475569', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#475569', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true }
    }
  };

  // Activity chart (tâches + minutes d'étude)
  const actCtx = document.getElementById('activity-chart').getContext('2d');
  if (activityChart) activityChart.destroy();
  activityChart = new Chart(actCtx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        {
          label: 'Tâches complétées',
          data: tasks,
          backgroundColor: 'rgba(99,179,237,0.25)',
          borderColor: '#63b3ed',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'Minutes étudiées',
          data: studyMins,
          backgroundColor: 'rgba(167,139,250,0.2)',
          borderColor: '#a78bfa',
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: 'y'
        }
      ]
    },
    options: { ...chartDefaults }
  });

  // Sessions chart (line)
  const sesCtx = document.getElementById('sessions-chart').getContext('2d');
  if (sessionsChart) sessionsChart.destroy();
  sessionsChart = new Chart(sesCtx, {
    type: 'line',
    data: {
      labels: days,
      datasets: [
        {
          label: 'Sessions Pomodoro',
          data: sessions,
          borderColor: '#00f5ff',
          backgroundColor: 'rgba(0,245,255,0.08)',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#00f5ff',
          pointRadius: 4
        }
      ]
    },
    options: {
      ...chartDefaults,
      plugins: {
        ...chartDefaults.plugins,
        legend: {
          labels: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 11 } }
        }
      }
    }
  });
}

// ============================================================
// SOUND SYSTEM (Web Audio API)
// ============================================================

let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playSound(type) {
  if (!state.soundEnabled) return;

  try {
    const ctx = getAudioCtx();

    if (type === 'xp') {
      // Court ding montant
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);

    } else if (type === 'session') {
      // Trois notes
      const notes = [523, 659, 784];
      notes.forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        const t = ctx.currentTime + i * 0.15;
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.start(t);
        osc.stop(t + 0.35);
      });

    } else if (type === 'levelup') {
      // Fanfare montante
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'square';
        const t = ctx.currentTime + i * 0.12;
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.start(t);
        osc.stop(t + 0.45);
      });
    }
  } catch (e) {
    // Web Audio non disponible
  }
}

// ============================================================
// PROFILE PAGE — Ranks list
// ============================================================

function renderRanksList() {
  const container = document.getElementById('ranks-list');
  const currentRank = getRank(state.level);
  container.innerHTML = '';

  CONFIG.ranks.forEach(rank => {
    const isCurrent = rank.name === currentRank.name;
    const isUnlocked = state.level >= rank.minLevel;

    const div = document.createElement('div');
    div.className = `rank-item${isCurrent ? ' current-rank' : ''}`;
    div.style.opacity = isUnlocked ? '1' : '0.4';

    div.innerHTML = `
      <span class="rank-item-icon">${rank.icon}</span>
      <div class="rank-item-info">
        <div class="rank-item-name" style="color:${rank.color}">${rank.name}</div>
        <div class="rank-item-req">Niveau ${rank.minLevel} requis</div>
      </div>
      <span class="rank-item-badge ${isCurrent ? 'active-badge' : 'locked'}">
        ${isCurrent ? 'ACTUEL' : isUnlocked ? '✓' : '🔒'}
      </span>
    `;

    container.appendChild(div);
  });
}

// ============================================================
// TAB NAVIGATION
// ============================================================

function initTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  const panels  = document.querySelectorAll('.tab-panel');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;

      buttons.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`tab-${target}`).classList.add('active');

      // Refresh charts quand on ouvre stats
      if (target === 'stats') {
        setTimeout(initCharts, 50);
      }
      if (target === 'profile') {
        renderRanksList();
      }
    });
  });
}

// ============================================================
// RESET ALL
// ============================================================

function resetAll() {
  if (!confirm('Réinitialiser TOUTES les données ? (XP, niveaux, tâches, stats)')) return;
  localStorage.removeItem('focusrank_state');
  location.reload();
}

// ============================================================
// HELPERS
// ============================================================

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Inject SVG gradient dans les rings
function injectSvgGradient() {
  document.querySelectorAll('.timer-ring, .timer-ring-focus').forEach(svg => {
    if (svg.querySelector('defs')) return;
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%"   stop-color="#2b6cb0"/>
        <stop offset="100%" stop-color="#00f5ff"/>
      </linearGradient>`;
    svg.insertBefore(defs, svg.firstChild);
  });
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

  // 1. Charger l'état
  loadState();
  checkDayReset();

  // 2. SVG gradients
  injectSvgGradient();

  // 3. Tabs
  initTabs();

  // 4. Timer initial
  initTimer();
  updateTimerDisplay();
  updateRingProgress(1);
  updateSessionDots();
  updateSessionGoal();

  // 5. Affichage initial
  updateXpBar();
  updateRankUI();
  updateStreakUI();
  updateStatsUI();
  renderTasks();
  renderRanksList();

  // 6. Goal display
  document.getElementById('goal-tasks-input').value   = state.goalTasks;
  document.getElementById('goal-sessions-input').value = state.goalSessions;
  updateTaskProgress();
  updateSessionGoal();

  // 7. Options
  document.getElementById('sound-toggle').checked = state.soundEnabled;
  document.getElementById('notif-toggle').checked  = state.notifEnabled;

  // ============================================================
  // EVENT LISTENERS
  // ============================================================

  // --- Tâches ---
  document.getElementById('generate-tasks-btn').addEventListener('click', () => {
    const val = document.getElementById('objective-input').value.trim();
    if (!val) {
      document.getElementById('objective-input').focus();
      return;
    }
    generateTasks(val);
    document.getElementById('objective-input').value = '';
  });

  document.getElementById('objective-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('generate-tasks-btn').click();
  });

  document.getElementById('clear-tasks-btn').addEventListener('click', clearAllTasks);

  // --- Daily goal ---
  document.getElementById('edit-goal-btn').addEventListener('click', showGoalSetup);
  document.getElementById('save-goal-btn').addEventListener('click', saveGoal);

  // --- Timer ---
  document.getElementById('start-btn').addEventListener('click', startTimer);
  document.getElementById('pause-btn').addEventListener('click', pauseTimer);
  document.getElementById('reset-btn').addEventListener('click', resetTimer);

  // Focus mode sync
  document.getElementById('focus-start-btn').addEventListener('click', startTimer);
  document.getElementById('focus-pause-btn').addEventListener('click', pauseTimer);
  document.getElementById('focus-reset-btn').addEventListener('click', resetTimer);

  // Timer mode
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setTimerMode(parseInt(btn.dataset.work), parseInt(btn.dataset.break));
    });
  });

  // --- Focus mode ---
  document.getElementById('focus-mode-btn').addEventListener('click', enterFocusMode);
  document.getElementById('exit-focus-btn').addEventListener('click', exitFocusMode);

  // Fermer focus avec Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') exitFocusMode();
  });

  // --- Level up close ---
  document.getElementById('levelup-close').addEventListener('click', () => {
    document.getElementById('levelup-overlay').classList.add('hidden');
  });

  // --- Options ---
  document.getElementById('sound-toggle').addEventListener('change', e => {
    state.soundEnabled = e.target.checked;
    saveState();
  });

  document.getElementById('notif-toggle').addEventListener('change', e => {
    state.notifEnabled = e.target.checked;
    if (e.target.checked && 'Notification' in window) {
      Notification.requestPermission().then(perm => {
        if (perm !== 'granted') {
          e.target.checked = false;
          state.notifEnabled = false;
        }
        saveState();
      });
    } else {
      saveState();
    }
  });

  // --- Reset all ---
  document.getElementById('reset-all-btn').addEventListener('click', resetAll);

  // ============================================================
  // Periodic save (toutes les 30 secondes)
  // ============================================================
  setInterval(() => {
    saveState();
    updateStatsUI();
    updateTaskProgress();
    updateSessionGoal();
  }, 30000);

});