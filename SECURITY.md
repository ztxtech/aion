# Security Policy

## Supported Versions

AION follows [SemVer](https://semver.org/). Security fixes are applied to the latest minor release and, for severe issues, to the previous minor release for at least 30 days.

| Version | Supported           |
| ------- | ------------------- |
| 0.5.x   | ✅ active           |
| 0.4.x   | ⚠️ critical fixes only |
| < 0.4   | ❌ end of life      |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security problems.**

Report privately by emailing the maintainers at the contact address in [`README.md`](./README.md), or — if you have GitHub access — by using ["Report a vulnerability"](../../security/advisories/new) on the Security tab.

A good report includes:

- A clear description of the issue and the impact (data leak, RCE, privilege escalation, governance bypass, etc.).
- A minimal reproduction: commands, the file / skill / tool / hook involved, and the observed output.
- Environment details: AION version (`aion-ts --version`), OpenCode version, OS, and any dataset / task involved.
- Whether the issue is exploitable in default `aion-ts init .` configurations, or only with specific flags / hooks.

## What to Expect

- **Acknowledgement** within 3 business days.
- **Triage** within 7 days: severity assessment (Critical / High / Medium / Low) and an expected fix window.
- **Coordinated disclosure**: we will work with you on a fix-and-disclose timeline. Default is 90 days from the report, or sooner if a fix is ready.
- **Credit**: reporters are credited in the release notes and (with consent) in the GitHub Security Advisory, unless they prefer to stay anonymous.

## Out-of-Scope

The following are not considered security vulnerabilities in AION's threat model:

- Prompt injection by the **task content** the user supplies — this is an upstream concern of any LLM-driven system; AION's leakage gate is the only defense, and it is designed to fail closed when in doubt.
- Hallucinations or incorrect reasoning by the underlying LLM. AION's critic roles (`ts-critic`, `c-critic`) are the mitigation, not a guarantee.
- Availability issues caused by malformed or hostile third-party datasets. AION treats untrusted datasets as read-only by default (`dataBoundaries.internet_access = false`); untrusted input MUST NOT be executed.

## Governance-Relevant Vulnerabilities

Bypasses of AION's governance are treated as security issues, not just bugs. This includes:

- Skipping the leakage gate (`dataBoundaries`).
- Weakening the authority ordering (`c-critic > ts-critic > main agent > other subagents`).
- Disabling hard gates (ablation, SHAP, residual diagnosis, drift, sensitivity).
- Allowing leaf workers to escape their Reception Contract.

Please flag these explicitly in your report so we can prioritize them.
