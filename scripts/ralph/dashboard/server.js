#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--workdir' || arg === '-w') {
      args.workdir = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--workdir=')) {
      args.workdir = arg.split('=')[1];
      continue;
    }
    if (arg === '--port' || arg === '-p') {
      args.port = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--port=')) {
      args.port = arg.split('=')[1];
      continue;
    }
    if (arg === '--stale-seconds') {
      args.staleSeconds = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--stale-seconds=')) {
      args.staleSeconds = arg.split('=')[1];
      continue;
    }
    if (arg === '--translate') {
      args.translate = true;
      continue;
    }
    if (arg === '--no-translate') {
      args.translate = false;
      continue;
    }
  }
  return args;
}

const args = parseArgs(process.argv);
const workDir = path.resolve(args.workdir || process.env.WORK_DIR || process.cwd());
const tasksDir = path.join(workDir, 'tasks');
const port = Number(args.port || process.env.PORT || 7420);
const staleSeconds = Number(args.staleSeconds || process.env.STALE_SECONDS || 600);
const translateEnabled = (() => {
  if (typeof args.translate === 'boolean') return args.translate;
  const raw = process.env.RALPH_DASHBOARD_TRANSLATE;
  if (raw == null) return true;
  const normalized = String(raw).trim().toLowerCase();
  return !(normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off');
})();

const sseClients = new Set();
let cachedState = null;
let dirty = true;
let lastComputedAt = 0;

const translationCache = new Map();
const translationPending = new Set();
const translationQueue = [];
let translationInFlight = false;
let translationLastError = null;
let translationCompletedBatches = 0;
let claudeAvailable = true;

const TRANSLATION_BATCH_MAX_ITEMS = 30;
const TRANSLATION_BATCH_MAX_CHARS = 14000;
const TRANSLATION_MAX_ATTEMPTS = 2;

function hashString(input) {
  return crypto.createHash('sha1').update(input).digest('hex');
}

function enqueueTranslation(key, source, priority = 3) {
  if (!translateEnabled || !claudeAvailable) return;
  if (!source) return;

  const cached = translationCache.get(key);
  if (cached && cached.source === source) return;

  const pendingId = `${key}|${hashString(source)}`;
  if (translationPending.has(pendingId)) return;

  translationPending.add(pendingId);
  translationQueue.push({ key, source, priority, attempts: 0, pendingId });
  translationQueue.sort((a, b) => a.priority - b.priority);
  kickTranslationWorker();
}

function getTranslation(key, source) {
  const cached = translationCache.get(key);
  if (cached && cached.source === source) return cached.translated;
  return null;
}

function translateOrQueue(key, source, priority = 3) {
  if (!translateEnabled || !claudeAvailable) return source;
  const translated = getTranslation(key, source);
  if (translated) return translated;
  enqueueTranslation(key, source, priority);
  return source;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      const slice = text.slice(first, last + 1);
      try {
        return JSON.parse(slice);
      } catch (_) {
        return null;
      }
    }
    return null;
  }
}

function runClaudeTranslation(items) {
  return new Promise((resolve, reject) => {
    const payload = {
      targetLanguage: 'en',
      items: items.map((item) => ({ key: item.key, text: item.source })),
    };

    const prompt = [
      'You are a translation engine.',
      'Translate each item.text to natural English.',
      '',
      'Rules:',
      '- Preserve code, backticks, URLs, file paths, identifiers, and IDs exactly.',
      '- Preserve newlines and markdown structure as closely as possible.',
      '- If an item is already English, return it unchanged.',
      '- Output ONLY valid JSON (no markdown, no commentary).',
      '',
      'Return format:',
      '{\"translations\": {\"<key>\": \"<english>\", ...}}',
      'Include every key exactly once.',
      '',
      'Input JSON:',
      JSON.stringify(payload),
    ].join('\n');

    const proc = spawn('claude', ['-p', '--output-format', 'json', prompt], {
      cwd: workDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    proc.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    proc.on('error', (err) => {
      reject(err);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`claude exited with code ${code}: ${stderr.trim()}`));
        return;
      }

      const parsed = safeJsonParse(stdout.trim());
      if (!parsed || typeof parsed.result !== 'string') {
        reject(new Error('Unexpected Claude CLI response (expected JSON with a string "result").'));
        return;
      }

      const translatedPayload = safeJsonParse(parsed.result.trim());
      if (!translatedPayload || typeof translatedPayload !== 'object') {
        reject(new Error('Claude CLI did not return valid JSON translations.'));
        return;
      }

      resolve(translatedPayload);
    });
  });
}

