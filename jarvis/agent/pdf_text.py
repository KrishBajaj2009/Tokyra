"""Bounded, conservative text extraction for a small, documented PDF subset.

This is deliberately not a general PDF reader. It accepts ordinary explicit
objects, direct stream lengths, unfiltered/Flate page streams, standard Latin
encodings and simple ToUnicode bfchar maps. It never reads files or runs tools.
PDF text operators/encodings follow Adobe PDF Reference 1.7, sections 3.2,
3.3, 5.3, 5.5 and 5.9:
https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.7old.pdf
"""

from __future__ import annotations

from dataclasses import dataclass
import re
import unicodedata
import zlib


MAX_INPUT_BYTES = 2 * 1024 * 1024
MAX_DECODED_BYTES = 4 * 1024 * 1024
MAX_TOKENS = 200_000
MAX_OBJECTS = 5_000
MAX_PAGES = 500
MAX_TEXT_CHARS = 200_000
MAX_CMAP_ENTRIES = 4_096
_SPACE = b"\x00\t\n\x0c\r "
_DELIMITERS = _SPACE + b"()<>[]{}/%"
_OBJECT = re.compile(rb"(?<![0-9])([0-9]{1,10})\s+([0-9]{1,5})\s+obj\b")
_NUMBER = re.compile(rb"[+-]?(?:\d+(?:\.\d*)?|\.\d+)\Z")
_STANDARD_LATIN = {
    "Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique",
    "Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic",
    "Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique",
}


class _Unsupported(ValueError):
    pass


class _Name(str):
    pass


@dataclass(frozen=True)
class _Ref:
    number: int
    generation: int


@dataclass
class _ObjectValue:
    value: object
    stream: bytes | None = None


@dataclass
class _Budget:
    tokens: int = MAX_TOKENS
    decoded: int = 0


class _Parser:
    def __init__(self, raw: bytes, budget: _Budget, position: int = 0):
        self.raw, self.budget, self.position = raw, budget, position
        self.pending: list[object] = []

    def token(self):
        if self.pending:
            return self.pending.pop(0)
        raw, end = self.raw, len(self.raw)
        while self.position < end:
            char = raw[self.position]
            if char in _SPACE:
                self.position += 1
            elif char == 37:
                while self.position < end and raw[self.position] not in b"\r\n":
                    self.position += 1
            else:
                break
        if self.position == end:
            return None
        self.budget.tokens -= 1
        if self.budget.tokens < 0:
            raise _Unsupported("PDF exceeds the text parser's work limit.")
        start = self.position
        char = raw[start]
        self.position += 1
        if char == 40:
            value, depth = bytearray(), 1
            while self.position < end:
                char = raw[self.position]
                self.position += 1
                if char == 92:
                    if self.position == end:
                        break
                    char = raw[self.position]
                    self.position += 1
                    if char in b"\r\n":
                        if char == 13 and raw[self.position:self.position + 1] == b"\n":
                            self.position += 1
                        continue
                    if 48 <= char <= 55:
                        digits = bytes([char])
                        for _ in range(2):
                            if self.position < end and 48 <= raw[self.position] <= 55:
                                digits += bytes([raw[self.position]])
                                self.position += 1
                        value.append(int(digits, 8) & 255)
                    else:
                        value.append({110: 10, 114: 13, 116: 9, 98: 8, 102: 12}.get(char, char))
                    continue
                if char == 40:
                    depth += 1
                    if depth > 32:
                        raise _Unsupported("PDF literal string nesting exceeds the safety limit.")
                elif char == 41:
                    depth -= 1
                    if not depth:
                        return bytes(value)
                if char == 13:
                    if raw[self.position:self.position + 1] == b"\n":
                        self.position += 1
                    char = 10
                value.append(char)
            raise _Unsupported("PDF contains an unterminated literal string.")
        if char == 60:
            if raw[self.position:self.position + 1] == b"<":
                self.position += 1
                return "<<"
            finish = raw.find(b">", self.position)
            if finish < 0:
                raise _Unsupported("PDF contains an unterminated hexadecimal string.")
            digits = bytes(c for c in raw[self.position:finish] if c not in _SPACE)
            self.position = finish + 1
            if len(digits) % 2:
                digits += b"0"
            try:
                return bytes.fromhex(digits.decode("ascii"))
            except (ValueError, UnicodeError) as error:
                raise _Unsupported("PDF contains an invalid hexadecimal string.") from error
        if char == 62 and raw[self.position:self.position + 1] == b">":
            self.position += 1
            return ">>"
        if char in b"[]":
            return chr(char)
        if char in b")>{}":
            return chr(char)
        while self.position < end and raw[self.position] not in _DELIMITERS:
            self.position += 1
        value = raw[start:self.position]
        if char == 47:
            value = re.sub(rb"#([0-9A-Fa-f]{2})", lambda m: bytes([int(m[1], 16)]), value[1:])
            return _Name(value.decode("latin1"))
        if _NUMBER.fullmatch(value):
            return float(value) if b"." in value else int(value)
        return value.decode("latin1")

    def value(self, depth=0):
        if depth > 32:
            raise _Unsupported("PDF object nesting exceeds the safety limit.")
        token = self.token()
        if token == "<<":
            result = {}
            while True:
                name = self.token()
                if name == ">>":
                    return result
                if not isinstance(name, _Name) or name in result:
                    raise _Unsupported("PDF has a malformed or ambiguous dictionary.")
                result[name] = self.value(depth + 1)
        if token == "[":
            result = []
            while True:
                item = self.token()
                if item == "]":
                    return result
                if item is None:
                    raise _Unsupported("PDF has an unterminated array.")
                self.pending.insert(0, item)
                result.append(self.value(depth + 1))
        if isinstance(token, int):
            second = self.token()
            if isinstance(second, int):
                third = self.token()
                if third == "R":
                    return _Ref(token, second)
                self.pending[0:0] = [second, third]
            else:
                self.pending.insert(0, second)
        if token is None or token in ("]", ">>"):
            raise _Unsupported("PDF contains an incomplete object.")
        return token


