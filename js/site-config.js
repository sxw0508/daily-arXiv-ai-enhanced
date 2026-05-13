const DEFAULT_DISPLAY_NAME = 'Target Research Paper AI Enhanced';

const DEFAULT_BRAND_NAMES = [
  'Daily Paper AI Enhanced',
  'Paper AI Enhanced',
  DEFAULT_DISPLAY_NAME
];

function resolveDisplayName() {
  const titleElements = Array.from(document.querySelectorAll('[data-site-title]'));
  const inlineDisplayName = titleElements
    .map(element => element.textContent.trim())
    .find(Boolean);

  return inlineDisplayName
    || ((typeof DATA_CONFIG !== 'undefined' && DATA_CONFIG.siteDisplayName)
      ? DATA_CONFIG.siteDisplayName
      : DEFAULT_DISPLAY_NAME);
}

function syncDocumentTitle(displayName) {
  if (!document.title) {
    document.title = displayName;
    return;
  }

  if (document.title.includes(displayName)) {
    return;
  }

  let nextTitle = document.title;
  [...DEFAULT_BRAND_NAMES]
    .sort((left, right) => right.length - left.length)
    .forEach((brandName) => {
      if (brandName !== displayName) {
        nextTitle = nextTitle.replaceAll(brandName, displayName);
      }
    });

  document.title = nextTitle;
}

function applySiteBranding() {
  const titleElements = Array.from(document.querySelectorAll('[data-site-title]'));
  const displayName = resolveDisplayName();
  const sourceSummary = (typeof DATA_CONFIG !== 'undefined' && DATA_CONFIG.sourceSummary)
    ? DATA_CONFIG.sourceSummary
    : 'arXiv, bioRxiv, medRxiv, and PubMed';

  titleElements.forEach(element => {
    element.textContent = displayName;
  });

  document.querySelectorAll('[data-site-logo-alt]').forEach(element => {
    element.alt = `${displayName} Logo`;
  });

  document.querySelectorAll('[data-source-summary]').forEach(element => {
    element.textContent = sourceSummary;
  });

  syncDocumentTitle(displayName);
}

document.addEventListener('DOMContentLoaded', applySiteBranding);
