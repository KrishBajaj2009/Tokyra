"""Synthetic PDFs exercise the supported subset and visible failures."""

import unittest
from unittest.mock import patch
import zlib

from agent import pdf_text


def make_pdf(content=b"BT /F1 12 Tf (Hello world) Tj ET", *, flate=False,
             font=b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
             stream_filter=b"", extras=()):
    if flate:
        content = zlib.compress(content)
        stream_filter = b" /Filter /FlateDecode"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        font,
        b"<< /Length " + str(len(content)).encode() + stream_filter + b" >>\nstream\n"
        + content + b"\nendstream",
        *extras,
    ]
    raw, offsets = b"%PDF-1.4\n", [0]
    for i, body in enumerate(objects, 1):
        offsets.append(len(raw))
        raw += str(i).encode() + b" 0 obj\n" + body + b"\nendobj\n"
    xref = len(raw)
    raw += f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode()
    raw += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:])
    raw += f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    return raw


class PdfExtractionTests(unittest.TestCase):
    def test_plain_text_and_flate(self):
        for compressed in (False, True):
            text, warnings = pdf_text.extract_pdf_text(make_pdf(flate=compressed))
            self.assertEqual(text, "Hello world")
            self.assertTrue(any("best-effort" in warning for warning in warnings))

    def test_hex_arrays_escaped_strings_and_line_breaks(self):
        raw = make_pdf(b"BT /F1 12 Tf [(Hello) -250 <776f726c64>] TJ "
                       b"0 -20 Td (A \\(test\\) \\101) Tj ET")
        text, _ = pdf_text.extract_pdf_text(raw)
        self.assertEqual(text, "Hello world\nA (test) A")

    def test_explicit_winansi_decoding(self):
        raw = make_pdf(b"BT /F1 12 Tf (Price \\200) Tj ET", font=
                       b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
        self.assertEqual(pdf_text.extract_pdf_text(raw)[0], "Price €")

    def test_unknown_font_refused_instead_of_guessing(self):
        text, warnings = pdf_text.extract_pdf_text(make_pdf(font=
            b"<< /Type /Font /Subtype /Type0 /BaseFont /CustomFont >>"))
        self.assertEqual(text, "")
        self.assertTrue(any("font" in warning for warning in warnings))

    def test_simple_unicode_map(self):
        cmap = b"1 beginbfchar\n<01> <03A9>\nendbfchar"
        stream = b"<< /Length " + str(len(cmap)).encode() + b" >>\nstream\n" + cmap + b"\nendstream"
        raw = make_pdf(b"BT /F1 12 Tf <01> Tj ET", font=
                       b"<< /Type /Font /Subtype /Type0 /BaseFont /Custom /ToUnicode 6 0 R >>", extras=[stream])
        self.assertEqual(pdf_text.extract_pdf_text(raw)[0], "Ω")

    def test_encryption_scan_and_unsupported_filter_are_visible(self):
        cases = [make_pdf() + b"\n/Encrypt 8 0 R", make_pdf(b"q /Image1 Do Q"),
                 make_pdf(stream_filter=b" /Filter /LZWDecode")]
        for raw in cases:
            text, warnings = pdf_text.extract_pdf_text(raw)
            self.assertEqual(text, "")
            self.assertTrue(warnings)

    def test_decoded_size_limit(self):
        raw = make_pdf(b" " * 3000, flate=True)
        with patch.object(pdf_text, "MAX_DECODED_BYTES", 512):
            text, warnings = pdf_text.extract_pdf_text(raw)
        self.assertEqual(text, "")
        self.assertTrue(any("limit" in warning for warning in warnings))

    def test_malformed_input_never_aborts_a_scan(self):
        for raw in [b"", b"not pdf", b"%PDF-1.7\n1 0 obj << /Broken", make_pdf()[:150],
                    b"%PDF-1.4\n1 0 obj " + b"[" * 50, b"%PDF-1.4\n1 0 obj << /Length 99 >>stream"]:
            text, warnings = pdf_text.extract_pdf_text(raw)
            self.assertEqual(text, "")
            self.assertTrue(warnings)


if __name__ == "__main__":
    unittest.main()
