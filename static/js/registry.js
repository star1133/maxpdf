// Tool catalogue. cat keys map to colours in CSS (--c-*).
export const PDF_CATS = [
  ['organize', ['Organize PDF', 'จัดการหน้า PDF'], 'var(--c-organize)'],
  ['optimize', ['Optimize PDF', 'ปรับแต่ง PDF'], 'var(--c-optimize)'],
  ['to', ['Convert to PDF', 'แปลงเป็น PDF'], 'var(--c-convert)'],
  ['from', ['Convert from PDF', 'แปลงจาก PDF'], 'var(--c-convert)'],
  ['edit', ['Edit PDF', 'แก้ไข PDF'], 'var(--c-edit)'],
  ['security', ['PDF Security', 'ความปลอดภัย PDF'], 'var(--c-security)'],
  ['intel', ['PDF Intelligence', 'PDF อัจฉริยะ'], 'var(--c-intel)'],
];
const N = true;
// id, cat, icon, [en,th], [desc en, desc th], extra
export const PDF_TOOLS = [
  { id: 'merge', cat: 'organize', icon: 'merge', name: ['Merge PDF', 'รวม PDF'], desc: ['Combine PDFs in the order you want.', 'รวมไฟล์ PDF หลายไฟล์ตามลำดับที่ต้องการ'] },
  { id: 'split', cat: 'organize', icon: 'split', name: ['Split PDF', 'แยก PDF'], desc: ['Separate one page or a whole set into independent PDF files.', 'แยกทีละหน้า หรือเป็นช่วง เป็นไฟล์ PDF อิสระ'] },
  { id: 'organize', cat: 'organize', icon: 'organize', name: ['Organize PDF', 'จัดเรียงหน้า PDF'], desc: ['Sort, delete, rotate pages or add blank ones.', 'เรียงลำดับ ลบ หมุน หรือเพิ่มหน้าว่าง'] },
  { id: 'rotate', cat: 'organize', icon: 'rotate', name: ['Rotate PDF', 'หมุน PDF'], desc: ['Rotate pages or whole files, even several PDFs at once.', 'หมุนบางหน้าหรือทั้งไฟล์ ทำได้หลายไฟล์พร้อมกัน'] },
  { id: 'crop', cat: 'organize', icon: 'crop', name: ['Crop PDF', 'ตัดขอบ PDF'], desc: ['Crop margins or select an area, then apply to one page or all.', 'ตัดขอบหรือเลือกพื้นที่ แล้วใช้กับหน้าเดียวหรือทั้งหมด'] },
  { id: 'pagenumbers', cat: 'organize', icon: 'hash', name: ['Page numbers', 'ใส่เลขหน้า'], desc: ['Add page numbers with your choice of position and style.', 'ใส่เลขหน้า เลือกตำแหน่ง รูปแบบ และตัวเลขไทยได้'] },

  { id: 'compress', cat: 'optimize', icon: 'compress', name: ['Compress PDF', 'บีบอัด PDF'], desc: ['Reduce file size while keeping quality as high as possible.', 'ลดขนาดไฟล์ โดยรักษาคุณภาพให้มากที่สุด'] },
  { id: 'repair', cat: 'optimize', icon: 'wrench', name: ['Repair PDF', 'ซ่อมแซม PDF'], desc: ['Recover data from a damaged or corrupt PDF.', 'กู้ข้อมูลจากไฟล์ PDF ที่เสียหาย'] },
  { id: 'ocr', cat: 'optimize', icon: 'ocr', name: ['OCR PDF', 'OCR PDF'], desc: ['Turn scanned PDFs into searchable, selectable text (Thai + English).', 'แปลง PDF สแกนให้ค้นหาและเลือกข้อความได้ (ไทย + อังกฤษ)'] },
  { id: 'pdfa', cat: 'optimize', icon: 'archive', name: ['PDF to PDF/A', 'PDF เป็น PDF/A'], desc: ['Convert to the ISO archival format for long-term storage.', 'แปลงเป็นมาตรฐาน PDF/A สำหรับเก็บถาวร'] },

  { id: 'jpg2pdf', cat: 'to', icon: 'image', name: ['JPG to PDF', 'รูปภาพเป็น PDF'], desc: ['Convert images to PDF. Adjust orientation and margins.', 'แปลงรูปภาพเป็น PDF ปรับแนวหน้ากระดาษและขอบได้'] },
  { id: 'word2pdf', cat: 'to', icon: 'word', name: ['Word to PDF', 'Word เป็น PDF'], desc: ['Make DOC and DOCX easy to read by converting to PDF.', 'แปลงไฟล์ DOC / DOCX เป็น PDF'] },
  { id: 'ppt2pdf', cat: 'to', icon: 'ppt', name: ['PowerPoint to PDF', 'PowerPoint เป็น PDF'], desc: ['Convert PPT and PPTX slideshows to PDF.', 'แปลงสไลด์ PPT / PPTX เป็น PDF'] },
  { id: 'excel2pdf', cat: 'to', icon: 'excel', name: ['Excel to PDF', 'Excel เป็น PDF'], desc: ['Make spreadsheets easy to read by converting them to PDF.', 'แปลงตาราง Excel เป็น PDF'] },
  { id: 'html2pdf', cat: 'to', icon: 'html', name: ['HTML to PDF', 'HTML เป็น PDF'], desc: ['Convert a web page or HTML to PDF with one click.', 'แปลงเว็บเพจหรือ HTML เป็น PDF'] },
  { id: 'scan', cat: 'to', icon: 'camera', name: ['Scan to PDF', 'สแกนเป็น PDF'], desc: ['Capture document scans with your camera and save as PDF.', 'ถ่ายเอกสารด้วยกล้องแล้วบันทึกเป็น PDF'] },

  { id: 'pdf2word', cat: 'from', icon: 'word', name: ['PDF to Word', 'PDF เป็น Word'], desc: ['Convert PDF to an editable DOCX document.', 'แปลง PDF เป็นเอกสาร DOCX ที่แก้ไขได้'] },
  { id: 'pdf2pptx', cat: 'from', icon: 'ppt', name: ['PDF to PowerPoint', 'PDF เป็น PowerPoint'], desc: ['Turn PDF pages into editable PPTX slides.', 'แปลงหน้า PDF เป็นสไลด์ PPTX ที่แก้ไขได้'] },
  { id: 'pdf2excel', cat: 'from', icon: 'excel', name: ['PDF to Excel', 'PDF เป็น Excel'], desc: ['Pull tables straight from PDFs into Excel spreadsheets.', 'ดึงตารางจาก PDF ไปยัง Excel'] },
  { id: 'pdf2jpg', cat: 'from', icon: 'image', name: ['PDF to JPG', 'PDF เป็นรูปภาพ'], desc: ['Convert each page to JPG/PNG or extract embedded images.', 'แปลงทุกหน้าเป็น JPG/PNG หรือดึงรูปที่ฝังอยู่'] },
  { id: 'pdf2md', cat: 'from', icon: 'markdown', name: ['PDF to Markdown', 'PDF เป็น Markdown'], desc: ['Headings, tables, lists and links preserved. Great for notes and LLMs.', 'คงหัวข้อ ตาราง รายการ ลิงก์ เหมาะกับโน้ตและ LLM'], isNew: N },
  { id: 'pdf2txt', cat: 'from', icon: 'text', name: ['PDF to Text', 'PDF เป็นข้อความ'], desc: ['Extract plain text from every page.', 'ดึงข้อความล้วนจากทุกหน้า'] },

  { id: 'edit', cat: 'edit', icon: 'edit', name: ['Edit PDF', 'แก้ไข PDF'], desc: ['Add text, images, shapes or freehand drawings.', 'เพิ่มข้อความ รูปภาพ รูปทรง หรือวาดอิสระ'] },
  { id: 'sign', cat: 'edit', icon: 'sign', name: ['Sign PDF', 'เซ็นชื่อ PDF'], desc: ['Draw, type or upload your signature and place it anywhere.', 'วาด พิมพ์ หรืออัปโหลดลายเซ็น แล้ววางตรงไหนก็ได้'] },
  { id: 'watermark', cat: 'edit', icon: 'water', name: ['Watermark', 'ลายน้ำ'], desc: ['Stamp text or an image over your PDF.', 'ประทับข้อความหรือรูปภาพทับ PDF'] },
  { id: 'forms', cat: 'edit', icon: 'form', name: ['PDF Forms', 'ฟอร์ม PDF'], desc: ['Detect, fill and create interactive form fields.', 'ตรวจจับ กรอก และสร้างช่องฟอร์มแบบโต้ตอบ'], isNew: N },
  { id: 'metadata', cat: 'edit', icon: 'info', name: ['PDF Metadata', 'ข้อมูลเมทาดาตา'], desc: ['View, edit or remove title, author and other properties.', 'ดู แก้ไข หรือลบชื่อเรื่อง ผู้เขียน และคุณสมบัติอื่น'] },
  { id: 'redact', cat: 'edit', icon: 'redact', name: ['Redact PDF', 'ปกปิดข้อมูล PDF'], desc: ['Permanently remove sensitive text and graphics.', 'ลบข้อความและกราฟิกที่เป็นความลับอย่างถาวร'] },

  { id: 'unlock', cat: 'security', icon: 'unlock', name: ['Unlock PDF', 'ปลดล็อก PDF'], desc: ['Remove password security from a PDF you can open.', 'ลบรหัสผ่านออกจาก PDF ที่คุณเปิดได้'] },
  { id: 'protect', cat: 'security', icon: 'lock', name: ['Protect PDF', 'ใส่รหัสผ่าน PDF'], desc: ['Encrypt with a password (AES-256).', 'เข้ารหัสด้วยรหัสผ่าน (AES-256)'] },

  { id: 'compare', cat: 'intel', icon: 'compare', name: ['Compare PDF', 'เปรียบเทียบ PDF'], desc: ['Side-by-side comparison to spot changes between versions.', 'เปรียบเทียบสองเวอร์ชันและมองเห็นความแตกต่าง'] },
  { id: 'summarize', cat: 'intel', icon: 'sparkles', name: ['AI Summarizer', 'AI สรุปเอกสาร'], desc: ['Concise summaries of articles, essays and PDFs.', 'สรุปบทความ เอกสาร และ PDF ให้กระชับ'], isNew: N },
  { id: 'translate', cat: 'intel', icon: 'translate', name: ['Translate PDF', 'แปลภาษา PDF'], desc: ['AI translation that keeps layout and formatting intact.', 'แปลด้วย AI พร้อมรักษาเลย์เอาต์เดิม'], isNew: N },
];

