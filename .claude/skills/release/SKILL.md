---
name: release
description: Cut a new release: update CHANGELOG, bump version, commit, push, and tag
argument-hint: "<version> (e.g. 3.22.0)"
---

Cut a new release for scdl-web. The version number is: $ARGUMENTS

## Process

1. **CHANGELOG.md** — move all bullet points under `## [Unreleased]` into a new section:
   ```
   ## [X.Y.Z] - YYYY-MM-DD
   ```
   Leave an empty `## [Unreleased]` block at the top.

2. **wails.json** — set `info.productVersion` to the new version number (without the `v` prefix).

3. Commit both files (no other files):
   ```
   Release vX.Y.Z
   ```
   No `Co-Authored-By:` footer.

4. Push the commit: `git push`

5. Create and push the tag — this triggers CI which builds the Windows installer and Linux AppImages and creates the GitHub release automatically:
   ```
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```

6. Confirm the tag was pushed and let the user know the GitHub Actions workflow will handle the rest.
