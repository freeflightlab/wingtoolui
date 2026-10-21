# Building the reference database

Instructions for collecting paraglider data in a **separate conversation**,
in a form that can be brought straight back into the design-tool project.

You do not need any context from the tool to follow this. Everything needed
is below.

---

## 1. What this is for

The design tool is validated against real production wings rather than against
itself. Every scaling law, line-length law and load model in it is checked
against published manufacturer data, and several were **corrected** by that
data — a two-liner correction that turned out to be wrong, a line-length law
that looked affine and was not, a set of row-load shares that disagreed with
the convention.

More wings make those checks stronger and would settle several open questions
listed in §6.

**Current database: 18 wings, 6 manufacturers, 80 size sheets.** The full
inventory is in `data/reference/CATALOGUE.md`.

---

## 2. What one wing needs

In rough order of value. A wing with only the first item is still worth
adding.

### a. Technical specification (highest value, easiest to find)

Almost always in the manual or on the product page. One row per size:

```
size, cell count, flat area m², flat span m, flat aspect ratio,
projected area m², projected span m, min/max chord m, glider weight kg,
certified weight range kg, line consumption m, riser length mm,
speedbar travel mm, trimmer travel mm, certification
```

Not every wing publishes all of these. **Record what is published and leave
the rest blank** — a blank is information; a guess is not.

### b. Line lengths

Either or both:

- **Total line lengths** — sail attachment point to the harness, per line.
  These are what a check centre measures against.
- **Single line lengths** — each individual line, per size.

Both usually appear as a table with a line reference (`A1`, `am3`, `2AB2`,
`br7`) and a length in millimetres.

**Critical:** note whether the lengths **include the risers**. Manufacturers
differ, and the difference is a few hundred millimetres on *every line*. If
the source does not say, record that it does not say.

### c. Line materials

Per line: the material reference (`Edelrid 8001-190`, `Liros DC 60`,
`PPSLS 125`), the colour, and any construction note ("double spliced both
sides", "loop cover"). Some makers also give a **loop length** and a
**cutting length** separately — capture both if present; they are different
quantities and both are used.

### d. Line plan / rigging diagram

A drawing showing which upper lines join which middles, and which middles
join which mains. Transcribe it one line a row, with the line it hangs from,
as `data/reference/lineplan-<design>.tsv` (`parseStatedTopology`):

```
# convention: up
line    parent     also
a1      A1
A1      Amain1
Amain1  riser A
sa1     ST1        a13
```

A parent that is not a line is where the cascade ends — `riser X`, `handle`
for the brake, `riser S` where the drawing does not say which riser the
stabilo is on. `also` is another sheet's name for the same line. If the
drawing numbers its ribs, note where each row's last line and the stabilo's
lines are: that is the only evidence for where rows end
(`docs/drawn-line-plans.md`, section 5).

### e. Riser geometry

Length of each riser at trim and at full speedbar, per size. Rare but
valuable — very few manufacturers publish it.

---

## 3. The output format

**One TSV file per wing per size.** Tab-separated, first row a header. Keep
the manufacturer's own line names exactly — the tool reads seven naming
conventions and normalising them destroys information.

### Line sheet

This exact format is read by `parseSimpleLineSheet`, and there is a test that
keeps it working. It was checked by writing a file to the spec below and
parsing it — the first version of these instructions described a format **no
reader accepted**, which is worth catching before fifty wings are transcribed
into it.

```
name	length_mm	material	colour	comment
a1	295	DC 60	white	double spliced both sides
a2	280	DC 60	white	double spliced both sides
A1	1238	8001-90	blue
```

Optional extra columns where the source gives them, named exactly:
`loop_mm`, `cutting_mm`, `quantity`, `total_length_mm`.

**Column order does not matter** and extra columns are ignored — the header is
read by name. Comma-separated works too, which is what a spreadsheet exports.
Lines beginning `#` are treated as provenance and kept.

Two of those `#` lines are read as keys, and are worth writing:

```
# measure: single-line            or   total-including-risers
# convention: up
```

`measure` says what a length in the file is. A sheet of sail-to-harness
totals read as single lines fails every check a cascade is held to, and
eight such sheets sat in the reference set saying the wrong one.

`convention: up` is for a sheet in UP Paragliders' naming, where `A1` is the
line *under* the canopy line `a1` and `BR1` is a brake line. Without it a
bare name is read Ozone's way (`A1` a canopy line, `BR1` the B row's first
main).

Otherwise the levels are settled on the sheet as a whole, so write the names
as the maker does: where the canopy lines are in lower case, a bare
upper-case name (`C1`) is read as the level below, and a number in front
(`2A1`, `3A1`) as a level that depends on how many the wing has.

### Specification

One file, one row per size, with the column names the reader takes
(`parseSizeFamilies`; a name it does not know is not read, and this example
gave nine of them wrongly until 2026-10-21):

```
family	size	cells	flat_span_m	flat_area_m2	flat_AR	proj_span_m	proj_area_m2	root_chord_m	mass_kg	weight_lo_kg	weight_hi_kg	total_line_m	line_pieces	application	certification	aspect_class	proj_AR
Ozone Rush 6	S	57	10.60	21.50	5.22	8.55	18.30	2.55	4.55	70	90	230		XC	EN B	mid
```

Where a maker publishes the projected aspect ratio and not the projected span,
as Niviuk do, put it in `proj_AR` as printed and leave `proj_span_m` blank: the
tool derives the span from it and the projected area, and says so.

### Naming files