export const DEV_CATS = [
  ['format', ['Format & Convert', 'จัดรูปแบบ & แปลง']],
  ['encode', ['Encode & Hash', 'เข้ารหัส & แฮช']],
  ['gen', ['Generators', 'ตัวสร้าง']],
  ['text', ['Text', 'ข้อความ']],
  ['web', ['Web & Design', 'เว็บ & ดีไซน์']],
  ['sys', ['System & Network', 'ระบบ & เครือข่าย']],
  ['img', ['Images', 'รูปภาพ']],
];
export const DEV_TOOLS = [
  { id: 'json', cat: 'format', icon: 'braces', name: ['JSON Formatter', 'จัด JSON'], desc: ['Format, validate, minify and sort JSON.', 'จัดรูปแบบ ตรวจสอบ ย่อ และเรียงคีย์ JSON'] },
  { id: 'json-ts', cat: 'format', icon: 'code', name: ['JSON to TypeScript', 'JSON เป็น TypeScript'], desc: ['Generate TypeScript interfaces from JSON.', 'สร้าง TypeScript interface จาก JSON'] },
  { id: 'yaml', cat: 'format', icon: 'list', name: ['YAML ⇄ JSON', 'YAML ⇄ JSON'], desc: ['Convert between YAML and JSON.', 'แปลงระหว่าง YAML กับ JSON'] },
  { id: 'csv', cat: 'format', icon: 'table', name: ['CSV ⇄ JSON', 'CSV ⇄ JSON'], desc: ['Convert CSV to JSON and back.', 'แปลง CSV เป็น JSON และกลับกัน'] },
  { id: 'beautify', cat: 'format', icon: 'code', name: ['HTML / CSS / JS Beautifier', 'จัดโค้ด HTML/CSS/JS'], desc: ['Prettify or minify HTML, CSS and JavaScript.', 'จัดรูปแบบหรือย่อ HTML CSS และ JavaScript'] },
  { id: 'sql', cat: 'format', icon: 'database', name: ['SQL Formatter', 'จัด SQL'], desc: ['Format SQL for many dialects.', 'จัดรูปแบบ SQL หลายภาษา'] },
  { id: 'xml', cat: 'format', icon: 'code', name: ['XML Formatter', 'จัด XML'], desc: ['Validate and pretty-print XML.', 'ตรวจสอบและจัดรูปแบบ XML'] },
  { id: 'markdown', cat: 'format', icon: 'markdown', name: ['Markdown Preview', 'พรีวิว Markdown'], desc: ['Live Markdown editor with safe preview.', 'เขียน Markdown พร้อมพรีวิวแบบสด'] },

  { id: 'base64', cat: 'encode', icon: 'binary', name: ['Base64', 'Base64'], desc: ['Encode/decode text and files (URL-safe too).', 'เข้ารหัส/ถอดรหัสข้อความและไฟล์'] },
  { id: 'url', cat: 'encode', icon: 'link', name: ['URL Encode / Parse', 'URL Encode / แยกส่วน'], desc: ['Percent-encode, decode and inspect URLs.', 'เข้ารหัส ถอดรหัส และแยกส่วนของ URL'] },
  { id: 'html-ent', cat: 'encode', icon: 'code', name: ['HTML Entities', 'อักขระพิเศษ HTML (Entities)'], desc: ['Escape and unescape HTML entities.', 'แปลงอักขระพิเศษ HTML'] },
  { id: 'jwt', cat: 'encode', icon: 'key', name: ['JWT Decoder', 'ถอดรหัส JWT'], desc: ['Inspect JWT header, payload and expiry.', 'ดู header payload และวันหมดอายุของ JWT'] },
  { id: 'hash', cat: 'encode', icon: 'hash', name: ['Hash & HMAC', 'Hash & HMAC'], desc: ['MD5, SHA-1/256/384/512 for text and files.', 'MD5 SHA-1/256/384/512 สำหรับข้อความและไฟล์'] },
  { id: 'unicode', cat: 'encode', icon: 'binary', name: ['Text ⇄ Binary / Hex', 'ข้อความ ⇄ Binary/Hex'], desc: ['Convert text to hex, binary, unicode escapes.', 'แปลงข้อความเป็น hex binary และ unicode'] },
  { id: 'numbase', cat: 'encode', icon: 'binary', name: ['Number Base', 'แปลงเลขฐาน'], desc: ['Convert between binary, octal, decimal, hex.', 'แปลงเลขฐาน 2 8 10 16 และอื่น ๆ'] },

  { id: 'uuid', cat: 'gen', icon: 'id', name: ['UUID / ULID', 'UUID / ULID'], desc: ['Generate UUID v4, v7 and ULID in bulk.', 'สร้าง UUID v4 v7 และ ULID จำนวนมาก'] },
  { id: 'password', cat: 'gen', icon: 'key', name: ['Password Generator', 'สร้างรหัสผ่าน'], desc: ['Strong random passwords and passphrases.', 'รหัสผ่านสุ่มที่แข็งแรง'] },
  { id: 'lorem', cat: 'gen', icon: 'text', name: ['Lorem Ipsum', 'Lorem Ipsum'], desc: ['Placeholder text generator (English + Thai).', 'สร้างข้อความตัวอย่าง (อังกฤษ + ไทย)'] },
  { id: 'qr', cat: 'gen', icon: 'qr', name: ['QR Code', 'QR Code'], desc: ['Generate and scan QR codes.', 'สร้างและสแกน QR Code'] },
  { id: 'random', cat: 'gen', icon: 'dice', name: ['Random Numbers', 'สุ่มตัวเลข'], desc: ['Random numbers, dice, coin and list picker.', 'สุ่มตัวเลข ลูกเต๋า เหรียญ และเลือกจากรายการ'] },

  { id: 'diff', cat: 'text', icon: 'diff', name: ['Text Diff', 'เปรียบเทียบข้อความ'], desc: ['Compare two texts line by line.', 'เปรียบเทียบข้อความสองชุดทีละบรรทัด'] },
  { id: 'case', cat: 'text', icon: 'case', name: ['Case Converter', 'แปลงตัวพิมพ์'], desc: ['camelCase, snake_case, kebab-case and more.', 'camelCase snake_case kebab-case และอื่น ๆ'] },
  { id: 'counter', cat: 'text', icon: 'hash', name: ['Word & Character Counter', 'นับคำ/ตัวอักษร'], desc: ['Count words, characters, lines and reading time.', 'นับคำ ตัวอักษร บรรทัด และเวลาอ่าน'] },
  { id: 'lines', cat: 'text', icon: 'sort', name: ['Sort & Dedupe Lines', 'เรียง/ลบบรรทัดซ้ำ'], desc: ['Sort, reverse, trim and remove duplicate lines.', 'เรียง กลับลำดับ ตัดช่องว่าง และลบบรรทัดซ้ำ'] },
  { id: 'slug', cat: 'text', icon: 'link', name: ['Slugify', 'สร้าง Slug (URL)'], desc: ['Turn titles into clean URL slugs.', 'แปลงหัวข้อเป็น slug สำหรับ URL'] },
  { id: 'regex', cat: 'text', icon: 'regex', name: ['Regex Tester', 'ทดสอบ Regex'], desc: ['Test regular expressions with live highlighting.', 'ทดสอบ Regular Expression พร้อมไฮไลต์'] },
  { id: 'baht', cat: 'text', icon: 'baht', name: ['Thai Baht Text', 'จำนวนเงินเป็นตัวอักษร'], desc: ['Convert numbers to Thai baht words.', 'แปลงตัวเลขเป็นตัวอักษรบาทไทย'] },

  { id: 'color', cat: 'web', icon: 'palette', name: ['Color Converter', 'แปลงสี'], desc: ['HEX, RGB, HSL, with picker and palettes.', 'HEX RGB HSL พร้อมตัวเลือกสี'] },
  { id: 'contrast', cat: 'web', icon: 'eye', name: ['Contrast Checker', 'ตรวจ Contrast'], desc: ['WCAG contrast ratio for text colors.', 'ตรวจสัดส่วนคอนทราสต์ WCAG'] },
  { id: 'gradient', cat: 'web', icon: 'palette', name: ['CSS Gradient', 'ไล่สี CSS (Gradient)'], desc: ['Build CSS gradients visually.', 'สร้าง CSS gradient แบบเห็นผลทันที'] },
  { id: 'shadow', cat: 'web', icon: 'square', name: ['Box Shadow', 'เงากล่อง (Box Shadow)'], desc: ['Design CSS box-shadow with live preview.', 'ออกแบบ box-shadow พร้อมพรีวิว'] },
  { id: 'http', cat: 'web', icon: 'globe', name: ['HTTP Status Codes', 'HTTP Status Codes'], desc: ['Searchable reference of HTTP status codes.', 'ตารางอ้างอิง HTTP status code'] },
  { id: 'useragent', cat: 'web', icon: 'globe', name: ['User-Agent Parser', 'อ่าน User-Agent'], desc: ['Parse browser, OS and device from UA.', 'อ่านเบราว์เซอร์ ระบบปฏิบัติการ จาก UA'] },

  { id: 'timestamp', cat: 'sys', icon: 'clock', name: ['Timestamp Converter', 'แปลง Timestamp'], desc: ['Unix epoch ⇄ human dates, with timezones.', 'Unix epoch ⇄ วันที่ พร้อมเขตเวลา'] },
  { id: 'cron', cat: 'sys', icon: 'calendar', name: ['Cron Explainer', 'อธิบาย Cron'], desc: ['Explain cron expressions and preview next runs.', 'อธิบาย cron และดูรอบถัดไป'] },
  { id: 'chmod', cat: 'sys', icon: 'terminal', name: ['chmod Calculator', 'คำนวณ chmod'], desc: ['Unix permissions, numeric ⇄ symbolic.', 'สิทธิ์ไฟล์ Unix แบบตัวเลข ⇄ สัญลักษณ์'] },
  { id: 'cidr', cat: 'sys', icon: 'server', name: ['IP / CIDR Calculator', 'คำนวณ IP / CIDR'], desc: ['Subnet ranges, masks and host counts.', 'ช่วง subnet mask และจำนวนโฮสต์'] },

  { id: 'img-compress', cat: 'img', icon: 'image', name: ['Image Compress / Resize', 'ย่อ/บีบอัดรูปภาพ'], desc: ['Resize, convert and compress images in your browser.', 'ย่อขนาด แปลงชนิด และบีบอัดรูปในเบราว์เซอร์'] },
  { id: 'img-base64', cat: 'img', icon: 'binary', name: ['Image ⇄ Base64', 'รูปภาพ ⇄ Base64'], desc: ['Create data URIs from images, or decode them.', 'สร้าง data URI จากรูป หรือถอดกลับ'] },
  { id: 'favicon', cat: 'img', icon: 'star', name: ['Favicon Generator', 'สร้าง Favicon'], desc: ['Make favicon sizes from one image.', 'สร้าง favicon หลายขนาดจากรูปเดียว'] },
];
export const byId = (id, list) => list.find((x) => x.id === id);