class _Reader:
    def __init__(self, raw: bytes):
        self.budget = _Budget()
        self.objects: dict[_Ref, _ObjectValue] = {}
        self.stream_cache: dict[_Ref, bytes] = {}
        self.font_cache: dict[object, object] = {}
        self.warnings: list[str] = []
        position = 0
        while match := _OBJECT.search(raw, position):
            if len(self.objects) >= MAX_OBJECTS:
                raise _Unsupported("PDF exceeds the object count limit.")
            ref = _Ref(int(match[1]), int(match[2]))
            if ref in self.objects:
                raise _Unsupported("Incrementally updated PDFs are unsupported; export a fresh PDF or text file.")
            parser = _Parser(raw, self.budget, match.end())
            value = parser.value()
            following = parser.token()
            stream = None
            if following == "stream":
                if not isinstance(value, dict) or not isinstance(value.get("Length"), int):
                    raise _Unsupported("PDF streams with indirect or missing lengths are unsupported.")
                if raw[parser.position:parser.position + 2] == b"\r\n":
                    parser.position += 2
                elif raw[parser.position:parser.position + 1] == b"\n":
                    parser.position += 1
                else:
                    raise _Unsupported("PDF contains a malformed stream header.")
                length = value["Length"]
                if length < 0 or parser.position + length > len(raw):
                    raise _Unsupported("PDF contains an invalid stream length.")
                stream = raw[parser.position:parser.position + length]
                parser.position += length
                if parser.token() != "endstream":
                    raise _Unsupported("PDF stream length does not match its content.")
                following = parser.token()
            if following != "endobj":
                raise _Unsupported("PDF contains a malformed or unsupported object.")
            if isinstance(value, dict) and value.get("Type") in ("ObjStm", "XRef"):
                raise _Unsupported("PDF object/cross-reference streams are unsupported; export a simpler PDF or text file.")
            self.objects[ref] = _ObjectValue(value, stream)
            position = parser.position

    def warn(self, message):
        if message not in self.warnings:
            self.warnings.append(message)

    def resolve(self, value):
        for _ in range(16):
            if not isinstance(value, _Ref):
                return value
            if value not in self.objects:
                raise _Unsupported("PDF references an unavailable object.")
            value = self.objects[value].value
        raise _Unsupported("PDF has cyclic or excessively nested object references.")

    def stream(self, ref):
        if not isinstance(ref, _Ref) or ref not in self.objects:
            raise _Unsupported("PDF has an unsupported stream reference.")
        if ref in self.stream_cache:
            return self.stream_cache[ref]
        item = self.objects[ref]
        if item.stream is None or not isinstance(item.value, dict):
            raise _Unsupported("PDF content does not refer to a stream.")
        if "F" in item.value:
            raise _Unsupported("External PDF streams are unsupported and were not read.")
        filters = self.resolve(item.value.get("Filter"))
        if isinstance(filters, list) and len(filters) == 1:
            filters = filters[0]
        if filters not in (None, "FlateDecode", "Fl"):
            raise _Unsupported("PDF uses an unsupported stream filter; content was omitted.")
        parameters = self.resolve(item.value.get("DecodeParms"))
        if parameters not in (None, "null", {}):
            raise _Unsupported("PDF stream predictors/decode parameters are unsupported; content was omitted.")
        available = MAX_DECODED_BYTES - self.budget.decoded
        if filters is None:
            result = item.stream
        else:
            decoder = zlib.decompressobj()
            try:
                result = decoder.decompress(item.stream, available + 1)
            except zlib.error as error:
                raise _Unsupported("PDF contains a damaged Flate stream.") from error
            if len(result) > available or decoder.unconsumed_tail:
                raise _Unsupported("PDF decompressed content exceeds the safety limit.")
            if not decoder.eof or decoder.unused_data:
                raise _Unsupported("PDF contains an incomplete or ambiguous Flate stream.")
        self.budget.decoded += len(result)
        if self.budget.decoded > MAX_DECODED_BYTES:
            raise _Unsupported("PDF decoded content exceeds the safety limit.")
        self.stream_cache[ref] = result
        return result

    def font(self, ref):
        key = ref if isinstance(ref, _Ref) else id(ref)
        if key not in self.font_cache:
            try:
                self.font_cache[key] = self._font(ref)
            except (_Unsupported, UnicodeError) as error:
                self.font_cache[key] = error if isinstance(error, _Unsupported) else _Unsupported("PDF contains malformed Unicode font data; text was omitted.")
        result = self.font_cache[key]
        if isinstance(result, _Unsupported):
            raise result
        return result

    def _font(self, ref):
        font = self.resolve(ref)
        if not isinstance(font, dict):
            raise _Unsupported("PDF text has no usable font definition; text was omitted.")
        if "ToUnicode" in font:
            cmap = self.stream(font["ToUnicode"])
            mapping = {}
            parser = _Parser(cmap, self.budget)
            previous = None
            while True:
                token = parser.token()
                if token is None:
                    break
                if token in ("usecmap", "beginbfrange"):
                    raise _Unsupported("PDF uses an unsupported ToUnicode CMap; text in that font was omitted.")
                if token != "beginbfchar":
                    previous = token
                    continue
                count = previous
                if not isinstance(count, int) or count < 0 or count > MAX_CMAP_ENTRIES or len(mapping) + count > MAX_CMAP_ENTRIES:
                    raise _Unsupported("PDF font mapping exceeds the safety limit.")
                for _ in range(count):
                    source, target = parser.value(), parser.value()
                    if not isinstance(source, bytes) or len(source) not in (1, 2) or not isinstance(target, bytes):
                        raise _Unsupported("PDF has an unsupported Unicode font mapping.")
                    if source in mapping:
                        raise _Unsupported("PDF has an ambiguous Unicode font mapping.")
                    mapping[source] = target.decode("utf-16-be")
                if parser.token() != "endbfchar":
                    raise _Unsupported("PDF has a malformed Unicode font mapping.")
                previous = None
            widths = {len(key) for key in mapping}
            if not mapping or len(widths) != 1:
                raise _Unsupported("PDF has an unsupported or empty Unicode font mapping.")
            result = ("cmap", (widths.pop(), mapping))
        else:
            subtype = font.get("Subtype")
            encoding = self.resolve(font.get("Encoding"))
            if subtype not in ("Type1", "TrueType") or isinstance(encoding, dict):
                raise _Unsupported("PDF uses an unsupported/custom font encoding; text in that font was omitted.")
            if encoding in ("WinAnsiEncoding", "MacRomanEncoding"):
                result = ("codec", "cp1252" if encoding == "WinAnsiEncoding" else "mac_roman")
            elif font.get("BaseFont") in _STANDARD_LATIN and encoding in (None, "StandardEncoding"):
                result = ("standard", None)
            else:
                raise _Unsupported("PDF font lacks a trustworthy Unicode mapping; text in that font was omitted.")
        return result

    def decode_text(self, raw, font_ref):
        kind, details = self.font(font_ref)
        if kind == "cmap":
            width, mapping = details
            if len(raw) % width:
                raise _Unsupported("PDF contains an incomplete character code; text was omitted.")
            try:
                text = "".join(mapping[raw[i:i + width]] for i in range(0, len(raw), width))
            except KeyError as error:
                raise _Unsupported("PDF contains unmapped character codes; text was omitted.") from error
        elif kind == "standard":
            if any(char < 32 or char > 126 for char in raw):
                raise _Unsupported("PDF StandardEncoding non-ASCII characters are unsupported; text was omitted.")
            text = raw.decode("ascii").translate(str.maketrans({"'": "’", "`": "‘"}))
        else:
            text = raw.decode(details)
        if any(unicodedata.category(char).startswith("C") or char == "\ufffd" for char in text):
            raise _Unsupported("PDF text contains unsupported control/private characters; text was omitted.")
        return text

    def content(self, raw, resources):
        fonts = self.resolve(resources.get("Font", {}))
        if not isinstance(fonts, dict):
            fonts = {}
        parser = _Parser(raw, self.budget)
        inside, font_ref = False, None
        operands, output, saved_fonts = [], [], []
        length = 0
        while True:
            first = parser.token()
            if first is None:
                break
            parser.pending.insert(0, first)
            token = parser.value()
            if not isinstance(token, str) or isinstance(token, _Name) or token in ("true", "false", "null"):
                operands.append(token)
                if len(operands) > 1_000:
                    raise _Unsupported("PDF content operand count exceeds the safety limit.")
                continue
            if token == "BI":
                raise _Unsupported("PDF inline images are unsupported; this page's text was omitted.")
            if token == "Do":
                self.warn("PDF contains image/form objects; text inside those objects was not extracted (no OCR).")
            if token == "q":
                saved_fonts.append(font_ref)
                if len(saved_fonts) > 32:
                    raise _Unsupported("PDF graphics state nesting exceeds the safety limit.")
            elif token == "Q":
                if not saved_fonts:
                    raise _Unsupported("PDF has unbalanced graphics state operators.")
                font_ref = saved_fonts.pop()
            elif token == "BT":
                if inside:
                    raise _Unsupported("PDF has nested text blocks.")
                inside = True
                output.append("\n")
            elif token == "ET":
                inside = False
                output.append("\n")
            elif token == "Tf" and inside:
                if len(operands) != 2 or not isinstance(operands[0], _Name):
                    raise _Unsupported("PDF has an invalid font-selection operator.")
                font_ref = fonts.get(operands[0])
            elif token in ("Td", "TD", "T*", "Tm") and inside:
                output.append("\n")
            elif token in ("Tj", "TJ", "'", '"') and inside:
                value = operands[-1] if operands else None
                strings = value if token == "TJ" and isinstance(value, list) else [value]
                try:
                    if token == "TJ" and not isinstance(value, list):
                        raise _Unsupported("PDF has an invalid text-array operator.")
                    segment = []
                    for part in strings:
                        if isinstance(part, bytes):
                            segment.append(self.decode_text(part, font_ref))
                        elif isinstance(part, (int, float)) and token == "TJ":
                            if part <= -200:
                                segment.append(" ")
                        else:
                            raise _Unsupported("PDF has an invalid text-showing operator.")
                    text = "".join(segment)
                    length += len(text)
                    if length > MAX_TEXT_CHARS:
                        raise _Unsupported("PDF extracted text exceeds the safety limit.")
                    if token in ("'", '"'):
                        output.append("\n")
                    output.append(text)
                except (_Unsupported, UnicodeError) as error:
                    self.warn(str(error) if isinstance(error, _Unsupported) else "PDF has undecodable font characters; text was omitted.")
            operands.clear()
        if inside:
            raise _Unsupported("PDF has an unterminated text block.")
        return "".join(output)

    def extract(self):
        catalogs = [item.value for item in self.objects.values() if isinstance(item.value, dict) and item.value.get("Type") == "Catalog"]
        if len(catalogs) != 1:
            raise _Unsupported("PDF has no unambiguous supported document catalog.")
        visited, pages, collected = set(), 0, []
        collected_length = 0
        pending = [(catalogs[0].get("Pages"), {}, 0)]
        while pending:
            ref, inherited, depth = pending.pop()
            if not isinstance(ref, _Ref) or ref in visited or depth > 32:
                raise _Unsupported("PDF has a cyclic, deep, or unsupported page tree.")
            visited.add(ref)
            page = self.resolve(ref)
            if not isinstance(page, dict):
                raise _Unsupported("PDF has an invalid page tree.")
            resources = self.resolve(page.get("Resources", inherited))
            if not isinstance(resources, dict):
                raise _Unsupported("PDF has unsupported page resources.")
            if page.get("Type") == "Pages":
                kids = self.resolve(page.get("Kids"))
                if not isinstance(kids, list) or len(kids) > MAX_OBJECTS:
                    raise _Unsupported("PDF has an unsupported page list.")
                pending.extend((kid, resources, depth + 1) for kid in reversed(kids))
            elif page.get("Type") == "Page":
                pages += 1
                if pages > MAX_PAGES:
                    raise _Unsupported("PDF exceeds the page count limit.")
                if "Annots" in page:
                    self.warn("PDF annotations/form fields were not extracted.")
                contents = page.get("Contents")
                if contents is None:
                    continue
                # A Contents entry may be one stream, an array, or an indirect array.
                resolved = self.resolve(contents)
                refs = resolved if isinstance(resolved, list) else [contents]
                try:
                    parts, size = [], 0
                    for item in refs:
                        part = self.stream(item)
                        size += len(part) + 1
                        if size > MAX_DECODED_BYTES:
                            raise _Unsupported("PDF page content exceeds the safety limit.")
                        parts.append(part)
                    raw = b"\n".join(parts)
                    page_text = self.content(raw, resources)
                    collected_length += len(page_text) + 1
                    if collected_length > MAX_TEXT_CHARS:
                        raise _Unsupported("PDF extracted text exceeds the total safety limit; remaining text was omitted.")
                    collected.append(page_text)
                except (_Unsupported, UnicodeError) as error:
                    self.warn(str(error) if isinstance(error, _Unsupported) else "PDF contains malformed Unicode font data; a page was omitted.")
            else:
                raise _Unsupported("PDF contains an invalid page-tree node.")
        text = "\n".join(collected)
        if len(text) > MAX_TEXT_CHARS:
            raise _Unsupported("PDF extracted text exceeds the safety limit.")
        return "\n".join(line.strip() for line in text.splitlines() if line.strip())


