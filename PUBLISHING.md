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

## Why replace rather than merge

The broken copy and the release do not overlap tidily. The old copy has
`equilibrium.js` at the top level; the release has `src/core/equilibrium.js`.
Git sees those as two different files. If you only add the release, the old
flat copies **stay**, and the build picks the wrong ones — that is precisely
how the repository ended up mixing 66 current files with 33 older ones.

So the old files have to be removed in the same commit that adds the new tree.

## The commands

Each of these was run against a copy of the current repository before being
written down, and the result was cloned fresh and tested.

```bash
cd wingtoolui
git rm -r -q .
```

`git rm -r .` removes every **tracked** file from the folder and stages the
removal. Your working folder will look empty apart from `.git`. That is
expected, and nothing is lost: the old files are still in the repository's
history, and the commit has not happened yet. If you want to stop at this
point, `git checkout .` puts everything back.

```bash
unzip -o /path/to/wingtoolui-release.zip
```

Unpacks the complete tree — folders, `.gitignore` and all — into the now-empty
folder.

```bash
git add -A
git status
```

`-A` stages everything, including the deletions and the dotfiles. Over the
tree GitHub holds now, `git status` reports what the release changed —
modified files, and added ones for anything new, all with slashes in their
paths: `src/core/...`, `docs/...`. A deletion means the release retired a
file, and its notes say which. (The first replacement, of the flat copy,
reported 99 deletions and 245 additions.)

> **If the additions have no slashes, stop.** The tree is flat and committing
> it will break the repository again.

`LICENSE` should not be in the list at all. The release carries the
repository's own file, byte for byte, so replacing the tree leaves it as it
was. If `git status` shows it modified or deleted, stop: the release is not
the one the checks passed (the self-audit holds `LICENSE` to the GPL's checksum).

```bash
git commit -m "Release $(node -p "require('./package.json').version")"
git push
```

The release's version is `package.json`'s and `CHANGELOG.md` says what it
changed; the page shows it beside its name. On the push, GitHub runs
`.github/workflows/check.yml`: it builds the page, fails if the committed
one is not what the sources build, and runs every check stage — the
repository's **Actions** tab shows the result.

## Check it worked

Clone the pushed repository into a **new** folder and run the doctor there.
Checking the folder you just worked in proves nothing, because that folder is
correct whether or not the push was.

```bash
cd ..
git clone https://github.com/freeflightlab/wingtoolui wingtoolui-check
cd wingtoolui-check
npm run doctor
```

Expected:

```
This checkout is complete. Next: npm run build && npm run check
```

If instead it says the tree is the old flat layout, the upload flattened it
again — see the note on the web interface below.

## If you use the web interface

GitHub's **Add file → Upload files** keeps a folder's structure only when you
drop the **folder**. Dropping the files from inside it flattens them, which is
what happened here.

So drag `src`, `data`, `docs`, `tests`, `tools` and `dist` as folders, then
delete the old flat files at the top level, and add `.gitignore` and
`.github/workflows/check.yml` by hand — the uploader does not show hidden
files or folders.

Using git is simpler and is the only way that is hard to get wrong.

## What a complete tree looks like

```
build.py  package.json  MANIFEST.txt  README.md  CHANGELOG.md  LICENSE  …
src/core/        40 modules
src/ui/          index.html, app.js, style.css
data/reference/  143 tables, CATALOGUE.md, and lep/ with three designs' files
docs/            documents and figures
tests/           the test suites
tools/           checks, importers, the doctor
dist/            paraglider-design-tool.html, the built tool
.github/         workflows/check.yml, the checks GitHub runs on a push
.gitignore
```

`MANIFEST.txt` lists every file with its size, and `npm run doctor` checks the
tree against it.
