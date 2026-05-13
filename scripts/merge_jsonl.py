#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


def load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []

    items: list[dict] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            text = line.strip()
            if not text:
                continue
            items.append(json.loads(text))
    return items


def primary_category(item: dict) -> str:
    categories = item.get("categories", [])
    if isinstance(categories, list) and categories:
        return str(categories[0]).strip()
    if categories:
        return str(categories).strip()
    return ""


def canonical_id(item: dict) -> str:
    return (
        str(item.get("id") or "").strip()
        or str(item.get("source_id") or "").strip()
        or str(item.get("doi") or "").strip()
        or str(item.get("title") or "").strip()
    )


def dedupe_key(item: dict) -> str:
    return f"{canonical_id(item)}||{primary_category(item)}"


def write_jsonl(items: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for item in items:
            handle.write(json.dumps(item, ensure_ascii=False) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", required=True)
    parser.add_argument("--aggregate", required=True)
    parser.add_argument("--delta-out", required=True)
    args = parser.parse_args()

    batch_path = Path(args.batch)
    aggregate_path = Path(args.aggregate)
    delta_path = Path(args.delta_out)

    aggregate_items = load_jsonl(aggregate_path)
    batch_items = load_jsonl(batch_path)

    seen = {dedupe_key(item) for item in aggregate_items}
    delta_items: list[dict] = []

    for item in batch_items:
        key = dedupe_key(item)
        if not key or key in seen:
            continue
        seen.add(key)
        delta_items.append(item)

    merged_items = [*aggregate_items, *delta_items]
    write_jsonl(merged_items, aggregate_path)
    write_jsonl(delta_items, delta_path)

    print(
        json.dumps(
            {
                "aggregate": str(aggregate_path),
                "batch": str(batch_path),
                "delta": str(delta_path),
                "existing_count": len(aggregate_items),
                "batch_count": len(batch_items),
                "added_count": len(delta_items),
                "merged_count": len(merged_items),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
