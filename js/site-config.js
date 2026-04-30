const SITE_CONFIG = {
  displayName: (typeof DATA_CONFIG !== 'undefined' && DATA_CONFIG.siteDisplayName)
    ? DATA_CONFIG.siteDisplayName
    : 'Daily Paper AI Enhanced',
  sourceSummary: (typeof DATA_CONFIG !== 'undefined' && DATA_CONFIG.sourceSummary)
    ? DATA_CONFIG.sourceSummary
    : 'arXiv, bioRxiv, medRxiv, and PubMed'
};

function applySiteBranding() {
  document.querySelectorAll('[data-site-title]').forEach(element => {
    element.textContent = SITE_CONFIG.displayName;
  });

  document.querySelectorAll('[data-site-logo-alt]').forEach(element => {
    element.alt = `${SITE_CONFIG.displayName} Logo`;
  });

  document.querySelectorAll('[data-source-summary]').forEach(element => {
    element.textContent = SITE_CONFIG.sourceSummary;
  });
}

document.addEventListener('DOMContentLoaded', applySiteBranding);
