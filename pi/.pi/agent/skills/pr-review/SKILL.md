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
- SSRF via user-supplied URLs
- Open redirects not validated against trusted domains

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

## Determining What to Flag

Flag issues that:
1. Meaningfully impact correctness, performance, security, or maintainability
2. Are discrete and actionable (not multiple issues combined into one)
3. Were introduced in the changes being reviewed (not pre-existing issues unless
   the change makes them worse)
4. The author would likely fix if they knew about them
5. Have provable impact — identify the specific parts affected, don't speculate
6. Demand rigor consistent with the rest of the codebase

## Priority Levels

Tag each finding with a priority level:

| Level | Meaning |
|-------|---------|
| **P0** | Drop everything to fix. Blocking release/operations. Only for universal issues. |
| **P1** | Urgent. Should be addressed in the next cycle. |
| **P2** | Normal. To be fixed eventually. |
| **P3** | Low. Nice to have. |

## Comment Guidelines

1. Be clear about *why* the issue is a problem, not just what it is
2. Communicate severity appropriately — don't exaggerate
3. Be brief — at most 1 paragraph per finding
4. Keep code snippets under 3 lines when providing fix examples
5. Explicitly state scenarios or environments where the issue arises
6. Use a matter-of-fact tone — helpful reviewer, not accusatory
7. Avoid flattery or unhelpful phrases like "Great job on..."

## Untrusted User Input

When reviewing code that handles user input:
1. Flag open redirects — they must validate against trusted domains only
2. Flag SQL that is not parameterized
3. Flag HTTP fetches with user-supplied URLs that aren't protected against
   access to local resources (SSRF)
4. Prefer escaping over sanitizing where possible (e.g., HTML escaping)

## Error Handling (Fail-Fast)

When reviewing added or modified error handling:
1. Evaluate every new or changed `try/catch`: identify what can fail and why
   local handling is correct at that exact layer
2. Silent local error recovery (especially parsing, IO, or network fallbacks)
   is a high-signal review candidate unless there is explicit justification
3. If a catch exists only to satisfy lint/style without real handling, flag it
4. When uncertain, prefer crashing fast over silent degradation

## Output Format

After the step-by-step analysis, compile findings into this structured format
(designed for easy copy-paste into ADO PR comments):

### Holistic Summary
2-3 paragraph overall assessment of the change.

### Verdict
`correct` (no blocking issues) or `needs attention` (has P0/P1 issues).

### Dimension Scores (1-5)

| Dimension | Score | Notes |
|-----------|-------|-------|
| Design | ?/5 | |
| Performance | ?/5 | |
| Security | ?/5 | |
| Effectiveness | ?/5 | |
| Correctness | ?/5 | |
| Code Quality | ?/5 | |

### Findings

List each finding with its priority tag, file location, and explanation.
Keep line references short (avoid ranges over 5-10 lines). Only flag code that
overlaps with the actual diff — don't flag pre-existing code.

| Priority | File | Lines | Issue | Recommendation |
|----------|------|-------|-------|----------------|
| P0 | `path/to/file` | 42 | ... | ... |
| P1 | `path/to/file` | 15 | ... | ... |
| P2 | `path/to/file` | 78 | ... | ... |
| P3 | `path/to/file` | 100 | ... | ... |

### Human Reviewer Callouts (Non-Blocking)

Include only those that apply. These are informational for the human reviewer,
not fix items. Do not include them in Findings unless there is an independent
defect. These callouts alone must not change the verdict.

- **This change adds a database migration:** <files/details>
- **This change introduces a new dependency:** <package(s)/details>
- **This change changes a dependency (or the lockfile):** <files/package(s)/details>
- **This change modifies auth/permission behavior:** <what changed and where>
- **This change introduces backwards-incompatible public schema/API/contract changes:** <what changed and where>
- **This change includes irreversible or destructive operations:** <operation and scope>

If none apply, write: *(none)*

### Security Deep-Dive
(If applicable) Detailed analysis of security-sensitive code paths.
