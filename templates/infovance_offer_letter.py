#!/usr/bin/env python3
"""
Infovance Technologies - Internship Offer Letter Generator

Single letter:
  python infovance_offer_letter.py --name "Aarav Sharma" --domain "Full Stack Web Development" \
      --start 2026-11-01 --end 2026-11-30 --seq 1

With custom output path and intern ID:
  python infovance_offer_letter.py --name "Aarav Sharma" --domain "Full Stack Web Development" \
      --start 2026-11-01 --end 2026-11-30 --intern-id "ISX-2026-ENG-000001" --out ./output.pdf

Many letters from a CSV (columns: name,domain,start,end[,seq]):
  python infovance_offer_letter.py --csv interns.csv --outdir letters

Needs: pip install reportlab pillow
Put the logo files (1_logo_dark.png, 7_symbol_only.png, msme_wordmark.png) in assets folder,
or pass --assets /path/to/folder.
"""
import argparse
import csv
import math
import os
import re
import sys
from datetime import date, datetime

from PIL import Image
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

# ----------------------------------------------------------------- settings
COMPANY = "Infovance Technologies"
TAGLINE = "Think Ahead. Build Beyond."
SIGNATORY_NAME = "Authorized Signatory"      # e.g. "Rahul Verma"
SIGNATORY_TITLE = "Infovance Technologies"   # e.g. "Founder & CEO"
# Footer contact details - replace with the real ones (set a value to "" to hide it)
WEBSITE = "linkedin.com/company/infovance-technologies"
PHONE = "+91 86965 63594"
EMAIL = "hr@infovence.in"
# MSME / Udyam badge shown next to the seal. Use your real Udyam number (set MSME_BADGE = False to hide)
MSME_BADGE = True
UDYAM_NO = "UDYAM-XX-00-0000000"

NAVY = HexColor("#0B1020")
INK = HexColor("#2A3147")
MUTED = HexColor("#6B7494")
PURPLE = HexColor("#7645EA")
BLUE = HexColor("#4A90EE")
CYAN = HexColor("#26C6EE")
CARD_BG = HexColor("#F5F6FF")
CARD_LINE = HexColor("#E1E4F7")

W, H = A4
M = 46  # side margin

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_DIRS = [
    os.path.join(SCRIPT_DIR, "assets", "fonts"),
    os.path.join(SCRIPT_DIR, "fonts"),
    "/usr/share/fonts/truetype/google-fonts",
    os.path.expanduser("~/.fonts"),
    "C:/Windows/Fonts",
    "/Library/Fonts",
]


def register_fonts(assets_dir=None):
    search_dirs = list(FONT_DIRS)
    if assets_dir:
        search_dirs.insert(0, os.path.join(assets_dir, "fonts"))
        search_dirs.insert(0, assets_dir)

    names = {
        "Regular": "Poppins-Regular.ttf",
        "Light": "Poppins-Light.ttf",
        "Medium": "Poppins-Medium.ttf",
        "Bold": "Poppins-Bold.ttf",
    }

    loaded_all = True
    for key, fn in names.items():
        font_name = f"P-{key}"
        if font_name in pdfmetrics.getRegisteredFontNames():
            continue
        found = False
        for d in search_dirs:
            path = os.path.join(d, fn)
            if os.path.exists(path):
                try:
                    pdfmetrics.registerFont(TTFont(font_name, path))
                    found = True
                    break
                except Exception:
                    pass
        if not found:
            loaded_all = False

    # Fallback to Helvetica if Poppins could not be found/registered
    if not loaded_all:
        print("[WARN] Poppins fonts not completely loaded. Falling back to core fonts.", file=sys.stderr)


def get_font(weight="Regular"):
    target = f"P-{weight}"
    if target in pdfmetrics.getRegisteredFontNames():
        return target
    if weight == "Bold":
        return "Helvetica-Bold"
    if weight == "Medium":
        return "Helvetica-Bold"
    return "Helvetica"


