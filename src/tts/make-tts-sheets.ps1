param(
  [Parameter(Mandatory = $true)]
  [string]$Manifest
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$data = Get-Content -LiteralPath $Manifest -Raw | ConvertFrom-Json
$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq "image/jpeg" } |
  Select-Object -First 1
$encoderParams = [System.Drawing.Imaging.EncoderParameters]::new(1)
$encoderParams.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new(
  [System.Drawing.Imaging.Encoder]::Quality,
  [int64]92
)

foreach ($sheet in @($data.sheets)) {
  $cards = @($sheet.cards)
  if ($cards.Count -eq 0) { continue }

  $firstPath = $cards[0].path
  $firstRotate = [bool]$cards[0].rotate
  $first = [System.Drawing.Image]::FromFile($firstPath)
  if ($firstRotate) {
    $first.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone)
  }
  $slotWidth = $first.Width
  $slotHeight = $first.Height
  $first.Dispose()

  $columns = [int]$sheet.columns
  $rows = [int]$sheet.rows
  $bitmap = [System.Drawing.Bitmap]::new($slotWidth * $columns, $slotHeight * $rows)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.Color]::White)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  for ($index = 0; $index -lt $cards.Count; $index++) {
    $cardPath = $cards[$index].path
    $rotate = [bool]$cards[$index].rotate
    $image = [System.Drawing.Image]::FromFile($cardPath)
    if ($rotate) {
      $image.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone)
    }
    $x = ($index % $columns) * $slotWidth
    $y = [Math]::Floor($index / $columns) * $slotHeight
    $graphics.DrawImage($image, $x, $y, $slotWidth, $slotHeight)
    $image.Dispose()
  }

  $outputDir = Split-Path -Parent $sheet.output
  if ($outputDir) {
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
  }
  $bitmap.Save($sheet.output, $jpegCodec, $encoderParams)
  $graphics.Dispose()
  $bitmap.Dispose()
  Write-Host "Wrote $($sheet.output)"
}

