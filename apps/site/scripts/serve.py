# -*- coding: utf-8 -*-
"""خادم معاينة محلي للموقع يدعم طلبات Range.

`python -m http.server` لا يدعم Range، فلا يستطيع المتصفح القفز داخل ملف
الفيديو (روابط فصول «كيف يعمل» تبدأ من الصفر). هذا الخادم يطابق سلوك
الاستضافة الحقيقية. التشغيل: python apps/site/scripts/serve.py [المنفذ]
"""
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class RangeHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not rng or not os.path.isfile(path):
            return super().send_head()
        m = re.match(r"bytes=(\d*)-(\d*)$", rng.strip())
        size = os.path.getsize(path)
        if not m or (not m.group(1) and not m.group(2)):
            return super().send_head()
        if m.group(1):
            start = int(m.group(1))
            end = int(m.group(2)) if m.group(2) else size - 1
        else:                                   # bytes=-N : آخر N بايت
            start = max(0, size - int(m.group(2)))
            end = size - 1
        end = min(end, size - 1)
        if start > end:
            self.send_error(416, "Requested Range Not Satisfiable")
            return None
        f = open(path, "rb")
        f.seek(start)
        self._remaining = end - start + 1
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.send_header("Content-Length", str(self._remaining))
        self.end_headers()
        return f

    def copyfile(self, source, outputfile):
        remaining = getattr(self, "_remaining", None)
        if remaining is None:
            return super().copyfile(source, outputfile)
        while remaining > 0:
            chunk = source.read(min(64 * 1024, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        # معاينة محلية: لا تخزين مؤقت، حتى لا يعرض المتصفح صفحة قديمة بعد التعديل
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):          # معاينة هادئة
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    # نص لاتيني فقط: طرفية ويندوز (cp1252) لا تطبع العربية
    print("ITQAN site preview: http://localhost:%d/institutional.html" % port)
    try:
        ThreadingHTTPServer(("127.0.0.1", port), RangeHandler).serve_forever()
    except (ConnectionError, KeyboardInterrupt):
        pass