# ----------------------------------------------------------------- helpers
def fmt_date(d):
    return f"{d.day} {d.strftime('%B %Y')}"


def duration_text(start, end):
    days = (end - start).days + 1
    if days >= 28:
        months = round(days / 30.44)
        return f"{months} Month{'s' if months != 1 else ''} ({days} Days)"
    weeks = max(1, round(days / 7))
    return f"{weeks} Week{'s' if weeks != 1 else ''} ({days} Days)"


def domain_code(domain):
    words = [w for w in re.findall(r"[A-Za-z]+", domain) if w.lower() not in ("and", "of", "the", "&")]
    if len(words) == 1:
        return words[0][:3].upper()
    return "".join(w[0] for w in words[:4]).upper()


def default_unique_id(start, domain, seq):
    return f"IVT/INT/{start.year}/{domain_code(domain)}/{seq:04d}"


def gradient_rect(c, x, y, w, h, colors=(PURPLE, BLUE, CYAN), horizontal=True, radius=0):
    c.saveState()
    p = c.beginPath()
    if radius:
        p.roundRect(x, y, w, h, radius)
    else:
        p.rect(x, y, w, h)
    c.clipPath(p, stroke=0, fill=0)
    if horizontal:
        c.linearGradient(x, y, x + w, y, colors, extend=False)
    else:
        c.linearGradient(x, y, x, y + h, colors, extend=False)
    c.restoreState()


def para(c, text, style, x, y, w):
    p = Paragraph(text, style)
    _, h = p.wrap(w, 1000)
    p.drawOn(c, x, y - h)
    return y - h


def arc_text(c, text, cx, cy, r, font, size, top=True, spacing=1.2):
    widths = [stringWidth(ch, font, size) + spacing for ch in text]
    span = sum(widths) / r
    c.setFont(font, size)
    if top:
        a = math.pi / 2 + span / 2
        for ch, w in zip(text, widths):
            mid = a - (w / 2) / r
            c.saveState()
            c.translate(cx + r * math.cos(mid), cy + r * math.sin(mid))
            c.rotate(math.degrees(mid) - 90)
            c.drawCentredString(0, 0, ch)
            c.restoreState()
            a -= w / r
    else:
        a = 3 * math.pi / 2 - span / 2
        for ch, w in zip(text, widths):
            mid = a + (w / 2) / r
            c.saveState()
            c.translate(cx + r * math.cos(mid), cy + r * math.sin(mid))
            c.rotate(math.degrees(mid) + 90)
            c.drawCentredString(0, 0, ch)
            c.restoreState()
            a += w / r


def draw_seal(c, cx, cy, symbol_img, r=47):
    ink = Color(0.36, 0.25, 0.80)
    c.saveState()
    c.translate(cx, cy)
    c.rotate(-10)
    c.setStrokeColor(ink)
    c.setFillColor(ink)
    c.setStrokeAlpha(0.88)
    c.setFillAlpha(0.88)
    c.setLineWidth(1.6)
    c.circle(0, 0, r, stroke=1, fill=0)
    c.setLineWidth(0.6)
    c.circle(0, 0, r - 3.5, stroke=1, fill=0)
    c.setLineWidth(0.8)
    c.circle(0, 0, r - 19, stroke=1, fill=0)
    arc_text(c, "INFOVANCE TECHNOLOGIES", 0, 0, r - 11.5, get_font("Bold"), 6.4, top=True, spacing=1.4)
    arc_text(c, "OFFICIAL  \u2022  ISSUED", 0, 0, r - 8.2, get_font("Medium"), 5.4, top=False, spacing=1.6)
    c.setFillAlpha(1)
    s = 26
    if symbol_img:
        try:
            c.drawImage(symbol_img, -s / 2, -s / 2, s, s, mask="auto")
        except Exception:
            c.setFillColor(ink)
            c.setFont(get_font("Bold"), 12)
            c.drawCentredString(0, -4, "IVT")
    else:
        c.setFillColor(ink)
        c.setFont(get_font("Bold"), 12)
        c.drawCentredString(0, -4, "IVT")
    c.restoreState()


