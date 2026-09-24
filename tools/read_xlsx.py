#!/usr/bin/env python3
"""read_xlsx.py — the modern (zip/XML) spreadsheet format.

`read_xls.py` reads the old OLE2 BIFF format. Three of the supplied line
sheets — Magnum 4, Vibe GT and Enzo 3 — are the newer zip format, and the
existing reader refuses them with "not an OLE2 file".

That refusal is why those wings sat unconverted: the tooling could not open
them, and the reason was one layer below where anyone looked.

    python3 tools/read_xlsx.py <file.xlsx> [sheet-index]

Prints the sheet as TSV. No dependencies: an xlsx is a zip of XML, and the
only awkward part is that most strings live in a shared table referenced by
index.
"""
import re
import sys
import zipfile


def col_to_index(ref):
    """'BC12' -> 54. Spreadsheet columns are base-26 with no zero."""
    letters = re.match(r'([A-Z]+)', ref).group(1)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def shared_strings(z):
    try:
        xml = z.read('xl/sharedStrings.xml').decode('utf-8', 'replace')
    except KeyError:
        return []
    out = []
    for si in re.findall(r'<si>(.*?)</si>', xml, re.S):
        # A string may be split across several runs; join their text.
        out.append(''.join(re.findall(r'<t[^>]*>(.*?)</t>', si, re.S)))
    return [s.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
            for s in out]


def read_sheet(path, index=0):
    z = zipfile.ZipFile(path)
    strings = shared_strings(z)
    sheets = sorted(n for n in z.namelist()
                    if re.match(r'xl/worksheets/sheet\d+\.xml$', n))
    if index >= len(sheets):
        raise SystemExit(f'{path} has {len(sheets)} sheets; asked for {index}')
    xml = z.read(sheets[index]).decode('utf-8', 'replace')

    rows = []
    for row in re.findall(r'<row[^>]*>(.*?)</row>', xml, re.S):
        cells = {}
        for m in re.finditer(r'<c r="([A-Z]+\d+)"([^>]*)>(.*?)</c>', row, re.S):
            ref, attrs, body = m.groups()
            v = re.search(r'<v>(.*?)</v>', body, re.S)
            t = re.search(r'<is>.*?<t[^>]*>(.*?)</t>', body, re.S)
            if t:
                val = t.group(1)
            elif v:
                val = v.group(1)
                if 't="s"' in attrs:
                    i = int(val)
                    val = strings[i] if i < len(strings) else ''
            else:
                val = ''
            cells[col_to_index(ref)] = val
        if cells:
            width = max(cells) + 1
            rows.append([cells.get(i, '') for i in range(width)])
    return rows, len(sheets)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    idx = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    rows, count = read_sheet(sys.argv[1], idx)
    print(f'# {sys.argv[1]} sheet {idx} of {count}, {len(rows)} rows',
          file=sys.stderr)
    for r in rows:
        print('\t'.join(r))
