
import argparse
import os
from datetime import datetime

import requests
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer,
    Table, TableStyle, PageBreak
)

# ---------- ตั้งค่า ----------
parser = argparse.ArgumentParser()
parser.add_argument("--host", default="http://localhost:9000")
parser.add_argument("--project", default="grocery-POS")
args = parser.parse_args()

token = os.environ.get("SONAR_TOKEN")
if not token:
    raise SystemExit("กรุณาตั้งค่า SONAR_TOKEN ก่อนใช้งาน")

# ---------- ฟอนต์ภาษาไทย ----------
font_candidates = [
    r"C:\Windows\Fonts\tahoma.ttf",
    r"C:\Windows\Fonts\THSarabunNew.ttf",
    r"C:\Windows\Fonts\LeelawUI.ttf",
]

font_path = next(
    (path for path in font_candidates if os.path.isfile(path)),
    None
)

if not font_path:
    raise SystemExit("ไม่พบฟอนต์ภาษาไทยใน Windows")

pdfmetrics.registerFont(TTFont("ThaiFont", font_path))

# ---------- ดึงข้อมูล SonarQube ----------
session = requests.Session()
session.auth = (token, "")

metric_keys = [
    "alert_status",
    "bugs",
    "vulnerabilities",
    "code_smells",
    "coverage",
    "duplicated_lines_density",
    "ncloc"
]

url = args.host.rstrip("/") + "/api/measures/component"

try:
    response = session.get(
        url,
        params={
            "component": args.project,
            "metricKeys": ",".join(metric_keys)
        },
        timeout=30
    )
    response.raise_for_status()
except requests.RequestException as error:
    raise SystemExit(f"ไม่สามารถดึงข้อมูล SonarQube: {error}")

data = response.json()
measures = {
    item["metric"]: item.get("value", "ไม่มีข้อมูล")
    for item in data["component"].get("measures", [])
}

# ---------- รูปแบบรายงาน ----------
NAVY = colors.HexColor("#23364D")
LIGHT = colors.HexColor("#EDF1F5")
GRAY = colors.HexColor("#5F6B76")

title_style = ParagraphStyle(
    "TitleThai",
    fontName="ThaiFont",
    fontSize=19,
    leading=28,
    alignment=TA_CENTER,
    textColor=NAVY,
    spaceAfter=12
)

heading_style = ParagraphStyle(
    "HeadingThai",
    fontName="ThaiFont",
    fontSize=14,
    leading=21,
    textColor=NAVY,
    spaceBefore=14,
    spaceAfter=8
)

body_style = ParagraphStyle(
    "BodyThai",
    fontName="ThaiFont",
    fontSize=11,
    leading=18,
    alignment=TA_LEFT,
    spaceAfter=7
)

small_style = ParagraphStyle(
    "SmallThai",
    fontName="ThaiFont",
    fontSize=10,
    leading=16,
    textColor=GRAY
)

def p(text, style=body_style):
    return Paragraph(str(text), style)

def get_value(key):
    return measures.get(key, "ไม่มีข้อมูล")

def metric_row(label, key, unit=""):
    value = get_value(key)
    if value != "ไม่มีข้อมูล":
        value = str(value) + unit
    return [p(label), p(value)]

quality = get_value("alert_status")
quality_text = {
    "OK": "ผ่านเกณฑ์ (Passed)",
    "ERROR": "ไม่ผ่านเกณฑ์ (Failed)",
    "WARN": "มีข้อควรระวัง"
}.get(quality, str(quality))

rows = [
    [p("รายการประเมิน"), p("ผลการวิเคราะห์")],
    [p("Quality Gate"), p(quality_text)],
    metric_row("ข้อบกพร่องของโปรแกรม (Bugs)", "bugs"),
    metric_row("ช่องโหว่ด้านความปลอดภัย (Vulnerabilities)", "vulnerabilities"),
    metric_row("ประเด็นคุณภาพโค้ด (Code Smells)", "code_smells"),
    metric_row("ความครอบคลุมของการทดสอบ (Coverage)", "coverage", "%"),
    metric_row("โค้ดซ้ำซ้อน (Duplicated Lines)", "duplicated_lines_density", "%"),
    metric_row("จำนวนบรรทัดโค้ด (Lines of Code)", "ncloc")
]

# ---------- สร้าง PDF ----------
output = "sonarqube_report_th.pdf"