def draw_msme_badge(c, x, y, w=124, h=72, assets="."):
    """MSME wordmark (no government emblem) + Udyam registration line."""
    c.saveState()
    c.setFillColor(HexColor("#FFFFFF"))
    c.setStrokeColor(CARD_LINE)
    c.setLineWidth(0.9)
    c.roundRect(x, y, w, h, 8, stroke=1, fill=1)
    gradient_rect(c, x + 8, y + h - 3.2, w - 16, 3.2, radius=1.6)
    wm = os.path.join(assets, "msme_wordmark.png")
    if os.path.exists(wm):
        try:
            iw = w - 30
            ih = iw * 300 / 770
            c.drawImage(wm, x + (w - iw) / 2, y + h - 10 - ih, iw, ih, mask="auto")
        except Exception:
            c.setFillColor(NAVY)
            c.setFont(get_font("Bold"), 16)
            c.drawCentredString(x + w / 2, y + h - 26, "MSME", charSpace=2.2)
    else:
        c.setFillColor(NAVY)
        c.setFont(get_font("Bold"), 16)
        c.drawCentredString(x + w / 2, y + h - 26, "MSME", charSpace=2.2)
    pill_w = 82
    c.setFillColor(HexColor("#E8F8F1"))
    c.roundRect(x + (w - pill_w) / 2, y + 14.5, pill_w, 9.5, 4.7, stroke=0, fill=1)
    c.setFillColor(HexColor("#0E8A5C"))
    c.setFont(get_font("Bold"), 5.6)
    c.drawCentredString(x + w / 2, y + 16.6, "UDYAM REGISTERED", charSpace=0.6)
    if UDYAM_NO:
        c.setFillColor(INK)
        c.setFont(get_font("Medium"), 5.4)
        c.drawCentredString(x + w / 2, y + 6, UDYAM_NO)
    c.restoreState()


