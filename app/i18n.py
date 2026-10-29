"""Thai translations for user-facing server messages (English is the source text)."""
from __future__ import annotations

import re

EXACT = {
    "The AI returned an unusable translation. Please try again.": "AI ส่งผลการแปลที่ใช้ไม่ได้ กรุณาลองอีกครั้ง",
    "The AI service could not be reached.": "เชื่อมต่อบริการ AI ไม่ได้",
    "The AI service returned an unexpected response.": "บริการ AI ตอบกลับในรูปแบบที่ไม่คาดคิด",
    "AI is not configured on this server.": "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า AI",
    "Translation needs an AI service, which is not configured on this server.": "การแปลภาษาต้องใช้บริการ AI ซึ่งเซิร์ฟเวอร์ยังไม่ได้ตั้งค่า",
    "The crop area is empty.": "พื้นที่ตัดขอบว่างเปล่า",
    "Missing image upload.": "ไม่พบรูปภาพที่อัปโหลด",
    "The watermark image could not be read.": "อ่านรูปลายน้ำไม่ได้",
    "Unsupported image data.": "ไม่รองรับข้อมูลรูปภาพนี้",
    "Enter at least one page range.": "กรอกช่วงหน้าอย่างน้อยหนึ่งช่วง",
    "Invalid page reference.": "อ้างอิงหน้าไม่ถูกต้อง",
    "The page selection is empty or out of range.": "ไม่ได้เลือกหน้า หรือหน้าอยู่นอกช่วงที่มี",
    "This file is not a valid PDF (or it is damaged). Try the Repair tool.": "ไฟล์นี้ไม่ใช่ PDF ที่ถูกต้อง (หรือเสียหาย) ลองใช้เครื่องมือซ่อมแซม PDF",
    "Unsupported file type.": "ไม่รองรับไฟล์ชนิดนี้",
    "Enter a full http(s) address, for example https://example.com": "กรอกที่อยู่เต็มแบบ http(s) เช่น https://example.com",
    "That URL is not valid.": "URL นี้ไม่ถูกต้อง",
    "URLs with credentials are not allowed.": "ไม่อนุญาต URL ที่มีชื่อผู้ใช้/รหัสผ่านแฝง",
    "A workflow needs between 1 and 8 steps.": "เวิร์กโฟลว์ต้องมี 1 ถึง 8 ขั้นตอน",
    "Only standard web ports are allowed.": "อนุญาตเฉพาะพอร์ตเว็บมาตรฐาน",
    "This address is not a public website.": "ที่อยู่นี้ไม่ใช่เว็บไซต์สาธารณะ",
    "The document could not be converted. It may be corrupt or protected.": "แปลงเอกสารไม่ได้ ไฟล์อาจเสียหายหรือมีการป้องกันไว้",
    "No pages left to save.": "ไม่มีหน้าเหลือให้บันทึก",
    "Could not flatten the form fields.": "ทำให้ช่องฟอร์มแบนไม่สำเร็จ",
    "Upload a watermark image.": "อัปโหลดรูปลายน้ำ",
    "No embedded images were found in this PDF.": "ไม่พบรูปภาพที่ฝังอยู่ใน PDF นี้",
    "Enter a password.": "กรอกรหัสผ่าน",
    "Could not extract key sentences. Configure AI for better results.": "สรุปประโยคสำคัญไม่ได้ ตั้งค่า AI เพื่อผลลัพธ์ที่ดีกว่า",
    "No tables or text were found in this PDF.": "ไม่พบตารางหรือข้อความใน PDF นี้",
    "Enter the watermark text.": "กรอกข้อความลายน้ำ",
    "Enter a web address, paste HTML or upload an .html file.": "กรอกที่อยู่เว็บ วาง HTML หรืออัปโหลดไฟล์ .html",
    "Nothing to apply yet. Add some text, shapes or a signature first.": "ยังไม่มีอะไรให้ใช้ เพิ่มข้อความ รูปทรง หรือลายเซ็นก่อน",
    "Nothing to redact: draw boxes or enter text to find.": "ไม่มีอะไรให้ปกปิด วาดกล่องหรือกรอกข้อความที่จะค้นหา",
    "Paste some text or upload a file.": "วางข้อความหรืออัปโหลดไฟล์",
    "Select an area or enter margins to crop.": "เลือกพื้นที่หรือกรอกขอบที่จะตัด",
    "This PDF is password protected.": "PDF นี้มีรหัสผ่านป้องกันอยู่",
    "Wrong password.": "รหัสผ่านไม่ถูกต้อง",
    "This PDF needs its password to be opened.": "PDF นี้ต้องใช้รหัสผ่านเพื่อเปิด",
    "No text layer found. Run OCR first, then translate.": "ไม่พบข้อความในไฟล์ ให้ทำ OCR ก่อนแล้วจึงแปล",
    "This PDF looks scanned (no text layer). Enable OCR and try again.": "PDF นี้ดูเหมือนเป็นภาพสแกน (ไม่มีข้อความ) เปิดใช้ OCR แล้วลองอีกครั้ง",
    "The operation took too long and was cancelled.": "ใช้เวลานานเกินไปและถูกยกเลิก",
    "This took too long and was cancelled.": "ใช้เวลานานเกินไปและถูกยกเลิก",
    "An inserted image is too large.": "รูปที่แทรกมีขนาดใหญ่เกินไป",
    "That document is too large to translate in one go.": "เอกสารนี้ใหญ่เกินกว่าจะแปลในครั้งเดียว",
    "Compare is limited to 120 pages.": "เปรียบเทียบได้สูงสุด 120 หน้า",
    "OCR is limited to 150 pages per file.": "OCR รองรับสูงสุด 150 หน้าต่อไฟล์",
    "Please select at most 300 pages at a time.": "เลือกได้สูงสุด 300 หน้าต่อครั้ง",
    "That would create more than 500 files.": "จะได้ไฟล์มากกว่า 500 ไฟล์",
    "Translation is limited to 60 pages at a time.": "แปลได้สูงสุด 60 หน้าต่อครั้ง",
    "There is not enough text to summarize.": "ข้อความน้อยเกินกว่าจะสรุปได้",
    "Colour profile for PDF/A is missing on this server.": "เซิร์ฟเวอร์ไม่มีโปรไฟล์สีสำหรับ PDF/A",
    "OCR engine is not installed on this server.": "เซิร์ฟเวอร์ยังไม่ได้ติดตั้งระบบ OCR",
    "Office conversion is not available on this server.": "เซิร์ฟเวอร์ยังไม่รองรับการแปลงไฟล์ Office",
    "The browser engine is not available on this server.": "เซิร์ฟเวอร์ไม่มีเอนจินเบราว์เซอร์",
    "This PDF is too damaged to repair.": "PDF นี้เสียหายเกินกว่าจะซ่อมได้",
    "Something went wrong while processing this file.": "เกิดข้อผิดพลาดขณะประมวลผลไฟล์นี้",
    "This file needs more memory than is allowed.": "ไฟล์นี้ต้องใช้หน่วยความจำมากกว่าที่อนุญาต",
    "Processing failed. The file may be damaged or too complex.": "ประมวลผลไม่สำเร็จ ไฟล์อาจเสียหายหรือซับซ้อนเกินไป",
    "Something went wrong.": "เกิดข้อผิดพลาดบางอย่าง",
    "Unknown tool.": "ไม่รู้จักเครื่องมือนี้",
    "Invalid options.": "ตัวเลือกไม่ถูกต้อง",
    "Please add the required files.": "กรุณาเพิ่มไฟล์ที่ต้องใช้",
    "Missing file.": "ไม่พบไฟล์",
    "This job has expired. Please run it again.": "งานนี้หมดอายุแล้ว กรุณาทำใหม่",
    "File not available (it may have expired).": "ไม่พบไฟล์ (อาจหมดอายุแล้ว)",
    "No such file.": "ไม่พบไฟล์นี้",
    "File not available.": "ไม่พบไฟล์",
    "Files not available (they may have expired).": "ไม่พบไฟล์ (อาจหมดอายุแล้ว)",
    "Not found.": "ไม่พบหน้านี้",
    "AI features are limited per hour. Please try again later.": "ฟีเจอร์ AI จำกัดจำนวนครั้งต่อชั่วโมง กรุณาลองใหม่ภายหลัง",
    "AI features have reached today's shared limit. Please try again tomorrow.": "ฟีเจอร์ AI ใช้ครบโควตารวมของวันนี้แล้ว กรุณาลองใหม่พรุ่งนี้",
    "Too many requests. Please try again in a little while.": "คำขอมากเกินไป กรุณาลองใหม่ภายหลัง",
    "Please wait for your current jobs to finish.": "กรุณารอให้งานที่กำลังทำอยู่เสร็จก่อน",
    "The server is busy. Please try again shortly.": "เซิร์ฟเวอร์กำลังยุ่ง กรุณาลองใหม่อีกครั้งในอีกสักครู่",
}

