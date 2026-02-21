---
name: commit
description: Stage and commit changes following project conventions
argument-hint: "[optional commit message]"
---

Commit the current changes following the project's conventions.

## Process

1. Run `git status` to see what changed. Never use `git add -A` — stage only the files relevant to this change.
2. Run `git diff` (staged + unstaged) to understand what will be committed.
3. Run `git log --oneline -5` to match the repo's commit message style.
4. Stage the relevant files explicitly by name.
5. Write a short, imperative commit message (e.g. "Fix sync stuck in running state"). If `$ARGUMENTS` is provided, use it as the message or as context.
6. **Never** add `Co-Authored-By:` or any AI attribution footer — commit in the user's name only.
7. Show the user the final `git status` after committing.
8. Do **not** push unless the user explicitly asks.
