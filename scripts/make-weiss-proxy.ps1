param(
  [Parameter(Mandatory = $true)]
  [string]$Manifest
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$data = Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8 | ConvertFrom-Json
$base = [System.Drawing.Image]::FromFile($data.basePath)
$bitmap = [System.Drawing.Bitmap]::new($base.Width, $base.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$graphics.DrawImage($base, 0, 0, $base.Width, $base.Height)

$black = [System.Drawing.Brushes]::Black
$boxOpacity = if ($data.boxOpacity -ne $null) { [double]$data.boxOpacity } else { 0.70 }
$boxOpacity = [Math]::Max(0, [Math]::Min(1, $boxOpacity))
$boxAlpha = [int][Math]::Round(255 * $boxOpacity)
$white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb($boxAlpha, 255, 255, 255))
$blurBox = [bool]$data.blurBox
$border = [System.Drawing.Pen]::new([System.Drawing.Color]::Black, [Math]::Max(2, [int]($base.Width * 0.005)))
$format = [System.Drawing.StringFormat]::new()
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$format.Trimming = [System.Drawing.StringTrimming]::EllipsisWord
$rulesFormat = [System.Drawing.StringFormat]::new()
$rulesFormat.Alignment = [System.Drawing.StringAlignment]::Center
$rulesFormat.LineAlignment = [System.Drawing.StringAlignment]::Near
$rulesFormat.Trimming = [System.Drawing.StringTrimming]::None
$fontFamily = "Meiryo"

function New-Rect([double]$x, [double]$y, [double]$w, [double]$h) {
  return [System.Drawing.RectangleF]::new(
    [single]($base.Width * $x),
    [single]($base.Height * $y),
    [single]($base.Width * $w),
    [single]($base.Height * $h)
  )
}

function Draw-Box([System.Drawing.RectangleF]$rect) {
  if ($blurBox) {
    $sourceRect = [System.Drawing.Rectangle]::new(
      [int][Math]::Round($rect.X),
      [int][Math]::Round($rect.Y),
      [int][Math]::Round($rect.Width),
      [int][Math]::Round($rect.Height)
    )
    $crop = [System.Drawing.Bitmap]::new($sourceRect.Width, $sourceRect.Height)
    $cropGraphics = [System.Drawing.Graphics]::FromImage($crop)
    $cropGraphics.DrawImage($base, 0, 0, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
    $smallWidth = [Math]::Max(1, [int]($rect.Width / 14))
    $smallHeight = [Math]::Max(1, [int]($rect.Height / 14))
    $small = [System.Drawing.Bitmap]::new($smallWidth, $smallHeight)
    $smallGraphics = [System.Drawing.Graphics]::FromImage($small)
    $smallGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $smallGraphics.DrawImage($crop, 0, 0, $smallWidth, $smallHeight)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($small, $rect)
    if ($boxAlpha -gt 0) {
      $graphics.FillRectangle($white, $rect)
    }
    $smallGraphics.Dispose()
    $small.Dispose()
    $cropGraphics.Dispose()
    $crop.Dispose()
  } else {
    $graphics.FillRectangle($white, $rect)
  }
  $graphics.DrawRectangle($border, $rect.X, $rect.Y, $rect.Width, $rect.Height)
}

function Is-Light-Neutral-Pixel([System.Drawing.Color]$color) {
  $max = [Math]::Max($color.R, [Math]::Max($color.G, $color.B))
  $min = [Math]::Min($color.R, [Math]::Min($color.G, $color.B))
  $brightness = ($color.R + $color.G + $color.B) / 3
  return $brightness -gt 150 -and ($max - $min) -lt 95
}

function Find-Printed-Rules-Rect() {
  $xStart = [int]($base.Width * 0.04)
  $xEnd = [int]($base.Width * 0.96)
  $yStart = [int]($base.Height * 0.42)
  $yEnd = [int]($base.Height * 0.89)
  $rowHits = @()

  for ($y = $yStart; $y -lt $yEnd; $y += 2) {
    $hits = 0
    $samples = 0
    for ($x = $xStart; $x -lt $xEnd; $x += 3) {
      $samples += 1
      if (Is-Light-Neutral-Pixel $bitmap.GetPixel($x, $y)) {
        $hits += 1
      }
    }
    if ($samples -gt 0 -and ($hits / $samples) -gt 0.44) {
      $rowHits += $y
    }
  }

  if ($rowHits.Count -lt 8) {
    return $null
  }

  $groups = @()
  $groupStart = $rowHits[0]
  $last = $rowHits[0]
  for ($index = 1; $index -lt $rowHits.Count; $index++) {
    $current = $rowHits[$index]
    if (($current - $last) -gt 8) {
      $groups += ,@($groupStart, $last)
      $groupStart = $current
    }
    $last = $current
  }
  $groups += ,@($groupStart, $last)

  $best = $groups | Sort-Object { $_[1] - $_[0] } -Descending | Select-Object -First 1
  if (($best[1] - $best[0]) -lt ($base.Height * 0.07)) {
    return $null
  }

  $top = [Math]::Max($base.Height * 0.42, $best[0] - ($base.Height * 0.02))
  $bottom = [Math]::Min($base.Height * 0.885, $best[1] + ($base.Height * 0.025))
  return [System.Drawing.RectangleF]::new(
    [single]($base.Width * 0.055),
    [single]$top,
    [single]($base.Width * 0.89),
    [single]($bottom - $top)
  )
}

function Get-Tesseract-Path() {
  $command = Get-Command tesseract -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $candidates = @(
    "C:\Program Files\Tesseract-OCR\tesseract.exe",
    "C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  return $null
}

function Get-Tesseract-Language([string]$tesseract) {
  $installDir = Split-Path -Parent $tesseract
  $japaneseData = Join-Path $installDir "tessdata\jpn.traineddata"
  $englishData = Join-Path $installDir "tessdata\eng.traineddata"

  if ((Test-Path -LiteralPath $japaneseData) -and (Test-Path -LiteralPath $englishData)) {
    return "jpn+eng"
  }
  if (Test-Path -LiteralPath $japaneseData) {
    return "jpn"
  }
  if (Test-Path -LiteralPath $englishData) {
    return "eng"
  }
  return $null
}

function Find-Ocr-Rules-Rect() {
  $tesseract = Get-Tesseract-Path
  if (-not $tesseract) { return $null }
  $language = Get-Tesseract-Language $tesseract
  if (-not $language) { return $null }

  $tsv = & $tesseract $data.basePath stdout -l $language --psm 6 tsv 2>$null
  if (-not $tsv) { return $null }

  $words = @()
  foreach ($line in @($tsv | Select-Object -Skip 1)) {
    $parts = [string]$line -split "`t"
    if ($parts.Count -lt 12) { continue }
    $text = $parts[11]
    if ([string]::IsNullOrWhiteSpace($text)) { continue }

    $left = [double]$parts[6]
    $top = [double]$parts[7]
    $width = [double]$parts[8]
    $height = [double]$parts[9]
    $conf = [double]$parts[10]
    if ($conf -lt 15) { continue }
    if ($top -lt ($base.Height * 0.42) -or $top -gt ($base.Height * 0.89)) { continue }

    $words += [pscustomobject]@{ Left = $left; Top = $top; Right = $left + $width; Bottom = $top + $height }
  }

  if ($words.Count -lt 3) { return $null }

  $top = ($words | Measure-Object -Property Top -Minimum).Minimum
  $bottom = ($words | Measure-Object -Property Bottom -Maximum).Maximum
  if (($bottom - $top) -lt ($base.Height * 0.035)) { return $null }

  return Fixed-Rules-Rect-At ([double](($top + $bottom) / 2))
}

function Fixed-Rules-Rect-At([double]$centerY) {
  $fixedWidth = $base.Width * 0.89
  $fixedHeight = $base.Height * 0.22
  $minY = $base.Height * 0.42
  $maxY = $base.Height * 0.885 - $fixedHeight
  $y = [Math]::Max($minY, [Math]::Min($maxY, $centerY - ($fixedHeight / 2)))
  return [System.Drawing.RectangleF]::new(
    [single](($base.Width - $fixedWidth) / 2),
    [single]$y,
    [single]$fixedWidth,
    [single]$fixedHeight
  )
}

function Wrapped-Text-Fits([string]$text, [System.Drawing.RectangleF]$rect, [double]$size) {
  $font = [System.Drawing.Font]::new($fontFamily, [single]$size, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $lines = @(Wrap-Text $text $font $rect)
  $lineHeight = $font.GetHeight($graphics) * 0.95
  $font.Dispose()
  return ($lines.Count * $lineHeight) -le ($rect.Height * 0.95)
}

function Get-Rules-Layout([string]$text, [System.Drawing.RectangleF]$detectedRect) {
  $lineCount = (($text -split "`n").Count)
  $length = $text.Length
  $width = $base.Width * 0.89
  $x = ($base.Width - $width) / 2
  $defaultBottom = if ($script:isCharacter) { $base.Height * 0.876 } else { $base.Height * 0.882 }
  $bottom = $defaultBottom

  if ($script:isCharacter -and $detectedRect -ne $null) {
    $detectedBottom = $detectedRect.Bottom + ($base.Height * 0.006)
    $bottom = [Math]::Min($defaultBottom, [Math]::Max($base.Height * 0.858, $detectedBottom))
  }

  if ($length -le 260 -and $lineCount -le 4) {
    $height = $base.Height * 0.155
    $startSize = $base.Height * 0.024
    $minSize = $base.Height * 0.014
  } elseif ($length -le 340 -and $lineCount -le 6) {
    $height = $base.Height * 0.195
    $startSize = $base.Height * 0.023
    $minSize = $base.Height * 0.012
  } elseif ($length -le 560 -and $lineCount -le 9) {
    $height = $base.Height * 0.25
    $startSize = $base.Height * 0.021
    $minSize = $base.Height * 0.010
  } else {
    $height = $base.Height * 0.315
    $startSize = $base.Height * 0.019
    $minSize = $base.Height * 0.008
  }

  $maxHeight = if ($script:isCharacter) {
    if ($length -gt 560) { $base.Height * 0.34 } elseif ($length -gt 340) { $base.Height * 0.285 } else { $base.Height * 0.22 }
  } else {
    if ($length -gt 560) { $base.Height * 0.38 } elseif ($length -gt 340) { $base.Height * 0.31 } else { $base.Height * 0.24 }
  }
  $topLimit = if ($script:isCharacter) { $base.Height * 0.54 } else { $base.Height * 0.44 }
  $rect = [System.Drawing.RectangleF]::new([single]$x, [single]($bottom - $height), [single]$width, [single]$height)

  while (-not (Wrapped-Text-Fits $text $rect $minSize)) {
    $nextHeight = [Math]::Min($maxHeight, $rect.Height + ($base.Height * 0.025))
    $nextY = [Math]::Max($topLimit, $bottom - $nextHeight)
    if ($nextHeight -eq $rect.Height -or $nextY -eq $rect.Y) {
      break
    }
    $rect = [System.Drawing.RectangleF]::new([single]$x, [single]$nextY, [single]$width, [single]($bottom - $nextY))
  }

  return [pscustomobject]@{ Rect = $rect; StartSize = $startSize; MinSize = $minSize }
}

function Get-Climax-Rules-Layout() {
  $rect = New-Rect 0.055 0.725 0.39 0.165
  return [pscustomobject]@{
    Rect = $rect
    StartSize = $base.Height * 0.025
    MinSize = $base.Height * 0.014
  }
}

function Text-Fits([string]$text, [System.Drawing.RectangleF]$rect, [double]$min, [System.Drawing.StringFormat]$stringFormat) {
  $font = [System.Drawing.Font]::new($fontFamily, [single]$min, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $measured = $graphics.MeasureString($text, $font, $rect.Size, $stringFormat)
  $font.Dispose()
  return $measured.Height -le $rect.Height -and $measured.Width -le ($rect.Width * 1.04)
}

function Expand-Rules-Rect-To-Fit([System.Drawing.RectangleF]$rect, [string]$text, [double]$minSize) {
  $topLimit = if ($text.Length -gt 620) { $base.Height * 0.30 } elseif ($text.Length -gt 420) { $base.Height * 0.36 } else { $base.Height * 0.42 }
  $bottomLimit = $base.Height * 0.885
  $next = $rect

  while (-not (Text-Fits $text $next $minSize $rulesFormat)) {
    $newTop = [Math]::Max($topLimit, $next.Y - ($base.Height * 0.035))
    $newBottom = [Math]::Min($bottomLimit, $next.Bottom + ($base.Height * 0.012))
    if ($newTop -eq $next.Y -and $newBottom -eq $next.Bottom) {
      break
    }
    $next = [System.Drawing.RectangleF]::new(
      [single]($base.Width * 0.04),
      [single]$newTop,
      [single]($base.Width * 0.92),
      [single]($newBottom - $newTop)
    )
  }

  return $next
}

function Fit-Font([string]$text, [System.Drawing.RectangleF]$rect, [double]$start, [double]$min, [int]$style, [System.Drawing.StringFormat]$stringFormat) {
  for ($size = $start; $size -ge $min; $size -= 0.5) {
    $font = [System.Drawing.Font]::new($fontFamily, [single]$size, $style, [System.Drawing.GraphicsUnit]::Pixel)
    $measured = $graphics.MeasureString($text, $font, $rect.Size, $stringFormat)
    if ($measured.Height -le $rect.Height -and $measured.Width -le ($rect.Width * 1.04)) {
      return $font
    }
    $font.Dispose()
  }
  return [System.Drawing.Font]::new($fontFamily, [single]$min, $style, [System.Drawing.GraphicsUnit]::Pixel)
}

function Wrap-Text([string]$text, [System.Drawing.Font]$font, [System.Drawing.RectangleF]$rect) {
  $lines = @()
  foreach ($paragraph in ($text -split "`n")) {
    $words = @($paragraph -split "\s+" | Where-Object { $_ -ne "" })
    if ($words.Count -eq 0) {
      $lines += ""
      continue
    }

    $line = ""
    foreach ($word in $words) {
      $candidate = if ($line -eq "") { $word } else { "$line $word" }
      $measured = $graphics.MeasureString($candidate, $font)
      if ($measured.Width -le ($rect.Width * 0.98)) {
        $line = $candidate
      } else {
        if ($line -ne "") { $lines += $line }
        $line = $word
      }
    }
    if ($line -ne "") { $lines += $line }
  }
  return $lines
}

function Fit-Wrapped-Font([string]$text, [System.Drawing.RectangleF]$rect, [double]$start, [double]$min) {
  for ($size = $start; $size -ge $min; $size -= 0.25) {
    $font = [System.Drawing.Font]::new($fontFamily, [single]$size, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $lines = @(Wrap-Text $text $font $rect)
    $lineHeight = $font.GetHeight($graphics) * 0.95
    if (($lines.Count * $lineHeight) -le ($rect.Height * 0.96)) {
      return [pscustomobject]@{ Font = $font; Lines = $lines; LineHeight = $lineHeight }
    }
    $font.Dispose()
  }

  $fallback = [System.Drawing.Font]::new($fontFamily, [single]$min, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $fallbackLines = @(Wrap-Text $text $fallback $rect)
  return [pscustomobject]@{ Font = $fallback; Lines = $fallbackLines; LineHeight = ($fallback.GetHeight($graphics) * 0.92) }
}

function Draw-Wrapped-Text([string]$text, [System.Drawing.RectangleF]$rect, [double]$start, [double]$min) {
  $fit = Fit-Wrapped-Font $text $rect $start $min
  $totalHeight = $fit.Lines.Count * $fit.LineHeight
  $y = $rect.Y + [Math]::Max(0, ($rect.Height - $totalHeight) / 2)

  foreach ($line in $fit.Lines) {
    $lineRect = [System.Drawing.RectangleF]::new($rect.X, [single]$y, $rect.Width, [single]$fit.LineHeight)
    $graphics.DrawString($line, $fit.Font, $black, $lineRect, $format)
    $y += $fit.LineHeight
    if ($y -gt $rect.Bottom) { break }
  }

  return $fit.Font
}

function Color-From-Argb([int]$a, [int]$r, [int]$g, [int]$b) {
  return [System.Drawing.Color]::FromArgb($a, $r, $g, $b)
}

function Get-Card-Colors([string]$color) {
  switch -Regex ($color.ToLowerInvariant()) {
    "green" {
      return [pscustomobject]@{
        Label = Color-From-Argb 255 0 150 76
        Name = Color-From-Argb 255 0 130 58
        NameStroke = Color-From-Argb 255 18 80 30
        Trait = Color-From-Argb 255 0 116 52
        TraitText = Color-From-Argb 255 255 255 255
      }
    }
    "red" {
      return [pscustomobject]@{
        Label = Color-From-Argb 255 190 34 36
        Name = Color-From-Argb 255 170 25 30
        NameStroke = Color-From-Argb 255 100 10 14
        Trait = Color-From-Argb 255 155 28 30
        TraitText = Color-From-Argb 255 255 255 255
      }
    }
    "blue" {
      return [pscustomobject]@{
        Label = Color-From-Argb 255 34 100 184
        Name = Color-From-Argb 255 20 82 160
        NameStroke = Color-From-Argb 255 8 42 92
        Trait = Color-From-Argb 255 18 74 142
        TraitText = Color-From-Argb 255 255 255 255
      }
    }
    default {
      return [pscustomobject]@{
        Label = Color-From-Argb 255 190 160 0
        Name = Color-From-Argb 255 174 146 0
        NameStroke = Color-From-Argb 255 96 80 0
        Trait = Color-From-Argb 255 145 125 0
        TraitText = Color-From-Argb 255 164 0 0
      }
    }
  }
}

function Fill-Rect([System.Drawing.RectangleF]$rect, [System.Drawing.Color]$color, [System.Drawing.Color]$outline) {
  $brush = [System.Drawing.SolidBrush]::new($color)
  $graphics.FillRectangle($brush, $rect)
  $brush.Dispose()
  if ($outline.A -gt 0) {
    $pen = [System.Drawing.Pen]::new($outline, [Math]::Max(1, [int]($base.Width * 0.0025)))
    $graphics.DrawRectangle($pen, $rect.X, $rect.Y, $rect.Width, $rect.Height)
    $pen.Dispose()
  }
}

function Measure-Text-Width([string]$text, [System.Drawing.Font]$font) {
  return $graphics.MeasureString($text, $font).Width
}

function Wrap-To-Width([string]$text, [System.Drawing.Font]$font, [double]$width) {
  $lines = @()
  $current = ""
  foreach ($word in @($text -split "\s+" | Where-Object { $_ -ne "" })) {
    $candidate = if ($current -eq "") { $word } else { "$current $word" }
    if ((Measure-Text-Width $candidate $font) -le $width) {
      $current = $candidate
    } else {
      if ($current -ne "") { $lines += $current }
      $current = $word
    }
  }
  if ($current -ne "") { $lines += $current }
  return $lines
}

function Measure-Ability-Lines([string]$text, [System.Drawing.Font]$font, [System.Drawing.Font]$labelFont, [System.Drawing.RectangleF]$rect) {
  $result = @()
  $paragraphs = @($text -split "`n" | Where-Object { $_.Trim() -ne "" })
  foreach ($paragraph in $paragraphs) {
    $line = $paragraph.Trim()
    $label = ""
    $rest = $line
    $match = [regex]::Match($line, "^\s*\[([^\]]+)\]\s*(.*)$")
    if ($match.Success) {
      $label = $match.Groups[1].Value
      $rest = $match.Groups[2].Value.Trim()
    }

    $labelWidth = 0
    if ($label) {
      $labelWidth = (Measure-Text-Width $label $labelFont) + ($base.Width * 0.018)
    }

    $wrapped = @(Wrap-To-Width $rest $font ($rect.Width - $labelWidth - ($base.Width * 0.012)))
    if ($wrapped.Count -eq 0) {
      $result += [pscustomobject]@{ Label = $label; Text = ""; HasLabel = [bool]$label }
      continue
    }

    for ($index = 0; $index -lt $wrapped.Count; $index++) {
      $result += [pscustomobject]@{
        Label = if ($index -eq 0) { $label } else { "" }
        Text = $wrapped[$index]
        HasLabel = ($index -eq 0 -and [bool]$label)
      }
    }
  }
  return $result
}

function Fit-Ability-Text([string]$text, [System.Drawing.RectangleF]$rect, [double]$start, [double]$min) {
  for ($size = $start; $size -ge $min; $size -= 0.25) {
    $font = [System.Drawing.Font]::new("Arial", [single]$size, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $labelFont = [System.Drawing.Font]::new("Arial", [single][Math]::Max($min, $size - 1), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $lines = @(Measure-Ability-Lines $text $font $labelFont $rect)
    $lineHeight = $font.GetHeight($graphics) * 1.02
    if (($lines.Count * $lineHeight) -le ($rect.Height * 0.98)) {
      return [pscustomobject]@{ Font = $font; LabelFont = $labelFont; Lines = $lines; LineHeight = $lineHeight }
    }
    $font.Dispose()
    $labelFont.Dispose()
  }

  $fallback = [System.Drawing.Font]::new("Arial", [single]$min, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $fallbackLabel = [System.Drawing.Font]::new("Arial", [single]$min, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  return [pscustomobject]@{
    Font = $fallback
    LabelFont = $fallbackLabel
    Lines = @(Measure-Ability-Lines $text $fallback $fallbackLabel $rect)
    LineHeight = $fallback.GetHeight($graphics) * 1.0
  }
}

function Draw-Ability-Run([string]$text, [double]$x, [double]$y, [System.Drawing.Font]$font, [System.Drawing.Font]$labelFont, [double]$lineHeight) {
  $cursor = $x
  $pattern = "\[(AUTO|CONT|ACT|CXCombo|Counter)\]"
  $lastIndex = 0

  foreach ($match in [regex]::Matches($text, $pattern)) {
    if ($match.Index -gt $lastIndex) {
      $plain = $text.Substring($lastIndex, $match.Index - $lastIndex)
      $graphics.DrawString($plain, $font, $black, [single]$cursor, [single]$y)
      $cursor += Measure-Text-Width $plain $font
    }

    $label = $match.Groups[1].Value
    $labelWidth = (Measure-Text-Width $label $labelFont) + ($base.Width * 0.018)
    $labelRect = [System.Drawing.RectangleF]::new([single]$cursor, [single]($y + 1), [single]$labelWidth, [single]($lineHeight - 1))
    Fill-Rect $labelRect (Color-From-Argb 255 16 16 16) (Color-From-Argb 0 0 0 0)
    $graphics.DrawString($label, $labelFont, [System.Drawing.Brushes]::White, [single]($cursor + ($base.Width * 0.006)), [single]$y)
    $cursor += $labelWidth + ($base.Width * 0.006)
    $lastIndex = $match.Index + $match.Length
  }

  if ($lastIndex -lt $text.Length) {
    $plain = $text.Substring($lastIndex)
    $graphics.DrawString($plain, $font, $black, [single]$cursor, [single]$y)
  }
}

function Draw-Ability-Text([string]$text, [System.Drawing.RectangleF]$rect, [double]$start, [double]$min) {
  $fit = Fit-Ability-Text $text $rect $start $min
  $y = $rect.Y + [Math]::Max(0, ($rect.Height - ($fit.Lines.Count * $fit.LineHeight)) / 2)

  foreach ($line in $fit.Lines) {
    $x = $rect.X
    if ($line.HasLabel) {
      $labelWidth = (Measure-Text-Width $line.Label $fit.LabelFont) + ($base.Width * 0.018)
      $labelRect = [System.Drawing.RectangleF]::new([single]$x, [single]($y + 1), [single]$labelWidth, [single]($fit.LineHeight - 1))
      Fill-Rect $labelRect (Color-From-Argb 255 16 16 16) (Color-From-Argb 0 0 0 0)
      $labelBrush = [System.Drawing.Brushes]::White
      $graphics.DrawString($line.Label, $fit.LabelFont, $labelBrush, [single]($x + ($base.Width * 0.006)), [single]$y)
      $x += $labelWidth + ($base.Width * 0.010)
    }
    Draw-Ability-Run $line.Text $x $y $fit.Font $fit.LabelFont $fit.LineHeight
    $y += $fit.LineHeight
    if ($y -gt $rect.Bottom) { break }
  }

  return $fit
}

function Draw-Centered-Fit([System.Drawing.RectangleF]$rect, [string]$text, [string]$family, [double]$start, [double]$min, [int]$style, [System.Drawing.Brush]$brush) {
  $savedFamily = $script:fontFamily
  $script:fontFamily = $family
  $font = Fit-Font $text $rect $start $min $style $format
  $graphics.DrawString($text, $font, $brush, $rect, $format)
  $script:fontFamily = $savedFamily
  return $font
}

function Fit-One-Line-Font([string]$text, [System.Drawing.RectangleF]$rect, [string]$family, [double]$start, [double]$min, [int]$style) {
  for ($size = $start; $size -ge $min; $size -= 0.25) {
    $font = [System.Drawing.Font]::new($family, [single]$size, $style, [System.Drawing.GraphicsUnit]::Pixel)
    $measured = $graphics.MeasureString($text, $font)
    if ($measured.Width -le ($rect.Width * 0.96) -and $measured.Height -le ($rect.Height * 1.15)) {
      return $font
    }
    $font.Dispose()
  }
  return [System.Drawing.Font]::new($family, [single]$min, $style, [System.Drawing.GraphicsUnit]::Pixel)
}

function Draw-Centered-One-Line-Fit([System.Drawing.RectangleF]$rect, [string]$text, [string]$family, [double]$start, [double]$min, [int]$style, [System.Drawing.Brush]$brush) {
  $nameFormat = [System.Drawing.StringFormat]::new()
  $nameFormat.Alignment = [System.Drawing.StringAlignment]::Center
  $nameFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
  $nameFormat.Trimming = [System.Drawing.StringTrimming]::None
  $nameFormat.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap
  $font = Fit-One-Line-Font $text $rect $family $start $min $style
  $graphics.DrawString($text, $font, $brush, $rect, $nameFormat)
  $nameFormat.Dispose()
  return $font
}

$rules = [string]$data.text
$rules = $rules -replace "\?(AUTO|CONT|ACT|CXCombo)\?", '[$1]'
$traitOpen = [string][char]0x300A
$traitClose = [string][char]0x300B
$rules = [regex]::Replace($rules, "\?([A-Za-z][A-Za-z0-9 /-]{1,40})\?", { param($match) "$traitOpen$($match.Groups[1].Value)$traitClose" })
$name = [string]$data.name
$cardType = [string]$data.cardType
$traits = [string]$data.traits
$script:isClimax = $cardType.ToLowerInvariant().Contains("climax") -or $base.Width -gt $base.Height
$script:isCharacter = $cardType.ToLowerInvariant().Contains("character") -and -not $script:isClimax
$script:isEvent = $cardType.ToLowerInvariant().Contains("event") -and -not $script:isClimax
$isClimax = $script:isClimax
$rulesLength = $rules.Length
$rulesLineCount = (($rules -split "`n").Count)
$detectedRulesRect = Find-Ocr-Rules-Rect
if ($detectedRulesRect -eq $null) {
  $printedRect = Find-Printed-Rules-Rect
  if ($printedRect -ne $null) {
    $detectedRulesRect = $printedRect
  }
}

if ($isClimax) {
  $rulesLayout = Get-Climax-Rules-Layout
} else {
  $rulesLayout = Get-Rules-Layout $rules $detectedRulesRect
}
$rulesRect = $rulesLayout.Rect
$rulesStartSize = $rulesLayout.StartSize
$rulesMinSize = $rulesLayout.MinSize
$nameRect = if ($isClimax) {
  New-Rect 0.39 0.885 0.52 0.058
} elseif ($script:isEvent) {
  New-Rect 0.30 0.887 0.56 0.058
} elseif ($script:isCharacter) {
  New-Rect 0.33 0.889 0.54 0.034
} else {
  New-Rect 0.285 0.889 0.59 0.034
}
$traitStripRect = New-Rect 0.45 0.935 0.47 0.030
$colors = Get-Card-Colors ([string]$data.color)

$rulesInnerRect = [System.Drawing.RectangleF]::new(
  [single]($rulesRect.X + ($base.Width * 0.015)),
  [single]($rulesRect.Y + ($base.Height * 0.010)),
  [single]($rulesRect.Width - ($base.Width * 0.030)),
  [single]($rulesRect.Height - ($base.Height * 0.020))
)

Fill-Rect $rulesRect (Color-From-Argb 252 255 255 255) (Color-From-Argb 200 170 170 170)
$rulesFit = Draw-Ability-Text $rules $rulesInnerRect $rulesStartSize $rulesMinSize

Fill-Rect $nameRect $colors.Name (Color-From-Argb 180 40 40 40)
$nameBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
$nameStartSize = if ($isClimax) { $base.Height * 0.039 } else { $base.Height * 0.032 }
$nameMinSize = if ($isClimax) { $base.Height * 0.012 } else { $base.Height * 0.008 }
$nameFont = Draw-Centered-One-Line-Fit $nameRect $name "Georgia" $nameStartSize $nameMinSize ([System.Drawing.FontStyle]::Bold) $nameBrush
$nameBrush.Dispose()

$traitParts = @($traits -split "\s*/\s*" | Where-Object { $_.Trim() -ne "" } | Select-Object -First 2)
if (-not $isClimax -and $traitParts.Count -gt 0) {
  $gap = $base.Width * 0.008
  $pillWidth = ($traitStripRect.Width - ($gap * [Math]::Max(0, $traitParts.Count - 1))) / $traitParts.Count
  for ($index = 0; $index -lt $traitParts.Count; $index++) {
    $traitRect = [System.Drawing.RectangleF]::new(
      [single]($traitStripRect.X + ($index * ($pillWidth + $gap))),
      [single]$traitStripRect.Y,
      [single]$pillWidth,
      [single]$traitStripRect.Height
    )
    Fill-Rect $traitRect $colors.Trait (Color-From-Argb 170 70 70 70)
    $traitBrush = [System.Drawing.SolidBrush]::new($colors.TraitText)
    $traitFont = Draw-Centered-Fit $traitRect $traitParts[$index] "Arial" ($base.Height * 0.016) ($base.Height * 0.009) ([System.Drawing.FontStyle]::Bold) $traitBrush
    $traitBrush.Dispose()
    $traitFont.Dispose()
  }
}

$outputDir = Split-Path -Parent $data.outputPath
if ($outputDir) {
  New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
}

$bitmap.Save($data.outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$rulesFit.Font.Dispose()
$rulesFit.LabelFont.Dispose()
$nameFont.Dispose()
$format.Dispose()
$rulesFormat.Dispose()
$border.Dispose()
$white.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
$base.Dispose()

Write-Host "Wrote $($data.outputPath)"
