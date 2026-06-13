---
name: python-toolbox
description: Built-in Python tool priors covering time series, statistics, machine learning, and related ecosystems. It reduces repeated search cost and gives the first coverage of method families and tool families.
---

## Debug Prefix Protocol

- When called, print this first: `[Skills: python-toolbox] Follow: <rules / context constraints that really apply now>; Current step: <one-line note>`.
- If this skill clearly depends on one rule, add one more line like `[Rules: <rule>] ...`, then continue with the real work.
- The debug prefix should stay stable, short, and easy to grep.

## Usage Principles

- This is a built-in prior library used to reduce repeated token cost when searching the Python tool ecosystem again and again.
- It gives a `high-frequency tool catalog + category view`, not a frozen ranking board.
- When the task touches Python tool choice, method coverage, time-series library comparison, statistical analysis, data interfaces, or experiment-stack design, check this skill first, then decide which tools still need fresh online validation.
- For key candidate tools, still validate freshness through official docs / PyPI / GitHub. Do not treat this skill as the only time-sensitive source.

## Dynamic Repo Cache

- This skill includes `repos-cache.jsonc` in the same directory — a categorized JSON file with 200+ high-star GitHub repos.
- **TTL = 2 days**. When the cache is stale (last refresh > 2 days), the `information-collector` agent should re-search GitHub and update incrementally:
  1. For each category, search GitHub with relevant keywords + `stars:>100` or `stars:>500`.
  2. Merge new repos; remove repos with `pushed_at` > 1 year ago that are not foundational (numpy, pandas, etc.).
  3. Update the `meta.version` field (increment by 1) and `meta.created_at` to today.
  4. Keep the total count >= 200 across all categories.
- The cache organizes repos into these categories:
  - **A**: Numerical Computing & Data Engineering (17)
  - **B**: Statistics / Econometrics / Bayesian / Causal (20)
  - **C**: Classical ML / AutoML / Explainability (19)
  - **D**: Time Series Forecasting & Analysis (31)
  - **E**: Deep Learning & Pretraining (21)
  - **F**: Time Series Analysis / Signal / Quality (15)
  - **G**: Anomaly Detection / Outliers (9)
  - **H**: Explainability / Diagnosis / Experiment Analysis (15)
  - **I**: Visualization & Dashboarding (17)
  - **J**: Data Storage / Query / Interfaces (14)
  - **K**: NLP & Text for Time Series (10)
  - **L**: Data Quality / MLOps / Deployment (14)
  - **M**: Specialized Domain Tools (13)

## High-Priority Built-In Priors (100+)

### A. Numerical Computing and Data Engineering (17)

- `numpy`: basic numerical computing and tensor arrays.
- `pandas`: main workhorse for table-like time series and feature engineering.
- `scipy`: optimization, signal processing, and statistical computing.
- `polars`: fast table processing.
- `pyarrow`: columnar storage and the Arrow ecosystem.
- `xarray`: multi-dimensional arrays and spatiotemporal data.
- `dask`: parallel and large-scale data processing.
- `numba`: speed-up for numerical code.
- `jax`: numerical computing and autodiff.
- `sympy`: symbolic computing.
- `joblib`: parallelism and caching.
- `patsy`: formula system for statistical modeling.
- `bottleneck`: array acceleration.
- `sparse`: sparse arrays.
- `pint`: units and physical quantities.
- `vaex`: out-of-core billion-row DataFrame.
- `cupy`: NumPy-compatible GPU arrays.

### B. Statistics / Econometrics / Bayesian / Causal (20)

- `statsmodels`: classic statistics, econometrics, and time-series models.
- `pmdarima`: Auto-ARIMA family.
- `arch`: volatility models and financial time series.
- `prophet`: trend and holiday modeling.
- `pingouin`: statistical tests and effect sizes.
- `scikit-posthocs`: post-hoc tests.
- `lifelines`: survival analysis.
- `pymc`: Bayesian modeling.
- `arviz`: Bayesian result analysis and visualization.
- `cmdstanpy`: Python interface for Stan.
- `bambi`: formula-based Bayesian models.
- `linearmodels`: panel data and linear econometrics.
- `econml`: causal machine learning.
- `dowhy`: causal inference framework.
- `causalml`: uplift / causal modeling.
- `causallib`: causal inference toolkit.
- `orbit`: Bayesian structural time series and forecasting.
- `pykalman`: Kalman filtering.
- `pydlm`: Bayesian dynamic linear models.
- `cvxpy`: disciplined convex optimization.

