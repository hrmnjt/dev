---
name: pr-review
description: Holistic code review for pull requests. Reviews design, security, performance, effectiveness, correctness, and code quality. Use when reviewing code changes, pull requests, or feature branches. Works step by step with tool calls, not in one shot.
---

# PR Review

Holistic code review methodology for pull requests. Reviews the change as a
whole — the PR merges completely or not at all — so focus on the big picture,
not just line-by-line nits.

## Process

Work **step by step, out loud**, using tools. Do NOT generate the review in one
shot — show your work through visible tool calls.

### 1. Understand the Change

- Read commit messages to grasp intent
- Use `git diff --stat <base>...HEAD` to see scope
- Read files central to the change first
- Summarize what the PR does before analyzing

### 2. Analyze by Dimension

Go through files systematically. For each dimension, read relevant code and
note findings with specific file paths and line numbers.

#### Design & Architecture
- Does the solution fit the existing codebase patterns?
- Is the module/class structure clean and logical?
- Are interfaces/APIs well-designed?
- Is there tight coupling or unclear separation of concerns?
- Would a different architectural approach be simpler?

#### Performance
- N+1 queries or unnecessary database round-trips
- Blocking operations on hot paths
- Algorithmic complexity (is it O(n²) where O(n) would do?)
- Unnecessary allocations, memory pressure
- Missing caching where appropriate
- Large dependencies pulled in for trivial functionality

#### Security
- SQL/command/script injection risks
- Missing authentication or authorization checks
- Sensitive data exposure (logs, error messages, client-side)
- Input validation gaps (user input, API payloads)
- Insecure defaults or configurations
- Hardcoded secrets, keys, tokens
- Dependency vulnerabilities

#### Effectiveness
- Does the solution actually solve the stated problem?
- Is there a simpler approach that would work as well?
- Dead code, unreachable paths, leftover debug logic
- Over-engineering: complexity that doesn't earn its keep
- Missing error handling for expected failure modes

#### Correctness
- Edge cases handled or ignored?
- Race conditions and concurrency issues
- Null/undefined safety
- Off-by-one errors
- Incorrect assumptions about data or state
- Type safety gaps

#### Code Quality
- Readability: can another developer understand this quickly?
- Naming: do names convey intent clearly?
- Comments: explain WHY, not WHAT (code should be the WHAT)
- Consistency with surrounding code and project conventions
- DRY: is logic duplicated where it shouldn't be?
- Test coverage: are edge cases tested? Are tests meaningful?

## Output Format

After the step-by-step analysis, compile findings into this structured format
(designed for easy copy-paste into ADO PR comments):

### Holistic Summary
2-3 paragraph overall assessment of the change.

### Dimension Scores (1-5)

| Dimension | Score | Notes |
|-----------|-------|-------|
| Design | ?/5 | |
| Performance | ?/5 | |
| Security | ?/5 | |
| Effectiveness | ?/5 | |
| Correctness | ?/5 | |
| Code Quality | ?/5 | |

### Critical Findings 🔴
Issues that **must** be fixed before merge.

| File | Lines | Issue | Fix |
|------|-------|-------|-----|

### Suggestions 🟡
Improvements worth making but not blocking.

| File | Lines | Issue | Suggestion |
|------|-------|-------|------------|

### Observations 🟢
Positive notes and minor observations.

| File | Lines | Note |
|------|-------|------|

### Security Deep-Dive
(If applicable) Detailed analysis of security-sensitive code paths.
