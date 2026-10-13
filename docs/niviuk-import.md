# Niviuk: importing a sixth manufacturer

Four families, 17 specification rows, five line sheets and 25 total-length
tables, none of it in any fit that came before. The companion to
`docs/scaling.md`, which covers the laws this data was tested against.

Four families and 17 sizes from a sixth manufacturer, none of it in the fit.

| family | AR | published | law predicts | error |
| --- | --- | --- | --- | --- |
| Hook 6 | 5.30 | 205 m | 243 m | +18% |
| Artik R 2 | 6.50 | 183 m | 197 m | +8% |
| Skin 4 P | 4.90 | 287 m | 212 m | **-26%** |
| Bi Skin 2 P | 5.50 | 522 m | 295 m | **-44%** |

The conventional wings hold. **The single-surface wings do not, and the reason
is structural rather than statistical.** Same maker, same area, same year:

| | Hook 6 (20) | Skin 4 P (20) |
| --- | --- | --- |
| flat area | 20 m² | 20 m² |
| cells | 47 | 39 |
| total line | 205 m | **346 m** |
| glider weight | 3.97 kg | **1.29 kg** |

**69% more line, 68% less weight.** A single-surface wing has no internal
structure, so the lines carry all the shape — it trades cloth and ribs for
line. The law was fitted only on double-surface wings and cannot be expected
to cover them.

## 1. A transcription hazard worth recording

The ARTIK R 2 table's text layer absorbs the size header as a data row,
shifting every label by one. Read literally it says **20 cells, aspect ratio
68**. The corrected reading is 68 cells, AR 6.5 — checked against span² / AR
matching the published area to within 5%, which is the kind of cross-check
`docs/collecting-reference-data.md` asks for.

## 2. And a parser gap the file exposed

`parseSizeFamilies` had no comment handling. The collection brief requires a
provenance header on every file, and the parser could not read a file that
followed its own instructions — because the one file that existed carried no
comments.

## 3. Line sheets, and two parser gaps they exposed

Niviuk publish a per-line table for every size — reference, material, strength,
colour, length — and a total-line-length table measured to the harness. They
are the first source here to give both for the same wing.
`tools/import-niviuk.mjs` converts a manual into the project's own sheet
format. Five wings, 546 lines, nothing dropped.

Getting to "nothing dropped" took two fixes.

**A known row name must beat a combined pair.** `2BR3` is genuinely ambiguous:
Advance's prefix convention reads it as rows B and R combined at level 2, and
Niviuk mean the brake row at level 2. Split blindly it became rows B and R, R
is not a row, and the name was rejected — **seven brake and stabilo lines per
sheet silently dropped.** Known multi-letter rows are now checked first,
because a row that exists is a better reading than a pair that does not.

**Rows run to I, not to E.** Five was enough for every double-surface wing in
the reference set. A single-surface wing is different: with no cells to gather
loads into, every attachment point gets its own row. The Skin 4 P runs **a
through i — nine load-bearing rows** — and F to I were being rejected as
unrecognised, dropping a fifth of its line plan.

**And the levels have to be settled on the whole sheet.** A canopy line is
written in lower case and the levels below it with a number in front — `2A1`,
`3A1`, `4A3`. Read name by name those came back as levels called `cascade-2`,
`cascade-3` and `cascade-4`, which nothing downstream knows, so no Niviuk
sheet had a middle line or a main line in it. `parseSimpleLineSheet` resolves
them now (`docs/line-plans.md`, section 2), along with the Artik R 2's `C1` to
`C4` and the Takoo 6's `BC1`, which are written in upper case under lower-case
canopy lines and were being counted as canopy lines: the Artik had eighteen C
attachments where it has fourteen.

That is the same structural fact as the line-length result above, seen from
the other side: a single-surface wing replaces internal structure with lines,
so it has more of them, in more rows, and they carry more of the shape.

## 4. Total line lengths, and a tool that read the wrong table in silence

Niviuk's section 10.7 prints, per size, the distance from each attachment
point to the harness — the PMA total, risers included. That is what an
inspector measures against and what `comparePlans` needs to diff a design
against a real wing.

`tools/import-niviuk-totals.mjs` extracts them — **25 sizes across five
wings**, cross-checked against the printed pages: Hook 6 20 reads 6390, Ikuma
3 20 reads 6544, Takoo 6 38 reads 8741, Skin 4 P 14 reads 5413.

Two things it got wrong first, both silent:

**It anchored on the contents page.** "10.7 TOTAL LINE LENGTH" appears in the
table of contents before it appears as a heading, so a forward search found
the listing rather than the table. It then extracted nothing and reported
"0 anchors" without error.

**Before that it anchored on the wrong table entirely** — the size headings
appear twice in a manual, once over the per-line table in 10.6 and once over
the totals in 10.7. The first match is the wrong one.

Both produced an empty file rather than a wrong one, which is the better
failure, but neither said anything was amiss. The cross-check that settled it
was reading six values off the printed page and comparing.

## 5. Three more things the importer got wrong

**The size was read as the model's version number.** Every Niviuk name
contains a number — HOOK 6, IKUMA 3, SKIN 4 P — so a lazy match stopped there
and "HOOK 6 20" came back as model *HOOK*, size *6*. The size is the last
number on the heading, not the first.

**The row labels were a fixed list.** `['A','B','C','D','BR']` fitted every
double-surface wing and **threw away four rows of the Skin 4 P**, which runs A
to I. Labels now come from each table's own header — and that header *wraps
across lines*, so gathering only the first line truncated ten columns to
three. The same structural fact that broke the line-sheet parser, met again in
a different file.

