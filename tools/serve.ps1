# Static file server for Render Zero that needs nothing installed: it uses the HTTP listener built into Windows.
# Started by "Play Render Zero.bat". Serves this project folder on http://localhost:8123 to this computer only.
param([int]$Port = 8123, [switch]$NoBrowser)

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
$types = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript'; '.json' = 'application/json'; '.css' = 'text/css'
  '.glb' = 'model/gltf-binary'; '.jpg' = 'image/jpeg'; '.png' = 'image/png'; '.spz' = 'application/octet-stream' }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch {
  Write-Host "Could not start on port ${Port}: $($_.Exception.Message)"
  Write-Host 'If another copy is already running, just open http://localhost:' -NoNewline; Write-Host "$Port in your browser."
  exit 1
}
Write-Host "Render Zero is running at http://localhost:$Port"
Write-Host 'Keep this window open while you play. Close it to stop.'
if (-not $NoBrowser) { Start-Process "http://localhost:$Port/" }

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }
    $path = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
    $inside = $path.StartsWith($root + '\', [System.StringComparison]::OrdinalIgnoreCase)
    if (-not $inside -or -not (Test-Path -LiteralPath $path -PathType Leaf)) {
      $res.StatusCode = 404
    } else {
      $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
      if ($types.ContainsKey($ext)) { $res.ContentType = $types[$ext] } else { $res.ContentType = 'application/octet-stream' }
      $res.Headers.Add('Cache-Control', 'no-store')
      $res.ContentLength64 = (Get-Item -LiteralPath $path).Length
      if ($req.HttpMethod -ne 'HEAD') {
        $file = [System.IO.File]::OpenRead($path)
        try { $file.CopyTo($res.OutputStream) } finally { $file.Close() }
      }
    }
  } catch {
    try { $res.StatusCode = 500 } catch { }
  } finally {
    try { $res.Close() } catch { try { $res.Abort() } catch { } }
  }
}
