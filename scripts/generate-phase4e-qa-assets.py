#!/usr/bin/env python3
"""Create local-only raster media for Phase 4E print-layout QA.

These assets are synthetic, regenerated in /tmp, and intentionally never read
or write project evidence, Storage, or production data.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/phase4e-pdf-fixtures/assets")
OUT.mkdir(parents=True, exist_ok=True)


def save(image: Image.Image, name: str) -> None:
    image.save(OUT / name, format="PNG", optimize=True)


def label(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, fill: str = "#ffffff") -> None:
    draw.text(xy, text, fill=fill, stroke_width=1, stroke_fill="#0f172a")


def site() -> None:
    image = Image.new("RGB", (1600, 900), "#cfe8f5")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 560, 1600, 900), fill="#759e64")
    draw.polygon([(0, 760), (1600, 460), (1600, 610), (0, 900)], fill="#3f4d5a")
    draw.line([(0, 760), (1600, 460)], fill="#f8fafc", width=18)
    draw.rectangle((540, 280, 1060, 640), fill="#d6b47b", outline="#6b4f2f", width=8)
    draw.rectangle((625, 355, 975, 640), fill="#7cb0c5", outline="#31485a", width=7)
    for x in (80, 220, 1240, 1420):
        draw.rectangle((x, 360, x + 48, 640), fill="#456d38")
        draw.ellipse((x - 60, 200, x + 108, 440), fill="#2f6a3d")
    label(draw, (72, 62), "LOCAL QA SITE IMAGE — synthetic only")
    save(image, "site-landscape.png")


def satellite() -> None:
    image = Image.new("RGB", (1600, 900), "#d8e5c8")
    draw = ImageDraw.Draw(image)
    for x in range(0, 1600, 110):
        draw.line((x, 0, x, 900), fill="#a6bf91", width=3)
    for y in range(0, 900, 90):
        draw.line((0, y, 1600, y), fill="#a6bf91", width=3)
    draw.line(((-80, 820), (1680, 100)), fill="#65737f", width=84)
    draw.line(((-80, 820), (1680, 100)), fill="#fef3c7", width=9)
    draw.line(((180, -50), (1300, 970)), fill="#5b6974", width=44)
    draw.line(((180, -50), (1300, 970)), fill="#f8fafc", width=5)
    draw.rectangle((655, 360, 945, 585), fill="#d97d59", outline="#7c2d12", width=8)
    draw.ellipse((740, 280, 860, 400), fill="#dc2626", outline="#ffffff", width=6)
    label(draw, (70, 55), "LOCAL QA SATELLITE / ROUTE MAP — synthetic only")
    save(image, "satellite-map.png")


def portrait() -> None:
    image = Image.new("RGB", (900, 1400), "#dbeafe")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 940, 900, 1400), fill="#8aad69")
    draw.rectangle((170, 260, 720, 1030), fill="#e5d4b5", outline="#6b4f2f", width=9)
    draw.rectangle((300, 615, 590, 1030), fill="#f8fafc", outline="#334155", width=8)
    draw.rectangle((205, 370, 685, 550), fill="#77b5d3", outline="#334155", width=8)
    draw.rectangle((330, 820, 560, 850), fill="#ef4444")
    label(draw, (62, 62), "LOCAL QA PORTRAIT PHOTO")
    save(image, "existing-portrait.png")


def safety() -> None:
    image = Image.new("RGB", (1400, 900), "#e2e8f0")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 635, 1400, 900), fill="#94a3b8")
    draw.rectangle((445, 120, 960, 715), fill="#b91c1c", outline="#7f1d1d", width=12)
    draw.rectangle((510, 205, 895, 560), fill="#fef2f2", outline="#7f1d1d", width=7)
    for y in range(260, 520, 70):
        draw.ellipse((570, y, 615, y + 45), fill="#16a34a")
        draw.ellipse((690, y, 735, y + 45), fill="#f59e0b")
        draw.ellipse((810, y, 855, y + 45), fill="#dc2626")
    draw.rectangle((545, 595, 860, 670), fill="#7f1d1d")
    label(draw, (62, 62), "LOCAL QA SAFETY SYSTEM PHOTO")
    save(image, "safety-landscape.png")


def code_excerpt() -> None:
    html_path = OUT / "code-excerpt-source.html"
    png_path = OUT / "code-excerpt.png"
    html_path.write_text(
        """<!doctype html><html lang=\"ar\" dir=\"rtl\"><head><meta charset=\"utf-8\"><style>
        *{box-sizing:border-box} body{margin:0;width:1600px;height:1100px;background:#f8fafc;font-family:'Noto Naskh Arabic',Tahoma,Arial,sans-serif;color:#111827;padding:30px}
        .sheet{height:1040px;border:5px solid #1f4d3a;background:#fff;padding:30px 38px}.head{display:flex;justify-content:space-between;align-items:start;border-bottom:3px solid #1f4d3a;padding-bottom:14px}.title{font-size:38px;font-weight:800;color:#1f4d3a}.sub{font-size:22px;color:#475569}.meta{font-family:Arial,sans-serif;direction:ltr;text-align:left;font-size:21px;line-height:1.5}.clause{margin-top:22px;background:#e8f2ec;border-right:8px solid #1f4d3a;padding:18px 24px;font-size:28px;line-height:1.55}.eng{font-family:Arial,sans-serif;direction:ltr;text-align:left;margin-top:22px;font-size:27px;line-height:1.42;background:#f8fafc;border:2px solid #cbd5e1;padding:18px 24px}.foot{margin-top:18px;font-size:20px;color:#475569}
        </style></head><body><main class=\"sheet\"><div class=\"head\"><div><div class=\"title\">مقتطف مرجعي فني — اختبار محلي</div><div class=\"sub\">تُستخدم هذه الصورة للتحقق من مقروئية المقتطفات فقط.</div></div><div class=\"meta\">SBC 801:2024<br>Clause 8.2.1<br>Page 12</div></div><div class=\"clause\">يجب المحافظة على وضوح معلومات المرجع الفني وارتباطها بالملاحظة الهندسية دون فصل العنوان أو البيانات عن المقتطف.</div><div class=\"eng\">SBC 801 — Clause 8.2.1<br>Provide a readable code excerpt with source, edition, clause and page metadata.<br>Arabic and English test text must remain legible at normal PDF viewing scale.</div><div class=\"foot\">المصدر: أصل صناعي محلي للفحص البصري — لا يمثل نصًا كوديًا معتمدًا.</div></main></body></html>""",
        encoding="utf-8",
    )
    subprocess.run(
        [
            "chromium", "--headless=new", "--disable-gpu", "--no-sandbox",
            "--window-size=1600,1100", "--hide-scrollbars",
            f"--screenshot={png_path}", html_path.as_uri(),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


site()
satellite()
portrait()
safety()
code_excerpt()
print(OUT)
