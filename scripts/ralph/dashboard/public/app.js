const ringCircle = document.getElementById('ring-progress');
const ringCircumference = 2 * Math.PI * 54;

let latestState = null;
let currentFilter = 'all';
let currentShots = [];
let currentShotIndex = -1;
let currentZoom = 1;

function $(id) {
  return document.getElementById(id);
}

function formatTime(ts) {
  if (!ts) return '--';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString();
}

function formatDuration(start, end) {
  if (!start || !end) return null;
  const diff = Math.max(0, end - start) / 1000;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hours}h ${rem}m`;
}

function setRing(percent) {
  const offset = ringCircumference - (percent / 100) * ringCircumference;
  ringCircle.style.strokeDashoffset = String(offset);
}

function renderHeader(state) {
  $('title').textContent = state.display?.prdTitle || state.prd?.title || 'Ralph Session';
  $('description').textContent = state.display?.prdDescription || state.prd?.description || 'No PRD description found.';
  $('workdir').textContent = state.meta?.workDir || '--';
  $('tasksdir').textContent = state.meta?.tasksDir || '--';
  $('updated-at').textContent = state.meta?.lastModified
    ? `Last change ${new Date(state.meta.lastModified).toLocaleTimeString()}`
    : 'Waiting for updates';
}

function renderStatus(state) {
  const stats = state.stats || { total: 0, done: 0, inProgress: 0, open: 0, percent: 0 };
  setRing(stats.percent || 0);
  $('percent').textContent = `${stats.percent || 0}%`;
  $('done-count').textContent = stats.done;
  $('inprogress-count').textContent = stats.inProgress;
  $('open-count').textContent = stats.open;
  $('reset-count').textContent = state.activity?.summary?.resets || 0;
  $('stories-count').textContent = `${stats.total} stories`;

  const pill = $('status-pill');
  if (stats.inProgress > 0) {
    pill.textContent = 'Running';
  } else if (stats.total > 0 && stats.done === stats.total) {
    pill.textContent = 'Complete';
  } else {
    pill.textContent = 'Idle';
  }
}

function renderIssues(state) {
  const issuesList = $('issues-list');
  issuesList.innerHTML = '';
  const issues = [];
  state.issues?.errors?.forEach((issue) => issues.push({ ...issue, level: 'error' }));
  state.issues?.warnings?.forEach((issue) => issues.push({ ...issue, level: 'warning' }));
  state.issues?.notes?.forEach((issue) => issues.push({ ...issue, level: 'note' }));

  $('issue-count').textContent = issues.length;

  if (issues.length === 0) {
    issuesList.innerHTML = '<div class="muted">No issues detected.</div>';
    return;
  }

  for (const issue of issues) {
    const item = document.createElement('div');
    item.className = `issue${issue.level === 'warning' ? ' issue--warning' : ''}${issue.level === 'note' ? ' issue--note' : ''}`;
    item.textContent = issue.message;
    issuesList.appendChild(item);
  }
}

function renderStories(state) {
  const list = $('stories-list');
  list.innerHTML = '';
  const stories = state.stories || [];

  const filtered = stories.filter((story) => {
    if (currentFilter === 'all') return true;
    return story.status === currentFilter;
  });

  if (filtered.length === 0) {
    list.innerHTML = '<div class="muted">No stories to show.</div>';
    return;
  }

  for (const story of filtered) {
    const card = document.createElement('div');
    card.className = 'story';

    const title = document.createElement('div');
    title.className = 'story__title';
    title.textContent = `${story.id} - ${story.displayTitle || story.title}`;

    const meta = document.createElement('div');
    meta.className = 'story__meta';

    const status = document.createElement('span');
    status.className = `story__status story__status--${story.status}`;
    status.textContent = story.status.replace('_', ' ');

    meta.appendChild(status);

    if (story.priority) {
      const priority = document.createElement('span');
      priority.textContent = `Priority ${story.priority}`;
      meta.appendChild(priority);
    }

    if (story.startedAt) {
      const started = document.createElement('span');
      started.textContent = `Started ${formatTime(story.startedAt)}`;
      meta.appendChild(started);
    }

    if (story.completedAt) {
      const completed = document.createElement('span');
      completed.textContent = `Completed ${formatTime(story.completedAt)}`;
      meta.appendChild(completed);
    }

    const duration = formatDuration(story.startedAt, story.completedAt);
    if (duration) {
      const durationEl = document.createElement('span');
      durationEl.textContent = `Duration ${duration}`;
      meta.appendChild(durationEl);
    }

    if (story.stale) {
      const stale = document.createElement('span');
      stale.textContent = 'Stale';
      meta.appendChild(stale);
    }

    card.appendChild(title);
    card.appendChild(meta);
    list.appendChild(card);
  }
}

function renderActivity(state) {
  const list = $('activity-list');
  list.innerHTML = '';
  const entries = state.activity?.entries || [];
  $('activity-count').textContent = `${entries.length} events`;

  if (entries.length === 0) {
    list.innerHTML = '<div class="muted">No activity yet.</div>';
    return;
  }

  for (const entry of entries) {
    const item = document.createElement('div');
    item.className = 'activity__item';

    const meta = document.createElement('div');
    meta.className = 'activity__meta';
    meta.textContent = entry.timestamp;

    const tag = document.createElement('span');
    tag.className = `activity__tag activity__tag--${entry.action}`;
    tag.textContent = `${entry.storyId} ${entry.action}`;

    const message = document.createElement('div');
    message.textContent = entry.displayMessage || entry.message;

    item.appendChild(meta);
    item.appendChild(tag);
    item.appendChild(message);
    list.appendChild(item);
  }
}

function renderLearning(state) {
  const latest = state.display?.latestLearning || state.progress?.latestSection || 'No progress.txt yet.';
  $('latest-learning').textContent = latest;
}

function renderGuardrails(state) {
  const preview = state.display?.guardrailsPreview || state.guardrails?.preview || 'No guardrails.md yet.';
  $('guardrails-preview').textContent = preview;
}

function renderScreenshots(state) {
  const grid = $('screenshots-grid');
  grid.innerHTML = '';
  const shots = state.screenshots?.items || [];
  currentShots = shots;
  $('screenshots-count').textContent = `${shots.length} files`;

  if (shots.length === 0) {
    grid.innerHTML = '<div class="muted">No screenshots found.</div>';
    return;
  }

  shots.forEach((shot, index) => {
    const card = document.createElement('div');
    card.className = 'shot';
    card.dataset.src = shot.url;
    card.dataset.name = shot.name;
    card.dataset.index = String(index);

    const img = document.createElement('img');
    img.src = shot.url;
    img.alt = shot.name;

    const label = document.createElement('div');
    label.className = 'shot__label';
    label.textContent = shot.name;

    card.appendChild(img);
    card.appendChild(label);
    grid.appendChild(card);
  });
}

function render(state) {
  renderHeader(state);
  renderStatus(state);
  renderIssues(state);
  renderStories(state);
  renderActivity(state);
  renderLearning(state);
  renderGuardrails(state);
  renderScreenshots(state);
}

async function fetchState() {
  try {
    const res = await fetch('/api/state');
    const data = await res.json();
    latestState = data;
    render(data);
  } catch (err) {
    console.error('Failed to fetch state', err);
  }
}

function setupFilters() {
  const filters = document.querySelectorAll('.filter');
  filters.forEach((btn) => {
    btn.addEventListener('click', () => {
      filters.forEach((el) => el.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      if (latestState) {
        renderStories(latestState);
      }
    });
  });
}

function applyZoom(value) {
  const image = $('modal-image');
  currentZoom = Math.min(4, Math.max(0.5, value));
  image.style.transform = `scale(${currentZoom})`;
}

function updateModalCounter() {
  const counter = $('modal-counter');
  if (currentShots.length === 0 || currentShotIndex < 0) {
    counter.textContent = '0 / 0';
    return;
  }
  counter.textContent = `${currentShotIndex + 1} / ${currentShots.length}`;
}

function openShot(index) {
  if (currentShots.length === 0) return;
  currentShotIndex = Math.max(0, Math.min(index, currentShots.length - 1));
  const shot = currentShots[currentShotIndex];
  const modal = $('shot-modal');
  const image = $('modal-image');
  const caption = $('modal-caption');
  image.src = shot.url;
  caption.textContent = shot.name;
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  applyZoom(1);
  updateModalCounter();
}

function closeModal() {
  const modal = $('shot-modal');
  const image = $('modal-image');
  const caption = $('modal-caption');
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  image.src = '';
  caption.textContent = '';
  currentShotIndex = -1;
  applyZoom(1);
  updateModalCounter();
}

function setupModal() {
  const modal = $('shot-modal');
  const imageWrap = modal.querySelector('.modal__image-wrap');

  document.body.addEventListener('click', (event) => {
    const target = event.target.closest('.shot');
    if (target) {
      const index = Number(target.dataset.index || 0);
      openShot(index);
    }
  });

  modal.addEventListener('click', (event) => {
    if (event.target.dataset.close === 'true') {
      closeModal();
    }

    const action = event.target.dataset.action;
    if (!action) return;
    if (action === 'prev') {
      openShot(currentShotIndex - 1);
    }
    if (action === 'next') {
      openShot(currentShotIndex + 1);
    }
    if (action === 'zoom-in') {
      applyZoom(currentZoom + 0.2);
    }
    if (action === 'zoom-out') {
      applyZoom(currentZoom - 0.2);
    }
    if (action === 'zoom-reset') {
      applyZoom(1);
    }
  });

  modal.addEventListener('dblclick', () => {
    applyZoom(currentZoom === 1 ? 2 : 1);
  });

  imageWrap.addEventListener('wheel', (event) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.1 : -0.1;
    applyZoom(currentZoom + delta);
  }, { passive: false });

  document.addEventListener('keydown', (event) => {
    if (!modal.classList.contains('active')) return;
    if (event.key === 'Escape') closeModal();
    if (event.key === 'ArrowLeft') openShot(currentShotIndex - 1);
    if (event.key === 'ArrowRight') openShot(currentShotIndex + 1);
    if (event.key === '+') applyZoom(currentZoom + 0.2);
    if (event.key === '-') applyZoom(currentZoom - 0.2);
  });
}

function setupEvents() {
  const liveDot = $('live-dot');
  if (!('EventSource' in window)) {
    setInterval(fetchState, 5000);
    return;
  }

  const source = new EventSource('/events');
  source.onopen = () => {
    liveDot.style.background = 'var(--accent)';
  };
  source.onerror = () => {
    liveDot.style.background = 'var(--danger)';
  };
  source.addEventListener('update', () => {
    fetchState();
  });
  setInterval(fetchState, 5000);
}

fetchState();
setupFilters();
setupModal();
setupEvents();