### C. Classical ML / AutoML / Explainability (19)

- `scikit-learn`: main entry for classical machine learning.
- `xgboost`: gradient-boosted trees.
- `lightgbm`: efficient GBDT.
- `catboost`: GBDT with strong categorical handling.
- `river`: online / streaming learning.
- `pycaret`: low-code machine learning.
- `flaml`: lightweight AutoML.
- `auto-sklearn`: AutoML.
- `optuna`: hyperparameter optimization.
- `ray[tune]`: large-scale search and tuning.
- `mlflow`: experiment tracking.
- `wandb`: experiment visualization and collaboration.
- `shap`: feature attribution.
- `lime`: local explanations.
- `interpret`: interpretable-model toolkit.
- `eli5`: feature weights and explanations.
- `alibi`: explanation and anomaly-analysis support.
- `dice-ml`: counterfactual explanations.
- `captum`: attribution and explanation for PyTorch models.

### D. General Time-Series Learning and Forecasting (31)

- `sktime`: unified framework for time-series ML.
- `aeon`: time-series learning toolbox.
- `darts`: unified forecasting / anomaly interface.
- `statsforecast`: Nixtla statistical forecasting stack.
- `mlforecast`: Nixtla machine-learning forecasting stack.
- `neuralforecast`: Nixtla deep-learning forecasting stack.
- `hierarchicalforecast`: hierarchical forecasting.
- `utilsforecast`: helper tools for forecasting.
- `datasetsforecast`: forecasting dataset tools.
- `gluonts`: probabilistic forecasting and deep models.
- `autogluon.timeseries`: AutoML for time-series forecasting.
- `pytorch-forecasting`: high-level PyTorch framework for time-series forecasting.
- `skforecast`: sklearn-compatible TS forecasting.
- `tsai`: fastai-style deep learning for time series.
- `kats`: Meta time-series analysis toolkit.
- `merlion`: Salesforce time-series intelligence library.
- `NeuralProphet`: neural Prophet route.
- `etna`: Tinkoff time-series library.
- `functime`: time-series ML at scale with Polars.
- `luminaire`: Zillow ML-driven time-series monitoring.
- `pyts`: time-series classification and transforms.
- `tslearn`: time-series clustering, classification, and metrics.
- `stumpy`: matrix profile / motif / discord.
- `ruptures`: change-point detection.
- `adtk`: anomaly detection toolkit.
- `tsfresh`: automatic feature extraction.
- `tsfel`: feature extraction library.
- `pycatch22`: catch22 features.
- `tsaug`: time-series augmentation.
- `PyPOTS`: ML on partially-observed time series, 50+ models.
- `TCDF`: Temporal Causal Discovery Framework.

### E. Deep Learning and Pretraining Related (21)

- `torch`: main PyTorch framework.
- `lightning`: training engineering framework.
- `tensorflow`: deep-learning framework.
- `keras`: high-level deep-learning API.
- `transformers`: pretrained-model ecosystem.
- `accelerate`: multi-device / train-infer support.
- `flax`: JAX neural-network library.
- `haiku`: JAX neural-network library.
- `optax`: JAX optimizer library.
- `tensorboard`: training-log visualization.
- `timm`: PyTorch image models (pretrained vision).
- `einops`: tensor manipulation.
- `wandb`: experiment tracking.
- `timesfm`: Google's pretrained time series foundation model.
- `chronos`: Amazon's pretrained TS models.
- `moirai`: Salesforce's universal TS forecasting.
- `lag-llama`: foundation model for univariate probabilistic TS forecasting.
- `patchtst`: patch-based time series transformer.
- `iTransformer`: inverted transformer for time series.
- `TimeSeriesLibrary`: unified TS model library (PatchTST, DLinear, etc.).
- `basicTS`: TS benchmark for forecasting and anomaly detection.

### F. Time-Series Analysis / Signal / Quality Support (15)

- `antropy`: entropy and complexity features.
- `PyEMD`: EMD / CEEMDAN and related decomposition.
- `PyWavelets`: wavelet analysis.
- `librosa`: spectrum and time-frequency analysis.
- `spectrum`: spectral analysis.
- `statsmodels.tsa`: filtering / decomposition / state space.
- `feature-engine`: feature-engineering components.
- `featuretools`: automatic feature engineering.
- `evidently`: data / model drift monitoring.
- `great_expectations`: data-quality rules.
- `pandera`: DataFrame schema checks.
- `dirty_cat`: dirty-category handling.
- `nannyml`: post-deployment drift detection.
- `neurokit2`: physiological signal processing.
- `biosppy`: biosignal processing.

