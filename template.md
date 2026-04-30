# About
This tool will daily crawl papers from arXiv, bioRxiv, medRxiv and PubMed, then use LLMs to summarize them.

See in: https://dw-dengwei.github.io/daily-arXiv-ai-enhanced/

# How to use
This repo can daily crawl papers from **arXiv, bioRxiv, medRxiv and PubMed**, and use **DeepSeek** to summarize the papers in **Chinese**.
If you wish to crawl other categories, PubMed queries, use other LLMs or other languages, please follow the bellow instructions.
Otherwise, you can directly use this repo in https://dw-dengwei.github.io/daily-arXiv-ai-enhanced/ . Please star it if you like :)

**Instructions:**
1. Fork this repo to your own account
2. Go to: your-own-repo -> Settings -> Secrets and variables -> Actions
3. Go to Secrets. Secrets are encrypted and are used for sensitive data
4. Create repository secrets named `OPENAI_API_KEY` and `OPENAI_BASE_URL`, and input corresponding values.
5. [Optional] Create `NCBI_API_KEY` if you enable `pubmed` and want higher PubMed E-utilities throughput.
6. Go to Variables. Variables are shown as plain text and are used for non-sensitive data
7. Create the following repository variables:
   1. `PAPER_SOURCES`: separate the sources with ",", such as `arxiv,biorxiv,medrxiv,pubmed`
   2. `ARXIV_CATEGORIES`: separate the arXiv categories with ",", such as `cs.CL, cs.CV`
   3. `BIORXIV_CATEGORIES`: optional bioRxiv categories, such as `bioinformatics,genomics`
   4. `MEDRXIV_CATEGORIES`: optional medRxiv categories, such as `infectious diseases`
   5. `PUBMED_QUERY`: optional PubMed query, such as `cancer AND immunotherapy`
   6. `PUBMED_LABEL`: optional display category for PubMed records, such as `Target Discovery`
   7. `KEYWORDS`: optional hard filter keywords, such as `target discovery,protein-ligand`
   8. `RXIV_LOOKBACK_DAYS`: optional lookback window for bioRxiv/medRxiv, such as `2`
   9. `PUBMED_RETMAX`: optional PubMed page size, such as `200`
   10. `PUBMED_DATE_TYPE`: optional PubMed date type, such as `edat`
   11. `LANGUAGE`: such as "Chinese" or "English"
   12. `MODEL_NAME`: such as "deepseek-chat"
   13. `EMAIL`: your email for push to github and NCBI E-utilities
   14. `NAME`: your name for push to github
8. Go to your-own-repo -> Actions -> arXiv-daily-ai-enhanced
9. You can manually click **Run workflow** to test if it works well (it may takes about one hour). 
By default, this action will automatically run every day
You can modify it in `.github/workflows/run.yml`
10. If you wish to modify the content in `README.md`, do not directly edit README.md. You should edit `template.md`.

# To-do list
- [x] Replace markdown with GitHub pages front-end.
- [ ] Bugfix: In the statistics page, the number of papers for a keyword is not correct.
- [ ] Update instructions for fork users about how to use github pages.

# Content
{readme_content}

# Related tools
- ICML, ICLR, NeurIPS list: https://dw-dengwei.github.io/OpenReview-paper-list/index.html

# Star history

[![Star History Chart](https://api.star-history.com/svg?repos=dw-dengwei/daily-arXiv-ai-enhanced&type=Date)](https://www.star-history.com/#dw-dengwei/daily-arXiv-ai-enhanced&Date)
