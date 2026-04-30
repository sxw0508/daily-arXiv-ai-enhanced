import os
import re
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path

import yaml


SOURCE_LABELS = {
    "arxiv": "arXiv",
    "biorxiv": "bioRxiv",
    "medrxiv": "medRxiv",
    "pubmed": "PubMed",
}

CONFIG_PATH = Path(__file__).resolve().parents[1] / "config.yaml"
LOCAL_CONFIG_PATH = Path(__file__).resolve().parents[1] / "config.local.yaml"


def clean_text(value):
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


@lru_cache(maxsize=1)
def load_project_config():
    config = {}

    for path in (CONFIG_PATH, LOCAL_CONFIG_PATH):
        if not path.exists():
            continue

        with open(path, "r", encoding="utf-8") as file:
            data = yaml.safe_load(file) or {}

        if isinstance(data, dict):
            config = deep_merge_dicts(config, data)

    return config


def deep_merge_dicts(base, override):
    merged = dict(base)

    for key, value in override.items():
        if (
            key in merged
            and isinstance(merged[key], dict)
            and isinstance(value, dict)
        ):
            merged[key] = deep_merge_dicts(merged[key], value)
        else:
            merged[key] = value

    return merged


def get_config_value(path, default=None):
    data = load_project_config()
    current = data

    for part in path.split("."):
        if not isinstance(current, dict):
            return default
        current = current.get(part)
        if current is None:
            return default

    return current


def get_text_env(name, config_path=None, default=""):
    env_value = os.environ.get(name)
    if env_value not in (None, ""):
        return clean_text(env_value)

    if config_path:
        config_value = get_config_value(config_path, default)
        return clean_text(config_value)

    return clean_text(default)


def get_int_env(name, config_path=None, default=0):
    env_value = os.environ.get(name)
    raw_value = env_value if env_value not in (None, "") else None

    if raw_value is None and config_path:
        raw_value = get_config_value(config_path, default)
    if raw_value is None:
        raw_value = default

    try:
        return int(raw_value)
    except (TypeError, ValueError):
        return int(default)


def parse_csv_env(name, default="", config_path=None):
    env_value = os.environ.get(name)
    if env_value not in (None, ""):
        raw = env_value
    else:
        config_value = get_config_value(config_path, None) if config_path else None
        if isinstance(config_value, list):
            return [clean_text(part) for part in config_value if clean_text(part)]
        if config_value not in (None, ""):
            raw = str(config_value)
        else:
            raw = default

    return [part.strip() for part in str(raw).split(",") if part.strip()]


def parse_keyword_groups_env(name="KEYWORD_GROUPS", config_path=None):
    env_value = os.environ.get(name)
    if env_value not in (None, ""):
        raw = env_value
        groups = []

        for group in raw.split(";"):
            terms = [clean_text(term) for term in group.split("|") if clean_text(term)]
            if terms:
                groups.append(terms)

        return groups

    config_value = get_config_value(config_path, None) if config_path else None
    if isinstance(config_value, list):
        groups = []
        for group in config_value:
            if isinstance(group, list):
                terms = [clean_text(term) for term in group if clean_text(term)]
            else:
                terms = [clean_text(group)] if clean_text(group) else []
            if terms:
                groups.append(terms)
        return groups

    raw = str(config_value or "")
    groups = []

    for group in raw.split(";"):
        terms = [clean_text(term) for term in group.split("|") if clean_text(term)]
        if terms:
            groups.append(terms)

    return groups


def build_canonical_id(source, source_id):
    return f"{source}:{source_id}"


def get_source_label(source):
    return SOURCE_LABELS.get(source, source)


def normalize_categories(categories):
    result = []
    for category in categories or []:
        cleaned = clean_text(category)
        if cleaned:
            result.append(cleaned)
    return result


def split_authors(authors):
    if isinstance(authors, list):
        return [clean_text(author) for author in authors if clean_text(author)]

    text = clean_text(authors)
    if not text:
        return []

    if ";" in text:
        parts = text.split(";")
    elif " and " in text:
        parts = text.split(" and ")
    elif text.count(",") > 1:
        parts = text.split(",")
    else:
        parts = [text]

    return [clean_text(part) for part in parts if clean_text(part)]


def format_iso_date(value):
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()

    text = clean_text(value)
    if not text:
        return ""

    match = re.match(r"(\d{4}-\d{2}-\d{2})", text)
    if match:
        return match.group(1)

    slash_match = re.match(r"(\d{4})/(\d{2})/(\d{2})", text)
    if slash_match:
        return "-".join(slash_match.groups())

    return ""


def build_rxiv_urls(source, doi, version):
    host = "www.biorxiv.org" if source == "biorxiv" else "www.medrxiv.org"
    version_text = clean_text(version)
    version_suffix = ""

    if version_text and not doi.endswith(f"v{version_text}"):
        version_suffix = f"v{version_text}"

    abs_url = f"https://{host}/content/{doi}{version_suffix}"
    return {
        "abs": abs_url,
        "pdf": f"{abs_url}.full.pdf",
        "html": abs_url,
    }


def matches_keywords(item, keywords):
    if not keywords:
        return True

    haystack = " ".join(
        [
            clean_text(item.get("title")),
            clean_text(item.get("summary")),
        ]
    ).lower()

    return any(keyword.lower() in haystack for keyword in keywords)


def matches_keyword_groups(item, keyword_groups):
    if not keyword_groups:
        return True

    haystack = " ".join(
        [
            clean_text(item.get("title")),
            clean_text(item.get("summary")),
        ]
    ).lower()

    return all(
        any(term.lower() in haystack for term in group)
        for group in keyword_groups
    )
