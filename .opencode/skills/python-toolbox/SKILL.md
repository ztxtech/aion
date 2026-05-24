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

## High-Priority Built-In Priors (100+)

### A. Numerical Computing and Data Engineering (15)

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

### B. Statistics / Econometrics / Bayesian / Causal (18)

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

### C. Classical ML / AutoML / Explainability (18)

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

### D. General Time-Series Learning and Forecasting (24)

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
- `kats`: Meta time-series analysis toolkit.
- `merlion`: Salesforce time-series intelligence library.
- `timeseria`: time-series processing and modeling.
- `pyts`: time-series classification and transforms.
- `tslearn`: time-series clustering, classification, and metrics.
- `stumpy`: matrix profile / motif / discord.
- `ruptures`: change-point detection.
- `adtk`: anomaly detection toolkit.
- `tsfresh`: automatic feature extraction.
- `tsfel`: feature extraction library.
- `pycatch22`: catch22 features.
- `tsaug`: time-series augmentation.

### E. Deep Learning and Pretraining Related (15)

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
- `tsai`: fastai-style deep learning for time series.
- `gluonts[torch]`: torch-side GluonTS stack.
- `torchts`: supporting time-series deep-learning ecosystem (validate by project).
- `nbeats-pytorch`: N-BEATS implementation projects (validate by project).
- `neuralprophet`: neural Prophet route.

### F. Time-Series Analysis / Signal / Quality Support (12)

- `antropy`: entropy and complexity features.
- `emd-signal`: EMD / CEEMDAN and related decomposition.
- `pywavelets`: wavelet analysis.
- `librosa`: spectrum and time-frequency analysis (can inspire cross-domain work).
- `spectrum`: spectral analysis.
- `statsmodels.tsa`: filtering / decomposition / state space.
- `feature-engine`: feature-engineering components.
- `featuretools`: automatic feature engineering.
- `evidently`: data / model drift monitoring.
- `great_expectations`: data-quality rules.
- `pandera`: DataFrame schema checks.
- `dirty_cat`: dirty-category handling.

### G. Data Entry / Storage / Query (12)

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

### H. Explainability / Diagnosis / Experiment Analysis (16)

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
- `statsmodels.graphics`: statistical diagnosis plots.
- `pingouin`: statistical tests, effect sizes, and power analysis.
- `scikit-posthocs`: multiple comparison and post-hoc testing.
- `evidently`: drift and monitoring analysis for data / models.

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

### 3. Online Recheck After That

For the key tools that will really enter the solution, experiment, or report, go online and confirm:

- whether the official docs are still maintained
- latest PyPI release time
- recent GitHub commits and issue activity
- whether a newer replacement exists

### 4. Output Requirements

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
