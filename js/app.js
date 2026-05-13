let currentDate = '';
let availableDates = [];
let currentView = 'grid'; // 'grid' 或 'list'
let currentCategory = 'all';
let urlCategoryParam = null; // 从URL参数中获取的category
let urlJsonParam = null; // 从URL参数中获取的json（API模式）
let urlAuthorParam = null; // 从URL参数中获取的author
let urlKeywordsParam = null; // 从URL参数中获取的keywords
let paperData = {};
let flatpickrInstance = null;
let isRangeMode = false;
let activeKeywords = []; // 存储激活的关键词
let userKeywords = []; // 存储用户的关键词
let activeAuthors = []; // 存储激活的作者
let userAuthors = []; // 存储用户的作者
let currentPaperIndex = 0; // 当前查看的论文索引
let currentFilteredPapers = []; // 当前过滤后的论文列表
let textSearchQuery = ''; // 实时文本搜索查询
let previousActiveKeywords = null; // 文本搜索激活时，暂存之前的关键词激活集合
let previousActiveAuthors = null; // 文本搜索激活时，暂存之前的作者激活集合
let currentRangeStart = '';
let currentRangeEnd = '';
let controlApiAvailable = false;
let controlStateCache = null;
let controlPollTimer = null;
let latestEnhancedOutputSignature = '';
let latestSuccessfulControlRun = '';

// 加载用户的关键词设置
function loadUserKeywords() {
  const savedKeywords = localStorage.getItem('preferredKeywords');
  if (savedKeywords) {
    try {
      userKeywords = JSON.parse(savedKeywords);
      // 默认激活所有关键词
      activeKeywords = [...userKeywords];
    } catch (error) {
      console.error('解析关键词失败:', error);
      userKeywords = [];
      activeKeywords = [];
    }
  } else {
    userKeywords = [];
    activeKeywords = [];
  }
  
  // renderKeywordTags();
  renderFilterTags();
}

// 加载用户的作者设置
function loadUserAuthors() {
  const savedAuthors = localStorage.getItem('preferredAuthors');
  if (savedAuthors) {
    try {
      userAuthors = JSON.parse(savedAuthors);
      // 默认激活所有作者
      activeAuthors = [...userAuthors];
    } catch (error) {
      console.error('解析作者失败:', error);
      userAuthors = [];
      activeAuthors = [];
    }
  } else {
    userAuthors = [];
    activeAuthors = [];
  }
  
  renderFilterTags();
}

// 渲染过滤标签（作者和关键词）
function renderFilterTags() {
  const filterTagsElement = document.getElementById('filterTags');
  const filterContainer = document.querySelector('.filter-label-container');
  
  // 如果没有作者和关键词，仅隐藏标签区域，保留容器（以显示搜索按钮）
  if ((!userAuthors || userAuthors.length === 0) && (!userKeywords || userKeywords.length === 0)) {
    filterContainer.style.display = 'flex';
    if (filterTagsElement) {
      filterTagsElement.style.display = 'none';
      filterTagsElement.innerHTML = '';
    }
    return;
  }
  
  filterContainer.style.display = 'flex';
  if (filterTagsElement) {
    filterTagsElement.style.display = 'flex';
  }
  filterTagsElement.innerHTML = '';
  
  // 先添加作者标签
  if (userAuthors && userAuthors.length > 0) {
    userAuthors.forEach(author => {
      const tagElement = document.createElement('span');
      tagElement.className = `category-button author-button ${activeAuthors.includes(author) ? 'active' : ''}`;
      tagElement.textContent = author;
      tagElement.dataset.author = author;
      tagElement.title = "匹配作者姓名";
      
      tagElement.addEventListener('click', () => {
        toggleAuthorFilter(author);
      });
      
      filterTagsElement.appendChild(tagElement);
      
      // 添加出现动画后移除动画类
      if (!activeAuthors.includes(author)) {
        tagElement.classList.add('tag-appear');
        setTimeout(() => {
          tagElement.classList.remove('tag-appear');
        }, 300);
      }
    });
  }
  
  // 再添加关键词标签
  if (userKeywords && userKeywords.length > 0) {
    userKeywords.forEach(keyword => {
      const tagElement = document.createElement('span');
      tagElement.className = `category-button keyword-button ${activeKeywords.includes(keyword) ? 'active' : ''}`;
      tagElement.textContent = keyword;
      tagElement.dataset.keyword = keyword;
      tagElement.title = "匹配标题和摘要中的关键词";
      
      tagElement.addEventListener('click', () => {
        toggleKeywordFilter(keyword);
      });
      
      filterTagsElement.appendChild(tagElement);
      
      // 添加出现动画后移除动画类
      if (!activeKeywords.includes(keyword)) {
        tagElement.classList.add('tag-appear');
        setTimeout(() => {
          tagElement.classList.remove('tag-appear');
        }, 300);
      }
    });
  }
}

// 切换关键词过滤
function toggleKeywordFilter(keyword) {
  const index = activeKeywords.indexOf(keyword);
  
  if (index === -1) {
    // 激活该关键词
    activeKeywords.push(keyword);
  } else {
    // 取消激活该关键词
    activeKeywords.splice(index, 1);
  }
  
  // 更新关键词标签UI
  const keywordTags = document.querySelectorAll('[data-keyword]');
  keywordTags.forEach(tag => {
    if (tag.dataset.keyword === keyword) {
      // 先移除上一次可能的高亮动画
      tag.classList.remove('tag-highlight');
      
      // 添加/移除激活状态
      tag.classList.toggle('active', activeKeywords.includes(keyword));
      
      // 添加高亮动画
      setTimeout(() => {
        tag.classList.add('tag-highlight');
      }, 10);
      
      // 移除高亮动画
      setTimeout(() => {
        tag.classList.remove('tag-highlight');
      }, 1000);
    }
  });
  
  // 重新渲染论文列表
  renderPapers();
}


// 切换作者过滤
function toggleAuthorFilter(author) {
  const index = activeAuthors.indexOf(author);
  
  if (index === -1) {
    // 激活该作者
    activeAuthors.push(author);
  } else {
    // 取消激活该作者
    activeAuthors.splice(index, 1);
  }
  
  // 更新作者标签UI
  const authorTags = document.querySelectorAll('[data-author]');
  authorTags.forEach(tag => {
    if (tag.dataset.author === author) {
      // 先移除上一次可能的高亮动画
      tag.classList.remove('tag-highlight');
      
      // 添加/移除激活状态
      tag.classList.toggle('active', activeAuthors.includes(author));
      
      // 添加高亮动画
      setTimeout(() => {
        tag.classList.add('tag-highlight');
      }, 10);
      
      // 移除高亮动画
      setTimeout(() => {
        tag.classList.remove('tag-highlight');
      }, 1000);
    }
  });
  
  // 重新渲染论文列表
  renderPapers();
}

// 从URL参数中获取category
function getUrlCategory() {
  const params = new URLSearchParams(window.location.search);
  const category = params.get('category');
  return category ? decodeURIComponent(category) : null;
}

// 从URL参数中获取json（API模式）
function getJsonParam() {
  const params = new URLSearchParams(window.location.search);
  const json = params.get('json');
  return json ? decodeURIComponent(json) : null;
}

// 从URL参数中获取author
function getUrlAuthor() {
  const params = new URLSearchParams(window.location.search);
  const author = params.get('author');
  return author ? decodeURIComponent(author).split(',').map(k => k.trim()).filter(k => k) : null;
}

// 从URL参数中获取keywords
function getUrlKeywords() {
  const params = new URLSearchParams(window.location.search);
  const keywords = params.get('keywords');
  return keywords ? decodeURIComponent(keywords).split(',').map(k => k.trim()).filter(k => k) : null;
}

// 检查是否以JSON模式运行
function isJsonMode() {
  return getJsonParam() !== null;
}

// 输出JSON格式的论文数据
function outputJsonData(papers, category) {
  const jsonData = {
    category: category,
    author: urlAuthorParam || null,
    keywords: urlKeywordsParam || null,
    count: papers.length,
    papers: papers.map(p => ({
      id: p.id,
      source: p.source,
      source_label: p.sourceLabel,
      title: p.title,
      authors: p.authors,
      categories: p.category,
      summary: p.summary,
      date: p.date,
      url: p.url,
      pdf_url: p.pdf_url || null,
      html_url: p.html_url || null,
      reason: p.matchReason
    }))
  };

  // 清空页面内容
  document.body.innerHTML = '';
  document.head.innerHTML = '';

  // 设置JSON内容
  document.body.textContent = JSON.stringify(jsonData, null, 2);
}

function inferSourceLabel(paper) {
  if (paper.source_label) return paper.source_label;
  if (paper.source) {
    if (paper.source === 'arxiv') return 'arXiv';
    if (paper.source === 'biorxiv') return 'bioRxiv';
    if (paper.source === 'medrxiv') return 'medRxiv';
    if (paper.source === 'pubmed') return 'PubMed';
    return paper.source;
  }

  const absUrl = paper.abs || paper.html || paper.pdf || '';
  if (absUrl.includes('arxiv.org')) return 'arXiv';
  if (absUrl.includes('biorxiv.org')) return 'bioRxiv';
  if (absUrl.includes('medrxiv.org')) return 'medRxiv';
  if (absUrl.includes('pubmed.ncbi.nlm.nih.gov')) return 'PubMed';
  return 'Unknown';
}

function getPrimaryPaperUrl(paper) {
  const sourceId = paper.source_id || (paper.id && paper.id.startsWith('arxiv:') ? paper.id.slice(6) : paper.id);
  return paper.abs || paper.html || paper.pdf || `https://arxiv.org/abs/${sourceId}`;
}

function getPaperPdfUrl(paper) {
  if (paper.pdf) return paper.pdf;
  if (paper.abs && paper.abs.includes('arxiv.org/abs/')) {
    return paper.abs.replace('/abs/', '/pdf/');
  }
  return '';
}

function getPaperHtmlUrl(paper) {
  if (paper.html) return paper.html;
  if (paper.abs) return paper.abs;
  return getPrimaryPaperUrl(paper);
}

