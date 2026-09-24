# Publishing this repository

**Read this before pushing to GitHub.** The repository has twice ended up
broken on GitHub in the same way, and both times the cause was how the files
were uploaded rather than anything in them.

## What went wrong

The copy on GitHub was checked against the current tree and found to be:

| | |
| --- | --- |
| **completely flat** | every file at the top level; no `src/`, `data/`, `docs/` |
| **missing 144 files** | all 130 reference data files, 8 core modules, 3 tools |
| **a mix of versions** | 66 files current, 33 older, from different uploads |
| **missing `.gitignore`** | dotfiles are skipped |

One of the older files was `equilibrium.js` still carrying the
`thinAirfoil(airfoil, alphaDeg)` bug, which put a 9% error into the zero-lift
angle. The repository was running a defect that had been fixed.

That combination — flat, partial, mixed, no dotfiles — is the signature of
GitHub's web **Add file → Upload files** with **individual files** dragged in.
It drops the folder structure, uploads only what was dragged, and does not
show hidden files. A first user who cloned it could not build it.

## How to publish correctly

**Use git.** This is the only method that preserves the tree exactly.

```bash
# Replace the whole working copy with the release, then commit everything.
cd wingtoolui
git rm -r -q .                       # stage removal of the old flat files
unzip -o ../wingtoolui-release.zip   # the complete tree, folders and all
git add -A                           # includes .gitignore and every folder
git status                           # check: expect src/, data/, docs/ …
git commit -m "Replace flat tree with the complete release"
git push
```

**GitHub Desktop** works the same way: replace the folder contents, and it will
show the new directories as added and the flat files as deleted.

**If you must use the web interface**, drag the **folders** — `src`, `data`,
`docs`, `tests`, `tools`, `dist` — not the files inside them. GitHub's uploader
keeps a folder's structure only when the folder itself is dropped. Then delete
the old flat files at the top level, and add `.gitignore` separately, because
the uploader will not show it.

## Check before and after

```bash
npm run doctor     # is this tree complete? says what is wrong and what to do
```

After pushing, clone it fresh into a new directory and run `npm run doctor`
there. If it passes on a fresh clone, the repository is right. If it reports
the flat layout, the upload flattened it again.

## What a complete tree looks like

```
build.py  package.json  MANIFEST.txt  README.md  …
src/core/        35 modules
src/ui/          index.html, app.js, style.css
data/reference/  134 reference files
docs/            documents and figures
tests/           the test suites
tools/           checks, importers, the doctor
dist/            paraglider-design-tool.html, the built tool
.gitignore
```

`MANIFEST.txt` lists every file with its size, and `npm run doctor` checks the
tree against it.