### G. Anomaly Detection / Outliers (9)

- `pyod`: Python Outlier Detection (30+ algorithms).
- `adtk`: anomaly detection toolkit for time series.
- `merlion`: Salesforce TS intelligence (anomaly + forecast).
- `suod`: scalable unsupervised outlier detection acceleration.
- `alibi-detect`: outlier, adversarial, and drift detection.
- `DeepOD`: deep learning for anomaly detection.
- `anomalib`: deep learning anomaly detection library.
- `stumpy`: matrix profile (motif/discord for anomaly).
- `telemanom`: LSTM-based satellite telemetry anomaly detection.

### H. Explainability / Diagnosis / Experiment Analysis (15)

- `shap`: main tool for global and local feature attribution.
- `lime`: local explanations.
- `captum`: attribution and explanation for PyTorch models.
- `alibi`: explanation, counterfactual, and anomaly analysis.
- `dice-ml`: counterfactual explanations.
- `interpret`: glass-box models and explanations.
- `eli5`: weight / feature explanations.
- `yellowbrick`: ML diagnosis visualization.
- `scikit-plot`: result plots for classification / regression.
- `seaborn`: statistical visualization.
- `matplotlib`: low-level plotting.
- `plotly`: interactive analysis plots.
- `bokeh`: interactive browser visualization.
- `altair`: declarative statistical visualization.
- `plotly-resampler`: large time series visualization.

### I. Visualization & Dashboarding (17)

- `matplotlib`: comprehensive 2D plotting.
- `seaborn`: statistical visualization.
- `plotly`: interactive web-based plotting.
- `bokeh`: interactive browser visualization.
- `altair`: declarative visualization.
- `streamlit`: rapid data app framework.
- `dash`: analytical web apps in Python.
- `gradio`: ML demo and web interface builder.
- `superset`: data visualization and exploration platform.
- `vizro`: low-code data visualization toolkit (McKinsey).
- `chartify`: easy chart creation (Spotify).
- `plotly-resampler`: large time series visualization.
- `pyqtgraph`: fast scientific visualization and GUI.
- `mayavi`: 3D scientific data visualization.
- `vedo`: scientific 3D analysis and visualization (VTK).
- `perspective`: streaming data visualization.
- `missingno`: missing data visualization.

### J. Data Entry / Storage / Query (14)

- `openpyxl`: Excel read/write.
- `xlsxwriter`: Excel export.
- `duckdb`: local analytical database.
- `sqlalchemy`: database connection abstraction.
- `sqlite3`: lightweight database.
- `psycopg` / `psycopg2`: PostgreSQL.
- `pymysql`: MySQL.
- `connectorx`: fast database-to-DataFrame loading.
- `s3fs`: object-storage access.
- `fsspec`: unified filesystem abstraction.
- `fastparquet`: Parquet support.
- `orjson`: fast JSON processing.
- `ibis`: Python dataframe API to many backends.
- `datafusion-python`: Apache DataFusion query engine.

### K. NLP & Text for Time Series (10)

- `transformers`: pretrained NLP/ML models.
- `spacy`: industrial-strength NLP.
- `nltk`: classic NLP toolkit.
- `gensim`: topic modeling and document similarity.
- `keybert`: keyword extraction with BERT embeddings.
- `sentence-transformers`: sentence and text embeddings.
- `fasttext`: fast text representation.
- `vaderSentiment`: VADER sentiment analysis.
- `finrobot`: LLM-driven financial analysis agent.
- `finbert`: financial sentiment analysis with BERT.

### L. Data Quality / MLOps / Deployment (14)

- `evidently`: drift and monitoring analysis.
- `great_expectations`: data quality validation.
- `pandera`: DataFrame schema validation.
- `mlflow`: ML lifecycle management.
- `wandb`: experiment tracking and collaboration.
- `bentoml`: model serving.
- `seldon-core`: MLOps deployment framework.
- `prefect`: data workflow orchestration.
- `airflow`: workflow orchestration platform.
- `dagster`: data orchestrator for ML.
- `feast`: feature store.
- `dvc`: data version control.
- `nannyml`: post-deployment ML monitoring.
- `deepchecks`: continuous validation for ML.

### M. Specialized Domain Tools (13)