// 根据category获取论文（复用现有逻辑）
function getPapersByCategory(paperData, category) {
  let papers = [];
  if (category === 'all') {
    const { sortedCategories } = getAllCategories(paperData);
    sortedCategories.forEach(cat => {
      if (paperData[cat]) {
        papers = papers.concat(paperData[cat]);
      }
    });
  } else if (paperData[category]) {
    papers = paperData[category];
  }
  return papers;
}

// 根据keywords匹配论文（复用现有逻辑：关键词之间是"或"关系）
function matchPapersByKeywords(papers, keywords) {
  if (!keywords || keywords.length === 0) return papers.map(p => ({ ...p, isMatched: false, matchReason: null }));

  return papers.map(paper => {
    const matches = keywords.some(keyword => {
      const searchText = `${paper.title} ${paper.summary}`.toLowerCase();
      return searchText.includes(keyword.toLowerCase());
    });

    if (matches) {
      const matchedKeywords = keywords.filter(keyword => {
        const searchText = `${paper.title} ${paper.summary}`.toLowerCase();
        return searchText.includes(keyword.toLowerCase());
      });
      return {
        ...paper,
        isMatched: true,
        matchReason: matchedKeywords.length > 0 ? `关键词: ${matchedKeywords.join(', ')}` : null
      };
    }
    return { ...paper, isMatched: false, matchReason: null };
  });
}

// 根据author匹配论文（复用现有逻辑）
function matchPapersByAuthor(papers, query_authors) {
  if (!query_authors) return papers.map(p => ({ ...p, isMatched: false, matchReason: null }));

  return papers.map(paper => {
    const matches = query_authors.some(author => {
      const searchText = `${paper.authors}`.toLowerCase();
      return searchText.includes(author.toLowerCase());
    });

    if (matches) {
      const matchedAuthors = query_authors.filter(author => {
        const searchText = `${paper.authors}`.toLowerCase();
        return searchText.includes(author.toLowerCase());
      });
      return {
        ...paper,
        isMatched: true,
        matchReason: matchedAuthors.length > 0 ? `作者: ${matchedAuthors.join(', ')}` : null
      };
    }
    return { ...paper, isMatched: false, matchReason: null };
  });
}

// 组合keywords和author匹配（复用现有逻辑：关键词和作者是"或"关系）
function matchPapersByKeywordsOrAuthor(papers, keywords, author) {
  // 先获取关键词匹配结果
  const keywordResults = matchPapersByKeywords(papers, keywords);

  // 再获取作者匹配结果
  const authorResults = matchPapersByAuthor(papers, author);

  // 合并：关键词或作者匹配都算
  return papers.map((paper, index) => {
    const keywordMatch = keywordResults[index];
    const authorMatch = authorResults[index];

    const isMatched = keywordMatch.isMatched || authorMatch.isMatched;
    const matchReasons = [];
    if (keywordMatch.isMatched && keywordMatch.matchReason) {
      matchReasons.push(keywordMatch.matchReason);
    }
    if (authorMatch.isMatched && authorMatch.matchReason) {
      matchReasons.push(authorMatch.matchReason);
    }

    return {
      ...paper,
      isMatched: isMatched,
      matchReason: matchReasons.length > 0 ? matchReasons.join(' | ') : null
    };
  });
}

function updateCrawlDateDisplay(label, caption = 'Crawl batch') {
  const dateElement = document.getElementById('currentDate');
  const captionElement = document.getElementById('currentDateCaption');

  if (dateElement) {
    dateElement.textContent = label;
  }
  if (captionElement) {
    captionElement.textContent = caption;
  }
}

function splitMultilineTerms(value) {
  return String(value || '')
    .split('\n')
    .map(term => term.trim())
    .filter(Boolean);
}

