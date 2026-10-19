from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from backend.billshield_core.documents import DocumentError, read_text_pdf


class FakePage:
    width = 200
    height = 400

    def __init__(self, words):
        self.words = words

    def extract_words(self):
        return self.words


class FakePdf:
    def __init__(self, pages):
        self.pages = pages

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class DocumentTests(unittest.TestCase):
    def _pdf_path(self, payload: bytes = b"%PDF-safe-test") -> Path:
        handle = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        handle.write(payload)
        handle.close()
        path = Path(handle.name)
        self.addCleanup(lambda: path.unlink(missing_ok=True))
        return path

    def test_reads_words_and_normalizes_coordinates(self) -> None:
        path = self._pdf_path()
        page = FakePage([{"text": "Total", "x0": 20, "top": 40, "x1": 70, "bottom": 60}])
        with patch("backend.billshield_core.documents.pdfplumber.open", return_value=FakePdf([page])):
            result = read_text_pdf(path)
        self.assertEqual(result.page_count, 1)
        self.assertEqual(result.tokens[0].id, "p1-w1")
        self.assertEqual(result.tokens[0].text, "Total")
        self.assertEqual(result.tokens[0].bounds.model_dump(), {"x0": 0.1, "top": 0.1, "x1": 0.35, "bottom": 0.15})

    def test_empty_page_requests_image_extraction(self) -> None:
        path = self._pdf_path()
        with patch("backend.billshield_core.documents.pdfplumber.open", return_value=FakePdf([FakePage([])])):
            result = read_text_pdf(path)
        self.assertIn("image extraction required", result.warnings[0])

    def test_rejects_false_pdf_signature(self) -> None:
        with self.assertRaisesRegex(DocumentError, "signature"):
            read_text_pdf(self._pdf_path(b"not-a-pdf"))

    def test_rejects_page_limit(self) -> None:
        path = self._pdf_path()
        with patch(
            "backend.billshield_core.documents.pdfplumber.open",
            return_value=FakePdf([FakePage([]), FakePage([])]),
        ):
            with self.assertRaisesRegex(DocumentError, "limit"):
                read_text_pdf(path, max_pages=1)


if __name__ == "__main__":
    unittest.main()
