# Phase Execution Status

This file tracks the implementation progress for the multi-phase hardening plan.

## Phase 0 - Security and Guardrails

Status: In progress

Completed:
- Removed hardcoded production credentials from backend migration utility.
- Added environment-variable and interactive credential flow for migration script.
- Added secret scanning script at mobile-app/scripts/scan-secrets.mjs.
- Enforced secret scanning in pre-commit hook before lint-staged.

Remaining:
- Rotate compromised credentials in production.
- Optionally add CI secret scanning (for example, gitleaks) in pipeline.

## Phase 1 - Stabilization Baseline

Status: In progress

Completed:
- Removed invalid eslint disable directives that referenced a missing rule.
- Fixed empty catch blocks in critical onboarding flow files.

Remaining:
- Reduce remaining lint errors and warnings in large modules.
- Continue replacing any with typed domain models in hotspots.

## Phase 2 - Functional Reliability

Status: In progress

Completed:
- Reduced web deprecation warnings by migrating tooltip pointerEvents usage to style-based behavior in high-traffic charts.
- Kept native behavior intact while applying web-safe pointer events handling in overlay containers.

Remaining:
- Investigate and mitigate recurring expo-server stream-pipe warning under web dev server.
- Add focused regression tests around onboarding/setup and holdings overview edge paths.

## Phase 3 - UI and UX Improvements

Status: Started

Completed:
- Improved chart tooltip interaction consistency for web behavior.

Remaining:
- Break up oversized tab screens into smaller feature sections.
- Standardize table interactions, empty states, and error feedback patterns.

## Phase 4 - Architecture and Performance

Status: Planned

Planned:
- Introduce stricter API-to-UI mapper types to reduce any usage.
- Split large feature components into composable modules.
- Add query cache/stale-time optimization for heavy overview data.