function dedupeTerms(terms) {
  const seen = new Set();
  return terms.filter(term => {
    const key = term.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function quotePubmedTerm(term) {
  return `"${String(term).replaceAll('"', '\\"')}"[Title/Abstract]`;
}

function buildAutoPubmedQuery(coreTerms, supportTerms) {
  const core = dedupeTerms(coreTerms).map(quotePubmedTerm);
  const support = dedupeTerms(supportTerms).map(quotePubmedTerm);

  if (core.length > 0 && support.length > 0) {
    return `((${core.join(' OR ')}) AND (${support.join(' OR ')}))`;
  }
  if (core.length > 0) {
    return `(${core.join(' OR ')})`;
  }
  if (support.length > 0) {
    return `(${support.join(' OR ')})`;
  }
  return '';
}

const SOURCE_OPTIONS = [
  { value: 'pubmed', label: 'PubMed' },
  { value: 'biorxiv', label: 'bioRxiv' },
  { value: 'medrxiv', label: 'medRxiv' },
  { value: 'arxiv', label: 'arXiv' },
];

const DEFAULT_RESEARCH_FOCUS = 'antibody_therapeutics';

const RESEARCH_FOCUS_OPTIONS = [
  { value: 'antibody_therapeutics', label: 'Antibody Therapeutics' },
  { value: 'adc', label: 'ADC' },
  { value: 'bispecific_antibody', label: 'Bispecific Antibody' },
  { value: 'general_target_biology', label: 'General Target Biology' },
];

function normalizeControlConfig(config) {
  return {
    paper_sources: config?.crawler?.paper_sources || '',
    research_focus: config?.crawler?.research_focus || DEFAULT_RESEARCH_FOCUS,
    arxiv_categories: config?.crawler?.arxiv_categories || '',
    biorxiv_categories: config?.crawler?.biorxiv_categories || '',
    medrxiv_categories: config?.crawler?.medrxiv_categories || '',
    rxiv_lookback_days: config?.crawler?.rxiv_lookback_days ?? 30,
    keywords_text: config?.crawler?.keywords_text || '',
    keyword_groups_text: config?.crawler?.keyword_groups_text || '',
    pubmed_query: config?.pubmed?.query || '',
    pubmed_label: config?.pubmed?.label || '',
    pubmed_retmax: config?.pubmed?.retmax ?? 200,
    pubmed_date_type: config?.pubmed?.date_type || 'pdat',
    llm_model_name: config?.llm?.model_name || '',
    llm_language: config?.llm?.language || '',
    llm_openai_base_url: config?.llm?.openai_base_url || '',
  };
}

function updateStatusPill(element, status, label) {
  if (!element) {
    return;
  }

  element.classList.remove('running', 'success', 'error', 'offline');
  if (status) {
    element.classList.add(status);
  }
  element.textContent = label;
}

function formatControlTimestamp(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getJobStateCopy(job) {
  if (!controlApiAvailable) {
    return {
      status: 'offline',
      label: 'Offline',
      detail: '本地控制 API 不可用。请使用 `uv run python local_console.py` 启动本地控制台。',
    };
  }

  if (job?.running) {
    return {
      status: 'running',
      label: 'Running',
      detail: `${job.action === 'full' ? '自动化分析' : '爬虫任务'} 正在运行，开始于 ${formatControlTimestamp(job.started_at) || '刚刚'}。`,
    };
  }

  if (job && typeof job.exit_code === 'number') {
    if (job.exit_code === 0) {
      return {
        status: 'success',
        label: 'Ready',
        detail: `${job.action === 'full' ? '完整分析' : '爬虫任务'} 已完成，结束于 ${formatControlTimestamp(job.finished_at) || '刚刚'}。`,
      };
    }
    return {
      status: 'error',
      label: 'Failed',
      detail: `${job.action === 'full' ? '完整分析' : '爬虫任务'} 失败，退出码 ${job.exit_code}。请先检查控制台日志。`,
    };
  }

  return {
    status: '',
    label: 'Idle',
    detail: '输入靶点和疾病后，点击 `Generate With AI` 生成抓取方案。',
  };
}

function getSelectedTargetSources() {
  return SOURCE_OPTIONS
    .map(option => option.value)
    .filter(value => {
      const checkbox = document.querySelector(`#studioSourceDropdown input[value="${value}"]`);
      return Boolean(checkbox?.checked);
    });
}

function updateSourceSummary() {
  const summary = document.getElementById('studioSourceSummary');
  if (!summary) {
    return;
  }

  const selected = getSelectedTargetSources();
  if (selected.length === 0) {
    summary.textContent = 'Select sources';
    return;
  }

  summary.textContent = SOURCE_OPTIONS
    .filter(option => selected.includes(option.value))
    .map(option => option.label)
    .join(', ');
}

function setSelectedTargetSources(values) {
  const normalized = Array.isArray(values)
    ? values
    : String(values || '').split(',').map(value => value.trim()).filter(Boolean);

  document.querySelectorAll('#studioSourceDropdown input[type="checkbox"]').forEach(checkbox => {
    checkbox.checked = normalized.includes(checkbox.value);
  });

  updateSourceSummary();
}

function setTargetStudioStatus(message) {
  const node = document.getElementById('studioStatusCopy');
  if (node) {
    node.textContent = message;
  }
}

function getSelectedResearchFocus() {
  const value = document.getElementById('studioResearchFocus')?.value || DEFAULT_RESEARCH_FOCUS;
  return RESEARCH_FOCUS_OPTIONS.some(option => option.value === value)
    ? value
    : DEFAULT_RESEARCH_FOCUS;
}

function populateTargetStudio(config) {
  const categoryLabel = document.getElementById('studioCategoryLabel');
  const coreTerms = document.getElementById('studioCoreTerms');
  const supportTerms = document.getElementById('studioSupportTerms');
  const pubmedQuery = document.getElementById('studioPubmedQuery');
  const lookbackDays = document.getElementById('studioLookbackDays');
  const researchFocus = document.getElementById('studioResearchFocus');

  const groups = String(config.keyword_groups_text || '')
    .split('\n')
    .map(group => group.split('|').map(term => term.trim()).filter(Boolean))
    .filter(group => group.length > 0);

  if (categoryLabel && !categoryLabel.value.trim()) {
    categoryLabel.value = config.pubmed_label || '';
  }
  if (!getSelectedTargetSources().length) {
    setSelectedTargetSources(config.paper_sources || 'pubmed');
  }
  if (researchFocus) {
    const nextFocus = config.research_focus || DEFAULT_RESEARCH_FOCUS;
    researchFocus.value = RESEARCH_FOCUS_OPTIONS.some(option => option.value === nextFocus)
      ? nextFocus
      : DEFAULT_RESEARCH_FOCUS;
  }
  if (coreTerms && !coreTerms.value.trim()) {
    coreTerms.value = (groups[0] || []).join('\n');
  }
  if (supportTerms && !supportTerms.value.trim()) {
    supportTerms.value = dedupeTerms(groups.slice(1).flat()).join('\n');
  }
  if (pubmedQuery && !pubmedQuery.value.trim()) {
    pubmedQuery.value = config.pubmed_query || '';
  }
  if (lookbackDays && !lookbackDays.value) {
    lookbackDays.value = String(config.rxiv_lookback_days ?? 30);
  }
}

function collectTargetStudioConfig() {
  const label = document.getElementById('studioCategoryLabel')?.value.trim() || '';
  const paperSources = getSelectedTargetSources();
  const researchFocus = getSelectedResearchFocus();
  const coreTerms = dedupeTerms(splitMultilineTerms(document.getElementById('studioCoreTerms')?.value || ''));
  const supportTerms = dedupeTerms(splitMultilineTerms(document.getElementById('studioSupportTerms')?.value || ''));
  const manualQuery = document.getElementById('studioPubmedQuery')?.value.trim() || '';
  const lookbackRaw = document.getElementById('studioLookbackDays')?.value.trim() || '';
  const lookbackDays = Number.parseInt(lookbackRaw, 10);

  if (!label) {
    throw new Error('请先生成或填写研究类别名。');
  }
  if (!paperSources.length) {
    throw new Error('请至少选择一个论文源。');
  }
  if (!manualQuery || coreTerms.length === 0 || supportTerms.length === 0) {
    throw new Error('请先点击 `Generate With AI`，或者手动补全 Terms 和 PubMed Query。');
  }

  const pubmedQuery = manualQuery || buildAutoPubmedQuery(coreTerms, supportTerms);
  const keywordGroupsText = [coreTerms.join(' | '), supportTerms.join(' | ')].filter(Boolean).join('\n');
  const keywordsText = dedupeTerms([...coreTerms, ...supportTerms]).join('\n');
  const existing = controlStateCache || normalizeControlConfig({});

  return {
    paper_sources: paperSources.join(', '),
    research_focus: researchFocus,
    arxiv_categories: existing.arxiv_categories || '',
    biorxiv_categories: existing.biorxiv_categories || '',
    medrxiv_categories: existing.medrxiv_categories || '',
    rxiv_lookback_days: Number.isFinite(lookbackDays) && lookbackDays > 0
      ? lookbackDays
      : (existing.rxiv_lookback_days || 30),
    keywords_text: keywordsText,
    keyword_groups_text: keywordGroupsText,
    pubmed_query: pubmedQuery,
    pubmed_label: label,
    pubmed_retmax: existing.pubmed_retmax || 200,
    pubmed_date_type: existing.pubmed_date_type || 'pdat',
    llm_model_name: existing.llm_model_name || '',
    llm_language: existing.llm_language || '',
    llm_openai_base_url: existing.llm_openai_base_url || '',
  };
}

function openTargetStudioModal() {
  const modal = document.getElementById('targetStudioModal');
  if (!modal) {
    return;
  }
  toggleSourceDropdown(false);
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeTargetStudioModal() {
  const modal = document.getElementById('targetStudioModal');
  if (!modal) {
    return;
  }
  toggleSourceDropdown(false);
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

function toggleSourceDropdown(forceOpen = null) {
  const trigger = document.getElementById('studioSourceTrigger');
  const dropdown = document.getElementById('studioSourceDropdown');

  if (!trigger || !dropdown) {
    return;
  }

  const shouldOpen = forceOpen === null
    ? !dropdown.classList.contains('open')
    : Boolean(forceOpen);

  dropdown.classList.toggle('open', shouldOpen);
  trigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
}

async function generateTargetPlan() {
  if (!controlApiAvailable) {
    showNotification('本地控制 API 不可用，请先启动 `uv run python local_console.py`。', 'error');
    return;
  }

  const target = document.getElementById('studioTargetInput')?.value.trim() || '';
  const disease = document.getElementById('studioDiseaseInput')?.value.trim() || '';
  const paperSources = getSelectedTargetSources();
  const researchFocus = getSelectedResearchFocus();

  if (!target) {
    showNotification('请先填写 Target。', 'error');
    return;
  }
  if (!paperSources.length) {
    showNotification('请至少选择一个论文源。', 'error');
    return;
  }

  try {
    const response = await fetch('/api/control/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target,
        disease,
        paper_sources: paperSources.join(','),
        research_focus: researchFocus,
      }),
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.message || `HTTP ${response.status}`);
    }

    const plan = result.plan || {};
    document.getElementById('studioCategoryLabel').value = plan.category_label || '';
    document.getElementById('studioCoreTerms').value = Array.isArray(plan.core_terms)
      ? plan.core_terms.join('\n')
      : '';
    document.getElementById('studioSupportTerms').value = Array.isArray(plan.supporting_terms)
      ? plan.supporting_terms.join('\n')
      : '';
    document.getElementById('studioPubmedQuery').value = plan.pubmed_query || '';

    showNotification(plan.strategy_note || 'AI 研究方案已生成。', 'success');
  } catch (error) {
    showNotification(`生成失败：${error.message || error}`, 'error');
  }
}

function initializeTargetStudio() {
  const openButton = document.getElementById('openTargetStudio');
  const closeButton = document.getElementById('closeTargetStudio');
  const modal = document.getElementById('targetStudioModal');
  const saveButton = document.getElementById('saveTargetStudio');
  const crawlButton = document.getElementById('runTargetCrawl');
  const fullButton = document.getElementById('runTargetFull');
  const generateButton = document.getElementById('generateTargetPlan');
  const sourceTrigger = document.getElementById('studioSourceTrigger');

  openButton?.addEventListener('click', () => {
    if (controlStateCache) {
      populateTargetStudio(controlStateCache);
    }
    openTargetStudioModal();
  });
  closeButton?.addEventListener('click', closeTargetStudioModal);
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeTargetStudioModal();
    }
  });
  document.querySelectorAll('#studioSourceDropdown input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', updateSourceSummary);
  });
  sourceTrigger?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleSourceDropdown();
  });
  document.addEventListener('click', (event) => {
    const multiselect = document.getElementById('studioSourceMultiselect');
    if (!multiselect) {
      return;
    }
    if (!multiselect.contains(event.target)) {
      toggleSourceDropdown(false);
    }
  });
  generateButton?.addEventListener('click', generateTargetPlan);
  saveButton?.addEventListener('click', async () => {
    if (!controlApiAvailable) {
      showNotification('本地控制 API 不可用，请先启动 `uv run python local_console.py`。', 'error');
      return;
    }

    try {
      await saveTargetStudio();
    } catch (error) {
      showNotification(`保存失败：${error.message || error}`, 'error');
    }
  });
  crawlButton?.addEventListener('click', () => runTargetStudio('crawl'));
  fullButton?.addEventListener('click', () => runTargetStudio('full'));
}

async function saveTargetStudio(options = {}) {
  const { silent = false } = options;
  const payload = collectTargetStudioConfig();

  const response = await fetch('/api/control/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.message || `HTTP ${response.status}`);
  }

  controlStateCache = normalizeControlConfig(result.config || {});
  populateTargetStudio(controlStateCache);

  if (!silent) {
    showNotification('新的靶点配置已写入后端。', 'success');
  }
  return result;
}

async function runTargetStudio(action) {
  if (!controlApiAvailable) {
    showNotification('本地控制 API 不可用，请先启动 `uv run python local_console.py`。', 'error');
    return;
  }

  try {
    await saveTargetStudio({ silent: true });

    const response = await fetch('/api/control/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.message || `HTTP ${response.status}`);
    }

    closeTargetStudioModal();
    showNotification(
      action === 'full' ? '已启动自动化分析流程。' : '已启动新的爬虫任务。',
      'success',
    );
    refreshControlState({ hydrateStudio: false, silent: true });
  } catch (error) {
    showNotification(`启动失败：${error.message || error}`, 'error');
  }
}

async function maybeRefreshLatestBatch(job, files) {
  const latestEnhanced = (files || []).find(file =>
    /_AI_enhanced_(Chinese|English)\.jsonl$/.test(file.name)
  );

  if (!latestEnhanced) {
    return;
  }

  const latestSignature = `${latestEnhanced.name}:${latestEnhanced.updated_at || ''}`;
  const successSignature = job && !job.running && job.exit_code === 0 && job.action === 'full'
    ? `${job.action}:${job.finished_at || job.started_at || ''}`
    : '';
  const shouldRefreshDates = latestSignature !== latestEnhancedOutputSignature
    || (successSignature && successSignature !== latestSuccessfulControlRun);

  if (!shouldRefreshDates) {
    return;
  }

  latestEnhancedOutputSignature = latestSignature;
  if (successSignature) {
    latestSuccessfulControlRun = successSignature;
  }

  const previousLatestDate = availableDates[0] || '';
  const dates = await fetchAvailableDates();
  const latestDate = dates?.[0] || '';

  if (!latestDate) {
    return;
  }

  const shouldAutoloadLatest = !currentDate
    || currentDate === previousLatestDate
    || !availableDates.includes(currentDate);

  if (shouldAutoloadLatest) {
    loadPapersByDate(latestDate);
  }
}

