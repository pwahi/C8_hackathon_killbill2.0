from decimal import Decimal
import unittest

from backend.billshield_core.money import MoneyError, format_minor, parse_major_to_minor


class MoneyTests(unittest.TestCase):
    def test_dot_decimal_and_grouping(self) -> None:
        self.assertEqual(parse_major_to_minor("1,299.00"), 129900)

    def test_comma_decimal_and_grouping(self) -> None:
        self.assertEqual(parse_major_to_minor("1.299,00", decimal_separator=","), 129900)

    def test_discount_parentheses(self) -> None:
        self.assertEqual(parse_major_to_minor("(200.00)"), -20000)

    def test_explicit_half_up_rounding(self) -> None:
        self.assertEqual(parse_major_to_minor(Decimal("19.905")), 1991)

    def test_float_is_rejected(self) -> None:
        with self.assertRaises(MoneyError):
            parse_major_to_minor(19.90)

    def test_non_finite_is_rejected(self) -> None:
        with self.assertRaises(MoneyError):
            parse_major_to_minor("NaN")

    def test_minor_unit_formatting(self) -> None:
        self.assertEqual(format_minor(-20000, "EUR"), "-EUR 200.00")
        self.assertEqual(format_minor(2243400, "INR"), "INR 22434.00")


if __name__ == "__main__":
    unittest.main()