```
<maker>-<model>-<size>.tsv        e.g.  ozone-rush6-MS.tsv
<maker>-<model>-spec.tsv          e.g.  ozone-rush6-spec.tsv
```

Lowercase, hyphens, no spaces.

---

## 4. Provenance — do this for every wing

Add a header comment naming where the numbers came from:

```
# Ozone Rush 6, size MS
# Source: Rush 6 user manual v1.2, February 2024, page 14
# Lengths: total line lengths, INCLUDING risers
# Retrieved: 2026-08-25
```

This matters more than it looks. Two of the corrections in the project came
from noticing that two sources measured *different quantities* under the same
name — and one of them was mine: the tool was publishing design lengths where
the inspection standard asks for lengths measured at 5 daN, a systematic error
of up to 20 mm on every line.

The reader picks up `including risers` / `excluding risers` from these
comments automatically. If neither appears it records "unknown" rather than
assuming.

---

## 5. Rules

**Transcribe, do not compute.** If a source gives area and span but not aspect
ratio, leave aspect ratio blank. The tool computes derived values and checks
them against published ones — that check is only meaningful if the published
figure is genuinely published.

**Do not fill gaps by interpolation.** A missing size is missing.

**Flag internal inconsistencies rather than fixing them.** One sheet already
in the database has cutting lengths that disagree with its own length-plus-loop
by 3%. That is recorded, not corrected, and it is useful precisely because it
is recorded.

**Keep the maker's units.** Millimetres for lines, metres for spans, as
published. Note the unit in the header if it is unusual.

---

## 6. What extra data would settle

Specific open questions, so collection can be aimed rather than broad:

| question | what would settle it |
| --- | --- |
| Why the Alpina 5 and Allegro light differ by 9.7% in line length at the same aspect ratio | more two-liners and three-liners at matched AR, with cell counts |
| Why the Lynx 2 carries 7% more line than its aspect ratio suggests, at every size | another 2.5-liner, with its line sheets |
| Whether a maker's published total line length is its lineset | the line sheets beside the specification, for any family — BGD's table goes with area and its sheets with span |
| Whether the front-to-rear anchor density ratio really tracks riser count | any wing with per-row line counts — **19 designs** now, three of them with three load-bearing rows, and that range (2.58 to 3.75) nearly touches the four-row one (1.00 to 2.50) |
| Whether riser count affects line consumption at all | a **low-aspect two-liner** or a **high-aspect three-liner** — the two are still partly confounded |
| What a line carries in flight, row by row | measured riser or line loads on any wing: every strength factor here rests on a modelled split |
| The real collapse dynamic factor | any published collapse or shock-load test data |
| Trimmer geometry | riser lengths at trim, full bar, and full trimmer, for any wing that has trimmers |

Wings that would help most: anything **not** from Ozone, UP, PHI, BGD, Skywalk
or Niviuk — the database is still Ozone-weighted. Advance, Nova, Gin, Supair,
Swing, Sol, Icaro, Flow, 777 and AirDesign are all unrepresented.

**Single-surface wings are now the most valuable single category.** Niviuk's
Skin 4 P and Bi Skin 2 P showed that the line-length law does not cover them —
they carry 69% more line for the same area — and two of them is not enough to
fit a replacement.

Tandems and paramotor wings are also thin: one tandem and no paramotor wing
with published trimmer travel.

---

## 7. Bringing it back

Paste the TSV files into the design-tool conversation, or attach them. Say
which are line sheets and which are specifications. The tool will:

1. parse them with the existing readers (seven naming conventions, four sheet
   formats);
2. run them through the whole validation sweep;
3. report anything that does not fit — which is the interesting part.

If a file does not parse, that is a finding about the format, not a failure of
the collection. Send it anyway.

---

## 8. Appendix: the naming conventions already understood

You do not need to normalise to any of these; they are listed so you can
recognise that an unfamiliar scheme is worth capturing verbatim.

| form | example | meaning |
| --- | --- | --- |
| uppercase + level | `A1` `AM6` `AR2` | Ozone: row, level, index |
| lowercase canopy | `a1` `b12` | PHI, BGD, Skywalk: top lines |
| roman numerals | `AI` `CVI` | UP: upper-main level |
| `main` suffix | `Amain1` `BRmain` | UP: main lines |
| level as prefix | `1A3` `2AB2` | Advance: level first, rows can be *pairs* |
| combined rows | `DE1` `ABM1` | one line serving two rows |
| stabilo | `sa1` `st3` | UP names it; most makers do not |

Brake lines appear as `K`, `Br`, `br` or `BR` depending on maker.

---

## 9. Checking the reference set itself

`size-families.tsv` is what this project measures everything against — cell
counts, areas, spans, chords. **Nothing checked that it was right.** A wrong
cell count there would quietly bend every result that depends on rib spacing,
and it would look like a modelling error rather than a typo.

`published-specs.tsv` holds the manufacturers' own tables, transcribed
separately. A single file cannot check itself.

**72 figures across 12 sizes, zero disagreements.** The Ultralite 5 is 34
cells and the Geo 7 is 48, both as published, and every area, span, aspect
ratio, root chord and projected area matches too.

Where a maker's manual and website differ slightly — the Geo 7 manual says
22.1 m² and AR 5.15 where the website says 22.2 and 5.16 — the website table
is used, because that is what it says. Inventing a reconciliation would hide
the difference.

Only two families are covered so far. The other nine in the reference set are
still unchecked against their makers, and that is the next piece of this work.
