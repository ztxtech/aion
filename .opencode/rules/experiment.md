# Aion Experiment Rules

## Debug Prefix Protocol

- When this rule is quoted, executed, or explained, print this first: `[Rules: experiment] Follow: <why this rule is used now>; Current step: <one-line note>`
- Say what this rule is constraining right now, then continue with the main content.

- benchmark-first: run the smallest baseline first, then try complex methods.
- Define task family, data split, metrics, and stop rules before building the experiment matrix.
- Separate three problem types: execution failure, implementation failure, and decision failure. Do not merge them into one line like "bad result".
- Do not write target values, expected values, hand-edited values, or placeholder values as experiment conclusions.
- Results must be reproducible, traceable, and comparable. Keep at least configs, logs, core metrics, and failure info.
- Do ablation, multi-seed runs, or stability checks when possible. If not possible, say the reason and the risk clearly.
- Do engineering with research-level care: keep baseline, strong nearby variants, and latest-method ideas alive when cost is still okay. If external search brings back a new method that may change the conclusion, do at least a minimal viability check or record the rejection reason clearly.
- If online information is thin, outside material is clearly not enough, platform articles repeat the same thing, or no executable gain can be found, the main experiment path should switch to local validation by default: minimal repro, sanity check, slice experiment, local probe, synthetic sample, script-level smoke test, or local ablation. Do not stop at vague judgment just because web info is limited.
- If the task runs on a platform, contest, or benchmark host, read the platform rules before experiments: submit quota, daily limit, cooldown, eval delay, public/private leaderboard rules, code/resource limits, and submit format constraints.
- For platform tasks with scarce submit chances, the default rhythm is `local benchmark first, platform submission later`: finish enough local baselines, slice checks, and error analysis first, then submit stronger candidates to the platform. Do not use limited submissions as a daily tuning tool.
- Before experiments start, first check whether the model can be used directly, or with zero-shot / few-shot / frozen-backbone / light adaptation. Do not treat "train first" as the default path.
- For open-ended problems, as long as the main metric, scoring function, or target threshold is known, the experiment must follow the loop `metric -> error analysis -> analysis tools -> adjustment -> re-validate`, not one score run and then a closeout discussion.
- Error analysis should cover at least these angles by default: slices / cohorts, error buckets, failure cases, residual structure, feature importance / attribution, time range / horizon, data cleaning, prompts / reasoning chain, and model / hyperparameter / postprocess. Do not look only at one score and human guess.
- In this round of error analysis, do not rely only on language-style explanation. In parallel, check whether the whole error problem can be rewritten from a math-modeling view, such as residual modeling, error decomposition, layered / segmented models, state-switch models, trend / season / event component modeling, noise models, or constrained optimization views.
- As long as such a modeling view can expose the root cause faster, use it first to help locate the issue, then decide whether to tune or switch path. Do not downgrade math modeling to an optional afterthought.
- The stop condition cannot be only "hard to improve". It must mean the method already beats others, reaches the target goal, or there is verified evidence that more work on this route is no longer on the Pareto front.
- Judge experiment conclusions together with time cost and engineering complexity, not with one number only.
- For time-series benchmarks, prefer showing results under multiple history lengths, so one context length does not hide length-sensitive failures.
- For event-driven tasks, record whether the event is `DETECTED` or `INJECTED`, and keep event boundaries, injection parameters, or detection hyperparameters.
- Qualitative labels or soft judgments should prefer robust statistics and support checks. When evidence is weak, `Uncertain` / `Inconclusive` is allowed. Do not force hard labels.
- The experiment flow should prefer `write structured results first, then make plots in one place`. Do not hard-couple plotting logic into the training main flow.
- Put plotting code in `scripts/plot/` at the project root. Use separate scripts to read experiment results and then make plots.
- Structured experiment results should be saved first in reusable formats like JSON / CSV / parquet, then report and plotting layers may read them.
- The default test loop is: save structured results -> make plots with `scripts/plot/` -> visual semantic analysis -> targeted testing / slice validation from the plots -> self-critique -> `ts-critic` review again. If one link is missing, the experiment loop is not complete.
- Post-experiment hypothesis analysis is required before closeout: finish SHAP / feature attribution or an equivalent explanation analysis, then close the loop with error distribution, residual diagnosis, failure cases, or statistical tests. If it is not done, keep working. Do not stop with that gap still open.
- If the current task needs a report, once structured results or plots already exist, they must be consumed in the report body or appendix. At least include a main result table / key metric summary, figure references, relative paths, and usage notes.
- For experiment results, add at least one round of visual diagnosis by default, for example actual vs forecast, error distribution, residual plots, slice plots, or outlier / drift plots. Do not conclude from table metrics only.
- Once a figure enters the Markdown body, it must be followed by an analysis paragraph right after it, not only a caption or file path.
- If plots contain Chinese labels, titles, legends, or notes, explicitly check the font rendering. If default Matplotlib fonts are not compatible, switch to a Chinese-safe font first, then keep plotting.