async function refreshControlState(options = {}) {
  const { hydrateStudio = false, silent = false } = options;

  try {
    const response = await fetch('/api/control/state', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    controlApiAvailable = true;
    controlStateCache = normalizeControlConfig(payload.config || {});

    if (hydrateStudio) {
      populateTargetStudio(controlStateCache);
    }

    const job = payload.job || {};
    const status = getJobStateCopy(job);
    updateStatusPill(document.getElementById('inlineJobStatus'), status.status, status.label);
    setTargetStudioStatus(status.detail);

    await maybeRefreshLatestBatch(job, payload.files || []);
  } catch (error) {
    controlApiAvailable = false;
    const status = getJobStateCopy(null);
    updateStatusPill(document.getElementById('inlineJobStatus'), status.status, status.label);
    setTargetStudioStatus(status.detail);

    if (!silent) {
      showNotification(`本地控制接口不可用：${error.message || error}`, 'error');
    }
  }
}

function showNotification(message, type = 'info') {
  const node = document.createElement('div');
  node.className = `app-notification ${type}`;
  node.textContent = message;
  document.body.appendChild(node);

  requestAnimationFrame(() => node.classList.add('visible'));

  window.setTimeout(() => {
    node.classList.remove('visible');
    window.setTimeout(() => node.remove(), 250);
  }, 2800);
}

document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  initializeTargetStudio();

  // 加载用户关键词
  loadUserKeywords();

  // 加载用户作者
  loadUserAuthors();

  // 解析URL中的category、json、author和keywords参数
  urlCategoryParam = getUrlCategory();
  urlJsonParam = getJsonParam();
  urlAuthorParam = getUrlAuthor();
  urlKeywordsParam = getUrlKeywords();
  if (urlCategoryParam && !isJsonMode()) {
    currentCategory = urlCategoryParam;
  }

  fetchAvailableDates().then(() => {
    if (availableDates.length > 0) {
      loadPapersByDate(availableDates[0]);
    }
  });

  refreshControlState({ hydrateStudio: true, silent: true });
  controlPollTimer = window.setInterval(() => {
    refreshControlState({ hydrateStudio: false, silent: true });
  }, 2500);
});

function initEventListeners() {
  // 日期选择器相关的事件监听
  const calendarButton = document.getElementById('calendarButton');
  calendarButton.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDatePicker();
  });
  
  const datePickerModal = document.querySelector('.date-picker-modal');
  datePickerModal.addEventListener('click', (event) => {
    if (event.target === datePickerModal) {
      toggleDatePicker();
    }
  });
  
  const datePickerContent = document.querySelector('.date-picker-content');
  datePickerContent.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  document.getElementById('dateRangeMode').addEventListener('change', toggleRangeMode);
  
  // 其他原有的事件监听器
  document.getElementById('closeModal').addEventListener('click', closeModal);
  
  document.querySelector('.paper-modal').addEventListener('click', (event) => {
    const modal = document.querySelector('.paper-modal');
    const pdfContainer = modal.querySelector('.pdf-container');
    
    // 如果点击的是模态框背景
    if (event.target === modal) {
      // 检查PDF是否处于放大状态
      if (pdfContainer && pdfContainer.classList.contains('expanded')) {
        // 如果PDF是放大的，先将其恢复正常大小
        const expandButton = modal.querySelector('.pdf-expand-btn');
        if (expandButton) {
          togglePdfSize(expandButton);
        }
        // 阻止事件继续传播，防止关闭整个模态框
        event.stopPropagation();
      } else {
        // 如果PDF不是放大状态，则关闭整个模态框
        closeModal();
      }
    }
  });
  
  // 添加键盘事件监听 - Esc 键关闭模态框，左右箭头键切换论文，R 键显示随机论文
  document.addEventListener('keydown', (event) => {
    // 检查是否有输入框或文本区域处于焦点状态
    const activeElement = document.activeElement;
    const isInputFocused = activeElement && (
      activeElement.tagName === 'INPUT' || 
      activeElement.tagName === 'TEXTAREA' || 
      activeElement.isContentEditable
    );
    
    if (event.key === 'Escape') {
      const paperModal = document.getElementById('paperModal');
      const datePickerModal = document.getElementById('datePickerModal');
      const targetStudioModal = document.getElementById('targetStudioModal');
      
      // 关闭论文模态框
      if (paperModal.classList.contains('active')) {
        closeModal();
      }
      // 关闭日期选择器模态框
      else if (datePickerModal.classList.contains('active')) {
        toggleDatePicker();
      }
      else if (targetStudioModal.classList.contains('active')) {
        closeTargetStudioModal();
      }
    }
    // 左右箭头键导航论文（仅在论文模态框打开时）
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const paperModal = document.getElementById('paperModal');
      if (paperModal.classList.contains('active')) {
        event.preventDefault(); // 防止页面滚动
        
        if (event.key === 'ArrowLeft') {
          navigateToPreviousPaper();
        } else if (event.key === 'ArrowRight') {
          navigateToNextPaper();
        }
      }
    }
    // space 键显示随机论文（在没有输入框焦点且日期选择器未打开时）
    else if (event.key === ' ' || event.key === 'Spacebar') {
      const paperModal = document.getElementById('paperModal');
      const datePickerModal = document.getElementById('datePickerModal');
      
      // 只有在没有输入框焦点且日期选择器没有打开时才触发
      // 现在允许在论文模态框打开时也能使用R键切换到随机论文
      if (!isInputFocused && !datePickerModal.classList.contains('active')) {
        event.preventDefault(); // 防止页面刷新
        event.stopPropagation(); // 阻止事件冒泡
        showRandomPaper();
      }
    }
  });
  
  // 添加鼠标滚轮横向滚动支持
  const categoryScroll = document.querySelector('.category-scroll');
  const keywordScroll = document.querySelector('.keyword-scroll');
  const authorScroll = document.querySelector('.author-scroll');
  
  // 为类别滚动添加鼠标滚轮事件
  if (categoryScroll) {
    categoryScroll.addEventListener('wheel', function(e) {
      if (e.deltaY !== 0) {
        e.preventDefault();
        this.scrollLeft += e.deltaY;
      }
    });
  }
  
  // 为关键词滚动添加鼠标滚轮事件
  if (keywordScroll) {
    keywordScroll.addEventListener('wheel', function(e) {
      if (e.deltaY !== 0) {
        e.preventDefault();
        this.scrollLeft += e.deltaY;
      }
    });
  }
  
  // 为作者滚动添加鼠标滚轮事件
  if (authorScroll) {
    authorScroll.addEventListener('wheel', function(e) {
      if (e.deltaY !== 0) {
        e.preventDefault();
        this.scrollLeft += e.deltaY;
      }
    });
  }

  // 其他事件监听器...
  const categoryButtons = document.querySelectorAll('.category-button');
  categoryButtons.forEach(button => {
    button.addEventListener('click', () => {
      const category = button.dataset.category;
      filterByCategory(category);
    });
  });

  // 回到顶部按钮：滚动显示/隐藏 + 点击回到顶部
  const backToTopButton = document.getElementById('backToTop');
  if (backToTopButton) {
    const updateBackToTopVisibility = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
      if (scrollTop > 300) {
        backToTopButton.classList.add('visible');
      } else {
        backToTopButton.classList.remove('visible');
      }
    };

    // 初始判断一次（防止刷新在中部时不显示）
    updateBackToTopVisibility();
    window.addEventListener('scroll', updateBackToTopVisibility, { passive: true });

    backToTopButton.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // 文本搜索：放大镜切换显示输入框
  const searchToggle = document.getElementById('textSearchToggle');
  const searchWrapper = document.querySelector('#textSearchContainer .search-input-wrapper');
  const searchInput = document.getElementById('textSearchInput');
  const searchClear = document.getElementById('textSearchClear');

  if (searchToggle && searchWrapper && searchInput && searchClear) {
    searchToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      searchWrapper.style.display = 'flex';
      searchInput.focus();
    });

    // 输入时更新查询并重新渲染
    const handleInput = () => {
      const value = searchInput.value.trim();
      textSearchQuery = value;
      // 有非空文本时：通过切换函数真正停用关键词/作者过滤，并记录之前状态
      if (textSearchQuery.length > 0) {
        if (previousActiveKeywords === null) {
          previousActiveKeywords = [...activeKeywords];
        }
        if (previousActiveAuthors === null) {
          previousActiveAuthors = [...activeAuthors];
        }
        // 逐个停用当前激活的关键词/作者
        // 注意：在遍历前复制数组，避免在切换过程中修改原数组导致遍历问题
        const keywordsToDisable = [...activeKeywords];
        const authorsToDisable = [...activeAuthors];
        keywordsToDisable.forEach(k => toggleKeywordFilter(k));
        authorsToDisable.forEach(a => toggleAuthorFilter(a));
      } else {
        // 文本删除为空，恢复之前记录的关键词/作者激活状态
        if (previousActiveKeywords && previousActiveKeywords.length > 0) {
          previousActiveKeywords.forEach(k => {
            // 若当前未激活则切换回激活
            if (!activeKeywords.includes(k)) toggleKeywordFilter(k);
          });
        }
        if (previousActiveAuthors && previousActiveAuthors.length > 0) {
          previousActiveAuthors.forEach(a => {
            if (!activeAuthors.includes(a)) toggleAuthorFilter(a);
          });
        }
        previousActiveKeywords = null;
        previousActiveAuthors = null;
        // 文本为空时自动隐藏输入框
        searchWrapper.style.display = 'none';
      }

      // 控制清除按钮显示
      searchClear.style.display = textSearchQuery.length > 0 ? 'inline-flex' : 'none';

      renderPapers();
    };

    searchInput.addEventListener('input', handleInput);

    // 清除按钮：清空文本，恢复其他过滤
    searchClear.addEventListener('click', (e) => {
      e.stopPropagation();
      searchInput.value = '';
      textSearchQuery = '';
      searchClear.style.display = 'none';
      // 恢复之前的过滤状态（如有）
      if (previousActiveKeywords && previousActiveKeywords.length > 0) {
        previousActiveKeywords.forEach(k => {
          if (!activeKeywords.includes(k)) toggleKeywordFilter(k);
        });
      }
      if (previousActiveAuthors && previousActiveAuthors.length > 0) {
        previousActiveAuthors.forEach(a => {
          if (!activeAuthors.includes(a)) toggleAuthorFilter(a);
        });
      }
      previousActiveKeywords = null;
      previousActiveAuthors = null;
      renderPapers();
      // 清空后隐藏输入框
      searchWrapper.style.display = 'none';
    });

    // 失焦时：若文本为空则隐藏输入框（保持有文本时不隐藏）
    searchInput.addEventListener('blur', () => {
      const value = searchInput.value.trim();
      if (value.length === 0) {
        searchWrapper.style.display = 'none';
      }
    });

    // 点击其他地方不隐藏输入框（需求4），因此不添加blur隐藏逻辑
  }
}