doc = SimpleDocTemplate(
    output,
    pagesize=A4,
    rightMargin=2.2 * cm,
    leftMargin=2.2 * cm,
    topMargin=2.0 * cm,
    bottomMargin=2.0 * cm
)

story = []

story.append(p(
    "รายงานผลการตรวจสอบคุณภาพซอร์สโค้ด",
    title_style
))
story.append(p(
    "ระบบบริหารจัดการร้านขายของชำ (Grocery Store POS System)",
    title_style
))
story.append(Spacer(1, 12))

story.append(p(f"เครื่องมือที่ใช้: SonarQube Community"))
story.append(p(f"Project Key: {args.project}"))
story.append(p(
    "วันที่จัดทำรายงาน: " +
    datetime.now().strftime("%d/%m/%Y %H:%M")
))

story.append(p("1. วัตถุประสงค์", heading_style))
story.append(p(
    "เพื่อประเมินคุณภาพซอร์สโค้ดของระบบบริหารจัดการร้านขายของชำ "
    "โดยตรวจสอบข้อบกพร่องของโปรแกรม ประเด็นด้านความปลอดภัย "
    "ความสามารถในการบำรุงรักษา ความซ้ำซ้อนของโค้ด "
    "และข้อมูลความครอบคลุมของการทดสอบ"
))

story.append(p("2. ผลการวิเคราะห์ด้วย SonarQube", heading_style))

table = Table(rows, colWidths=[10.3 * cm, 5.1 * cm], repeatRows=1)
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), NAVY),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [
        colors.white, LIGHT
    ]),
    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#C7CDD4")),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("LEFTPADDING", (0, 0), (-1, -1), 10),
    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ("TOPPADDING", (0, 0), (-1, -1), 9),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
]))
story.append(table)
story.append(PageBreak())
story.append(p("3. การอภิปรายผล", heading_style))
story.append(p(
    f"ผลการตรวจสอบ Quality Gate: {quality_text} "
    "ซึ่งเป็นผลการประเมินตามเงื่อนไขที่กำหนดไว้ใน SonarQube "
    "โดยไม่สามารถใช้ยืนยันได้ว่าระบบปราศจากข้อบกพร่องทั้งหมด"
))

story.append(p(
    f"จากการวิเคราะห์พบ Bugs จำนวน {get_value('bugs')} รายการ "
    f"Vulnerabilities จำนวน {get_value('vulnerabilities')} รายการ "
    f"และ Code Smells จำนวน {get_value('code_smells')} รายการ "
    "ซึ่งเป็นประเด็นที่ควรตรวจสอบรายละเอียดและพิจารณาปรับปรุง"
))

story.append(p(
    f"ค่า Coverage เท่ากับ {get_value('coverage')}% "
    "โดยเป็นค่าความครอบคลุมของการทดสอบที่ SonarQube ได้รับรายงาน "
    "จึงไม่ใช่ผลยืนยันว่าการทดสอบด้วยตนเองไม่ผ่าน"
))

story.append(p(
    f"ค่า Duplicated Lines เท่ากับ "
    f"{get_value('duplicated_lines_density')}% "
    "แสดงสัดส่วนของโค้ดที่ SonarQube ตรวจพบว่ามีความซ้ำซ้อน"
))

story.append(p("4. ข้อเสนอแนะ", heading_style))
story.append(p(
    "ควรตรวจสอบรายละเอียดของ Bugs และ Vulnerabilities "
    "ตามระดับความรุนแรง ปรับปรุงโค้ดที่มีปัญหา "
    "ลดความซ้ำซ้อน และพิจารณาเพิ่มการทดสอบอัตโนมัติ "
    "พร้อมส่งรายงาน Coverage ให้ SonarQube "
    "เพื่อให้การประเมินคุณภาพมีความครอบคลุมมากยิ่งขึ้น"
))

def add_footer(canvas, document):
    canvas.saveState()
    canvas.setFont("ThaiFont", 9)
    canvas.setFillColor(GRAY)
    canvas.drawCentredString(
        A4[0] / 2, 1.2 * cm,
        f"SonarQube Analysis Report | หน้า {document.page}"
    )
    canvas.restoreState()

doc.build(story, onFirstPage=add_footer, onLaterPages=add_footer)

print(f"สร้างรายงานสำเร็จ: {output}")