function kickTranslationWorker() {
  if (!translateEnabled || !claudeAvailable) return;
  if (translationInFlight) return;
  if (translationQueue.length === 0) return;
  setTimeout(() => {
    void processTranslationQueue();
  }, 10);
}

async function processTranslationQueue() {
  if (!translateEnabled || !claudeAvailable) return;
  if (translationInFlight) return;
  if (translationQueue.length === 0) return;

  translationInFlight = true;
  translationLastError = null;

  const batch = [];
  let batchChars = 0;

  while (translationQueue.length > 0 && batch.length < TRANSLATION_BATCH_MAX_ITEMS) {
    const next = translationQueue[0];
    const nextSize = (next.source || '').length;
    if (batch.length > 0 && batchChars + nextSize > TRANSLATION_BATCH_MAX_CHARS) break;

    translationQueue.shift();
    batch.push(next);
    batchChars += nextSize;
  }

  try {
    const result = await runClaudeTranslation(batch);
    const translations = result.translations || result;

    for (const item of batch) {
      const translated = translations[item.key];
      if (typeof translated === 'string' && translated.trim()) {
        translationCache.set(item.key, { source: item.source, translated: translated.trim() });
      }
      translationPending.delete(item.pendingId);
    }

    translationCompletedBatches += 1;
    markDirty();
  } catch (err) {
    translationLastError = err instanceof Error ? err.message : String(err);
    if (translationLastError.includes('ENOENT') || translationLastError.includes('not found')) {
      claudeAvailable = false;
    }

    for (const item of batch) {
      if (item.attempts + 1 <= TRANSLATION_MAX_ATTEMPTS) {
        translationQueue.push({ ...item, attempts: item.attempts + 1 });
      } else {
        translationPending.delete(item.pendingId);
      }
    }
    translationQueue.sort((a, b) => a.priority - b.priority);
  } finally {
    translationInFlight = false;
    if (translationQueue.length > 0) {
      kickTranslationWorker();
    }
  }
}

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return null;
  }
}

function readJson(filePath) {
  const raw = safeRead(filePath);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { __error: `Invalid JSON in ${filePath}: ${err.message}` };
  }
}

function normalizeStoryStatus(story) {
  const status = story.status || null;
  if (status === 'done' || status === 'completed') return 'done';
  if (status === 'in_progress') return 'in_progress';
  if (status === 'open') return 'open';
  if (status == null && story.passes === true) return 'done';
  if (status == null && story.passes === false) return 'open';
  return 'open';
}

function parseTimestamp(ts) {
  if (!ts) return null;
  const iso = ts.replace(' ', 'T');
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseActivity(raw) {
  if (!raw) return { entries: [], parseErrors: 0 };
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  const entries = [];
  let parseErrors = 0;
  const pattern = /^\[([^\]]+)\] \[([^\]]+)\] \[([^\]]+)\] (.+)$/;
  for (const line of lines) {
    const match = line.match(pattern);
    if (!match) {
      parseErrors += 1;
      continue;
    }
    const timestamp = match[1];
    entries.push({
      timestamp,
      storyId: match[2],
      action: match[3],
      message: match[4],
      ts: parseTimestamp(timestamp),
    });
  }
  return { entries, parseErrors };
}

function buildActivitySummary(entries) {
  const byStory = {};
  let resets = 0;
  for (const entry of entries) {
    const story = byStory[entry.storyId] || {
      id: entry.storyId,
      startedAt: null,
      completedAt: null,
      resets: 0,
      lastAction: null,
      lastMessage: null,
      events: 0,
    };
    story.lastAction = entry.action;
    story.lastMessage = entry.message;
    story.events += 1;
    if (entry.action === 'started' && !story.startedAt) {
      story.startedAt = entry.ts ? entry.ts.getTime() : null;
    }
    if (entry.action === 'completed') {
      story.completedAt = entry.ts ? entry.ts.getTime() : null;
    }
    if (entry.action === 'reset') {
      story.resets += 1;
      resets += 1;
    }
    byStory[entry.storyId] = story;
  }

  const incomplete = Object.values(byStory)
    .filter((story) => story.startedAt && !story.completedAt)
    .map((story) => story.id);

  return { byStory, resets, incomplete };
}

