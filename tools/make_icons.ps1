# Renders icons/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png (180) with System.Drawing.
Add-Type -AssemblyName System.Drawing
$root = Join-Path $PSScriptRoot '..\icons'
function Draw($size, $path, $maskable) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.SmoothingMode = 'AntiAlias'
  $green = [System.Drawing.ColorTranslator]::FromHtml('#2d6a4f'); $paper = [System.Drawing.ColorTranslator]::FromHtml('#f4f5f1')
  $g.Clear([System.Drawing.Color]::Transparent)
  $s = $size / 512.0
  if ($maskable) { $g.FillRectangle((New-Object System.Drawing.SolidBrush $green), 0, 0, $size, $size) }
  else { $gp = New-Object System.Drawing.Drawing2D.GraphicsPath; $r = 112 * $s; $d = 2 * $r
    $gp.AddArc(0, 0, $d, $d, 180, 90); $gp.AddArc($size - $d, 0, $d, $d, 270, 90); $gp.AddArc($size - $d, $size - $d, $d, $d, 0, 90); $gp.AddArc(0, $size - $d, $d, $d, 90, 90); $gp.CloseFigure()
    $g.FillPath((New-Object System.Drawing.SolidBrush $green), $gp) }
  $ballR = ($(if ($maskable) { 120 } else { 150 })) * $s
  $g.FillEllipse((New-Object System.Drawing.SolidBrush $paper), 256 * $s - $ballR, 256 * $s - $ballR, 2 * $ballR, 2 * $ballR)
  $pen = New-Object System.Drawing.Pen $green, (22 * $s); $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
  $k = $(if ($maskable) { 0.8 } else { 1 })
  $g.DrawBezier($pen, (256 - 106 * $k) * $s, (256 - 56 * $k) * $s, (256 - 66 * $k) * $s, (256 - 26 * $k) * $s, (256 - 46 * $k) * $s, (256 + 14 * $k) * $s, (256 - 46 * $k) * $s, (256 + 64 * $k) * $s)
  $g.DrawBezier($pen, (256 + 106 * $k) * $s, (256 - 56 * $k) * $s, (256 + 66 * $k) * $s, (256 - 26 * $k) * $s, (256 + 46 * $k) * $s, (256 + 14 * $k) * $s, (256 + 46 * $k) * $s, (256 + 64 * $k) * $s)
  $g.Dispose(); $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose(); Write-Host "wrote $path"
}
Draw 192 (Join-Path $root 'icon-192.png') $false
Draw 512 (Join-Path $root 'icon-512.png') $false
Draw 512 (Join-Path $root 'icon-maskable-512.png') $true
Draw 180 (Join-Path $root 'apple-touch-icon.png') $false
