# Define your item pipelines here
#
# Don't forget to add your pipeline to the ITEM_PIPELINES setting
# See: https://docs.scrapy.org/en/latest/topics/item-pipeline.html


import arxiv
import os
from scrapy.exceptions import DropItem

from daily_arxiv.source_utils import (
    build_canonical_id,
    format_iso_date,
    get_source_label,
    matches_keywords,
    matches_keyword_groups,
    normalize_categories,
    parse_csv_env,
    parse_keyword_groups_env,
)


class DailyArxivPipeline:
    def __init__(self):
        self.page_size = 100
        self.client = arxiv.Client(self.page_size)
        self.keywords = parse_csv_env("KEYWORDS", config_path="crawler.keywords")
        self.keyword_groups = parse_keyword_groups_env(
            "KEYWORD_GROUPS",
            config_path="crawler.keyword_groups",
        )

    def process_item(self, item: dict, spider):
        source = item.get("source", "arxiv").lower()
        normalized_item = (
            self._normalize_arxiv_item(item)
            if source == "arxiv"
            else self._normalize_external_item(item, source)
        )

        if self.keywords and not matches_keywords(normalized_item, self.keywords):
            raise DropItem(
                f"Filtered {normalized_item['id']} by KEYWORDS={','.join(self.keywords)}"
            )

        if self.keyword_groups and not matches_keyword_groups(
            normalized_item, self.keyword_groups
        ):
            raise DropItem(
                f"Filtered {normalized_item['id']} by KEYWORD_GROUPS"
            )

        return normalized_item

    def _normalize_arxiv_item(self, item):
        source_id = item.get("source_id") or item.get("id")
        if not source_id:
            raise DropItem("Missing arXiv source identifier")

        search = arxiv.Search(id_list=[source_id])
        paper = next(self.client.results(search))

        categories = normalize_categories(getattr(paper, "categories", []))
        published_date = format_iso_date(getattr(paper, "published", ""))
        updated_date = format_iso_date(getattr(paper, "updated", ""))

        normalized = {
            "id": build_canonical_id("arxiv", source_id),
            "source": "arxiv",
            "source_label": get_source_label("arxiv"),
            "source_id": source_id,
            "doi": getattr(paper, "doi", "") or "",
            "pdf": f"https://arxiv.org/pdf/{source_id}",
            "abs": f"https://arxiv.org/abs/{source_id}",
            "html": f"https://arxiv.org/abs/{source_id}",
            "authors": [author.name for author in paper.authors],
            "title": paper.title,
            "categories": categories,
            "comment": getattr(paper, "comment", "") or "",
            "summary": paper.summary,
            "posted_date": published_date or updated_date,
            "published": published_date,
            "updated": updated_date,
        }
        return normalized

    def _normalize_external_item(self, item, source):
        source_id = item.get("source_id") or item.get("doi") or item.get("id")
        if not source_id:
            raise DropItem(f"Missing source identifier for {source}")

        categories = normalize_categories(item.get("categories", []))
        if not categories:
            raise DropItem(f"Missing categories for {source}:{source_id}")

        normalized = {
            "id": item.get("id") or build_canonical_id(source, source_id),
            "source": source,
            "source_label": item.get("source_label") or get_source_label(source),
            "source_id": source_id,
            "doi": item.get("doi", "") or "",
            "pdf": item.get("pdf", "") or "",
            "abs": item.get("abs", "") or "",
            "html": item.get("html", "") or item.get("abs", "") or "",
            "authors": item.get("authors", []),
            "title": item.get("title", "") or "",
            "categories": categories,
            "comment": item.get("comment", "") or "",
            "summary": item.get("summary", "") or "",
            "posted_date": format_iso_date(item.get("posted_date", "")),
            "published": format_iso_date(item.get("published", "")),
            "updated": format_iso_date(item.get("updated", "")),
        }

        optional_fields = [
            "license",
            "version",
            "paper_type",
            "journal_ref",
        ]
        for field in optional_fields:
            if item.get(field):
                normalized[field] = item[field]

        return normalized
