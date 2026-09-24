#!/usr/bin/env python3
"""read_xls.py — minimal reader for legacy .xls (BIFF8 in an OLE2 container).

The UP Paragliders line sheets are genuine Excel 97 files, not the zipped
OOXML that openpyxl handles, and xlrd is not installable here. Rather than
lose five wings from the validation set, this walks the two layers directly:

  OLE2  a FAT-based container. The header names a sector size, a directory
        chain and two allocation tables — one for streams of 4096 bytes and
        up, one for shorter streams packed into a "mini stream".
  BIFF  a flat sequence of (type, length, payload) records inside the
        "Workbook" stream. Only six types are needed for a value dump:
        BOF/EOF, BOUNDSHEET, SST, LABELSST, NUMBER, RK, MULRK, FORMULA.

Deliberately read-only and deliberately partial: it extracts cell values and
nothing else — no formatting, no formulas re-evaluated, no writing.
"""
import struct, sys, json

def ole_streams(data):
    if data[:8] != b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1':
        raise ValueError('not an OLE2 file')
    ssz = 1 << struct.unpack_from('<H', data, 30)[0]      # sector size
    mssz = 1 << struct.unpack_from('<H', data, 32)[0]     # mini sector size
    nfat = struct.unpack_from('<I', data, 44)[0]
    dirstart = struct.unpack_from('<I', data, 48)[0]
    ministart = struct.unpack_from('<I', data, 60)[0]
    difstart = struct.unpack_from('<I', data, 68)[0]
    ndif = struct.unpack_from('<I', data, 72)[0]

    sect = lambda n: data[512 + n*ssz : 512 + (n+1)*ssz]

    # FAT sector numbers: 109 in the header, the rest chained through the DIFAT.
    fatsects = [struct.unpack_from('<I', data, 76 + 4*i)[0] for i in range(109)]
    nxt = difstart
    for _ in range(ndif):
        if nxt in (0xFFFFFFFE, 0xFFFFFFFF): break
        s = sect(nxt)
        fatsects += [struct.unpack_from('<I', s, 4*i)[0] for i in range(ssz//4 - 1)]
        nxt = struct.unpack_from('<I', s, ssz - 4)[0]

    fat = []
    for fs in fatsects[:nfat]:
        if fs >= 0xFFFFFFFE: continue
        s = sect(fs)
        fat += [struct.unpack_from('<I', s, 4*i)[0] for i in range(ssz//4)]

    def chain(start):
        out, n, guard = [], start, 0
        while n < 0xFFFFFFFE and guard < 1_000_000:
            out.append(n); n = fat[n] if n < len(fat) else 0xFFFFFFFE; guard += 1
        return out

    def read_chain(start, size=None):
        b = b''.join(sect(n) for n in chain(start))
        return b[:size] if size else b

    # Directory entries: 128 bytes each.
    dirdata = read_chain(dirstart)
    entries = []
    for i in range(len(dirdata)//128):
        e = dirdata[i*128:(i+1)*128]
        nlen = struct.unpack_from('<H', e, 64)[0]
        name = e[:max(0, nlen-2)].decode('utf-16-le', 'ignore')
        entries.append({'name': name, 'type': e[66],
                        'start': struct.unpack_from('<I', e, 116)[0],
                        'size': struct.unpack_from('<I', e, 120)[0]})

    # Mini-FAT, for streams below the cutoff.
    minifat = []
    mfstart = struct.unpack_from('<I', data, 60)[0]
    nmf = struct.unpack_from('<I', data, 64)[0]
    mf = b''.join(sect(n) for n in chain(mfstart)) if nmf else b''
    minifat = [struct.unpack_from('<I', mf, 4*i)[0] for i in range(len(mf)//4)]
    root = next((e for e in entries if e['type'] == 5), None)
    ministream = read_chain(root['start']) if root and root['size'] else b''

    def read_stream(e):
        if e['size'] >= 4096:
            return read_chain(e['start'], e['size'])
        out, n, guard = b'', e['start'], 0
        while n < 0xFFFFFFFE and guard < 1_000_000:
            out += ministream[n*mssz:(n+1)*mssz]
            n = minifat[n] if n < len(minifat) else 0xFFFFFFFE
            guard += 1
        return out[:e['size']]

    return {e['name']: read_stream(e) for e in entries if e['type'] == 2}

def rk_value(rk):
    mult = rk & 1
    if rk & 2:
        v = float(rk >> 2 if (rk >> 2) < 0x20000000 else (rk >> 2) - 0x40000000)
    else:
        v = struct.unpack('<d', struct.pack('<q', (rk & 0xFFFFFFFC) << 32))[0]
    return v / 100 if mult else v

def parse_biff(stream):
    pos, sheets, sst, cells, cur = 0, [], [], {}, None
    boundsheets = []
    while pos < len(stream) - 4:
        t, ln = struct.unpack_from('<HH', stream, pos)
        pay = stream[pos+4:pos+4+ln]
        pos += 4 + ln
        if t == 0x0085 and len(pay) >= 8:            # BOUNDSHEET
            posn = struct.unpack_from('<I', pay, 0)[0]
            cch = pay[6]
            flags = pay[7]
            nm = pay[8:8+cch*(2 if flags & 1 else 1)]
            boundsheets.append({'pos': posn,
                'name': nm.decode('utf-16-le' if flags & 1 else 'latin-1', 'ignore')})
        elif t == 0x00FC:                             # SST
            n = struct.unpack_from('<I', pay, 4)[0]
            p = 8
            while len(sst) < n and p < len(pay):
                cch = struct.unpack_from('<H', pay, p)[0]; p += 2
                fl = pay[p]; p += 1
                if fl & 8: p += 2 + 4*struct.unpack_from('<H', pay, p-3)[0] if False else 0
                if fl & 1:
                    s = pay[p:p+cch*2].decode('utf-16-le', 'ignore'); p += cch*2
                else:
                    s = pay[p:p+cch].decode('latin-1', 'ignore'); p += cch
                sst.append(s)
        elif t in (0x0009, 0x0209, 0x0409, 0x0809):   # BOF
            cur = len(cells); cells[cur] = {}
        elif t == 0x00FD and len(pay) >= 10:          # LABELSST
            r, c, _, idx = struct.unpack_from('<HHHI', pay, 0)
            cells.setdefault(cur, {})[(r, c)] = sst[idx] if idx < len(sst) else ''
        elif t == 0x0203 and len(pay) >= 14:          # NUMBER
            r, c = struct.unpack_from('<HH', pay, 0)
            cells.setdefault(cur, {})[(r, c)] = struct.unpack_from('<d', pay, 6)[0]
        elif t == 0x027E and len(pay) >= 10:          # RK
            r, c = struct.unpack_from('<HH', pay, 0)
            cells.setdefault(cur, {})[(r, c)] = rk_value(struct.unpack_from('<I', pay, 6)[0])
        elif t == 0x00BD and len(pay) >= 6:           # MULRK
            r, c0 = struct.unpack_from('<HH', pay, 0)
            n = (len(pay) - 6) // 6
            for i in range(n):
                cells.setdefault(cur, {})[(r, c0+i)] = rk_value(
                    struct.unpack_from('<I', pay, 4 + i*6 + 2)[0])
        elif t == 0x0006 and len(pay) >= 14:          # FORMULA, cached value
            r, c = struct.unpack_from('<HH', pay, 0)
            bits = pay[6:14]
            if bits[6:8] != b'\xff\xff':
                cells.setdefault(cur, {})[(r, c)] = struct.unpack('<d', bits)[0]
    return boundsheets, cells

def to_tsv(cellmap):
    if not cellmap: return ''
    maxr = max(r for r, _ in cellmap); maxc = max(c for _, c in cellmap)
    out = []
    for r in range(maxr+1):
        row = []
        for c in range(maxc+1):
            v = cellmap.get((r, c), '')
            if isinstance(v, float) and v == int(v): v = int(v)
            # Cells routinely hold a bilingual label on two lines
            # ("Leine\nline"). Written straight to TSV that newline ends the
            # row, and every column after it shifts up — the header splits
            # across several rows and layout detection reads the wrong thing.
            row.append(str(v).replace('\r', ' ').replace('\n', ' ').replace('\t', ' ').strip())
        while row and row[-1] == '': row.pop()
        out.append('\t'.join(row))
    return '\n'.join(out)

if __name__ == '__main__':
    data = open(sys.argv[1], 'rb').read()
    streams = ole_streams(data)
    wb = streams.get('Workbook') or streams.get('Book')
    if not wb: sys.exit('no Workbook stream: ' + ', '.join(streams))
    sheets, cells = parse_biff(wb)
    names = [s['name'] for s in sheets]
    print(f"sheets: {names}", file=sys.stderr)
    for i, key in enumerate(sorted(cells)):
        nm = names[i] if i < len(names) else f'sheet{i}'
        body = to_tsv(cells[key])
        if not body.strip(): continue
        out = f"{sys.argv[2]}-{nm}.tsv".replace(' ', '_')
        open(out, 'w').write(body + '\n')
        print(f"  wrote {out} ({body.count(chr(10))+1} rows)", file=sys.stderr)
