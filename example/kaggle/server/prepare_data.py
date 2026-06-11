#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


STORE_IDS = {"1", "2", "3", "4", "5"}
TRAIN_END = "2017-07-30"
TEST_START = "2017-07-31"
TEST_END = "2017-08-15"
METRIC = "rmsle"


def ensure_dirs(base_dir: Path) -> tuple[Path, Path]:
    public_dir = base_dir / "public_data"
    private_dir = base_dir / "private_data"
    public_dir.mkdir(parents=True, exist_ok=True)
    private_dir.mkdir(parents=True, exist_ok=True)
    return public_dir, private_dir


def filter_rows(source_path: Path, dest_path: Path, keep_row) -> int:
    count = 0
    with source_path.open(newline="") as src, dest_path.open("w", newline="") as dst:
        reader = csv.DictReader(src)
        writer = csv.DictWriter(dst, fieldnames=reader.fieldnames)
        writer.writeheader()
        for row in reader:
            if keep_row(row):
                writer.writerow(row)
                count += 1
    return count


def build_local_split(source_dir: Path, output_dir: Path) -> dict[str, int]:
    public_dir, private_dir = ensure_dirs(output_dir)

    stats: dict[str, int] = {}
    train_src = source_dir / "train.csv"
    test_src = source_dir / "test.csv"

    train_public_path = public_dir / "train.csv"
    local_test_path = public_dir / "test.csv"
    sample_submission_path = public_dir / "sample_submission.csv"
    truth_path = private_dir / "ground_truth.csv"

    with train_src.open(newline="") as src, \
        train_public_path.open("w", newline="") as train_dst, \
        local_test_path.open("w", newline="") as test_dst, \
        sample_submission_path.open("w", newline="") as sample_dst, \
        truth_path.open("w", newline="") as truth_dst:
        reader = csv.DictReader(src)
        train_writer = csv.DictWriter(train_dst, fieldnames=reader.fieldnames)
        test_writer = csv.DictWriter(test_dst, fieldnames=["id", "date", "store_nbr", "family", "onpromotion"])
        sample_writer = csv.DictWriter(sample_dst, fieldnames=["id", "sales"])
        truth_writer = csv.DictWriter(truth_dst, fieldnames=["id", "sales"])

        train_writer.writeheader()
        test_writer.writeheader()
        sample_writer.writeheader()
        truth_writer.writeheader()

        train_count = 0
        test_count = 0
        for row in reader:
            if row["store_nbr"] not in STORE_IDS:
                continue
            if row["date"] <= TRAIN_END:
                train_writer.writerow(row)
                train_count += 1
                continue
            if TEST_START <= row["date"] <= TEST_END:
                test_writer.writerow(
                    {
                        "id": row["id"],
                        "date": row["date"],
                        "store_nbr": row["store_nbr"],
                        "family": row["family"],
                        "onpromotion": row["onpromotion"],
                    }
                )
                sample_writer.writerow({"id": row["id"], "sales": "0.0"})
                truth_writer.writerow({"id": row["id"], "sales": row["sales"]})
                test_count += 1

    stats["train_rows"] = train_count
    stats["test_rows"] = test_count

    stats["stores_rows"] = filter_rows(
        source_dir / "stores.csv",
        public_dir / "stores.csv",
        lambda row: row["store_nbr"] in STORE_IDS,
    )
    stats["transactions_rows"] = filter_rows(
        source_dir / "transactions.csv",
        public_dir / "transactions.csv",
        lambda row: row["store_nbr"] in STORE_IDS and row["date"] <= TRAIN_END,
    )
    stats["oil_rows"] = filter_rows(
        source_dir / "oil.csv",
        public_dir / "oil.csv",
        lambda row: row["date"] <= TEST_END,
    )
    stats["holidays_rows"] = filter_rows(
        source_dir / "holidays_events.csv",
        public_dir / "holidays_events.csv",
        lambda row: row["date"] <= TEST_END,
    )

    with test_src.open(newline="") as src, (public_dir / "official_test_reference.csv").open("w", newline="") as dst:
        reader = csv.DictReader(src)
        writer = csv.DictWriter(dst, fieldnames=reader.fieldnames)
        writer.writeheader()
        kept = 0
        for row in reader:
            if row["store_nbr"] in STORE_IDS:
                writer.writerow(row)
                kept += 1
    stats["official_test_reference_rows"] = kept

    metadata = {
        "competition_slug": "store-sales-time-series-forecasting",
        "description": "Local Kaggle-like holdout for fast offline iteration.",
        "metric": METRIC,
        "public_train_end": TRAIN_END,
        "hidden_test_start": TEST_START,
        "hidden_test_end": TEST_END,
        "stores": sorted(int(v) for v in STORE_IDS),
        "all_families": True,
        "rows": stats,
    }
    (public_dir / "competition.json").write_text(json.dumps(metadata, indent=2) + "\n")
    return stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a local Kaggle slice for example002-local.")
    parser.add_argument(
        "--source-dir",
        type=Path,
        required=True,
        help="Directory containing the original Kaggle CSV files.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parent,
        help="Directory that will receive public_data/ and private_data/.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    stats = build_local_split(args.source_dir, args.output_dir)
    print(json.dumps(stats, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