**A loose heading pattern found page numbers.** The Artik came back with
twelve "sizes", half of them page numbers and column headers.

Every one of these produced plausible output rather than an error. What caught
them was reading four values off the printed pages and comparing — the
cross-check `docs/collecting-reference-data.md` asks for and which is easy to
skip because the numbers look reasonable either way.

### And one that four values could not catch: the columns

Section 10.7 is a grid: a row for each attachment along the span, a column for
each line row. Where a wing has no line the cell is empty — the Hook 6's D row
stops four ribs out — and extracted as text an empty cell leaves nothing
behind. The importer labelled the numbers on a row A, B, C, D, BR from the
left, so everything after an empty cell moved one column over:

```
Hook 6, size 24      as imported                  as printed
row 4    6870 6770 6827 6926 6835    A B C D K        A B C D K
row 5    6825 6717 6790 6674         A B C D          A B C K
row 10   6185 6184 6408              A B C            A B K
row 11   6310                        A                K
```

**150 totals in 22 of the 25 files were filed under the wrong row**: brake
totals as D lines on the Hook 6 and Ikuma 3, as C lines on the Skin 4 P, and
on the Artik R 2 its C totals as B, its D totals as C and its brake's as D. The four values
checked against the page were all `A1`, which is in the first cell of the
first row of every table.

What gives it away is the wing. From row 4 to row 5 the Hook 6's A total falls
45 mm and its "D" total 252; from row 10 to row 11 its "A" total goes *up*
125 mm at the wingtip. Put back, the eleven brake totals run from 7140 down to
6310 mm in steps of no more than 231, and there are D totals on the four rows
that have D lines.

The same manual's section 10.6 lists every line by name, so it says which
columns each row of the grid has. `tools/relabel-niviuk-totals.mjs` put the
labels back from it — it moves labels and changes no length — and each file
says so in its header. `tools/import-niviuk-totals.mjs` now takes that sheet
(`--lines`) and refuses a table with a short row without it.

Three things it could not settle, and which are as they were: the tables stop
at row 12 or 13 where the per-line sheets go on to 14, 16 or 18; the brake
column is missing from the full rows of the Artik R 2, Skin 4 P and Takoo 6,
where the importer kept only as many values as it had found labels; and the
Hook 6's per-line sheet has a `c10` in its ninth row.

---

## 6. Multi-size sheets, split

UP publish some sheets with a **column per size**: a line name, then its
length in the L, M, SM and S wings across the row. Read as a single wing that
mixes an L with an XS, which is what produced "st1 appears twice" and "uppers
longer than mains" the first time the reference sweep met them.

`splitMultiSizeSheet` turns one file into one sheet per size. Three files,
**twelve wings recovered**, all parsing cleanly and all now checked against
the physics in their own right.

### A size named but absent

The Makalu 5 header names five sizes and its rows carry four values, with the
lengths descending L, M, SM, S. **XS is simply absent from the file.**

A size with no data is reported rather than filled. Guessing which column was
dropped would be a coin toss, and a wrong guess would assign one wing's
lengths to another — the worst kind of error this project can make, because
the output would look entirely reasonable.

### What the numbers measure is a key, not prose

The first version wrote `# Lengths INCLUDE the risers` and the sweep looked
for `including risers`. The words did not match, so four sheets of
sail-to-harness totals were checked as if they were individual lines and
failed for having uppers longer than mains — which is exactly what a total
does.

Files now carry `# measure: total-including-risers` or `# measure:
single-line`, and an unknown value is refused rather than written. A key
cannot drift out of step with its reader the way a sentence can.

It can still be wrong. The writer defaulted to `single-line`, and UP's
workbooks call their totals sheet "Einzelleine / single" — so the eight split
sheets of the Meru 2 and Summit X declared that every line on the wing is
seven metres long. They hold totals: `a1` is 7.4 m, 0.3 m more than that
wing's own component lines add up to, as on the Makalu 5, whose sheet says
"lines including risers". The key has no default now, a sheet whose shortest
line is over three metres cannot be written as single lines, and the sweep
checks the same of every file that says it is.

---

## 7. Magnum 4, Vibe GT and Enzo 3 — and why they were not done

These three were supplied and sat unconverted for a long time. I had reported
them as **absent from the repository**, which was true and useless: they were
absent because the tooling could not open them.

`tools/read_xls.py` reads the old OLE2 spreadsheet format. All three files are
the modern zip-and-XML format, and it refused them with `not an OLE2 file`.
The reason was one layer below where I was looking, and "not present" was the
wrong conclusion to stop at.

`tools/read_xlsx.py` opens them. Fifteen sheets, and the reference set goes
from 19 wings to **21**.

### The Magnum 4 is the first five-row wing

Rows **A B C D E** plus brakes, across three tandem sizes. Every other wing in
the set stops at D, and the anchor-density table's four-riser group went from
two designs to three, moving its measured mean from 1.57 to 1.65.

### The Enzo 3 is not a cut list

It is a **PMA-style inspection record**: reference length, the specimen as
measured, and the difference. Six sizes, 59 lines each.

| | measurements | inside ±12 mm |
| --- | --- | --- |
| six sizes | 354 | **353 (99.7%)** |

The PMA standard allows ±12 mm on a reference length, and this project has
used that band since the inspection work without ever seeing it exercised on
real production. A manufacturer holds it on all but one line out of 354, and
the worst is 14 mm.

That is evidence for a tolerance that had been taken on the standard's word.
