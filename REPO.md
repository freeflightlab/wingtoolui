# What to commit

The repository is currently **flat** — every file at the top level, no
directories. That happened one file at a time, and it has three consequences
that are easy to miss because the built tool still works.

## What is wrong now

**Thirteen of twenty-five core modules are absent.** `num.js`, `planform.js`,
`airfoil.js`, `atmosphere.js`, `aero.js`, `lobe.js`, `wing3d.js`,
`ovalization.js`, `equilibrium.js`, `lines.js`, `export.js`, `xfoil.js` and
`bom.js` have never been committed. The build cannot run.

**`build.py`, `src/ui/` and `data/reference/` are absent too.** No bundler, no
interface sources, none of the 72 production data files the validation rests
on.

**The tests cannot run even with every file present**, because the flat layout
breaks their imports. `tests/run-tests.js` imports `'../src/core/num.js'`;
there is no arrangement of a single directory in which that resolves.

None of this is visible from using the tool. `paraglider-design-tool.html` is
self-contained — it inlines every module at build time — so it opens and runs
perfectly from a repository that can no longer produce it.

## What to commit instead

The directory structure, as it comes out of the packaged output:

```
MANIFEST.txt  README.md  ROADMAP.md  REPO.md  build.py
src/core/     25 modules
src/ui/       index.html, style.css, app.js
tests/        run-tests.js, benchmark.js
tools/        audit.mjs, manifest.mjs, make-diagrams.mjs, read_xls.py
docs/         11 notes and 6 figures
data/reference/  72 files
dist/         paraglider-design-tool.html
```

`MANIFEST.txt` lists every file with its size. `node tools/audit.mjs` checks a
checkout against it and names what is absent; run against the current
repository it reports the tree as incomplete before doing anything else.

## Two things made robust anyway

**`build.py` accepts either layout** and reports every missing module at once
rather than failing on the first, so a partial checkout says plainly that it is
partial.

**Figures live beside the documents that use them** rather than in
`docs/img/`. A document and its figure are always siblings, which is the one
arrangement that survives both a nested tree and a flattened one — so the
images in the documentation resolve either way.
