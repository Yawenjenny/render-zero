"""Shrink the textures inside .glb files so the game loads faster online.

  python shrink_glb.py <in.glb> <out.glb> [max_size=2048]

Every embedded texture larger than max_size is scaled down, and PNG textures are re-saved as JPEG (the models
here have no transparency). The mesh itself is copied byte for byte. Resizing uses the image code built into
Windows (System.Drawing through PowerShell), so nothing has to be installed.
"""
import json, os, struct, subprocess, sys, tempfile

PS = r'''
param($src, $dst, [int]$max)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($src)
$scale = [Math]::Min(1.0, $max / [Math]::Max($img.Width, $img.Height))
$w = [int][Math]::Round($img.Width * $scale); $h = [int][Math]::Round($img.Height * $scale)
$bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
$attr = New-Object System.Drawing.Imaging.ImageAttributes
$attr.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)      # no dark fringe at the edges
$g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $w, $h), 0, 0, $img.Width, $img.Height, [System.Drawing.GraphicsUnit]::Pixel, $attr)
$g.Dispose(); $img.Dispose()
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]90)
$bmp.Save($dst, $codec, $ep); $bmp.Dispose()
"$w $h"
'''


def image_size(b):
    if b[:8] == b'\x89PNG\r\n\x1a\n':
        return struct.unpack('>II', b[16:24])
    if b[:2] == b'\xff\xd8':
        i = 2
        while i < len(b):
            if b[i] != 0xFF:
                i += 1
                continue
            m = b[i + 1]
            if m in (0xC0, 0xC1, 0xC2):
                h, w = struct.unpack('>HH', b[i + 5:i + 9])
                return w, h
            i += 2 + struct.unpack('>H', b[i + 2:i + 4])[0]
    return 0, 0


def shrink(src, dst, max_size=2048):
    d = open(src, 'rb').read()
    assert d[:4] == b'glTF', 'not a .glb file'
    jlen = struct.unpack('<I', d[12:16])[0]
    j = json.loads(d[20:20 + jlen])
    bin0 = 20 + jlen + 8
    views = j.get('bufferViews', [])
    data = [d[bin0 + v.get('byteOffset', 0): bin0 + v.get('byteOffset', 0) + v['byteLength']] for v in views]

    # a texture that carries transparency must stay as it is
    keep = set()
    for m in j.get('materials', []):
        if m.get('alphaMode', 'OPAQUE') != 'OPAQUE':
            t = m.get('pbrMetallicRoughness', {}).get('baseColorTexture')
            if t is not None:
                keep.add(j['textures'][t['index']].get('source'))

    notes = []
    with tempfile.TemporaryDirectory() as tmp:
        script = os.path.join(tmp, 'resize.ps1')
        open(script, 'w', encoding='utf-8').write(PS)
        for i, im in enumerate(j.get('images', [])):
            if 'bufferView' not in im or i in keep:
                continue
            raw = data[im['bufferView']]
            w, h = image_size(raw)
            is_png = raw[:4] == b'\x89PNG'
            if max(w, h) <= max_size and not is_png:
                continue
            a = os.path.join(tmp, 'in_%d.%s' % (i, 'png' if is_png else 'jpg'))
            b = os.path.join(tmp, 'out_%d.jpg' % i)
            open(a, 'wb').write(raw)
            r = subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, a, b, str(max_size)],
                               capture_output=True, text=True)
            if r.returncode != 0 or not os.path.exists(b):
                raise RuntimeError('resize failed for image %d: %s' % (i, r.stderr.strip()[:300]))
            new = open(b, 'rb').read()
            if len(new) < len(raw):
                data[im['bufferView']] = new
                im['mimeType'] = 'image/jpeg'
                notes.append('%dx%d %s %.1f MB -> %s jpg %.1f MB' % (w, h, 'png' if is_png else 'jpg', len(raw) / 1048576, r.stdout.strip().replace(' ', 'x'), len(new) / 1048576))

    # lay every buffer view out again, in order, aligned to 4 bytes
    out = bytearray()
    for v, chunk in zip(views, data):
        while len(out) % 4:
            out.append(0)
        v['byteOffset'] = len(out)
        v['byteLength'] = len(chunk)
        out += chunk
    while len(out) % 4:
        out.append(0)
    j['buffers'][0]['byteLength'] = len(out)
    js = json.dumps(j, separators=(',', ':')).encode('utf-8')
    js += b' ' * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(out)
    with open(dst, 'wb') as f:
        f.write(b'glTF' + struct.pack('<II', 2, total))
        f.write(struct.pack('<I', len(js)) + b'JSON' + js)
        f.write(struct.pack('<I', len(out)) + b'BIN\x00' + bytes(out))
    return len(d), total, notes


if __name__ == '__main__':
    before, after, notes = shrink(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 2048)
    print('%s: %.1f MB -> %.1f MB' % (os.path.basename(sys.argv[2]), before / 1048576, after / 1048576))
    for n in notes:
        print('   ', n)
