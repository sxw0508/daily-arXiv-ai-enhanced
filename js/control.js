const controlState = {
  initialized: false,
  dirty: false,
  pollingTimer: null,
  lastConfigSignature: '',
};

const fieldIds = {
  paper_sources: 'paperSources',
  arxiv_categories: 'arxivCategories',
  biorxiv_categories: 'biorxivCategories',
  medrxiv_categories: 'medrxivCategories',
  rxiv_lookback_days: 'lookbackDays',
  keywords_text: 'keywordsText',
  keyword_groups_text: 'keywordGroupsText',
  pubmed_query: 'pubmedQuery',
  pubmed_label: 'pubmedLabel',
  pubmed_retmax: 'pubmedRetmax',
  pubmed_date_type: 'pubmedDateType',
  llm_model_name: 'llmModelName',
  llm_language: 'llmLanguage',
  llm_openai_base_url: 'llmBaseUrl',
};

document.addEventListener('DOMContentLoaded', () => {
  bindControlEvents();
  refreshState({ hydrateForm: true });
  controlState.pollingTimer = window.setInterval(() => {
    refreshState({ hydrateForm: false, silent: true });
  }, 2500);
});

function bindControlEvents() {
  const fieldElements = Object.values(fieldIds)
    .map(id => document.getElementById(id))
    .filter(Boolean);

  fieldElements.forEach(element => {
    element.addEventListener('input', () => setDirty(true));
  });

  document.getElementById('saveConfigButton').addEventListener('click', saveConfig);
  document.getElementById('runFullButton').addEventListener('click', () => runAction('full'));
  document.getElementById('runCrawlButton').addEventListener('click', () => runAction('crawl'));
  document.getElementById('stopJobButton').addEventListener('click', stopCurrentJob);
}

