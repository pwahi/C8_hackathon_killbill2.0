import json
import unittest
from tempfile import TemporaryDirectory
from pathlib import Path
from unittest.mock import patch
from billshield_core.groq_vision import extract_crop
from billshield_core.groq_vision import build_request, parse_response, MODEL


class GroqVisionTests(unittest.TestCase):
    def test_response_cached_before_validation_and_replayed_without_network(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit):
                return json.dumps({"choices": [{"finish_reason": "stop", "message": {"content": '{"lines": []}'}}]}).encode()
        with TemporaryDirectory() as directory:
            with patch("billshield_core.groq_http.urlopen", return_value=Response()) as network:
                for _ in range(2):
                    result = extract_crop(b"\x89PNG\r\n\x1a\nexample", "image/png", "fake-key", Path(directory))
                    self.assertEqual(result.lines, ())
                self.assertEqual(network.call_count, 1)

    def test_array_box_is_unavailable_not_guessed(self):
        data = {"lines": [{"id": "fee", "description": "Delivery", "raw_amount": "650", "page": 1, "confidence": 0.8, "bounds": [1, 2, 3, 4]}]}
        output = parse_response({"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(data)}}]})
        self.assertIsNone(output.lines[0].bounds)
        self.assertIn("invalid", output.lines[0].warning)

    def test_role_and_group_suggestions_are_parsed_and_invalid_ones_dropped(self):
        data = {"lines": [
            {"id": "a", "description": "Discount", "raw_amount": "-200.00", "page": 1, "confidence": 0.9, "role": "discount", "group": "bicycle"},
            {"id": "b", "description": "Fee", "raw_amount": "650", "page": 1, "confidence": 0.9, "role": "surcharge", "group": 7},
            {"id": "c", "description": "Total", "raw_amount": "1,378.80", "page": 1, "confidence": 0.9},
        ]}
        output = parse_response({"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(data)}}]})
        self.assertEqual((output.lines[0].role, output.lines[0].group), ("discount", "bicycle"))
        self.assertEqual((output.lines[1].role, output.lines[1].group), (None, None))
        self.assertIsNone(output.lines[2].role)
        self.assertEqual(output.lines[0].raw_amount, "-200.00")

    def test_row_columns_are_kept_as_printed_and_bad_shapes_dropped(self):
        data = {"lines": [
            {"id": "a", "description": "Bike", "raw_amount": "1,299.00", "page": 1, "confidence": 0.9, "role": "charge",
             "breakdown": {"quantity": 1, "unit_price": "1,499.00", "discount": "-200,00", "taxable_value": None, "taxes": []}},
            {"id": "b", "description": "Fee", "raw_amount": "5", "page": 1, "confidence": 0.9, "breakdown": "1499 - 200"},
            {"id": "c", "description": "Round off", "raw_amount": "0.40", "page": 1, "confidence": 0.9, "role": "adjustment",
             "breakdown": {"quantity": None, "unit_price": None, "discount": None, "taxable_value": None, "taxes": "9%"}},
        ]}
        output = parse_response({"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(data)}}]})
        bike = output.lines[0].breakdown
        self.assertEqual((bike.quantity, bike.unit_price, bike.discount), ("1", "1,499.00", "-200,00"))
        self.assertIsNone(output.lines[1].breakdown)
        self.assertIsNone(output.lines[2].breakdown)
        self.assertEqual(output.lines[2].role, "adjustment")

    def test_cut_off_answer_has_its_own_error(self):
        from billshield_core.groq_vision import IncompleteOutput
        with self.assertRaises(IncompleteOutput):
            parse_response({"choices": [{"finish_reason": "length", "message": {"content": '{"lines": []}'}}]})

    def test_request_uses_selected_model_and_json(self):
        payload = build_request(b"\x89PNG\r\n\x1a\nexample", "image/png")
        self.assertEqual(payload["model"], MODEL)
        self.assertEqual(payload["response_format"], {"type": "json_object"})
        self.assertNotIn("api_key", payload)

    def test_invalid_input_rejected(self):
        with self.assertRaises(ValueError):
            build_request(b"not an image", "image/jpeg")

    def test_incomplete_response_rejected(self):
        with self.assertRaises(ValueError):
            parse_response({"choices": [{"finish_reason": "length", "message": {"content": "{}"}}]})

    def test_amount_is_raw_and_no_box_is_invented(self):
        data = {"lines": [{"id": "fee", "description": "Delivery", "raw_amount": "650",
                           "currency": "INR", "page": 1, "confidence": 0.8}]}
        output = parse_response({"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(data)}}]})
        self.assertEqual(output.lines[0].raw_amount, "650")
        self.assertIsNone(output.lines[0].bounds)