# ----------------------------------------------------------------- builder
def build_letter(out_path, name, domain, start, end, seq=1, issue_date=None, assets=".", custom_uid=None):
    register_fonts(assets)
    issue_date = issue_date or date.today()
    uid = custom_uid or default_unique_id(start, domain, seq)

    # Load header logo or fallback
    header_path = os.path.join(assets, "1_logo_dark.png")
    header_img = None
    header_h = 70
    if os.path.exists(header_path):
        try:
            header_pil = Image.open(header_path).convert("RGB")
            crop_bottom = min(700, header_pil.height)
            crop_top = min(40, header_pil.height)
            if crop_bottom > crop_top:
                header_pil = header_pil.crop((0, crop_top, header_pil.width, crop_bottom))
            header_h = W * header_pil.height / header_pil.width
            header_img = ImageReader(header_pil)
        except Exception as e:
            print(f"[WARN] Could not load header image: {e}", file=sys.stderr)

    # Load seal symbol or fallback
    symbol_path = os.path.join(assets, "7_symbol_only.png")
    symbol_img = None
    if os.path.exists(symbol_path):
        try:
            symbol_img = ImageReader(symbol_path)
        except Exception:
            pass

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    c = canvas.Canvas(out_path, pagesize=A4)
    c.setTitle(f"Internship Offer Letter - {name}")
    c.setAuthor(COMPANY)
    c.setSubject(f"{domain} Internship | {uid}")

    # ---- header (brand banner) + gradient edge
    if header_img:
        c.drawImage(header_img, 0, H - header_h, W, header_h)
    else:
        # Gradient banner fallback
        c.setFillColor(NAVY)
        c.rect(0, H - header_h, W, header_h, stroke=0, fill=1)
        c.setFillColor(HexColor("#FFFFFF"))
        c.setFont(get_font("Bold"), 20)
        c.drawString(M, H - 46, COMPANY.upper())
    gradient_rect(c, 0, H - header_h - 3.5, W, 3.5)

    # ---- title
    y = H - header_h - 40
    c.setFillColor(NAVY)
    c.setFont(get_font("Bold"), 22)
    c.drawString(M, y, "INTERNSHIP OFFER LETTER")
    gradient_rect(c, M, y - 11, 64, 3.5, radius=1.7)

    # ---- meta row
    y -= 36
    c.setFont(get_font("Regular"), 9)
    c.setFillColor(MUTED)
    c.drawString(M, y, "Date of Issue")
    c.setFillColor(NAVY)
    c.setFont(get_font("Medium"), 9.5)
    c.drawString(M + 64, y, fmt_date(issue_date))

    c.setFont(get_font("Medium"), 9)
    pill_w = stringWidth(uid, get_font("Bold"), 8.8) + 62
    px = W - M - pill_w
    c.setFillColor(CARD_BG)
    c.setStrokeColor(CARD_LINE)
    c.roundRect(px, y - 6, pill_w, 19, 9.5, stroke=1, fill=1)
    c.setFillColor(MUTED)
    c.setFont(get_font("Regular"), 7.5)
    c.drawString(px + 10, y - 0.5, "UNIQUE ID")
    c.setFillColor(PURPLE)
    c.setFont(get_font("Bold"), 8.8)
    c.drawString(px + 52, y - 0.8, uid)

    # ---- styles
    f_reg = get_font("Regular")
    f_bold = get_font("Bold")
    body = ParagraphStyle("body", fontName=f_reg, fontSize=9.6, leading=15.2,
                          textColor=INK, alignment=TA_LEFT)
    bold = f'<font name="{f_bold}" color="#0B1020">'
    cw = W - 2 * M

    # ---- greeting + intro
    y -= 30
    c.setFont(f_bold, 11.5)
    c.setFillColor(NAVY)
    c.drawString(M, y, f"Dear {name},")
    y -= 10
    y = para(c, (
        f"<font name='{f_bold}' color='#7645EA'>Congratulations!</font> We are delighted to offer you the position of "
        f"{bold}{domain} Intern</font> at {bold}{COMPANY}</font>. After reviewing your profile, we are confident "
        f"that you will be a valuable addition to our team, and we look forward to seeing you "
        f"<i>think ahead and build beyond</i>."), body, M, y, cw)

    # ---- details card
    y -= 14
    rows = [
        (("INTERN NAME", name), ("DOMAIN", domain)),
        (("START DATE", fmt_date(start)), ("END DATE", fmt_date(end))),
        (("DURATION", duration_text(start, end)), ("OFFER STATUS", "Confirmed")),
    ]
    row_h, pad = 37, 9
    card_h = row_h * len(rows) + pad * 2 - 6
    card_y = y - card_h
    c.setFillColor(CARD_BG)
    c.setStrokeColor(CARD_LINE)
    c.setLineWidth(0.8)
    c.roundRect(M, card_y, cw, card_h, 8, stroke=1, fill=1)
    gradient_rect(c, M + 10, card_y + 12, 3.5, card_h - 24, horizontal=False, colors=(PURPLE, BLUE, CYAN), radius=1.75)
    col_x = [M + 28, M + cw / 2 + 6]
    yy = y - pad - 14
    for ri, row in enumerate(rows):
        for ci, (label, value) in enumerate(row):
            c.setFillColor(MUTED)
            c.setFont(get_font("Medium"), 6.8)
            c.drawString(col_x[ci], yy + 11, label)
            c.setFillColor(NAVY if not (label == "OFFER STATUS") else HexColor("#12A06B"))
            c.setFont(get_font("Bold"), 10.6)
            c.drawString(col_x[ci], yy - 3, value)
        if ri < len(rows) - 1:
            c.setStrokeColor(CARD_LINE)
            c.setLineWidth(0.6)
            c.line(M + 28, yy - 14, M + cw - 16, yy - 14)
        yy -= row_h
    y = card_y

    # ---- program text
    y -= 18
    y = para(c, (
        f"During this internship you will work on {bold}practical, industry-relevant assignments and projects</font> "
        f"in <b>{domain}</b>, guided by our team. It is a chance to apply what you already know, sharpen your "
        f"technical skills and build real, portfolio-worthy experience."), body, M, y, cw)
    y -= 7
    y = para(c, (
        "Throughout the internship you are expected to participate actively, complete assigned tasks on time, "
        "follow the guidelines shared by Infovance Technologies, and maintain professional conduct and "
        "responsible communication."), body, M, y, cw)

    # ---- perks strip
    y -= 16
    perks = [("Real-World Projects", "Hands-on tasks, not just theory"),
             ("Mentor Guidance", "Learn from working professionals"),
             ("Completion Certificate", "On successful completion")]
    gap = 10
    pw = (cw - gap * 2) / 3
    ph = 40
    for i, (t, s) in enumerate(perks):
        px = M + i * (pw + gap)
        c.setFillColor(HexColor("#FFFFFF"))
        c.setStrokeColor(CARD_LINE)
        c.setLineWidth(0.8)
        c.roundRect(px, y - ph, pw, ph, 8, stroke=1, fill=1)
        # check badge
        bx, by = px + 15, y - ph / 2
        c.saveState()
        p = c.beginPath()
        p.circle(bx, by, 7.5)
        c.clipPath(p, stroke=0, fill=0)
        c.linearGradient(bx - 7.5, by - 7.5, bx + 7.5, by + 7.5, (PURPLE, CYAN), extend=False)
        c.restoreState()
        c.setStrokeColor(HexColor("#FFFFFF"))
        c.setLineWidth(1.6)
        c.setLineCap(1)
        c.setLineJoin(1)
        c.lines([(bx - 3.2, by - 0.2, bx - 0.8, by - 2.8), (bx - 0.8, by - 2.8, bx + 3.4, by + 2.6)])
        c.setFillColor(NAVY)
        c.setFont(get_font("Bold"), 8.3)
        c.drawString(px + 29, by + 3, t)
        c.setFillColor(MUTED)
        c.setFont(get_font("Regular"), 6.8)
        c.drawString(px + 29, by - 7, s)
    y -= ph

    # ---- closing
    y -= 16
    y = para(c, (
        "On successful completion, you will receive an <b>Internship Completion Certificate</b>, and outstanding "
        "performers may be considered for a Letter of Recommendation and future opportunities with us."),
        body, M, y, cw)
    y -= 7
    y = para(c, (
        f"Welcome aboard! We wish you all the best for your journey with {bold}{COMPANY}</font>."),
        body, M, y, cw)
    y -= 8
    c.setFont(get_font("Regular"), 9.6)
    c.setFillColor(INK)
    c.drawString(M, y - 10, "Best regards,")

    # ---- signature block + seal
    sig_line_y = 104
    c.setStrokeColor(NAVY)
    c.setLineWidth(0.9)
    c.line(M, sig_line_y, M + 150, sig_line_y)
    c.setFillColor(NAVY)
    c.setFont(get_font("Bold"), 10)
    c.drawString(M, sig_line_y - 14, SIGNATORY_NAME)
    c.setFillColor(MUTED)
    c.setFont(get_font("Regular"), 8.3)
    c.drawString(M, sig_line_y - 26, SIGNATORY_TITLE)
    seal_cx, seal_cy = W - M - 46, sig_line_y + 4
    draw_seal(c, seal_cx, seal_cy, symbol_img, r=44)
    if MSME_BADGE:
        bw, bh = 124, 72
        draw_msme_badge(c, seal_cx - 44 - 16 - bw, seal_cy - bh / 2 - 5, bw, bh, assets)

    # ---- footer (contacts + tagline)
    fh = 54
    c.setFillColor(NAVY)
    c.rect(0, 0, W, fh, stroke=0, fill=1)
    gradient_rect(c, 0, fh, W, 3)
    items = [(l, v) for l, v in (("WEBSITE", WEBSITE), ("MOBILE", PHONE), ("EMAIL", EMAIL)) if v]
    if items:
        step = (W - 2 * M) / len(items)
        for i, (label, value) in enumerate(row for row in items):
            label, value = label, value
            cx = M + step * (i + 0.5)
            c.setFillColor(CYAN)
            c.setFont(get_font("Medium"), 5.8)
            c.drawCentredString(cx, 38, label, charSpace=1.4)
            c.setFillColor(HexColor("#E4E8FF"))
            c.setFont(get_font("Medium"), 8.2)
            c.drawCentredString(cx, 27, value)
            if i:
                c.setStrokeColor(HexColor("#2A3260"))
                c.setLineWidth(0.6)
                c.line(M + step * i, 24, M + step * i, 43)
    c.setFillColor(HexColor("#8F9AD8"))
    c.setFont(get_font("Light"), 6.3)
    c.drawCentredString(W / 2, 9, f"{COMPANY.upper()}   \u2022   {TAGLINE.upper()}", charSpace=0.8)

    c.showPage()
    c.save()
    return uid