function listScreenshots(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith('.'));

    return entries.map((name) => {
      const fullPath = path.join(dirPath, name);
      let stat = null;
      try {
        stat = fs.statSync(fullPath);
      } catch (err) {
        stat = null;
      }
      const storyMatch = name.match(/(US-\d{3})/i);
      return {
        name,
        url: `/screenshots/${encodeURIComponent(name)}`,
        size: stat ? stat.size : null,
        mtime: stat ? stat.mtimeMs : null,
        storyId: storyMatch ? storyMatch[1].toUpperCase() : null,
      };
    });
  } catch (err) {
    return [];
  }
}

function extractScreenshotRefs(raw, screenshotsDir) {
  if (!raw) return { references: [], missing: [] };
  const matches = raw.match(/tasks\/screenshots\/[^\s`'"\)]+/g) || [];
  const unique = Array.from(new Set(matches));
  const missing = [];
  const available = new Set(listScreenshots(screenshotsDir).map((shot) => shot.name));

  for (const ref of unique) {
    const filePart = ref.replace('tasks/screenshots/', '');
    if (filePart.includes('*')) {
      const regexStr = `^${filePart.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*')}$`;
      const regex = new RegExp(regexStr);
      const hasMatch = Array.from(available).some((name) => regex.test(name));
      if (!hasMatch) {
        missing.push(ref);
      }
    } else if (!available.has(filePart)) {
      missing.push(ref);
    }
  }

  return { references: unique, missing };
}

function extractLatestSection(raw) {
  if (!raw) return '';
  const lines = raw.split('\n');
  const separators = [];
  lines.forEach((line, index) => {
    if (line.trim() === '---') separators.push(index);
  });

  if (separators.length === 0) {
    return raw.trim();
  }

  const start = separators.length >= 2 ? separators[separators.length - 2] : separators[0];
  const end = separators[separators.length - 1];
  const slice = lines.slice(start, end).join('\n').trim();
  return slice || raw.trim();
}

function buildState() {
  const prdPath = path.join(tasksDir, 'prd.json');
  const activityPath = path.join(tasksDir, 'activity.log');
  const progressPath = path.join(tasksDir, 'progress.txt');
  const guardrailsPath = path.join(tasksDir, 'guardrails.md');
  const screenshotsDir = path.join(tasksDir, 'screenshots');

  const prd = readJson(prdPath);
  const progressRaw = safeRead(progressPath);
  const guardrailsRaw = safeRead(guardrailsPath);
  const activityRaw = safeRead(activityPath);
  const activityParsed = parseActivity(activityRaw);
  const activitySummary = buildActivitySummary(activityParsed.entries);

  const stories = prd && !prd.__error && Array.isArray(prd.userStories) ? prd.userStories : [];
  const prdTitleRaw = prd && !prd.__error && typeof prd.title === 'string' ? prd.title : '';
  const prdDescriptionRaw = prd && !prd.__error && typeof prd.description === 'string' ? prd.description : '';
  const prdTitleDisplay = translateOrQueue('prd.title', prdTitleRaw, 0) || prdTitleRaw;
  const prdDescriptionDisplay = translateOrQueue('prd.description', prdDescriptionRaw, 0) || prdDescriptionRaw;

  const computedStories = stories.map((story) => {
    const status = normalizeStoryStatus(story);
    const startedAt = story.startedAt ? Number(story.startedAt) * 1000 : null;
    const completedAt = story.completedAt ? Number(story.completedAt) * 1000 : null;
    const staleCount = Number(story.staleCount || 0);
    const stale = status === 'in_progress' && startedAt && (Date.now() - startedAt) / 1000 > staleSeconds;
    const storyId = typeof story.id === 'string' ? story.id : 'UNKNOWN';
    const storyTitleRaw = typeof story.title === 'string' ? story.title : '';
    const storyDescriptionRaw = typeof story.description === 'string' ? story.description : '';
    return {
      id: storyId,
      title: storyTitleRaw,
      displayTitle: translateOrQueue(`story.${storyId}.title`, storyTitleRaw, 0) || storyTitleRaw,
      status,
      priority: story.priority || null,
      passes: story.passes === true,
      startedAt,
      completedAt,
      stale,
      staleCount,
      description: storyDescriptionRaw || null,
      displayDescription: translateOrQueue(`story.${storyId}.description`, storyDescriptionRaw, 1) || storyDescriptionRaw || null,
      acceptanceCriteria: story.acceptanceCriteria || [],
    };
  });

  const total = computedStories.length;
  const done = computedStories.filter((story) => story.status === 'done').length;
  const inProgress = computedStories.filter((story) => story.status === 'in_progress').length;
  const open = computedStories.filter((story) => story.status === 'open').length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  const screenshots = listScreenshots(screenshotsDir);
  const screenshotRefs = extractScreenshotRefs(progressRaw, screenshotsDir);
  const lastSection = extractLatestSection(progressRaw);
  const guardrailsPreviewRaw = guardrailsRaw ? guardrailsRaw.split('\n').slice(0, 30).join('\n') : '';
  const displayLatestLearning = translateOrQueue('progress.latestSection', lastSection, 2) || lastSection;
  const displayGuardrailsPreview = translateOrQueue('guardrails.preview', guardrailsPreviewRaw, 2) || guardrailsPreviewRaw;

  const activityEntries = activityParsed.entries.slice(-120).reverse().map((entry) => {
    const messageRaw = typeof entry.message === 'string' ? entry.message : '';
    const key = `activity.${entry.timestamp}.${entry.storyId}.${entry.action}`;
    return {
      ...entry,
      displayMessage: translateOrQueue(key, messageRaw, 4) || messageRaw,
    };
  });

  const issues = {
    errors: [],
    warnings: [],
    notes: [],
  };

  if (!fs.existsSync(tasksDir)) {
    issues.errors.push({
      type: 'missing-tasks',
      message: `Tasks directory not found at ${tasksDir}`,
    });
  }

  if (!prd) {
    issues.warnings.push({
      type: 'missing-prd',
      message: 'prd.json not found',
    });
  } else if (prd.__error) {
    issues.errors.push({
      type: 'invalid-prd',
      message: prd.__error,
    });
  }

  if (!activityRaw) {
    issues.warnings.push({
      type: 'missing-activity',
      message: 'activity.log not found',
    });
  } else if (activityParsed.parseErrors > 0) {
    issues.warnings.push({
      type: 'activity-parse',
      message: `activity.log had ${activityParsed.parseErrors} unparsable line(s)`,
    });
  }

  if (!progressRaw) {
    issues.warnings.push({
      type: 'missing-progress',
      message: 'progress.txt not found',
    });
  }

  if (!guardrailsRaw) {
    issues.warnings.push({
      type: 'missing-guardrails',
      message: 'guardrails.md not found',
    });
  }

  if (activitySummary.incomplete.length > 0) {
    issues.warnings.push({
      type: 'incomplete-stories',
      message: `Stories started but not completed in activity.log: ${activitySummary.incomplete.join(', ')}`,
    });
  }

  if (activitySummary.resets > 0) {
    issues.warnings.push({
      type: 'reset-detected',
      message: `${activitySummary.resets} reset(s) detected in activity.log`,
    });
  }

  if (screenshotRefs.missing.length > 0) {
    issues.warnings.push({
      type: 'missing-screenshots',
      message: `Missing screenshot references: ${screenshotRefs.missing.join(', ')}`,
    });
  }

  const completedStatusMismatch = stories.filter((story) => story.status === 'completed');
  if (completedStatusMismatch.length > 0) {
    issues.warnings.push({
      type: 'status-mismatch',
      message: `Found ${completedStatusMismatch.length} story(ies) with status="completed" (Ralph expects "done"). Progress may appear as 0%.`,
    });
  }

  if (stories.length > 0 && activityRaw) {
    const completedMissing = computedStories
      .filter((story) => story.status === 'done')
      .filter((story) => !activitySummary.byStory[story.id] || !activitySummary.byStory[story.id].completedAt)
      .map((story) => story.id);
    if (completedMissing.length > 0) {
      issues.notes.push({
        type: 'missing-completed-logs',
        message: `Stories marked done without completion logs: ${completedMissing.join(', ')}`,
      });
    }
  }

  const staleStories = computedStories.filter((story) => story.stale).map((story) => story.id);
  if (staleStories.length > 0) {
    issues.warnings.push({
      type: 'stale-stories',
      message: `Stories in progress beyond ${staleSeconds}s: ${staleStories.join(', ')}`,
    });
  }

  if (translateEnabled && !claudeAvailable) {
    issues.warnings.push({
      type: 'translation-disabled',
      message: 'Content translation is enabled but Claude CLI is not available. Set RALPH_DASHBOARD_TRANSLATE=0 to disable translation warnings.',
    });
  }

  if (translateEnabled && translationLastError) {
    issues.warnings.push({
      type: 'translation-error',
      message: `Content translation error: ${translationLastError}`,
    });
  }

  const lastUpdated = [
    prdPath,
    progressPath,
    activityPath,
    guardrailsPath,
    screenshotsDir,
  ].reduce((latest, filePath) => {
    try {
      const stat = fs.statSync(filePath);
      const mtime = stat.mtimeMs;
      return mtime > latest ? mtime : latest;
    } catch (err) {
      return latest;
    }
  }, 0);

  return {
    meta: {
      workDir,
      tasksDir,
      updatedAt: Date.now(),
      lastModified: lastUpdated || null,
      staleSeconds,
    },
    prd: prd && !prd.__error ? prd : null,
    display: {
      prdTitle: prdTitleDisplay,
      prdDescription: prdDescriptionDisplay,
      latestLearning: displayLatestLearning,
      guardrailsPreview: displayGuardrailsPreview,
    },
    translation: {
      enabled: translateEnabled,
      claudeAvailable,
      inFlight: translationInFlight,
      queued: translationQueue.length,
      completedBatches: translationCompletedBatches,
      lastError: translationLastError,
    },
    stats: {
      total,
      done,
      inProgress,
      open,
      percent,
    },
    stories: computedStories,
    activity: {
      entries: activityEntries,
      summary: activitySummary,
    },
    progress: {
      raw: progressRaw || '',
      latestSection: lastSection,
    },
    guardrails: {
      raw: guardrailsRaw || '',
      preview: guardrailsPreviewRaw,
    },
    screenshots: {
      items: screenshots,
      count: screenshots.length,
    },
    artifacts: {
      references: screenshotRefs.references,
      missing: screenshotRefs.missing,
    },
    issues,
  };
}

function getState() {
  const now = Date.now();
  if (!cachedState || dirty || now - lastComputedAt > 1000) {
    cachedState = buildState();
    dirty = false;
    lastComputedAt = now;
  }
  return cachedState;
}

function sendJson(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendText(res, status, data, contentType = 'text/plain') {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(data);
}

function serveStatic(res, filePath, contentType) {
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (err) {
    sendText(res, 404, 'Not found');
  }
}

function handleApiState(req, res) {
  const state = getState();
  sendJson(res, state);
}

function handleEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n');
  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
}

function broadcastUpdate() {
  const payload = JSON.stringify({ updatedAt: Date.now() });
  for (const client of sseClients) {
    client.write(`event: update\ndata: ${payload}\n\n`);
  }
}

function markDirty() {
  dirty = true;
  broadcastUpdate();
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname || '/';

  if (pathname === '/api/state') {
    handleApiState(req, res);
    return;
  }

  if (pathname === '/events') {
    handleEvents(req, res);
    return;
  }

  if (pathname.startsWith('/screenshots/')) {
    const filename = decodeURIComponent(pathname.replace('/screenshots/', ''));
    const filePath = path.join(tasksDir, 'screenshots', filename);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';
    serveStatic(res, filePath, contentType);
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    serveStatic(res, path.join(PUBLIC_DIR, 'index.html'), 'text/html');
    return;
  }

  if (pathname === '/app.js') {
    serveStatic(res, path.join(PUBLIC_DIR, 'app.js'), 'application/javascript');
    return;
  }

  if (pathname === '/styles.css') {
    serveStatic(res, path.join(PUBLIC_DIR, 'styles.css'), 'text/css');
    return;
  }

  sendText(res, 404, 'Not found');
});

function watchTarget(targetPath) {
  try {
    if (!fs.existsSync(targetPath)) return;
    fs.watch(targetPath, { persistent: true }, () => {
      markDirty();
    });
  } catch (err) {
    // ignore watch errors
  }
}

function startWatchers() {
  watchTarget(tasksDir);
  watchTarget(path.join(tasksDir, 'prd.json'));
  watchTarget(path.join(tasksDir, 'activity.log'));
  watchTarget(path.join(tasksDir, 'progress.txt'));
  watchTarget(path.join(tasksDir, 'guardrails.md'));
  watchTarget(path.join(tasksDir, 'screenshots'));
}

server.listen(port, () => {
  console.log(`Ralph dashboard running at http://localhost:${port}`);
  console.log(`Work dir: ${workDir}`);
  console.log(`Tasks dir: ${tasksDir}`);
});

startWatchers();

setInterval(() => {
  for (const client of sseClients) {
    client.write(': keep-alive\n\n');
  }
}, 15000);