async function refreshState(options = {}) {
  const { hydrateForm = false, silent = false } = options;

  try {
    const response = await fetch('/api/control/state', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const config = normalizeConfigPayload(payload.config || {});
    const configSignature = JSON.stringify(config);

    if (hydrateForm || (!controlState.dirty && configSignature !== controlState.lastConfigSignature)) {
      fillForm(config);
      controlState.lastConfigSignature = configSignature;
      if (hydrateForm) {
        setDirty(false);
      }
    }

    renderServerState(true);
    renderJob(payload.job || {});
    renderFiles(payload.files || []);
    renderSummary(config, payload.job || {});
    controlState.initialized = true;
  } catch (error) {
    renderServerState(false, String(error));
    if (!silent) {
      showNotification(`Control API unavailable: ${error}`, 'error');
    }
  }
}

function normalizeConfigPayload(config) {
  return {
    paper_sources: config?.crawler?.paper_sources || '',
    arxiv_categories: config?.crawler?.arxiv_categories || '',
    biorxiv_categories: config?.crawler?.biorxiv_categories || '',
    medrxiv_categories: config?.crawler?.medrxiv_categories || '',
    rxiv_lookback_days: config?.crawler?.rxiv_lookback_days ?? 30,
    keywords_text: config?.crawler?.keywords_text || '',
    keyword_groups_text: config?.crawler?.keyword_groups_text || '',
    pubmed_query: config?.pubmed?.query || '',
    pubmed_label: config?.pubmed?.label || 'PubMed',
    pubmed_retmax: config?.pubmed?.retmax ?? 200,
    pubmed_date_type: config?.pubmed?.date_type || 'edat',
    llm_model_name: config?.llm?.model_name || '',
    llm_language: config?.llm?.language || '',
    llm_openai_base_url: config?.llm?.openai_base_url || '',
    has_api_key: Boolean(config?.llm?.has_api_key),
  };
}

function fillForm(config) {
  document.getElementById('paperSources').value = config.paper_sources;
  document.getElementById('arxivCategories').value = config.arxiv_categories;
  document.getElementById('biorxivCategories').value = config.biorxiv_categories;
  document.getElementById('medrxivCategories').value = config.medrxiv_categories;
  document.getElementById('lookbackDays').value = config.rxiv_lookback_days;
  document.getElementById('keywordsText').value = config.keywords_text;
  document.getElementById('keywordGroupsText').value = config.keyword_groups_text;
  document.getElementById('pubmedQuery').value = config.pubmed_query;
  document.getElementById('pubmedLabel').value = config.pubmed_label;
  document.getElementById('pubmedRetmax').value = config.pubmed_retmax;
  document.getElementById('pubmedDateType').value = config.pubmed_date_type;
  document.getElementById('llmModelName').value = config.llm_model_name;
  document.getElementById('llmLanguage').value = config.llm_language;
  document.getElementById('llmBaseUrl').value = config.llm_openai_base_url;
}

function collectConfigPayload() {
  return {
    paper_sources: document.getElementById('paperSources').value.trim(),
    arxiv_categories: document.getElementById('arxivCategories').value.trim(),
    biorxiv_categories: document.getElementById('biorxivCategories').value.trim(),
    medrxiv_categories: document.getElementById('medrxivCategories').value.trim(),
    rxiv_lookback_days: document.getElementById('lookbackDays').value.trim(),
    keywords_text: document.getElementById('keywordsText').value,
    keyword_groups_text: document.getElementById('keywordGroupsText').value,
    pubmed_query: document.getElementById('pubmedQuery').value,
    pubmed_label: document.getElementById('pubmedLabel').value.trim(),
    pubmed_retmax: document.getElementById('pubmedRetmax').value.trim(),
    pubmed_date_type: document.getElementById('pubmedDateType').value.trim(),
    llm_model_name: document.getElementById('llmModelName').value.trim(),
    llm_language: document.getElementById('llmLanguage').value.trim(),
    llm_openai_base_url: document.getElementById('llmBaseUrl').value.trim(),
  };
}

async function saveConfig() {
  const payload = collectConfigPayload();

  try {
    const response = await fetch('/api/control/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.message || `HTTP ${response.status}`);
    }

    const normalized = normalizeConfigPayload(result.config || {});
    fillForm(normalized);
    controlState.lastConfigSignature = JSON.stringify(normalized);
    setDirty(false);
    renderSummary(normalized, null);
    showNotification('Backend config saved.', 'success');
  } catch (error) {
    showNotification(`Failed to save config: ${error}`, 'error');
  }
}

async function runAction(action) {
  try {
    const response = await fetch('/api/control/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.message || `HTTP ${response.status}`);
    }

    showNotification(result.message || 'Task started.', 'success');
    refreshState({ hydrateForm: false, silent: true });
  } catch (error) {
    showNotification(`Failed to start task: ${error}`, 'error');
  }
}

async function stopCurrentJob() {
  try {
    const response = await fetch('/api/control/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.message || `HTTP ${response.status}`);
    }

    showNotification(result.message || 'Stop signal sent.', 'info');
    refreshState({ hydrateForm: false, silent: true });
  } catch (error) {
    showNotification(`Failed to stop task: ${error}`, 'error');
  }
}

function renderServerState(online, errorMessage = '') {
  const dot = document.getElementById('serverDot');
  const text = document.getElementById('serverStatusText');

  dot.classList.remove('online', 'error');
  if (online) {
    dot.classList.add('online');
    text.textContent = 'Local API connected';
  } else {
    dot.classList.add('error');
    text.textContent = errorMessage ? `Connection failed: ${errorMessage}` : 'Local API unavailable';
  }
}

function renderJob(job) {
  const pill = document.getElementById('jobStatusPill');
  const meta = document.getElementById('jobMetaText');
  const logOutput = document.getElementById('logOutput');

  pill.classList.remove('running', 'success', 'error');

  if (job.running) {
    pill.textContent = 'Running';
    pill.classList.add('running');
    meta.textContent = `${formatAction(job.action)} started at ${formatStamp(job.started_at)}`;
  } else if (job.exit_code === 0) {
    pill.textContent = 'Completed';
    pill.classList.add('success');
    meta.textContent = `${formatAction(job.action)} finished successfully`;
  } else if (typeof job.exit_code === 'number' && job.exit_code !== 0) {
    pill.textContent = 'Failed';
    pill.classList.add('error');
    meta.textContent = `${formatAction(job.action)} exited with code ${job.exit_code}`;
  } else {
    pill.textContent = 'Idle';
    meta.textContent = 'No backend task is running.';
  }

  logOutput.textContent = (job.log_tail && job.log_tail.length > 0)
    ? job.log_tail.join('\n')
    : 'Waiting for backend activity...';
  logOutput.scrollTop = logOutput.scrollHeight;
}

function renderFiles(files) {
  const container = document.getElementById('recentFiles');
  if (!files || files.length === 0) {
    container.innerHTML = '<div class="file-item"><span class="file-name">No output files yet.</span></div>';
    return;
  }

  container.innerHTML = files.map(file => `
    <div class="file-item">
      <div>
        <div class="file-name">${escapeHtml(file.name)}</div>
        <div class="file-meta">${formatBytes(file.size)}</div>
      </div>
      <div class="file-meta">${formatStamp(file.updated_at)}</div>
    </div>
  `).join('');
}

function renderSummary(config, job) {
  document.getElementById('apiKeyStatus').textContent = config.has_api_key ? 'Configured' : 'Missing';

  if (job) {
    document.getElementById('lastExitCode').textContent =
      typeof job.exit_code === 'number' ? String(job.exit_code) : '-';
    document.getElementById('startedAt').textContent = formatStamp(job.started_at);
    document.getElementById('finishedAt').textContent = formatStamp(job.finished_at);
  }
}

function setDirty(isDirty) {
  controlState.dirty = isDirty;
  const indicator = document.getElementById('dirtyState');
  if (isDirty) {
    indicator.textContent = 'Unsaved backend changes';
    indicator.classList.add('is-dirty');
  } else {
    indicator.textContent = 'No pending changes';
    indicator.classList.remove('is-dirty');
  }
}

function formatAction(action) {
  if (action === 'full') return 'Full pipeline';
  if (action === 'crawl') return 'Crawl only';
  return action || 'Task';
}

function formatStamp(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function showNotification(message, type = 'info') {
  const node = document.createElement('div');
  node.className = `control-notification ${type}`;
  node.textContent = message;
  document.body.appendChild(node);

  requestAnimationFrame(() => node.classList.add('visible'));

  window.setTimeout(() => {
    node.classList.remove('visible');
    window.setTimeout(() => node.remove(), 250);
  }, 2800);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