def extract_pdf_text(raw: bytes) -> tuple[str, list[str]]:
    """Return best-effort page text and explicit limitations; unsupported input is safe.

    No OCR, layout reconstruction, embedded-file extraction, network access or
    file I/O is performed. Warnings must be shown alongside indexed PDF results.
    A failed file yields empty text; a partly readable file identifies omissions.
    """
    if not isinstance(raw, bytes):
        return "", ["PDF input must be bytes."]
    if len(raw) > MAX_INPUT_BYTES:
        return "", ["PDF exceeds the 2 MB input limit."]
    if not raw.startswith(b"%PDF-"):
        return "", ["File does not have a supported PDF header."]
    if re.search(rb"/Encrypt\b", raw):
        return "", ["Encrypted PDFs are unsupported; no text was indexed."]
    try:
        reader = _Reader(raw)
        text = reader.extract()
        if text:
            reader.warn("PDF extraction is best-effort: reading order, spacing and completeness are not guaranteed; verify against the original.")
        else:
            reader.warn("No supported extractable text found; this may be an image-only/scanned PDF. OCR is unavailable.")
        return text, reader.warnings
    except _Unsupported as error:
        return "", [str(error)]
    except Exception:
        # Malformed input must never abort a folder scan. Do not expose document
        # bytes or exception details through a diagnostic.
        return "", ["Malformed or unsupported PDF; no text was indexed."]
