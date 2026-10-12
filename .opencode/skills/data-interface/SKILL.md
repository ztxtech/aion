---
name: data-interface
description: Normalize data entry and data interfaces for time-series tasks. It supports four main sources first: PDF, table files, databases, and code-style Data Loader / Data Factory inputs, then turns them into one shared data contract.
---

## Debug Prefix Protocol

- When called, print this first: `[Skills: data-interface] Follow: <rules / context constraints that really apply now>; Current step: <one-line note>`.
- If this skill clearly depends on one rule, add one more line like `[Rules: <rule>] ...`, then continue with the real work.
- The debug prefix should stay stable, short, and easy to grep.


## When To Use

- The task needs to read data before analysis, modeling, experiments, or reporting.
- Data comes from more than one source, so normalization must happen before model work starts.
- The `data/` layer needs a stable interface instead of letting all upstream formats leak into experiment logic.
- If the task gives only a data-interface name, data platform, data service, or SDK name without the official site and docs, use `websearch` / `webfetch` to locate the official site and official docs first, then decide how to connect. Do not write the interface from second-hand tutorials first.
- Once the official docs entry is confirmed, read the doc pages directly related to the current integration clearly, including access mode, auth, quota, fields / schema, error handling, pagination / rate limits, version differences, and examples. Parallel reading is fine, but key pages must not be missed.

## The Four Unified Entry Types For Now

### 1. PDF / scans / mixed text-image attachments

Good for: policy attachments, market rules, research reports, disclosure materials with charts, scans.

- Use `pdf-intake` for read-only extraction by default.
- Good for extracting rules, tables, charts, notes about calculation rules, field definitions, and business background.
- Not good as a direct training data source unless it is later cleaned into a structured table.
- Output should become a structured summary, field dictionary, or middle table instead of feeding raw PDF text into model training.

### 2. Table files: Excel / CSV / TSV and similar

Good for: trading data, sensor exports, manually curated ledgers, public disclosure tables.

- For Excel, CSV, and TSV, first do header checks, type detection, time-column detection, timezone checks, and frequency checks in one place.
- Make clear:
  - which column is the timestamp
  - which columns are target variables
  - which columns are features / exogenous variables
  - which columns are entity IDs / grouping keys
  - how missing values, duplicate rows, and invalid values are handled
- If the main input is spreadsheets, you may use `xlsx` abilities for cleaning, but the final result must still land on the unified data interface.
- If Python tool choice is needed for tables, databases, validation, or storage, check `python-toolbox` for data-engineering priors first, then validate key tools online.

### 3. Databases / SQL / time-series stores

Good for: MySQL, PostgreSQL, SQLite, ClickHouse, time-series databases, data warehouses, and similar systems.

- Make the query contract clear first. Do not treat the database as a black box.
- Fix these points:
  - connection source and permission boundary
  - query time range
  - primary key / time key / entity key
  - dedup, aggregation, fill, and sampling rules
  - output format written to disk
- Data read from the database should first land as a reproducible middle table or cache before it enters the `data/` interface, so experiments do not depend directly on one-time query state.

### 4. Code-style data interfaces: Data Loader / Data Factory / Dataset

Good for: Python `DataLoader`, `Dataset`, `DataFactory`, feature factories, or preprocessing pipelines already provided by the user.

- Review the input/output contract first instead of trusting the existing implementation directly.
- Check:
  - input parameters
  - returned object structure
  - whether time splitting is correct
  - whether leakage exists
  - whether training-only features or future information leaked in
  - whether the same dataset can be reproduced
- If the current interface is unstable, add one normalization wrapper first instead of tying all downstream experiments to that private implementation.

## Unified Target Contract

No matter which upstream type is used, everything must converge into one shared data contract before downstream work begins.

At least make clear:

- data source type
- raw path / query / interface name
- time column
- target column
- feature columns
- entity columns / grouping columns
- frequency and timezone
- data range
- missing-value and outlier strategy
- split method
- final output location

## Normalized Directory Strategy

- If the raw input directory does not fit the normalized structure of the current project, do not work in the raw directory directly.
- Prefer copying or mirroring raw input into a unified raw-data directory, for example `data/raw_external/`, `data/raw_legacy/`, or `data/raw_imports/`.
- Do field cleaning, time alignment, type conversion, dedup, and normalization inside the normalized directory.
- Downstream experiments, feature engineering, and evaluation should depend only on the normalized interface, not on outside raw directories directly.
- If original-directory meaning must be preserved, record source relations with index files, mapping tables, or README files instead of continuing mixed development in the raw directory.

## Suggested Landing Style

- Put all data logic into `data/` in one place, not scattered inside experiment scripts.
- Write a clear read-adapter layer for each data source, then expose one unified interface to `evaluation/`, `exp/`, and `model/`.
- Keep a minimal validation script or sample call for key data entry points to prove that the interface really works.
- As long as code, directories, or experiment protocols are involved, `ztxexp` still applies.

## Relation To Time-Series Tasks

- Before entering visual analysis, `tsfresh` feature analysis, or method choice in `time-series`, use this skill first to unify the data entry.
- If the data contract itself is unstable, all later time-series analysis, plotting, search, and experiments are unreliable too.

## Future Expandable Data Sources

For now the main focus is the four types above, but later it may expand to:

- `parquet` / `feather`
- `json` / `jsonl`
- API / streaming interfaces
- object storage / data lakes
- message queues / event streams

When a new type is added, add `adapter layer + unified contract` first. Do not let raw source format leak into downstream work directly.

## Output Format

- Data source type
- Raw entry description
- Unified data contract
- Risks and uncertainty
- Suggested interface for landing
