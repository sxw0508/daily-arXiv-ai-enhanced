/**
 * Data Source Configuration
 *
 * The frontend now prefers bundled data files that are committed into the
 * repository under `assets/` and `data/`, so both local preview and remote
 * static hosting can render the same paper set directly.
 */

const DATA_CONFIG = {
    /**
     * Display name used across the frontend
     */
    siteDisplayName: 'Target Research Paper AI Enhanced',

    /**
     * Human-readable summary of supported sources
     */
    sourceSummary: 'arXiv, bioRxiv, medRxiv, and PubMed',

    /**
     * GitHub repository owner (username)
     * This will be replaced during GitHub Actions workflow execution
     */
    repoOwner: 'dw-dengwei',

    /**
     * GitHub repository name
     * This will be replaced during GitHub Actions workflow execution
     */
    repoName: 'daily-arXiv-ai-enhanced',

    /**
     * Whether the frontend should read bundled data from the current site.
     */
    useBundledData: true,

    /**
     * Data branch name kept for backward compatibility when bundled mode is
     * disabled in the future.
     */
    dataBranch: 'data',

    /**
     * Detect whether the frontend is running from a local preview server.
     * In local preview we should read files from the checked-out workspace
     * instead of the remote GitHub data branch.
     */
    isLocalPreview: function() {
        if (typeof window === 'undefined') {
            return false;
        }

        const { protocol, hostname } = window.location;
        return protocol === 'file:' || hostname === '127.0.0.1' || hostname === 'localhost';
    },

    /**
     * Get the base URL for raw GitHub content from data branch
     * @returns {string} Base URL for raw GitHub content
     */
    getDataBaseUrl: function() {
        if (this.useBundledData || this.isLocalPreview()) {
            return '';
        }
        return `https://raw.githubusercontent.com/${this.repoOwner}/${this.repoName}/${this.dataBranch}`;
    },

    /**
     * Get the repository web URL
     * @returns {string} Repository homepage URL
     */
    getRepoWebUrl: function() {
        return `https://github.com/${this.repoOwner}/${this.repoName}`;
    },

    /**
     * Get the repository API URL
     * @returns {string} GitHub REST API repository endpoint
     */
    getRepoApiUrl: function() {
        return `https://api.github.com/repos/${this.repoOwner}/${this.repoName}`;
    },

    /**
     * Get the full URL for a data file
     * @param {string} filePath - Relative path to the data file (e.g., 'data/2025-01-01.jsonl')
     * @returns {string} Full URL to the data file
     */
    getDataUrl: function(filePath) {
        const baseUrl = this.getDataBaseUrl();
        return baseUrl ? `${baseUrl}/${filePath}` : filePath;
    }
};
