from __future__ import annotations

import json
import subprocess
import threading
from collections import deque
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import yaml
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field


ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "daily_arxiv" / "config.yaml"
LOCAL_CONFIG_PATH = ROOT / "daily_arxiv" / "config.local.yaml"
DATA_DIR = ROOT / "data"
FILE_LIST_PATH = ROOT / "assets" / "file-list.txt"


def load_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}

    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
        return data if isinstance(data, dict) else {}


def save_yaml(path: Path, data: dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(
            data,
            handle,
            allow_unicode=True,
            sort_keys=False,
            default_flow_style=False,
        )


def deep_merge_dicts(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
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


def get_nested(data: dict[str, Any], path: str, default: Any = None) -> Any:
    current: Any = data
    for part in path.split("."):
        if not isinstance(current, dict):
            return default
        current = current.get(part)
        if current is None:
            return default
    return current


def set_nested(data: dict[str, Any], path: str, value: Any) -> None:
    current = data
    parts = path.split(".")
    for part in parts[:-1]:
        next_value = current.get(part)
        if not isinstance(next_value, dict):
            next_value = {}
            current[part] = next_value
        current = next_value
    current[parts[-1]] = value


def csv_text_to_list(value: Any) -> list[str]:
    if isinstance(value, list):
        raw_parts = value
    else:
        text = str(value or "")
        raw_parts = text.replace("\n", ",").split(",")
    return [str(part).strip() for part in raw_parts if str(part).strip()]


def multiline_text_to_list(value: Any) -> list[str]:
    if isinstance(value, list):
        raw_parts = value
    else:
        raw_parts = str(value or "").splitlines()
    return [str(part).strip() for part in raw_parts if str(part).strip()]


def keyword_groups_text_to_list(value: Any) -> list[list[str]]:
    if isinstance(value, list):
        groups: list[list[str]] = []
        for group in value:
            if isinstance(group, list):
                normalized = [str(term).strip() for term in group if str(term).strip()]
                if normalized:
                    groups.append(normalized)
        return groups

    groups = []
    for line in str(value or "").splitlines():
        terms = [term.strip() for term in line.split("|") if term.strip()]
        if terms:
            groups.append(terms)
    return groups


def list_to_multiline(value: Any) -> str:
    if not isinstance(value, list):
        return ""
    return "\n".join(str(item).strip() for item in value if str(item).strip())


def keyword_groups_to_multiline(value: Any) -> str:
    if not isinstance(value, list):
        return ""
    lines = []
    for group in value:
        if isinstance(group, list):
            terms = [str(term).strip() for term in group if str(term).strip()]
            if terms:
                lines.append(" | ".join(terms))
    return "\n".join(lines)


def read_runtime_config() -> dict[str, Any]:
    config = load_yaml(CONFIG_PATH)
    local_config = load_yaml(LOCAL_CONFIG_PATH)
    return deep_merge_dicts(config, local_config)


DEFAULT_RESEARCH_FOCUS = "antibody_therapeutics"

RESEARCH_FOCUS_PRESETS: dict[str, dict[str, Any]] = {
    "antibody_therapeutics": {
        "label": "Antibody Therapeutics",
        "category_suffix": "Antibody",
        "required_group": [
            "antibody",
            "monoclonal antibody",
            "therapeutic antibody",
            "bispecific antibody",
            "antibody-drug conjugate",
            "ADC",
            "nanobody",
        ],
        "supporting_terms": [
            "antibody",
            "monoclonal antibody",
            "therapeutic antibody",
            "bispecific antibody",
            "antibody-drug conjugate",
            "ADC",
            "nanobody",
            "antibody engineering",
            "humanized antibody",
            "Fc engineering",
            "epitope mapping",
            "internalization",
            "clinical efficacy",
            "safety",
        ],
        "query_terms": [
            "antibody",
            "monoclonal antibody",
            "therapeutic antibody",
            "bispecific antibody",
            "antibody-drug conjugate",
            "ADC",
            "nanobody",
        ],
        "prompt_guidance": (
            "Prioritize therapeutic antibody papers over general target biology. "
            "Favor monoclonal antibodies, bispecific antibodies, ADCs, nanobodies, "
            "antibody engineering, affinity maturation, epitope mapping, Fc engineering, "
            "internalization, biomarker, efficacy, resistance, and safety topics."
        ),
    },
    "adc": {
        "label": "ADC",
        "category_suffix": "ADC",
        "required_group": [
            "antibody-drug conjugate",
            "ADC",
            "linker",
            "payload",
            "internalization",
        ],
        "supporting_terms": [
            "antibody-drug conjugate",
            "ADC",
            "linker",
            "payload",
            "internalization",
            "bystander effect",
            "topoisomerase inhibitor",
            "tubulin inhibitor",
        ],
        "query_terms": [
            "antibody-drug conjugate",
            "ADC",
            "linker",
            "payload",
            "internalization",
        ],
        "prompt_guidance": (
            "Prioritize antibody-drug conjugate literature. Focus on linker-payload design, "
            "internalization, bystander effect, target expression, resistance, efficacy, and safety."
        ),
    },
    "bispecific_antibody": {
        "label": "Bispecific Antibody",
        "category_suffix": "BsAb",
        "required_group": [
            "bispecific antibody",
            "bsAb",
            "T-cell engager",
            "dual-specific",
        ],
        "supporting_terms": [
            "bispecific antibody",
            "bsAb",
            "T-cell engager",
            "dual-specific",
            "CD3 engager",
            "conditional activation",
        ],
        "query_terms": [
            "bispecific antibody",
            "bsAb",
            "T-cell engager",
            "dual-specific",
        ],
        "prompt_guidance": (
            "Prioritize bispecific antibody literature. Focus on dual-target design, CD3 engagers, "
            "conditional activation, tumor selectivity, cytokine release, and translational efficacy."
        ),
    },
    "general_target_biology": {
        "label": "General Target Biology",
        "category_suffix": "",
        "required_group": [],
        "supporting_terms": [],
        "query_terms": [],
        "prompt_guidance": (
            "Allow broader target biology and translational papers instead of forcing therapeutic antibody modality."
        ),
    },
}


def normalize_research_focus(value: Any) -> str:
    focus = str(value or "").strip().lower()
    return focus if focus in RESEARCH_FOCUS_PRESETS else DEFAULT_RESEARCH_FOCUS


def merge_unique_terms(primary: list[str], additional: list[str]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for term in [*primary, *additional]:
        text = str(term).strip()
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        merged.append(text)
    return merged


def ensure_query_focus(query: str, query_terms: list[str]) -> str:
    text = str(query or "").strip()
    if not text or not query_terms:
        return text

    lowered = text.lower()
    if any(term.lower() in lowered for term in query_terms):
        return text

    clause = " OR ".join(f'"{term}"[Title/Abstract]' for term in query_terms)
    return f"({text}) AND ({clause})"


def apply_research_focus_to_plan(plan: dict[str, Any], research_focus: str) -> dict[str, Any]:
    preset = RESEARCH_FOCUS_PRESETS[research_focus]
    support_terms = merge_unique_terms(
        [str(term).strip() for term in plan.get("supporting_terms", []) if str(term).strip()],
        preset["supporting_terms"],
    )
    plan["supporting_terms"] = support_terms
    plan["pubmed_query"] = ensure_query_focus(
        str(plan.get("pubmed_query", "")).strip(),
        preset["query_terms"],
    )

    category_label = str(plan.get("category_label", "")).strip()
    suffix = str(preset.get("category_suffix", "")).strip()
    if category_label and suffix and suffix.lower() not in category_label.lower():
        plan["category_label"] = f"{category_label} {suffix}".strip()

    plan["research_focus"] = research_focus
    return plan


def apply_research_focus_to_keyword_groups(
    keyword_groups: list[list[str]],
    research_focus: str,
) -> list[list[str]]:
    preset = RESEARCH_FOCUS_PRESETS[research_focus]
    required_group = [
        str(term).strip() for term in preset.get("required_group", []) if str(term).strip()
    ]
    if not required_group:
        return keyword_groups

    normalized = [group for group in keyword_groups if group]
    normalized.append(required_group)
    return normalized


class ResearchPlan(BaseModel):
    category_label: str = Field(
        description="Short human-readable antibody therapeutics category label"
    )
    core_terms: list[str] = Field(description="Core target terms, aliases, or gene names")
    supporting_terms: list[str] = Field(
        description="Supporting disease, modality, drug, biomarker, or mechanism terms"
    )
    pubmed_query: str = Field(description="PubMed Title/Abstract query")
    strategy_note: str = Field(
        description="Short note explaining what the generated search strategy emphasizes"
    )


def build_research_plan(payload: dict[str, Any]) -> dict[str, Any]:
    target = str(payload.get("target", "")).strip()
    disease = str(payload.get("disease", "")).strip()
    paper_sources = csv_text_to_list(payload.get("paper_sources", ""))
    research_focus = normalize_research_focus(payload.get("research_focus"))

    if not target:
        raise ValueError("Target is required.")

    runtime_config = read_runtime_config()
    llm_config = runtime_config.get("llm", {}) if isinstance(runtime_config, dict) else {}
    api_key = str(
        llm_config.get("openai_api_key")
        or ""
    ).strip()
    base_url = str(llm_config.get("openai_base_url") or "").strip()
    model_name = str(llm_config.get("model_name") or "").strip()
    language = str(llm_config.get("language") or "Chinese").strip()

    if not api_key:
        raise ValueError("LLM API key is not configured in config.local.yaml.")
    if not model_name:
        raise ValueError("LLM model_name is missing from configuration.")

    llm_kwargs: dict[str, Any] = {
        "model": model_name,
        "api_key": api_key,
    }
    if base_url:
        llm_kwargs["base_url"] = base_url
    if (
        base_url
        and "dashscope.aliyuncs.com/compatible-mode" in base_url
        and model_name.lower().startswith("qwen")
    ):
        llm_kwargs["extra_body"] = {"enable_thinking": False}

    llm = ChatOpenAI(**llm_kwargs).with_structured_output(
        ResearchPlan,
        method="function_calling",
    )

    source_text = ", ".join(paper_sources) if paper_sources else "pubmed"
    focus_preset = RESEARCH_FOCUS_PRESETS[research_focus]
    disease_text = disease if disease else "Not specified"
    prompt = f"""
You are a biomedical literature search strategist focused on translational therapeutic research.

Generate a focused literature tracking plan for:
- Target: {target}
- Disease or indication: {disease_text}
- Selected sources: {source_text}
- Research focus: {focus_preset["label"]}

Requirements:
- Return concise, production-usable search terms.
- `category_label` should be short and readable for a dashboard category.
- `core_terms` should focus on the target itself, aliases, official gene/protein names, and closely related naming variants.
- `supporting_terms` should focus on disease wording when provided, plus high-signal therapeutic or modality words that improve relevance.
- `pubmed_query` must be a valid PubMed query built mostly with Title/Abstract fields.
- Avoid overly broad generic words unless they materially improve retrieval quality.
- Prefer English scientific terminology in the search terms and query, even if the explanation language is {language}.
- `strategy_note` should be short and user-facing in {language}.
- {focus_preset["prompt_guidance"]}
- If research focus is antibody-related, make sure the generated query explicitly contains antibody modality terms instead of generic oncology-only wording.
- If disease is not specified, generate a broader target-centric strategy without inventing a fake indication.
""".strip()

    response = llm.invoke(prompt)
    plan = apply_research_focus_to_plan(response.model_dump(), research_focus)
    plan["paper_sources"] = paper_sources
    return plan


def refresh_file_list() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    FILE_LIST_PATH.parent.mkdir(parents=True, exist_ok=True)

    files = sorted(path.name for path in DATA_DIR.glob("*.jsonl"))
    with FILE_LIST_PATH.open("w", encoding="utf-8") as handle:
        if files:
            handle.write("\n".join(files))
            handle.write("\n")


def latest_files() -> list[dict[str, Any]]:
    files = []
    for path in sorted(DATA_DIR.glob("*"), key=lambda p: p.stat().st_mtime, reverse=True):
        if not path.is_file():
            continue
        stat = path.stat()
        files.append(
            {
                "name": path.name,
                "size": stat.st_size,
                "updated_at": datetime.fromtimestamp(
                    stat.st_mtime, tz=timezone.utc
                ).isoformat(timespec="seconds"),
            }
        )
    return files[:12]


def read_public_config() -> dict[str, Any]:
    config = load_yaml(CONFIG_PATH)
    local_config = load_yaml(LOCAL_CONFIG_PATH)

    return {
        "crawler": {
            "paper_sources": ", ".join(
                get_nested(config, "crawler.paper_sources", []) or []
            ),
            "research_focus": normalize_research_focus(
                get_nested(config, "crawler.research_focus", DEFAULT_RESEARCH_FOCUS)
            ),
            "arxiv_categories": ", ".join(
                get_nested(config, "crawler.arxiv_categories", []) or []
            ),
            "biorxiv_categories": ", ".join(
                get_nested(config, "crawler.biorxiv_categories", []) or []
            ),
            "medrxiv_categories": ", ".join(
                get_nested(config, "crawler.medrxiv_categories", []) or []
            ),
            "keywords_text": list_to_multiline(
                get_nested(config, "crawler.keywords", [])
            ),
            "keyword_groups_text": keyword_groups_to_multiline(
                get_nested(config, "crawler.keyword_groups", [])
            ),
            "rxiv_lookback_days": get_nested(config, "crawler.rxiv_lookback_days", 30),
        },
        "pubmed": {
            "query": get_nested(config, "pubmed.query", ""),
            "label": get_nested(config, "pubmed.label", "PubMed"),
            "retmax": get_nested(config, "pubmed.retmax", 200),
            "date_type": get_nested(config, "pubmed.date_type", "edat"),
        },
        "llm": {
            "model_name": get_nested(config, "llm.model_name", ""),
            "language": get_nested(config, "llm.language", ""),
            "openai_base_url": get_nested(config, "llm.openai_base_url", ""),
            "has_api_key": bool(get_nested(local_config, "llm.openai_api_key", "")),
        },
    }


def update_public_config(payload: dict[str, Any]) -> dict[str, Any]:
    config = load_yaml(CONFIG_PATH)
    research_focus = normalize_research_focus(payload.get("research_focus"))
    keywords = merge_unique_terms(
        multiline_text_to_list(payload["keywords_text"]),
        RESEARCH_FOCUS_PRESETS[research_focus].get("required_group", []),
    )
    keyword_groups = apply_research_focus_to_keyword_groups(
        keyword_groups_text_to_list(payload["keyword_groups_text"]),
        research_focus,
    )

    set_nested(config, "crawler.paper_sources", csv_text_to_list(payload["paper_sources"]))
    set_nested(config, "crawler.research_focus", research_focus)
    set_nested(
        config,
        "crawler.arxiv_categories",
        csv_text_to_list(payload["arxiv_categories"]),
    )
    set_nested(
        config,
        "crawler.biorxiv_categories",
        csv_text_to_list(payload["biorxiv_categories"]),
    )
    set_nested(
        config,
        "crawler.medrxiv_categories",
        csv_text_to_list(payload["medrxiv_categories"]),
    )
    set_nested(
        config,
        "crawler.keywords",
        keywords,
    )
    set_nested(
        config,
        "crawler.keyword_groups",
        keyword_groups,
    )
    set_nested(
        config,
        "crawler.rxiv_lookback_days",
        max(1, int(payload["rxiv_lookback_days"])),
    )
    set_nested(config, "pubmed.query", str(payload["pubmed_query"]).strip())
    set_nested(config, "pubmed.label", str(payload["pubmed_label"]).strip())
    set_nested(config, "pubmed.retmax", max(1, int(payload["pubmed_retmax"])))
    set_nested(config, "pubmed.date_type", str(payload["pubmed_date_type"]).strip())
    set_nested(config, "llm.model_name", str(payload["llm_model_name"]).strip())
    set_nested(config, "llm.language", str(payload["llm_language"]).strip())
    set_nested(
        config,
        "llm.openai_base_url",
        str(payload["llm_openai_base_url"]).strip(),
    )

    save_yaml(CONFIG_PATH, config)
    return read_public_config()


class JobManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._process: subprocess.Popen[str] | None = None
        self._action = ""
        self._started_at = ""
        self._finished_at = ""
        self._exit_code: int | None = None
        self._log_lines: deque[str] = deque(maxlen=500)

    def _append_log(self, line: str) -> None:
        clean_line = line.rstrip("\n")
        if clean_line:
            self._log_lines.append(clean_line)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            running = bool(self._process and self._process.poll() is None)
            return {
                "running": running,
                "action": self._action,
                "started_at": self._started_at,
                "finished_at": self._finished_at,
                "exit_code": self._exit_code,
                "log_tail": list(self._log_lines)[-120:],
            }

    def start(self, action: str) -> tuple[bool, str]:
        with self._lock:
            if self._process and self._process.poll() is None:
                return False, "A backend task is already running."

            command, cwd = self._build_command(action)
            if not command:
                return False, f"Unsupported action: {action}"

            process = subprocess.Popen(
                command,
                cwd=str(cwd),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            self._process = process
            self._action = action
            self._started_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
            self._finished_at = ""
            self._exit_code = None
            self._log_lines.clear()
            self._append_log(f"$ {' '.join(command)}")

            thread = threading.Thread(
                target=self._consume_output,
                args=(process, action),
                daemon=True,
            )
            thread.start()

        return True, "Task started."

    def stop(self) -> tuple[bool, str]:
        with self._lock:
            if not self._process or self._process.poll() is not None:
                return False, "No backend task is running."
            self._append_log("Stopping current task...")
            self._process.terminate()
            return True, "Stop signal sent."

    def _build_command(self, action: str) -> tuple[list[str] | None, Path]:
        if action == "full":
            return ["bash", "run.sh"], ROOT

        if action == "crawl":
            return ["bash", "run.sh", "--crawl-only"], ROOT

        return None, ROOT

    def _consume_output(self, process: subprocess.Popen[str], action: str) -> None:
        assert process.stdout is not None

        for line in process.stdout:
            with self._lock:
                self._append_log(line)

        exit_code = process.wait()
        refresh_file_list()

        with self._lock:
            self._append_log(f"Task finished with exit code {exit_code}.")
            self._finished_at = datetime.now(timezone.utc).isoformat(
                timespec="seconds"
            )
            self._exit_code = exit_code
            self._process = None


JOB_MANAGER = JobManager()


class ControlRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def _write_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length > 0 else b"{}"
        return json.loads(raw.decode("utf-8"))

    def do_GET(self) -> None:
        if self.path == "/api/control/state":
            self._write_json(
                {
                    "ok": True,
                    "config": read_public_config(),
                    "job": JOB_MANAGER.snapshot(),
                    "files": latest_files(),
                }
            )
            return

        if self.path == "/":
            self.path = "/index.html"

        return super().do_GET()

    def do_POST(self) -> None:
        if self.path == "/api/control/config":
            try:
                payload = self._read_json()
                updated = update_public_config(payload)
            except Exception as error:  # pragma: no cover - defensive
                self._write_json(
                    {"ok": False, "message": f"Failed to save config: {error}"},
                    status=HTTPStatus.BAD_REQUEST,
                )
                return

            self._write_json({"ok": True, "message": "Config saved.", "config": updated})
            return

        if self.path == "/api/control/run":
            payload = self._read_json()
            ok, message = JOB_MANAGER.start(str(payload.get("action", "")).strip())
            self._write_json(
                {"ok": ok, "message": message, "job": JOB_MANAGER.snapshot()},
                status=200 if ok else HTTPStatus.CONFLICT,
            )
            return

        if self.path == "/api/control/generate":
            try:
                payload = self._read_json()
                plan = build_research_plan(payload)
            except Exception as error:  # pragma: no cover - defensive
                self._write_json(
                    {"ok": False, "message": f"Failed to generate plan: {error}"},
                    status=HTTPStatus.BAD_REQUEST,
                )
                return

            self._write_json({"ok": True, "plan": plan, "message": "Research plan generated."})
            return

        if self.path == "/api/control/stop":
            ok, message = JOB_MANAGER.stop()
            self._write_json(
                {"ok": ok, "message": message, "job": JOB_MANAGER.snapshot()},
                status=200 if ok else HTTPStatus.CONFLICT,
            )
            return

        self._write_json(
            {"ok": False, "message": f"Unknown endpoint: {self.path}"},
            status=HTTPStatus.NOT_FOUND,
        )


def main() -> None:
    refresh_file_list()
    server = ThreadingHTTPServer(("127.0.0.1", 8000), ControlRequestHandler)
    print("Local console running at http://127.0.0.1:8000")
    server.serve_forever()


if __name__ == "__main__":
    main()
