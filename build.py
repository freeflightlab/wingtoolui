#!/usr/bin/env python3
"""build.py — bundle the tool into one self-contained HTML file.

The core is written as ES modules so it can be unit-tested under Node and
reasoned about file by file. The delivered tool has to run by double-clicking
it, with no server and no network, because that is how a person building a
wing in a workshop will actually use it — and browsers refuse to load ES
modules over file:// URLs.

So this script strips the import/export keywords and concatenates the modules,
in dependency order, into a single script block. Everything therefore shares
one scope, which makes a duplicate top-level name a silent, hard-to-find bug.
The collision check below turns that into a build failure instead.
"""

import re
import sys
import json
from pathlib import Path

ROOT = Path(__file__).parent
DIST = ROOT / "dist"


def _layout(names):
    """Find the sources, whether the tree is nested or flat.

    The project is laid out as src/core, src/ui, tests, tools, docs, data.
    A checkout does not always arrive that way: copying files out of a build
    artefact, or committing them a directory at a time, flattens everything
    into one folder.

    Probing for a single known file is not enough. Keying on num.js reported
    a flat checkout holding eleven modules as having none at all, because
    num.js happened to be one of the absent ones. So both candidate locations
    are counted and the fuller one wins — which also means an incomplete
    checkout is diagnosed against the layout it actually used.
    """
    nested = ROOT / "src" / "core"
    n_nested = sum(1 for n in names if (nested / n).exists())
    n_flat = sum(1 for n in names if (ROOT / n).exists())
    if n_nested == 0 and n_flat == 0:
        return nested, ROOT / "src" / "ui", "missing"
    if n_flat > n_nested:
        return ROOT, ROOT if (ROOT / "app.js").exists() else ROOT / "src" / "ui", "flat"
    return nested, ROOT / "src" / "ui", "nested"

# Dependency order. num has no dependencies; export depends on the rest.
MODULES = [
    "num.js",
    "planform.js",
    "airfoil.js",
    "atmosphere.js",
    "aero.js",
    "lobe.js",
    "wing3d.js",
    "flatdev.js",
    "ovalization.js",
    "equilibrium.js",
    "lines.js",
    "lineplan.js",
    "risers.js",
    "pma.js",
    "pairing.js",
    "marking.js",
    "viewfit.js",
    "pressure.js",
    "family.js",
    "vribs.js",
    "ribholes.js",
    "reinforcement.js",
    "compare.js",
    "intake.js",
    "ribstress.js",
    "shaping3d.js",
    "inflated.js",
    "trimdrift.js",
    "fabric.js",
    "bom.js",
    "loads.js",
    "scaling.js",
    "export.js",
    "lep.js",
    "xfoil.js",
]

CORE, UI, LAYOUT = _layout(MODULES)

IMPORT_RE = re.compile(r"^\s*import\s+.*?;\s*$", re.MULTILINE | re.DOTALL)
EXPORT_DECL_RE = re.compile(r"^\s*export\s+(?=(?:default\s+)?(?:function|const|let|var|class))", re.MULTILINE)
EXPORT_LIST_RE = re.compile(r"^\s*export\s*\{[^}]*\}\s*;?\s*$", re.MULTILINE)

TOP_LEVEL_RE = re.compile(
    r"^(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)",
    re.MULTILINE,
)


def strip_module(text: str) -> str:
    text = IMPORT_RE.sub("", text)
    text = EXPORT_LIST_RE.sub("", text)
    text = EXPORT_DECL_RE.sub("", text)
    return text.strip()


def collect_names(text: str):
    return TOP_LEVEL_RE.findall(text)


def _missing_report(names):
    """Name every missing module, not just the first.

    A checkout missing half the core reports one filename at a time, and each
    fix reveals the next. Listing them together says plainly that the
    checkout is incomplete rather than that one file is misplaced.
    """
    absent = [n for n in names if not (CORE / n).exists()]
    if not absent:
        return None
    lines = [
        f"build: {len(absent)} of {len(names)} core modules are missing"
        f" (looked in {CORE}, layout '{LAYOUT}')",
        "",
    ]
    lines += [f"  {n}" for n in absent]
    lines += ["", "What to do:", ""]
    if LAYOUT == "flat":
        # This is the specific case a first user hit: they cloned a repository
        # still holding the OLD flat layout, where every file sat at the top
        # level and several were never committed at all. The build found
        # enough files to guess "flat" and then failed on the rest, which
        # reads like a bug in the tool rather than a stale checkout.
        lines += [
            "  This tree is the OLD FLAT LAYOUT: source files at the top",
            "  level rather than under src/core. That layout was replaced,",
            "  and several modules were never committed to it — which is why",
            "  they are missing here.",
            "",
            "  It cannot be repaired by adding the missing files. Replace the",
            "  whole tree with a current release, which is laid out as:",
            "",
            "      src/core/    the modules listed above",
            "      src/ui/      index.html, app.js, style.css",
            "      tests/  tools/  data/reference/  docs/",
            "      build.py  package.json  MANIFEST.txt",
            "",
            "  Then: npm run build && npm run check",
            "",
            "  A flat tree is what GitHub's web uploader makes when files are",
            "  dragged in one at a time. PUBLISHING.md says how to avoid it.",
        ]
    else:
        lines += [
            "  A checkout needs every file in MANIFEST.txt: the core modules,",
            "  src/ui, build.py, tests, tools and data/reference.",
            "",
            "  Committing only the files that changed leaves a tree that",
            "  cannot build or be tested. Take a complete release rather than",
            "  adding the files above one at a time — anything missing from",
            "  MANIFEST.txt is missing for a reason you cannot see from here.",
            "",
            "  Then: npm run build && npm run check",
        ]
    return "\n".join(lines)