// Function to detect preferred language based on browser settings
function getPreferredLanguage() {
  const browserLang = navigator.language || navigator.userLanguage;
  // Check if browser is set to Chinese variants
  if (browserLang.startsWith('zh')) {
    return 'Chinese';
  }
  // Default to Chinese for all other languages
  return 'Chinese';
}

// Function to select the best available language for a date
function selectLanguageForDate(date, preferredLanguage = null) {
  const availableLanguages = window.dateLanguageMap?.get(date) || [];
  
  if (availableLanguages.length === 0) {
    return 'Chinese'; // fallback
  }
  
  // Use provided preference or detect from browser
  const preferred = preferredLanguage || getPreferredLanguage();
  
  // If preferred language is available, use it
  if (availableLanguages.includes(preferred)) {
    return preferred;
  }
  
  // Fallback: prefer Chinese if available, otherwise use the first available
  return availableLanguages.includes('Chinese') ? 'Chinese' : availableLanguages[0];
}

async function fetchAvailableDates() {
  try {
    // 从 data 分支获取文件列表
    const fileListUrl = DATA_CONFIG.getDataUrl('assets/file-list.txt');
    const response = await fetch(fileListUrl, { cache: 'no-store' });
    if (!response.ok) {
      console.error('Error fetching file list:', response.status);
      return [];
    }
    const text = await response.text();
    const files = text.trim().split('\n');

    const dateRegex = /(\d{4}-\d{2}-\d{2})_AI_enhanced_(English|Chinese)\.jsonl/;
    const dateLanguageMap = new Map(); // Store date -> available languages
    const dates = [];
    
    files.forEach(file => {
      const match = file.match(dateRegex);
      if (match && match[1] && match[2]) {
        const date = match[1];
        const language = match[2];
        
        if (!dateLanguageMap.has(date)) {
          dateLanguageMap.set(date, []);
          dates.push(date);
        }
        dateLanguageMap.get(date).push(language);
      }
    });
    
    // Store the language mapping globally for later use
    window.dateLanguageMap = dateLanguageMap;
    availableDates = [...new Set(dates)];
    availableDates.sort((a, b) => new Date(b) - new Date(a));

    initDatePicker(); // Assuming this function uses availableDates

    return availableDates;
  } catch (error) {
    console.error('获取可用日期失败:', error);
  }
}

function initDatePicker() {
  const datepickerInput = document.getElementById('datepicker');
  
  if (flatpickrInstance) {
    flatpickrInstance.destroy();
  }
  
  // 创建可用日期的映射，用于禁用无效日期
  const enabledDatesMap = {};
  availableDates.forEach(date => {
    enabledDatesMap[date] = true;
  });
  
  // 配置 Flatpickr
  flatpickrInstance = flatpickr(datepickerInput, {
    inline: true,
    dateFormat: "Y-m-d",
    defaultDate: availableDates[0],
    enable: [
      function(date) {
        // 只启用有效日期
        const dateStr = date.getFullYear() + "-" +
                        String(date.getMonth() + 1).padStart(2, '0') + "-" +
                        String(date.getDate()).padStart(2, '0');
        return Boolean(enabledDatesMap[dateStr]);
      }
    ],
    onChange: function(selectedDates, dateStr) {
      if (isRangeMode && selectedDates.length === 2) {
        // 处理日期范围选择
        const startDate = formatDateForAPI(selectedDates[0]);
        const endDate = formatDateForAPI(selectedDates[1]);
        loadPapersByDateRange(startDate, endDate);
        toggleDatePicker();
      } else if (!isRangeMode && selectedDates.length === 1) {
        // 处理单个日期选择
        const selectedDate = formatDateForAPI(selectedDates[0]);
        // if (availableDates.includes(selectedDate)) {
          loadPapersByDate(selectedDate);
          toggleDatePicker();
        // }
      }
    }
  });
  
  // 隐藏日期输入框
  const inputElement = document.querySelector('.flatpickr-input');
  if (inputElement) {
    inputElement.style.display = 'none';
  }
}

function formatDateForAPI(date) {
  return date.getFullYear() + "-" + 
         String(date.getMonth() + 1).padStart(2, '0') + "-" + 
         String(date.getDate()).padStart(2, '0');
}

function toggleRangeMode() {
  isRangeMode = document.getElementById('dateRangeMode').checked;
  
  if (flatpickrInstance) {
    flatpickrInstance.set('mode', isRangeMode ? 'range' : 'single');
    if (isRangeMode && currentRangeStart && currentRangeEnd) {
      flatpickrInstance.setDate([currentRangeStart, currentRangeEnd], false);
    } else if (!isRangeMode && currentDate && availableDates.includes(currentDate)) {
      flatpickrInstance.setDate(currentDate, false);
    }
  }
}