- `geopandas`: geospatial data manipulation.
- `folium`: interactive map visualization.
- `networkx`: graph/network analysis.
- `igraph`: high-performance graph analysis.
- `yfinance`: Yahoo Finance market data downloader.
- `pandas-ta`: technical analysis indicators.
- `zipline`: algorithmic trading backtesting.
- `backtrader`: backtesting framework.
- `freqtrade`: crypto trading bot framework.
- `MetPy`: meteorological data tools.
- `cartopy`: geospatial map projections.
- `pyEDM`: empirical dynamic modeling for causal inference.
- `cvxpy`: disciplined convex optimization.

## How To Use This Skill

### 1. Prior Role

- When you need to enumerate the Python tool space, use this list first for one round of category coverage.
- If the task is time-series, first check whether tools like `statsmodels`, `sktime`, `aeon`, the Nixtla stack, `darts`, `pytorch-forecasting`, `tsfresh`, `ruptures`, and `adtk` are relevant.
- If the task is about data entry, first check whether tools like `pandas`, `polars`, `pyarrow`, `duckdb`, `sqlalchemy`, `openpyxl`, `pandera`, and `great_expectations` are relevant.

### 2. Experiment Analysis and Explanation

When the task already entered experiment-result analysis, choose tool combinations first from the explain / diagnose / analysis group in this skill instead of inventing tools from zero:

- feature attribution: `shap`, `captum`, `lime`
- statistical tests and effect size: `pingouin`, `scikit-posthocs`, `statsmodels`
- diagnosis and result visualization: `matplotlib`, `seaborn`, `plotly`, `yellowbrick`
- drift / stability / data quality: `evidently`, `pandera`, `great_expectations`

If reflection already entered the stage `why is the error still so large`, do not give only verbal explanation. By default also consider math-modeling tool combinations in parallel, such as:

- residual / component modeling: `statsmodels`, `prophet`, `pymc`
- layered / segmented / state-switch modeling: `statsmodels`, `pymc`, `ruptures`
- constraint and optimization expressions: `cvxpy`, `scipy.optimize`

If experiment analysis exposes new weak points, anomaly patterns, or higher uncertainty, write clearly into the conclusion whether another iteration round should start.

### 2.5 Matplotlib Chinese Fonts and Visual-Diagnosis Suggestions

When the task needs charts with Chinese text, or visual observation is needed to find patterns, prefer the following minimum strategy instead of reading tables only:

- plotting priority: `matplotlib` + `seaborn`, and `plotly` only when needed
- Chinese font candidates to probe first: `Noto Sans CJK SC`, `Source Han Sans SC`, `Microsoft YaHei`, `SimHei`, `WenQuanYi Micro Hei`, or equivalent CJK fonts on the current system
- For Matplotlib font issues, first check:
  - whether `matplotlib.font_manager` can find usable fonts
  - whether Chinese characters render correctly
  - whether minus signs render correctly
  - whether exported PNG / PDF is really readable
- If the default font fails, prefer exploratory steps first: list system fonts, generate font-probe figures or Chinese sample figures, and choose the font after real rendering instead of guessing.
- If local exploration is still stuck, suggest calling `information-collector` in parallel to search official docs, issues, known workarounds, and alternatives instead of fighting on one local thread only.

### 3. Dynamic Cache Refresh

When this skill is loaded and the cache file `repos-cache.jsonc` has `meta.created_at` older than 2 days:

1. The `information-collector` agent should search GitHub for each category using relevant keywords.
2. Merge new repos into the cache; remove repos no longer maintained (`pushed_at` > 1 year ago, not foundational).
3. Increment `meta.version` and update `meta.created_at`.
4. Ensure total repo count stays >= 200.

### 4. Online Recheck After That

For the key tools that will really enter the solution, experiment, or report, go online and confirm:

- whether the official docs are still maintained
- latest PyPI release time
- recent GitHub commits and issue activity
- whether a newer replacement exists

### 5. Output Requirements

- Report covered tool categories and candidate tools first.
- If the task is already in experiment analysis, also report the recommended explain / diagnose / statistical-analysis tool combinations.
- Then say which tools still need online validation.
- Do not treat this skill as a frozen ranking. It is a high-frequency tool prior, not an immutable leaderboard.

## Output Format

- Problem type
- Covered tool categories
- Candidate tool list
- Recommended experiment-analysis / explanation tool combinations
- Tools that should be validated first
- Items that still need online confirmation