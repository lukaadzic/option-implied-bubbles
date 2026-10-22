#!/usr/bin/env python3
"""Render the data-driven 1200x630 social preview for option-implied-bubbles.

Pulls the S&P 500 combined bubble estimate series from the public Vercel Blob
store (the same source the dashboard fetches at runtime) and draws:

  - the headline reading (combined estimate at the ~1y maturity group,
    as a share of spot price) and where it sits in the asset's own history
  - a sparkline of that series since 1996
  - the product name and site URL

Reproducible: `python3 scripts/render-og.py` regenerates public/og.png.
"""

from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT = REPO_ROOT / "public" / "og.png"

# Same public Vercel Blob store the dashboard reads (src/utils/dataLoader.ts).
SPX_URL = (
    "https://kpjvwsjhhmtk0pdx.public.blob.vercel-storage.com/"
    "bubble_data_SPX_splitadj_1996to2023.json"
)

# The ~1y maturity group is the one the dashboard's summary panel is labelled
# with (SUMMARY_TAU_INDEX = 2 in src/hooks/useDashboardData.ts).
TAU_INDEX = 2
OPTION_TYPE = "combined"

W, H = 1200, 630

BG = "#0b1120"
PANEL = "#111a2e"
INK = "#e2e8f0"
MUTED = "#94a3b8"
ACCENT = "#f59e0b"  # tau3 series colour from the dark Plotly palette
ACCENT_DIM = "#b8860b"
GRID = "#1e293b"

# Montserrat static TTFs (Montserrat-Regular.ttf etc.). Override with OG_FONT_DIR.
FONT_DIR = Path(os.environ.get("OG_FONT_DIR", "~/.fonts")).expanduser()


def font(size: int, weight: str = "Regular") -> ImageFont.FreeTypeFont:
    path = FONT_DIR / f"Montserrat-{weight}.ttf"
    return ImageFont.truetype(str(path), size)


def load_spx() -> list[float]:
    """Return the combined-estimate series as % of spot price, oldest first."""
    print(f"Fetching {SPX_URL} …")
    with urllib.request.urlopen(SPX_URL, timeout=60) as resp:
        data = json.load(resp)
    series = []
    for point in data["time_series_data"]:
        group = point["bubble_estimates"]["daily_grouped"][TAU_INDEX]
        mu = group[OPTION_TYPE]["mu"]
        price = point["stock_prices"]["adjusted"]
        if price:
            series.append(mu / price * 100.0)
    if not series:
        raise SystemExit("no series points")
    return series


def percentile(series: list[float], value: float) -> float:
    at_or_below = sum(1 for v in series if v <= value)
    return at_or_below / len(series) * 100.0


def render(series: list[float]) -> None:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # Panel background with a faint grid.
    d.rounded_rectangle([48, 48, W - 48, H - 48], radius=24, fill=PANEL)
    grid_step = 60
    for gx in range(48 + 24, W - 48, grid_step):
        d.line([gx, 48, gx, H - 48], fill=GRID, width=1)
    for gy in range(48 + 24, H - 48, grid_step):
        d.line([48, gy, W - 48, gy], fill=GRID, width=1)

    f_big = font(58, "ExtraBold")
    f_med = font(30, "SemiBold")
    f_num = font(96, "ExtraBold")
    f_small = font(24, "Regular")
    f_micro = font(20, "Regular")

    # Eyebrow.
    d.text((96, 92), "OPTION-IMPLIED BUBBLE ESTIMATES", font=f_micro, fill=MUTED)

    # Title.
    d.text((96, 128), "S&P 500  ·  1996–2023", font=f_big, fill=INK)

    # Headline number: latest reading as % of spot.
    last = series[-1]
    pct = percentile(series, last)
    sign = "+" if last > 0 else ""
    d.text((96, 218), f"{sign}{last:.1f}%", font=f_num, fill=ACCENT)

    sub = (
        f"of spot price at the ~1y horizon  ·  {pct:.0f}th percentile since 1996"
    )
    d.text((96, 344), sub, font=f_med, fill=INK)

    # Sparkline of the full series.
    chart_x0, chart_y0 = 96, 430
    chart_x1, chart_y1 = W - 96, 556
    cw, ch = chart_x1 - chart_x0, chart_y1 - chart_y0
    lo, hi = min(series), max(series)
    span = hi - lo or 1.0
    # Zero line.
    zy = chart_y1 - (0 - lo) / span * ch
    if chart_y0 <= zy <= chart_y1:
        d.line([chart_x0, zy, chart_x1, zy], fill=GRID, width=2)

    step = cw / max(len(series) - 1, 1)
    pts = []
    for i, v in enumerate(series):
        x = chart_x0 + i * step
        y = chart_y1 - (v - lo) / span * ch
        pts.append((x, y))

    d.line(pts, fill=ACCENT, width=5, joint="curve")

    # End dot.
    ex, ey = pts[-1]
    r = 9
    d.ellipse([ex - r, ey - r, ex + r, ey + r], fill=ACCENT)
    d.ellipse([ex - r + 3, ey - r + 3, ex + r - 3, ey + r - 3], fill=PANEL)

    # Axis labels.
    def fmt(v: float) -> str:
        return f"{v:+.1f}%"

    d.text((chart_x0, chart_y1 + 8), "1996", font=f_micro, fill=MUTED)
    lx = chart_x1 - d.textlength("2023", font=f_micro)
    d.text((lx, chart_y1 + 8), "2023", font=f_micro, fill=MUTED)
    # Max label right-aligned above the chart, clear of any title text.
    hx = chart_x1 - d.textlength(fmt(hi), font=f_micro)
    d.text((hx, chart_y0 - 30), fmt(hi), font=f_micro, fill=MUTED)

    # Site URL pill, beside the headline number and clear of the sparkline.
    url = "financial-bubble.vercel.app"
    pill_w = int(d.textlength(url, font=f_small)) + 56
    pill_h = 56
    pill_x, pill_y = W - 96 - pill_w, 246
    d.rounded_rectangle(
        [pill_x, pill_y, pill_x + pill_w, pill_y + pill_h],
        radius=28,
        fill=ACCENT,
    )
    tw = d.textlength(url, font=f_small)
    d.text(
        (pill_x + (pill_w - tw) / 2, pill_y + 14),
        url,
        font=f_small,
        fill="#0b1120",
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {img.size[0]}x{img.size[1]})")


def main() -> None:
    series = load_spx()
    print(f"series points: {len(series)}, last {series[-1]:.3f}%")
    render(series)


if __name__ == "__main__":
    main()