async function loadPapersByDate(date) {
  currentDate = date;
  currentRangeStart = '';
  currentRangeEnd = '';
  updateCrawlDateDisplay(formatDate(date), 'Crawl batch');
  
  // 更新日期选择器中的选中日期
  if (flatpickrInstance) {
    flatpickrInstance.setDate(date, false);
  }
  
  // 不再重置激活的关键词和作者
  // 而是保持当前选择状态
  
  const container = document.getElementById('paperContainer');
  container.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <p>Loading paper...</p>
    </div>
  `;
  
  try {
    const selectedLanguage = selectLanguageForDate(date);
    // 从 data 分支获取数据文件
    const dataUrl = DATA_CONFIG.getDataUrl(`data/${date}_AI_enhanced_${selectedLanguage}.jsonl`);
    const response = await fetch(dataUrl, { cache: 'no-store' });
    // 如果文件不存在（例如返回 404），在论文展示区域提示没有论文
    if (!response.ok) {
      if (response.status === 404) {
        container.innerHTML = `
          <div class="loading-container">
            <p>No papers found for this date.</p>
          </div>
        `;
        paperData = {};
        renderCategoryFilter({ sortedCategories: [], categoryCounts: {} });
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();
    // 空文件也提示没有论文
    if (!text || text.trim() === '') {
      container.innerHTML = `
        <div class="loading-container">
          <p>No papers found for this date.</p>
        </div>
      `;
      paperData = {};
      renderCategoryFilter({ sortedCategories: [], categoryCounts: {} });
      return;
    }
    
    paperData = parseJsonlData(text, date);

    const categories = getAllCategories(paperData);

    renderCategoryFilter(categories);

    // 如果URL中有category、json、author或keywords参数，直接返回JSON
    const hasJsonParams = urlJsonParam !== null;
    if (hasJsonParams) {
      // 获取基础论文列表（按category或all）
      const targetCategory = urlJsonParam || urlCategoryParam || 'all';
      let papers = getPapersByCategory(paperData, targetCategory);

      // 应用keywords和author匹配（"或"关系）
      if (urlKeywordsParam || urlAuthorParam) {
        papers = matchPapersByKeywordsOrAuthor(papers, urlKeywordsParam, urlAuthorParam);
      }

      // JSON模式：只返回匹配的论文
      papers = papers.filter(p => p.isMatched);

      outputJsonData(papers, targetCategory);
      return;
    }

    renderPapers();
  } catch (error) {
    console.error('加载论文数据失败:', error);
    container.innerHTML = `
      <div class="loading-container">
        <p>Loading data fails. Please retry.</p>
        <p>Error messages: ${error.message}</p>
      </div>
    `;
  }
}

function parseJsonlData(jsonlText, date) {
  const result = {};
  
  const lines = jsonlText.trim().split('\n');
  
  lines.forEach(line => {
    try {
      const paper = JSON.parse(line);
      
      if (!paper.categories) {
        paper.categories = [inferSourceLabel(paper)];
      }
      
      let allCategories = Array.isArray(paper.categories) ? paper.categories : [paper.categories];
      allCategories = allCategories.filter(category => !!category);
      if (allCategories.length === 0) {
        allCategories = [inferSourceLabel(paper)];
      }
      
      const primaryCategory = allCategories[0];
      
      if (!result[primaryCategory]) {
        result[primaryCategory] = [];
      }
      
      const summary = paper.AI && paper.AI.tldr ? paper.AI.tldr : paper.summary;
      const sourceLabel = inferSourceLabel(paper);
      
      result[primaryCategory].push({
        title: paper.title,
        url: getPrimaryPaperUrl(paper),
        pdf_url: getPaperPdfUrl(paper),
        html_url: getPaperHtmlUrl(paper),
        authors: Array.isArray(paper.authors) ? paper.authors.join(', ') : paper.authors,
        category: allCategories,
        allCategories: allCategories,
        summary: summary,
        details: paper.summary || '',
        date: paper.posted_date || paper.published || date,
        id: paper.id,
        source: paper.source || '',
        sourceLabel: sourceLabel,
        motivation: paper.AI && paper.AI.motivation ? paper.AI.motivation : '',
        method: paper.AI && paper.AI.method ? paper.AI.method : '',
        result: paper.AI && paper.AI.result ? paper.AI.result : '',
        conclusion: paper.AI && paper.AI.conclusion ? paper.AI.conclusion : '',
        code_url: paper.code_url || '',
        code_stars: paper.code_stars || 0,
        code_last_update: paper.code_last_update || ''
      });
    } catch (error) {
      console.error('解析JSON行失败:', error, line);
    }
  });
  
  return result;
}

// 获取所有类别并按偏好排序
function getAllCategories(data) {
  const categories = Object.keys(data);
  const catePaperCount = {};
  
  categories.forEach(category => {
    catePaperCount[category] = data[category] ? data[category].length : 0;
  });
  
  return {
    sortedCategories: categories.sort((a, b) => {
      return a.localeCompare(b);
    }),
    categoryCounts: catePaperCount
  };
}

function renderCategoryFilter(categories) {
  const container = document.querySelector('.category-scroll');
  const { sortedCategories, categoryCounts } = categories;
  
  let totalPapers = 0;
  Object.values(categoryCounts).forEach(count => {
    totalPapers += count;
  });
  
  container.innerHTML = `
    <button class="category-button ${currentCategory === 'all' ? 'active' : ''}" data-category="all">All<span class="category-count">${totalPapers}</span></button>
  `;
  
  sortedCategories.forEach(category => {
    const count = categoryCounts[category];
    const button = document.createElement('button');
    button.className = `category-button ${category === currentCategory ? 'active' : ''}`;
    button.innerHTML = `${category}<span class="category-count">${count}</span>`;
    button.dataset.category = category;
    button.addEventListener('click', () => {
      filterByCategory(category);
    });
    
    container.appendChild(button);
  });
  
  document.querySelector('.category-button[data-category="all"]').addEventListener('click', () => {
    filterByCategory('all');
  });
}

function filterByCategory(category) {
  currentCategory = category;

  // 如果不是JSON模式，才更新URL参数
  if (!isJsonMode()) {
    const url = new URL(window.location);
    if (category === 'all') {
      url.searchParams.delete('category');
    } else {
      url.searchParams.set('category', category);
    }
    // 使用replaceState更新URL，不刷新页面
    window.history.replaceState({}, '', url);
  }

  document.querySelectorAll('.category-button').forEach(button => {
    button.classList.toggle('active', button.dataset.category === category);
  });

  // 保持当前激活的过滤标签
  renderFilterTags();

  // 重置页面滚动条到顶部
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
  
  renderPapers();
}

// 帮助函数：高亮文本中的匹配内容
function highlightMatches(text, terms, className = 'highlight-match') {
  if (!terms || terms.length === 0 || !text) {
    return text;
  }
  
  let result = text;
  
  // 按照长度排序关键词，从长到短，避免短词先替换导致长词匹配失败
  const sortedTerms = [...terms].sort((a, b) => b.length - a.length);
  
  // 为每个词创建一个正则表达式，使用 'gi' 标志进行全局、不区分大小写的匹配
  sortedTerms.forEach(term => {
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    result = result.replace(regex, `<span class="${className}">$1</span>`);
  });
  
  return result;
}

// 帮助函数：格式化作者列表（用于论文卡片显示）
// 规则：≤4个作者全部显示，>4个作者显示前2+后2，中间用省略号
function formatAuthorsForCard(authorsString, authorTerms = []) {
  if (!authorsString) {
    return '';
  }
  
  // 将作者字符串解析为数组（处理逗号分隔的情况）
  const authorsArray = authorsString.split(',').map(author => author.trim()).filter(author => author.length > 0);
  
  if (authorsArray.length === 0) {
    return '';
  }
  
  // 如果不超过4个作者，全部显示
  if (authorsArray.length <= 4) {
    return authorsArray.map(author => {
      // 对每个作者应用高亮
      const highlightedAuthor = authorTerms.length > 0 
        ? highlightMatches(author, authorTerms, 'author-highlight')
        : author;
      return `<span class="author-item">${highlightedAuthor}</span>`;
    }).join(', ');
  }
  
  // 超过4个作者：显示前2个、省略号、后2个
  const firstTwo = authorsArray.slice(0, 2);
  const lastTwo = authorsArray.slice(-2);
  
  const result = [];
  
  // 前2个作者
  firstTwo.forEach(author => {
    const highlightedAuthor = authorTerms.length > 0 
      ? highlightMatches(author, authorTerms, 'author-highlight')
      : author;
    result.push(`<span class="author-item">${highlightedAuthor}</span>`);
  });
  
  // 省略号
  result.push('<span class="author-ellipsis">...</span>');
  
  // 后2个作者
  lastTwo.forEach(author => {
    const highlightedAuthor = authorTerms.length > 0 
      ? highlightMatches(author, authorTerms, 'author-highlight')
      : author;
    result.push(`<span class="author-item">${highlightedAuthor}</span>`);
  });
  
  return result.join(', ');
}

function renderPapers() {
  const container = document.getElementById('paperContainer');
  container.innerHTML = '';
  container.className = `paper-container ${currentView === 'list' ? 'list-view' : ''}`;
  
  let papers = [];
  if (currentCategory === 'all') {
    const { sortedCategories } = getAllCategories(paperData);
    sortedCategories.forEach(category => {
      if (paperData[category]) {
        papers = papers.concat(paperData[category]);
      }
    });
  } else if (paperData[currentCategory]) {
    papers = paperData[currentCategory];
  }
  
  // 创建匹配论文的集合
  let filteredPapers = [...papers];

  // 重置所有论文的匹配状态，避免上次渲染的残留
  filteredPapers.forEach(p => {
    p.isMatched = false;
    p.matchReason = undefined;
  });

  // 文本搜索优先：当存在非空文本时，像关键词/作者一样只排序不隐藏
  if (textSearchQuery && textSearchQuery.trim().length > 0) {
    const q = textSearchQuery.toLowerCase();

    // 排序：匹配的排前
    filteredPapers.sort((a, b) => {
      const hayA = [
        a.title,
        a.authors,
        Array.isArray(a.category) ? a.category.join(', ') : a.category,
        a.summary,
        a.details || '',
        a.motivation || '',
        a.method || '',
        a.result || '',
        a.conclusion || ''
      ].join(' ').toLowerCase();
      const hayB = [
        b.title,
        b.authors,
        Array.isArray(b.category) ? b.category.join(', ') : b.category,
        b.summary,
        b.details || '',
        b.motivation || '',
        b.method || '',
        b.result || '',
        b.conclusion || ''
      ].join(' ').toLowerCase();
      const am = hayA.includes(q);
      const bm = hayB.includes(q);
      if (am && !bm) return -1;
      if (!am && bm) return 1;
      return 0;
    });

    // 标记匹配项，用于卡片样式与提示
    filteredPapers.forEach(p => {
      const hay = [
        p.title,
        p.authors,
        Array.isArray(p.category) ? p.category.join(', ') : p.category,
        p.summary,
        p.details || '',
        p.motivation || '',
        p.method || '',
        p.result || '',
        p.conclusion || ''
      ].join(' ').toLowerCase();
      const matched = hay.includes(q);
      p.isMatched = matched;
      p.matchReason = matched ? [`文本: ${textSearchQuery}`] : undefined;
    });
  } else {
    // 关键词和作者匹配，但不过滤，只排序
    if (activeKeywords.length > 0 || activeAuthors.length > 0) {
      // 对论文进行排序，将匹配的论文放在前面
      filteredPapers.sort((a, b) => {
        const aMatchesKeyword = activeKeywords.length > 0 ? 
          activeKeywords.some(keyword => {
            // 仅在标题和摘要中搜索关键词
            const searchText = `${a.title} ${a.summary}`.toLowerCase();
            return searchText.includes(keyword.toLowerCase());
          }) : false;
          
        const aMatchesAuthor = activeAuthors.length > 0 ?
          activeAuthors.some(author => {
            // 仅在作者中搜索作者名
            return a.authors.toLowerCase().includes(author.toLowerCase());
          }) : false;
          
        const bMatchesKeyword = activeKeywords.length > 0 ?
          activeKeywords.some(keyword => {
            // 仅在标题和摘要中搜索关键词
            const searchText = `${b.title} ${b.summary}`.toLowerCase();
            return searchText.includes(keyword.toLowerCase());
          }) : false;
          
        const bMatchesAuthor = activeAuthors.length > 0 ?
          activeAuthors.some(author => {
            // 仅在作者中搜索作者名
            return b.authors.toLowerCase().includes(author.toLowerCase());
          }) : false;
      
        // a和b的匹配状态（关键词或作者匹配都算）
        const aMatches = aMatchesKeyword || aMatchesAuthor;
        const bMatches = bMatchesKeyword || bMatchesAuthor;
        
        if (aMatches && !bMatches) return -1;
        if (!aMatches && bMatches) return 1;
        return 0;
      });
      
      // 标记匹配的论文
      filteredPapers.forEach(paper => {
        const matchesKeyword = activeKeywords.length > 0 ?
          activeKeywords.some(keyword => {
            const searchText = `${paper.title} ${paper.summary}`.toLowerCase();
            return searchText.includes(keyword.toLowerCase());
          }) : false;
          
        const matchesAuthor = activeAuthors.length > 0 ?
          activeAuthors.some(author => {
            return paper.authors.toLowerCase().includes(author.toLowerCase());
          }) : false;
          
        // 添加匹配标记（用于后续高亮整个论文卡片）
        paper.isMatched = matchesKeyword || matchesAuthor;
        
        // 添加匹配原因（用于显示匹配提示）
        if (paper.isMatched) {
          paper.matchReason = [];
          if (matchesKeyword) {
            const matchedKeywords = activeKeywords.filter(keyword => 
              `${paper.title} ${paper.summary}`.toLowerCase().includes(keyword.toLowerCase())
            );
            if (matchedKeywords.length > 0) {
              paper.matchReason.push(`关键词: ${matchedKeywords.join(', ')}`);
            }
          }
          if (matchesAuthor) {
            const matchedAuthors = activeAuthors.filter(author => 
              paper.authors.toLowerCase().includes(author.toLowerCase())
            );
            if (matchedAuthors.length > 0) {
              paper.matchReason.push(`作者: ${matchedAuthors.join(', ')}`);
            }
          }
        }
      });
    }
  }
  
  // 关键词和作者匹配，但不过滤，只排序
  if (activeKeywords.length > 0 || activeAuthors.length > 0) {
    // 对论文进行排序，将匹配的论文放在前面
    filteredPapers.sort((a, b) => {
      const aMatchesKeyword = activeKeywords.length > 0 ? 
        activeKeywords.some(keyword => {
          // 仅在标题和摘要中搜索关键词
          const searchText = `${a.title} ${a.summary}`.toLowerCase();
          return searchText.includes(keyword.toLowerCase());
        }) : false;
        
      const aMatchesAuthor = activeAuthors.length > 0 ?
        activeAuthors.some(author => {
          // 仅在作者中搜索作者名
          return a.authors.toLowerCase().includes(author.toLowerCase());
        }) : false;
        
      const bMatchesKeyword = activeKeywords.length > 0 ?
        activeKeywords.some(keyword => {
          // 仅在标题和摘要中搜索关键词
          const searchText = `${b.title} ${b.summary}`.toLowerCase();
          return searchText.includes(keyword.toLowerCase());
        }) : false;
        
      const bMatchesAuthor = activeAuthors.length > 0 ?
        activeAuthors.some(author => {
          // 仅在作者中搜索作者名
          return b.authors.toLowerCase().includes(author.toLowerCase());
        }) : false;
      
      // a和b的匹配状态（关键词或作者匹配都算）
      const aMatches = aMatchesKeyword || aMatchesAuthor;
      const bMatches = bMatchesKeyword || bMatchesAuthor;
      
      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;
      return 0;
    });
    
    // 标记匹配的论文
    filteredPapers.forEach(paper => {
      const matchesKeyword = activeKeywords.length > 0 ?
        activeKeywords.some(keyword => {
          const searchText = `${paper.title} ${paper.summary}`.toLowerCase();
          return searchText.includes(keyword.toLowerCase());
        }) : false;
        
      const matchesAuthor = activeAuthors.length > 0 ?
        activeAuthors.some(author => {
          return paper.authors.toLowerCase().includes(author.toLowerCase());
        }) : false;
        
      // 添加匹配标记（用于后续高亮整个论文卡片）
      paper.isMatched = matchesKeyword || matchesAuthor;
      
      // 添加匹配原因（用于显示匹配提示）
      if (paper.isMatched) {
        paper.matchReason = [];
        if (matchesKeyword) {
          const matchedKeywords = activeKeywords.filter(keyword => 
            `${paper.title} ${paper.summary}`.toLowerCase().includes(keyword.toLowerCase())
          );
          if (matchedKeywords.length > 0) {
            paper.matchReason.push(`关键词: ${matchedKeywords.join(', ')}`);
          }
        }
        if (matchesAuthor) {
          const matchedAuthors = activeAuthors.filter(author => 
            paper.authors.toLowerCase().includes(author.toLowerCase())
          );
          if (matchedAuthors.length > 0) {
            paper.matchReason.push(`作者: ${matchedAuthors.join(', ')}`);
          }
        }
      }
    });
  }
  
  // 存储当前过滤后的论文列表，用于箭头键导航
  currentFilteredPapers = [...filteredPapers];
  
  if (filteredPapers.length === 0) {
    container.innerHTML = `
      <div class="loading-container">
        <p>No paper found.</p>
      </div>
    `;
    return;
  }
  
  filteredPapers.forEach((paper, index) => {
    const paperCard = document.createElement('div');
    // 添加匹配高亮类
    paperCard.className = `paper-card ${paper.isMatched ? 'matched-paper' : ''}`;
    paperCard.dataset.id = paper.id || paper.url;
    
    if (paper.isMatched) {
      // 添加匹配原因提示
      const matchReasons = Array.isArray(paper.matchReason) ? paper.matchReason : [paper.matchReason];
      paperCard.title = `匹配: ${matchReasons.filter(Boolean).join(' | ')}`;
    }
    
    const categoryTags = paper.allCategories ? 
      paper.allCategories.map(cat => `<span class="category-tag">${cat}</span>`).join('') : 
      `<span class="category-tag">${paper.category}</span>`;
    const sourceTag = `<span class="category-tag">${paper.sourceLabel || 'Unknown'}</span>`;
    
    // 组合需要高亮的词：关键词 + 文本搜索
    const titleSummaryTerms = [];
    if (activeKeywords.length > 0) {
      titleSummaryTerms.push(...activeKeywords);
    }
    if (textSearchQuery && textSearchQuery.trim().length > 0) {
      titleSummaryTerms.push(textSearchQuery.trim());
    }

    // 高亮标题和摘要（关键词与文本搜索）
    const highlightedTitle = titleSummaryTerms.length > 0 
      ? highlightMatches(paper.title, titleSummaryTerms, 'keyword-highlight') 
      : paper.title;
    const highlightedSummary = titleSummaryTerms.length > 0 
      ? highlightMatches(paper.summary, titleSummaryTerms, 'keyword-highlight') 
      : paper.summary;

    // 高亮作者（作者过滤 + 文本搜索）
    const authorTerms = [];
    if (activeAuthors.length > 0) authorTerms.push(...activeAuthors);
    if (textSearchQuery && textSearchQuery.trim().length > 0) authorTerms.push(textSearchQuery.trim());
    
    // 格式化作者列表（应用截断规则和高亮）
    const formattedAuthors = formatAuthorsForCard(paper.authors, authorTerms);
    
    // 构建 GitHub 按钮 HTML
    // let githubHtml = '';
    // if (paper.code_url) {
    //   const stars = paper.code_stars ? `<span class="github-stars">★ ${paper.code_stars}</span>` : '';
    //   const isHot = paper.code_stars > 100;
      
    //   githubHtml = `
    //     <a href="${paper.code_url}" target="_blank" class="github-link" title="View Code" onclick="event.stopPropagation()">
    //       <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" style="vertical-align: text-bottom; margin-right: 4px;">
    //         <path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
    //       </svg>
    //       Code ${stars}
    //       ${isHot ? '<span class="hot-icon">🔥</span>' : ''}
    //     </a>
    //   `;
    // }

    paperCard.innerHTML = `
      <div class="paper-card-index">${index + 1}</div>
      ${paper.isMatched ? '<div class="match-badge" title="匹配您的搜索条件"></div>' : ''}
      <div class="paper-card-header">
        <h3 class="paper-card-title">${highlightedTitle}</h3>
        <p class="paper-card-authors">${formattedAuthors}</p>
        <div class="paper-card-categories">
          ${sourceTag}${categoryTags}
        </div>
      </div>
      <div class="paper-card-body">
        <p class="paper-card-summary">${highlightedSummary}</p>
        <div class="paper-card-footer">
          <div class="footer-left">
            <span class="paper-card-date">${paper.sourceLabel || 'Unknown'}</span>
            <span class="paper-card-date">${formatDate(paper.date)}</span>
          </div>
          <span class="paper-card-link">Details</span>
        </div>
      </div>
    `;
    
    paperCard.addEventListener('click', () => {
      currentPaperIndex = index; // 记录当前点击的论文索引
      showPaperDetails(paper, index + 1);
    });
    
    container.appendChild(paperCard);
  });
}

