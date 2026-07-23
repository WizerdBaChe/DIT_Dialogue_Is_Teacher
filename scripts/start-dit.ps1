# Minimal static file server for the DIT release package.
# No dependencies (no Node/Python required) — uses only .NET APIs bundled with Windows.
# Binds to 127.0.0.1 only, so no admin rights and no firewall exposure are needed.

# App files live in an "app" subfolder next to this script, so the top level of the
# unzipped release only shows start-dit.bat/.ps1 and this README-style text file.
# This only changes which local folder is served as the HTTP document root — every
# asset path in index.html is root-relative ("/assets/..."), so it resolves the same
# way regardless of how deep that folder sits on disk, on any OS.
$ErrorActionPreference = "Stop"
$root = Join-Path $PSScriptRoot "app"
if (-not (Test-Path $root -PathType Container)) {
    Write-Host "找不到 app 資料夾（$root），發布包可能不完整。" -ForegroundColor Red
    exit 1
}
$mime = @{
    ".html" = "text/html; charset=utf-8"
    ".js"   = "text/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".ico"  = "image/x-icon"
    ".woff" = "font/woff"
    ".woff2"= "font/woff2"
    ".map"  = "application/json; charset=utf-8"
    ".txt"  = "text/plain; charset=utf-8"
}

function Start-DitListener {
    param([int]$Port)
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://127.0.0.1:$Port/")
    $listener.Start()
    return $listener
}

$port = 4787
$listener = $null
for ($i = 0; $i -lt 20; $i++) {
    try {
        $listener = Start-DitListener -Port $port
        break
    } catch {
        $port++
    }
}
if (-not $listener) {
    Write-Host "找不到可用的本機連接埠（port），請關閉佔用中的程式後再試一次。" -ForegroundColor Red
    exit 1
}

$url = "http://127.0.0.1:$port/"
Write-Host "DIT 正在執行： $url"
Write-Host "瀏覽器沒有自動開啟的話，請手動貼上上面這個網址。"
Write-Host "要停止伺服器，直接關閉這個視窗即可。"
Write-Host ""

Start-Process $url

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        try {
            $localPath = [Uri]::UnescapeDataString($request.Url.LocalPath)
            if ($localPath -eq "/") { $localPath = "/index.html" }
            $filePath = Join-Path $root ($localPath.TrimStart("/") -replace "/", [IO.Path]::DirectorySeparatorChar)
            $fullRoot = (Resolve-Path $root).Path
            $resolved = [IO.Path]::GetFullPath($filePath)

            if (-not $resolved.StartsWith($fullRoot, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $resolved -PathType Leaf)) {
                $response.StatusCode = 404
                $bytes = [Text.Encoding]::UTF8.GetBytes("404 Not Found")
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $ext = [IO.Path]::GetExtension($resolved).ToLowerInvariant()
                $contentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
                $response.ContentType = $contentType
                $bytes = [IO.File]::ReadAllBytes($resolved)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            }
        } catch {
            try {
                $response.StatusCode = 500
                $bytes = [Text.Encoding]::UTF8.GetBytes("500 Internal Server Error")
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } catch {}
        } finally {
            $response.OutputStream.Close()
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