def parse_date(s):
    return datetime.strptime(s.strip(), "%Y-%m-%d").date()


def main():
    default_assets = os.path.join(SCRIPT_DIR, "assets")
    if not os.path.exists(default_assets):
        default_assets = SCRIPT_DIR

    ap = argparse.ArgumentParser(description="Infovance Technologies offer letter generator")
    ap.add_argument("--name")
    ap.add_argument("--domain")
    ap.add_argument("--start", help="YYYY-MM-DD")
    ap.add_argument("--end", help="YYYY-MM-DD")
    ap.add_argument("--seq", type=int, default=1, help="running number used in the unique ID")
    ap.add_argument("--intern-id", "--uid", dest="uid", help="custom intern unique ID (overrides default format)")
    ap.add_argument("--issue", help="issue date YYYY-MM-DD (default: today)")
    ap.add_argument("--csv", help="CSV with columns name,domain,start,end[,seq]")
    ap.add_argument("--outdir", default=".")
    ap.add_argument("--out", help="explicit output file path (e.g. /path/to/letter.pdf)")
    ap.add_argument("--assets", default=default_assets)
    a = ap.parse_args()

    issue = parse_date(a.issue) if a.issue else None

    if a.csv:
        os.makedirs(a.outdir, exist_ok=True)
        jobs = []
        with open(a.csv, newline="", encoding="utf-8-sig") as f:
            for i, r in enumerate(csv.DictReader(f), start=1):
                jobs.append((r["name"].strip(), r["domain"].strip(), parse_date(r["start"]),
                             parse_date(r["end"]), int(r.get("seq") or i)))
        for name, domain, s, e, seq in jobs:
            safe = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_")
            out = os.path.join(a.outdir, f"Offer_Letter_{safe}.pdf")
            uid = build_letter(out, name, domain, s, e, seq, issue, a.assets)
            print(f"{out}   [{uid}]")
    else:
        if not all([a.name, a.domain, a.start, a.end]):
            ap.error("give --name --domain --start --end (or use --csv)")
        
        s_date = parse_date(a.start)
        e_date = parse_date(a.end)
        
        if a.out:
            out = a.out
        else:
            os.makedirs(a.outdir, exist_ok=True)
            safe = re.sub(r"[^A-Za-z0-9]+", "_", a.name).strip("_")
            out = os.path.join(a.outdir, f"Offer_Letter_{safe}.pdf")

        uid = build_letter(out, a.name, a.domain, s_date, e_date, a.seq, issue, a.assets, custom_uid=a.uid)
        print(f"SUCCESS: {out}   [{uid}]")


if __name__ == "__main__":
    main()