function showPaperDetails(paper, paperIndex) {
  const modal = document.getElementById('paperModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const paperLink = document.getElementById('paperLink');
  const pdfLink = document.getElementById('pdfLink');
  const htmlLink = document.getElementById('htmlLink');
  const pdfUrl = paper.pdf_url || '';
  const htmlUrl = paper.html_url || paper.url;
  const pdfPreviewSection = pdfUrl ? `
      <div class="pdf-preview-section">
        <div class="pdf-header">
          <h3>PDF Preview</h3>
          <button class="pdf-expand-btn" onclick="togglePdfSize(this)">
            <svg class="expand-icon" viewBox="0 0 24 24" width="24" height="24">
              <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
            </svg>
            <svg class="collapse-icon" viewBox="0 0 24 24" width="24" height="24" style="display: none;">
              <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
            </svg>
          </button>
        </div>
        <div class="pdf-container">
          <iframe src="${pdfUrl}" width="100%" height="800px" frameborder="0"></iframe>
        </div>
      </div>
    ` : '';
  
  // 重置模态框的滚动位置
  modalBody.scrollTop = 0;
  
  // 组合高亮词：关键词 + 文本搜索
  const modalTitleTerms = [];
  if (activeKeywords.length > 0) modalTitleTerms.push(...activeKeywords);
  if (textSearchQuery && textSearchQuery.trim().length > 0) modalTitleTerms.push(textSearchQuery.trim());
  // 高亮标题
  const highlightedTitle = modalTitleTerms.length > 0 
    ? highlightMatches(paper.title, modalTitleTerms, 'keyword-highlight') 
    : paper.title;
  
  // 在标题前添加索引号
  modalTitle.innerHTML = paperIndex ? `<span class="paper-index-badge">${paperIndex}</span> ${highlightedTitle}` : highlightedTitle;
  
  const abstractText = paper.details || '';
  
  const categoryDisplay = paper.allCategories ? 
    paper.allCategories.join(', ') : 
    paper.category;
  
  // 高亮作者（作者过滤 + 文本搜索）
  const modalAuthorTerms = [];
  if (activeAuthors.length > 0) modalAuthorTerms.push(...activeAuthors);
  if (textSearchQuery && textSearchQuery.trim().length > 0) modalAuthorTerms.push(textSearchQuery.trim());
  const highlightedAuthors = modalAuthorTerms.length > 0 
    ? highlightMatches(paper.authors, modalAuthorTerms, 'author-highlight') 
    : paper.authors;
  
  // 高亮摘要（关键词 + 文本搜索）
  const highlightedSummary = modalTitleTerms.length > 0 
    ? highlightMatches(paper.summary, modalTitleTerms, 'keyword-highlight') 
    : paper.summary;
  
  // 高亮详情（Abstract/details）
  const highlightedAbstract = modalTitleTerms.length > 0 
    ? highlightMatches(abstractText, modalTitleTerms, 'keyword-highlight') 
    : abstractText;
  
  // 高亮其他部分（如果存在且是摘要的一部分）
  const highlightedMotivation = paper.motivation && modalTitleTerms.length > 0 
    ? highlightMatches(paper.motivation, modalTitleTerms, 'keyword-highlight') 
    : paper.motivation;
  
  const highlightedMethod = paper.method && modalTitleTerms.length > 0 
    ? highlightMatches(paper.method, modalTitleTerms, 'keyword-highlight') 
    : paper.method;
  
  const highlightedResult = paper.result && modalTitleTerms.length > 0 
    ? highlightMatches(paper.result, modalTitleTerms, 'keyword-highlight') 
    : paper.result;
  
  const highlightedConclusion = paper.conclusion && modalTitleTerms.length > 0 
    ? highlightMatches(paper.conclusion, modalTitleTerms, 'keyword-highlight') 
    : paper.conclusion;
  
  // 判断是否需要显示高亮说明
  const showHighlightLegend = activeKeywords.length > 0 || activeAuthors.length > 0;
  
  // 添加匹配标记
  const matchedPaperClass = paper.isMatched ? 'matched-paper-details' : '';
  
  const modalContent = `
    <div class="paper-details ${matchedPaperClass}">
      <p><strong>Authors: </strong>${highlightedAuthors}</p>
      <p><strong>Source: </strong>${paper.sourceLabel || 'Unknown'}</p>
      <p><strong>Categories: </strong>${categoryDisplay}</p>
      <p><strong>Date: </strong>${formatDate(paper.date)}</p>
      
      
      <h3>TL;DR</h3>
      <p>${highlightedSummary}</p>
      
      <div class="paper-sections">
        ${paper.motivation ? `<div class="paper-section"><h4>Motivation</h4><p>${highlightedMotivation}</p></div>` : ''}
        ${paper.method ? `<div class="paper-section"><h4>Method</h4><p>${highlightedMethod}</p></div>` : ''}
        ${paper.result ? `<div class="paper-section"><h4>Result</h4><p>${highlightedResult}</p></div>` : ''}
        ${paper.conclusion ? `<div class="paper-section"><h4>Conclusion</h4><p>${highlightedConclusion}</p></div>` : ''}
      </div>
      
      ${highlightedAbstract ? `<h3>Abstract</h3><p class="original-abstract">${highlightedAbstract}</p>` : ''}
      ${pdfPreviewSection}
    </div>
  `;
  
  // Update modal content
  document.getElementById('modalBody').innerHTML = modalContent;
  document.getElementById('paperLink').href = paper.url;
  document.getElementById('paperLink').title = paper.sourceLabel
    ? `Open in ${paper.sourceLabel}`
    : 'Open paper page';
  document.getElementById('pdfLink').href = pdfUrl || paper.url;
  document.getElementById('htmlLink').href = htmlUrl;
  document.getElementById('pdfLink').style.display = pdfUrl ? 'inline-flex' : 'none';
  document.getElementById('htmlLink').style.display = htmlUrl ? 'inline-flex' : 'none';
  
  // 提示词来自：https://papers.cool/
  const readingUrl = pdfUrl || htmlUrl || paper.url;
  prompt = `请你阅读这篇文章${readingUrl},总结一下这篇文章解决的问题、相关工作、研究方法、做了什么实验及其结果、结论，最后整体总结一下这篇文章的内容`
  document.getElementById('kimiChatLink').href = `https://www.kimi.com/_prefill_chat?prefill_prompt=${prompt}&system_prompt=你是一个学术助手，后面的对话将围绕着以下论文内容进行，已经通过链接给出了论文的PDF和论文已有的FAQ。用户将继续向你咨询论文的相关问题，请你作出专业的回答，不要出现第一人称，当涉及到分点回答时，鼓励你以markdown格式输出。&send_immediately=true&force_search=true`;
  
  // 更新论文位置信息
  const paperPosition = document.getElementById('paperPosition');
  if (paperPosition && currentFilteredPapers.length > 0) {
    paperPosition.textContent = `${currentPaperIndex + 1} / ${currentFilteredPapers.length}`;
  }
  
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const modal = document.getElementById('paperModal');
  const modalBody = document.getElementById('modalBody');
  
  // 重置模态框的滚动位置
  modalBody.scrollTop = 0;
  
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

// 导航到上一篇论文
function navigateToPreviousPaper() {
  if (currentFilteredPapers.length === 0) return;
  
  currentPaperIndex = currentPaperIndex > 0 ? currentPaperIndex - 1 : currentFilteredPapers.length - 1;
  const paper = currentFilteredPapers[currentPaperIndex];
  showPaperDetails(paper, currentPaperIndex + 1);
}

// 导航到下一篇论文
function navigateToNextPaper() {
  if (currentFilteredPapers.length === 0) return;
  
  currentPaperIndex = currentPaperIndex < currentFilteredPapers.length - 1 ? currentPaperIndex + 1 : 0;
  const paper = currentFilteredPapers[currentPaperIndex];
  showPaperDetails(paper, currentPaperIndex + 1);
}

// 显示随机论文
function showRandomPaper() {
  // 检查是否有可用的论文
  if (currentFilteredPapers.length === 0) {
    console.log('No papers available to show random paper');
    return;
  }
  
  // 生成随机索引
  const randomIndex = Math.floor(Math.random() * currentFilteredPapers.length);
  const randomPaper = currentFilteredPapers[randomIndex];
  
  // 更新当前论文索引
  currentPaperIndex = randomIndex;
  
  // 显示随机论文
  showPaperDetails(randomPaper, currentPaperIndex + 1);
  
  // 显示随机论文指示器
  showRandomPaperIndicator();
  
  console.log(`Showing random paper: ${randomIndex + 1}/${currentFilteredPapers.length}`);
}

// 显示随机论文指示器
function showRandomPaperIndicator() {
  // 移除已存在的指示器
  const existingIndicator = document.querySelector('.random-paper-indicator');
  if (existingIndicator) {
    existingIndicator.remove();
  }
  
  // 创建新的指示器
  const indicator = document.createElement('div');
  indicator.className = 'random-paper-indicator';
  indicator.textContent = 'Random Paper';
  
  // 添加到页面
  document.body.appendChild(indicator);
  
  // 3秒后自动移除
  setTimeout(() => {
    if (indicator && indicator.parentNode) {
      indicator.remove();
    }
  }, 3000);
}

function toggleDatePicker() {
  const datePicker = document.getElementById('datePickerModal');
  datePicker.classList.toggle('active');
  
  if (datePicker.classList.contains('active')) {
    document.body.style.overflow = 'hidden';
    
    // 重新初始化日期选择器以确保它反映最新的可用日期
    if (flatpickrInstance) {
      if (isRangeMode && currentRangeStart && currentRangeEnd) {
        flatpickrInstance.setDate([currentRangeStart, currentRangeEnd], false);
      } else if (currentDate && availableDates.includes(currentDate)) {
        flatpickrInstance.setDate(currentDate, false);
      }
    }
  } else {
    document.body.style.overflow = '';
  }
}

function toggleView() {
  currentView = currentView === 'grid' ? 'list' : 'grid';
  document.getElementById('paperContainer').classList.toggle('list-view', currentView === 'list');
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });
}