def build():
    problem = _missing_report(MODULES)
    if problem:
        print(problem)
        raise SystemExit(1)

    seen = {}
    collisions = []
    chunks = []

    for name in MODULES:
        path = CORE / name
        if not path.exists():
            sys.exit(f"build: missing module {path}")
        raw = path.read_text()

        for ident in collect_names(raw):
            if ident in seen and seen[ident] != name:
                collisions.append(f"  {ident!r} declared in both {seen[ident]} and {name}")
            seen[ident] = name

        chunks.append(f"/* ===== {name} ===== */\n{strip_module(raw)}")

    if collisions:
        sys.exit(
            "build: duplicate top-level names would collide in the bundle:\n"
            + "\n".join(collisions)
            + "\n\nRename one of each pair, then rebuild."
        )

    core_js = "\n\n".join(chunks)

    # Real measured line lengths, embedded so the tool can diff a design
    # against a production wing offline.
    #
    # The data has been in data/reference/ since the Niviuk import and the
    # comparison has existed since Phase 2, but nothing in the interface could
    # reach either — the tool is a single offline file, so anything it needs
    # has to be built in.
    totals = {}
    for f in sorted((ROOT / "data" / "reference").glob("*-totals.tsv")):
        rows = {}
        for line in f.read_text().splitlines():
            if not line or line.startswith("#") or line.startswith("anchor"):
                continue
            a, row, mm = line.split("\t")
            rows.setdefault(a, {})[row] = int(mm)
        key = f.name.replace("-totals.tsv", "")
        totals[key] = rows
    reference_js = "const REFERENCE_TOTALS = " + json.dumps(totals, separators=(",", ":")) + ";"

    # The full line-material catalogue, embedded.
    #
    # `DEFAULT_LINE_TABLE` carries 21 lines; `data/reference/line-materials.tsv`
    # has 78 across four brands. The wider table has been in the repository and
    # unreachable, so a designer could not choose what to build from.
    mats = (ROOT / "data" / "reference" / "line-materials.tsv").read_text()
    reference_js += "\nconst LINE_MATERIALS_TSV = " + json.dumps(mats) + ";"

    # Every published wing, as a starting point.
    #
    # `REFERENCE_LIB` in app.js was twenty designs typed in by hand, covering
    # seven families. The data files hold 55 sizes across eleven, including
    # every Niviuk — so two thirds of the wings this project validates against
    # could not be loaded as a starting point in the tool that validates them.
    #
    # Generated here so adding a reference file adds a wing, with no second
    # list to keep in step.
    import re as _re
    lib = []
    for f in sorted((ROOT / "data" / "reference").glob("*.tsv")):
        if not _re.search(r"(-spec|families)\.tsv$", f.name):
            continue
        rows = [l for l in f.read_text().splitlines()
                if l.strip() and not l.startswith("#")]
        if not rows:
            continue
        head = rows[0].split("\t")
        idx = {name: head.index(name) for name in head}
        # The real column names, read from the file's own header rather than
        # assumed: `size` not `name`, `flat_span_m` not `flat_span`. Guessing
        # them produced a library of zero wings, silently.
        need = ["family", "size", "flat_area_m2", "flat_span_m", "flat_AR",
                "cells", "root_chord_m", "proj_area_m2"]
        if not all(n in idx for n in need):
            continue
        for line in rows[1:]:
            c = line.split("\t")
            try:
                lib.append([c[idx["family"]], c[idx["size"]],
                            float(c[idx["flat_area_m2"]]),
                            float(c[idx["flat_span_m"]]),
                            float(c[idx["flat_AR"]]), int(float(c[idx["cells"]])),
                            float(c[idx["root_chord_m"]]),
                            float(c[idx["proj_area_m2"]])])
            except (ValueError, IndexError, KeyError):
                continue
    reference_js += ("\nconst REFERENCE_WINGS = "
                     + json.dumps(lib, separators=(",", ":")) + ";")

    # The Swoop2: a complete design, not just a specification.
    swoop = (ROOT / "data" / "reference" / "lep" / "swoop2-20260829.lep")
    reference_js += ("\nconst SWOOP2_LEP = "
                     + json.dumps(swoop.read_text() if swoop.exists() else "") + ";")

    shell = (UI / "index.html").read_text()
    app = (UI / "app.js").read_text()
    css = (UI / "style.css").read_text()

    html = shell.replace("/*__CSS__*/", css)
    html = html.replace("/*__CORE__*/", core_js + "\n\n" + reference_js)
    html = html.replace("/*__APP__*/", app)

    DIST.mkdir(exist_ok=True)
    out = DIST / "paraglider-design-tool.html"
    out.write_text(html)

    kb = len(html.encode()) / 1024
    print(f"build: wrote {out} ({kb:.0f} KB, {len(MODULES)} core modules, {len(seen)} top-level names)")


if __name__ == "__main__":
    build()
