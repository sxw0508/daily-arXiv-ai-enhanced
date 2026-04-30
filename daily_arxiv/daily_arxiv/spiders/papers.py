import json
import os
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from xml.etree import ElementTree

import scrapy

from daily_arxiv.source_utils import (
    build_canonical_id,
    build_rxiv_urls,
    clean_text,
    get_int_env,
    get_source_label,
    get_text_env,
    normalize_categories,
    parse_csv_env,
    split_authors,
)


class PapersSpider(scrapy.Spider):
    name = "papers"
    allowed_domains = [
        "arxiv.org",
        "api.biorxiv.org",
        "eutils.ncbi.nlm.nih.gov",
        "pubmed.ncbi.nlm.nih.gov",
    ]
    PUBMED_MONTHS = {
        "jan": "01",
        "feb": "02",
        "mar": "03",
        "apr": "04",
        "may": "05",
        "jun": "06",
        "jul": "07",
        "aug": "08",
        "sep": "09",
        "oct": "10",
        "nov": "11",
        "dec": "12",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        configured_sources = parse_csv_env(
            "PAPER_SOURCES",
            "arxiv",
            config_path="crawler.paper_sources",
        )
        self.enabled_sources = {source.lower() for source in configured_sources}

        self.target_categories = set(
            parse_csv_env(
                "ARXIV_CATEGORIES",
                config_path="crawler.arxiv_categories",
            )
            or parse_csv_env(
                "CATEGORIES",
                "cs.CV",
                config_path="crawler.arxiv_categories",
            )
        )

        self.biorxiv_categories = parse_csv_env(
            "BIORXIV_CATEGORIES",
            config_path="crawler.biorxiv_categories",
        )
        self.medrxiv_categories = parse_csv_env(
            "MEDRXIV_CATEGORIES",
            config_path="crawler.medrxiv_categories",
        )
        self.rxiv_lookback_days = max(
            1,
            get_int_env(
                "RXIV_LOOKBACK_DAYS",
                config_path="crawler.rxiv_lookback_days",
                default=2,
            ),
        )

        end_date = datetime.now(timezone.utc).date()
        start_date = end_date - timedelta(days=self.rxiv_lookback_days - 1)
        self.rxiv_start_date = start_date.isoformat()
        self.rxiv_end_date = end_date.isoformat()
        self.pubmed_start_date = start_date.strftime("%Y/%m/%d")
        self.pubmed_end_date = end_date.strftime("%Y/%m/%d")

        self.pubmed_query = get_text_env("PUBMED_QUERY", "pubmed.query")
        if not self.pubmed_query:
            keyword_terms = parse_csv_env(
                "KEYWORDS",
                config_path="crawler.keywords",
            )
            if keyword_terms:
                self.pubmed_query = " OR ".join(
                    f'"{keyword}"' for keyword in keyword_terms
                )

        self.pubmed_label = get_text_env("PUBMED_LABEL", "pubmed.label", "PubMed")
        self.pubmed_retmax = max(
            1,
            get_int_env("PUBMED_RETMAX", "pubmed.retmax", 200),
        )
        self.pubmed_date_type = get_text_env(
            "PUBMED_DATE_TYPE",
            "pubmed.date_type",
            "edat",
        )
        self.ncbi_api_key = clean_text(os.environ.get("NCBI_API_KEY"))
        self.ncbi_email = clean_text(os.environ.get("EMAIL"))
        self.ncbi_tool = get_text_env(
            "NCBI_TOOL",
            default="daily-papers-ai-enhanced",
        )

    def start_requests(self):
        if "arxiv" in self.enabled_sources:
            for category in sorted(self.target_categories):
                yield scrapy.Request(
                    f"https://arxiv.org/list/{category}/new",
                    callback=self.parse_arxiv,
                )

        if "biorxiv" in self.enabled_sources:
            yield from self._start_rxiv_requests("biorxiv", self.biorxiv_categories)

        if "medrxiv" in self.enabled_sources:
            yield from self._start_rxiv_requests("medrxiv", self.medrxiv_categories)

        if "pubmed" in self.enabled_sources:
            if not self.pubmed_query:
                self.logger.warning(
                    "Skipping PubMed because neither PUBMED_QUERY nor KEYWORDS is set"
                )
            else:
                yield scrapy.Request(
                    self._build_pubmed_search_url(),
                    callback=self.parse_pubmed_search,
                    meta={"dont_obey_robotstxt": True},
                    cb_kwargs={"retstart": 0},
                )

    def _start_rxiv_requests(self, source, categories):
        rxiv_categories = categories or [None]
        for category in rxiv_categories:
            yield scrapy.Request(
                self._build_rxiv_url(source, 0, category),
                callback=self.parse_rxiv,
                cb_kwargs={"source": source, "category_filter": category, "cursor": 0},
            )

    def _build_rxiv_url(self, source, cursor=0, category=None):
        url = (
            f"https://api.biorxiv.org/details/"
            f"{source}/{self.rxiv_start_date}/{self.rxiv_end_date}/{cursor}/json"
        )
        if category:
            url = f"{url}?{urlencode({'category': category})}"
        return url

    def _build_pubmed_search_url(self, retstart=0):
        params = {
            "db": "pubmed",
            "term": self.pubmed_query,
            "retmode": "json",
            "retmax": self.pubmed_retmax,
            "retstart": retstart,
            "sort": "pub_date",
            "datetype": self.pubmed_date_type,
            "mindate": self.pubmed_start_date,
            "maxdate": self.pubmed_end_date,
        }
        if self.ncbi_api_key:
            params["api_key"] = self.ncbi_api_key
        if self.ncbi_email:
            params["email"] = self.ncbi_email
        if self.ncbi_tool:
            params["tool"] = self.ncbi_tool
        return (
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?"
            f"{urlencode(params)}"
        )

    def _build_pubmed_fetch_url(self, pmids):
        params = {
            "db": "pubmed",
            "retmode": "xml",
            "id": ",".join(pmids),
        }
        if self.ncbi_api_key:
            params["api_key"] = self.ncbi_api_key
        if self.ncbi_email:
            params["email"] = self.ncbi_email
        if self.ncbi_tool:
            params["tool"] = self.ncbi_tool
        return (
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?"
            f"{urlencode(params)}"
        )

    def parse_arxiv(self, response):
        anchors = []
        for li in response.css("div[id=dlpage] ul li"):
            href = li.css("a::attr(href)").get()
            if href and "item" in href:
                anchors.append(int(href.split("item")[-1]))

        for paper in response.css("dl dt"):
            paper_anchor = paper.css("a[name^='item']::attr(name)").get()
            if not paper_anchor:
                continue

            paper_id = int(paper_anchor.split("item")[-1])
            if anchors and paper_id >= anchors[-1]:
                continue

            abstract_link = paper.css("a[title='Abstract']::attr(href)").get()
            if not abstract_link:
                continue

            arxiv_id = abstract_link.split("/")[-1]
            paper_dd = paper.xpath("following-sibling::dd[1]")
            if not paper_dd:
                continue

            subjects_text = paper_dd.css(".list-subjects .primary-subject::text").get()
            if not subjects_text:
                subjects_text = paper_dd.css(".list-subjects::text").get()

            if subjects_text:
                categories_in_paper = re.findall(r"\(([^)]+)\)", subjects_text)
                paper_categories = set(categories_in_paper)
                if paper_categories.intersection(self.target_categories):
                    yield {
                        "source": "arxiv",
                        "source_label": get_source_label("arxiv"),
                        "source_id": arxiv_id,
                        "categories": list(paper_categories),
                    }
                    self.logger.info(
                        "Found arXiv paper %s with categories %s",
                        arxiv_id,
                        paper_categories,
                    )
                else:
                    self.logger.debug(
                        "Skipped arXiv paper %s with categories %s (not in target %s)",
                        arxiv_id,
                        paper_categories,
                        self.target_categories,
                    )
            else:
                self.logger.warning(
                    "Could not extract categories for arXiv paper %s, including anyway",
                    arxiv_id,
                )
                yield {
                    "source": "arxiv",
                    "source_label": get_source_label("arxiv"),
                    "source_id": arxiv_id,
                    "categories": [],
                }

    def parse_rxiv(self, response, source, category_filter=None, cursor=0):
        payload = json.loads(response.text)
        collection = payload.get("collection", [])

        for record in collection:
            doi = clean_text(record.get("doi"))
            if not doi:
                continue

            categories = normalize_categories([record.get("category")])
            if not categories:
                categories = normalize_categories([category_filter])
            if not categories:
                categories = [get_source_label(source)]

            version = clean_text(record.get("version"))
            urls = build_rxiv_urls(source, doi, version)

            yield {
                "id": build_canonical_id(source, doi),
                "source": source,
                "source_label": get_source_label(source),
                "source_id": doi,
                "doi": doi,
                "title": clean_text(record.get("title")),
                "authors": split_authors(record.get("authors")),
                "categories": categories,
                "summary": clean_text(record.get("abstract")),
                "comment": f"Version {version}" if version else "",
                "abs": urls["abs"],
                "pdf": urls["pdf"],
                "html": urls["html"],
                "posted_date": clean_text(record.get("date")),
                "published": clean_text(record.get("published")),
                "license": clean_text(record.get("license")),
                "version": version,
                "paper_type": clean_text(record.get("type")),
            }

        next_cursor = cursor + len(collection)
        total_count = self._extract_total_count(payload)

        if len(collection) == 100 and (total_count is None or next_cursor < total_count):
            yield scrapy.Request(
                self._build_rxiv_url(source, next_cursor, category_filter),
                callback=self.parse_rxiv,
                cb_kwargs={
                    "source": source,
                    "category_filter": category_filter,
                    "cursor": next_cursor,
                },
            )

    def parse_pubmed_search(self, response, retstart=0):
        payload = json.loads(response.text)
        search_result = payload.get("esearchresult", {})
        pmids = search_result.get("idlist", [])

        if pmids:
            yield scrapy.Request(
                self._build_pubmed_fetch_url(pmids),
                callback=self.parse_pubmed_fetch,
                meta={"dont_obey_robotstxt": True},
            )

        total_count = self._extract_pubmed_count(search_result)
        next_start = retstart + self.pubmed_retmax
        if total_count is not None and next_start < total_count:
            yield scrapy.Request(
                self._build_pubmed_search_url(next_start),
                callback=self.parse_pubmed_search,
                meta={"dont_obey_robotstxt": True},
                cb_kwargs={"retstart": next_start},
            )

    def parse_pubmed_fetch(self, response):
        root = ElementTree.fromstring(response.text)

        for article in root.findall(".//PubmedArticle"):
            pmid = clean_text(self._xml_text(article.find(".//MedlineCitation/PMID")))
            if not pmid:
                continue

            title = clean_text(self._xml_text(article.find(".//ArticleTitle")))
            abstract = self._extract_pubmed_abstract(article)
            authors = self._extract_pubmed_authors(article)
            doi = clean_text(
                self._xml_text(
                    article.find(".//PubmedData/ArticleIdList/ArticleId[@IdType='doi']")
                )
            )
            journal_node = article.find(".//Article/Journal/ISOAbbreviation")
            if journal_node is None:
                journal_node = article.find(".//Article/Journal/Title")
            journal = clean_text(self._xml_text(journal_node))

            publication_types = normalize_categories(
                [
                    self._xml_text(node)
                    for node in article.findall(
                        ".//Article/PublicationTypeList/PublicationType"
                    )
                ]
            )
            categories = [self.pubmed_label]
            categories.extend(publication_types[:3])

            pubmed_url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
            published_date = self._extract_pubmed_date(article)
            created_date = self._extract_structured_date(
                article.find(".//MedlineCitation/DateCreated")
            )
            completed_date = self._extract_structured_date(
                article.find(".//MedlineCitation/DateCompleted")
            )

            yield {
                "id": build_canonical_id("pubmed", pmid),
                "source": "pubmed",
                "source_label": get_source_label("pubmed"),
                "source_id": pmid,
                "doi": doi,
                "title": title,
                "authors": authors,
                "categories": categories,
                "summary": abstract,
                "comment": journal,
                "abs": pubmed_url,
                "html": pubmed_url,
                "pdf": "",
                "posted_date": published_date or created_date or completed_date,
                "published": published_date,
                "updated": created_date or completed_date,
                "journal_ref": journal,
            }

    @staticmethod
    def _extract_total_count(payload):
        messages = payload.get("messages") or []
        if not messages:
            return None

        count = messages[0].get("count")
        try:
            return int(count)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _extract_pubmed_count(search_result):
        count = search_result.get("count")
        try:
            return int(count)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _xml_text(node):
        if node is None:
            return ""
        return "".join(node.itertext()).strip()

    def _extract_pubmed_authors(self, article):
        authors = []
        for author in article.findall(".//Article/AuthorList/Author"):
            collective = clean_text(self._xml_text(author.find("CollectiveName")))
            if collective:
                authors.append(collective)
                continue

            fore_name = clean_text(self._xml_text(author.find("ForeName")))
            last_name = clean_text(self._xml_text(author.find("LastName")))
            initials = clean_text(self._xml_text(author.find("Initials")))
            full_name = clean_text(
                " ".join(part for part in [fore_name, last_name] if part)
            )
            if full_name:
                authors.append(full_name)
            elif last_name or initials:
                authors.append(
                    clean_text(" ".join(part for part in [initials, last_name] if part))
                )
        return authors

    def _extract_pubmed_abstract(self, article):
        sections = []
        for abstract_text in article.findall(".//Article/Abstract/AbstractText"):
            label = clean_text(abstract_text.attrib.get("Label"))
            text = clean_text(self._xml_text(abstract_text))
            if not text:
                continue
            sections.append(f"{label}: {text}" if label else text)
        return "\n\n".join(sections)

    def _extract_pubmed_date(self, article):
        article_date = article.find(".//Article/ArticleDate")
        structured_article_date = self._extract_structured_date(article_date)
        if structured_article_date:
            return structured_article_date

        pub_date = article.find(".//Article/Journal/JournalIssue/PubDate")
        return self._extract_pub_date(pub_date)

    def _extract_structured_date(self, date_node):
        if date_node is None:
            return ""

        year = clean_text(self._xml_text(date_node.find("Year")))
        month = clean_text(self._xml_text(date_node.find("Month"))) or "01"
        day = clean_text(self._xml_text(date_node.find("Day"))) or "01"

        if not year:
            return ""

        month = self._normalize_month(month)
        day = day.zfill(2)
        return f"{year}-{month}-{day}"

    def _extract_pub_date(self, pub_date_node):
        if pub_date_node is None:
            return ""

        structured_date = self._extract_structured_date(pub_date_node)
        if structured_date:
            return structured_date

        medline_date = clean_text(self._xml_text(pub_date_node.find("MedlineDate")))
        if not medline_date:
            return ""

        year_match = re.search(r"\d{4}", medline_date)
        if not year_match:
            return ""

        return f"{year_match.group(0)}-01-01"

    def _normalize_month(self, month):
        month_text = clean_text(month)
        if month_text.isdigit():
            return month_text.zfill(2)

        lowered = month_text[:3].lower()
        return self.PUBMED_MONTHS.get(lowered, "01")