async function loadPapersByDateRange(startDate, endDate) {
  // 获取日期范围内的所有有效日期
  const validDatesInRange = availableDates.filter(date => {
    return date >= startDate && date <= endDate;
  });
  
  if (validDatesInRange.length === 0) {
    showNotification('选中的时间范围内没有可用的抓取批次。', 'info');
    return;
  }
  
  currentDate = `${startDate} to ${endDate}`;
  currentRangeStart = startDate;
  currentRangeEnd = endDate;
  updateCrawlDateDisplay(`${formatDate(startDate)} - ${formatDate(endDate)}`, 'Crawl window');
  
  // 不再重置激活的关键词和作者
  // 而是保持当前选择状态
  
  const container = document.getElementById('paperContainer');
  container.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <p>Loading papers from ${formatDate(startDate)} to ${formatDate(endDate)}...</p>
    </div>
  `;
  
  try {
    // 加载所有日期的论文数据
    const allPaperData = {};
    
    for (const date of validDatesInRange) {
      const selectedLanguage = selectLanguageForDate(date);
      // 从 data 分支获取数据文件
      const dataUrl = DATA_CONFIG.getDataUrl(`data/${date}_AI_enhanced_${selectedLanguage}.jsonl`);
      const response = await fetch(dataUrl, { cache: 'no-store' });
      const text = await response.text();
      const dataPapers = parseJsonlData(text, date);
      
      // 合并数据
      Object.keys(dataPapers).forEach(category => {
        if (!allPaperData[category]) {
          allPaperData[category] = [];
        }
        allPaperData[category] = allPaperData[category].concat(dataPapers[category]);
      });
    }
    
    paperData = allPaperData;

    const categories = getAllCategories(paperData);

    renderCategoryFilter(categories);

    // 如果URL中有category、json、author或keywords参数，直接返回JSON
    const hasJsonParams = urlJsonParam !== null;
    if (hasJsonParams) {
      // 获取基础论文列表（按category或all）
      const targetCategory = urlJsonParam || urlCategoryParam || 'all';
      let papers = getPapersByCategory(paperData, targetCategory);

      // 应用keywords和author匹配（"或"关系）
      if (urlKeywordsParam || urlAuthorParam) {
        papers = matchPapersByKeywordsOrAuthor(papers, urlKeywordsParam, urlAuthorParam);
      }

      // JSON模式：只返回匹配的论文
      papers = papers.filter(p => p.isMatched);

      outputJsonData(papers, targetCategory);
      return;
    }

    renderPapers();
  } catch (error) {
    console.error('加载论文数据失败:', error);
    container.innerHTML = `
      <div class="loading-container">
        <p>Loading data fails. Please retry.</p>
        <p>Error messages: ${error.message}</p>
      </div>
    `;
  }
}

// 清除所有激活的关键词
function clearAllKeywords() {
  activeKeywords = [];
  // renderKeywordTags();
  // 重新渲染论文列表，移除关键词匹配的高亮和优先排序
  renderPapers();
}

// 清除所有作者过滤
function clearAllAuthors() {
  activeAuthors = [];
  renderFilterTags();
  // 重新渲染论文列表，移除作者匹配的高亮和优先排序
  renderPapers();
}

// 切换PDF预览器大小
function togglePdfSize(button) {
  const pdfContainer = button.closest('.pdf-preview-section').querySelector('.pdf-container');
  const iframe = pdfContainer.querySelector('iframe');
  const expandIcon = button.querySelector('.expand-icon');
  const collapseIcon = button.querySelector('.collapse-icon');
  
  if (pdfContainer.classList.contains('expanded')) {
    // 恢复正常大小
    pdfContainer.classList.remove('expanded');
    iframe.style.height = '800px';
    expandIcon.style.display = 'block';
    collapseIcon.style.display = 'none';
    
    // 移除遮罩层
    const overlay = document.querySelector('.pdf-overlay');
    if (overlay) {
      overlay.remove();
    }
  } else {
    // 放大显示
    pdfContainer.classList.add('expanded');
    iframe.style.height = '90vh';
    expandIcon.style.display = 'none';
    collapseIcon.style.display = 'block';
    
    // 添加遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'pdf-overlay';
    document.body.appendChild(overlay);
    
    // 点击遮罩层时收起PDF
    overlay.addEventListener('click', () => {
      togglePdfSize(button);
    });
  }
}
