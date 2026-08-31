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
    lines += [
        "",
        "A checkout needs every file listed in MANIFEST.txt: the core modules,",
        "src/ui, build.py, tests, tools and data/reference. Committing only the",
        "files that changed leaves a tree that cannot build or be tested.",
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

    shell = (UI / "index.html").read_text()
    app = (UI / "app.js").read_text()
    css = (UI / "style.css").read_text()

    html = shell.replace("/*__CSS__*/", css)
    html = html.replace("/*__CORE__*/", core_js)
    html = html.replace("/*__APP__*/", app)

    DIST.mkdir(exist_ok=True)
    out = DIST / "paraglider-design-tool.html"
    out.write_text(html)

    kb = len(html.encode()) / 1024
    print(f"build: wrote {out} ({kb:.0f} KB, {len(MODULES)} core modules, {len(seen)} top-level names)")


if __name__ == "__main__":
    build()