PATTERNS = [
    (r"Files are too large \(limit (\d+) MB(?: per request)?\)\.?", "ไฟล์ใหญ่เกินไป (จำกัด {0} MB)"),
    (r"At most (\d+) files are allowed for this tool\.", "เครื่องมือนี้รองรับสูงสุด {0} ไฟล์"),
    (r"“(.+)” is not a supported file type for this tool \((.+)\)\.", "ไม่รองรับไฟล์ “{0}” สำหรับเครื่องมือนี้ (รองรับ {1})"),
    (r"“(.+)” does not look like a valid \.(\w+) file\.", "“{0}” ไม่ใช่ไฟล์ .{1} ที่ถูกต้อง"),
    (r"“(.+)” is empty\.", "“{0}” เป็นไฟล์ว่าง"),
    (r"(.+) could not be read as an image\.", "อ่าน {0} เป็นรูปภาพไม่ได้"),
    (r"(.+) is not a valid PDF\.", "{0} ไม่ใช่ PDF ที่ถูกต้อง"),
    (r"(.+) is already password protected\. Unlock it first\.", "{0} มีรหัสผ่านอยู่แล้ว กรุณาปลดล็อกก่อน"),
    (r"Invalid page range: (.+)", "ช่วงหน้าไม่ถูกต้อง: {0}"),
    (r"Invalid pattern: (.+)", "รูปแบบ (regex) ไม่ถูกต้อง: {0}"),
    (r"Language not installed: (.+)", "ยังไม่ได้ติดตั้งภาษา: {0}"),
    (r"Step (\d+) has no PDF to work on\.", "ขั้นตอนที่ {0} ไม่มี PDF ให้ทำงาน"),
    (r"“(.+)” cannot be used at step (\d+)\.", "ใช้ “{0}” ในขั้นตอนที่ {1} ไม่ได้"),
    (r"The AI service returned an error \((\d+)\)\.", "บริการ AI ตอบกลับข้อผิดพลาด ({0})"),
    (r"The page could not be loaded: (.+)", "โหลดหน้านี้ไม่สำเร็จ: {0}"),
    (r"OCR failed: (.+)", "OCR ไม่สำเร็จ: {0}"),
    (r"(\w+) failed: (.+)", "{0} ทำงานไม่สำเร็จ: {1}"),
]
_COMPILED = [(re.compile(p, re.S), t) for p, t in PATTERNS]


def tr(msg: str, lang: str | None) -> str:
    if lang != "th" or not msg:
        return msg
    if msg in EXACT:
        return EXACT[msg]
    for rx, tpl in _COMPILED:
        m = rx.fullmatch(msg)
        if m:
            return tpl.format(*m.groups())
    return msg
