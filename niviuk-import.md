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
