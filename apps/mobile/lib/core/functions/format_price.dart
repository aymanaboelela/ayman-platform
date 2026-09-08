import 'package:easy_localization/easy_localization.dart';

/// «١٬٢٥٠» — a price in whole pounds, in Arabic-Indic digits.
///
/// The mobile twin of `formatEGP` in `apps/web/lib/price.ts`, and it must stay
/// identical: the same course shows the same figure on the card and on the
/// site.
///
/// ⚠️ Fractions are DROPPED here, on purpose. A course price is a whole number
/// of pounds and «٢٥٠٫٠٠ ج» on a card is noise. A ledger is the opposite case
/// and gets [formatPiastres] instead — rounding several figures that are meant
/// to add up makes the arithmetic visibly wrong on the one screen whose whole
/// job is arithmetic.
String formatEgp(int cents) =>
    NumberFormat('#,##0', 'ar_EG').format(cents / 100);

/// The same thing, never rounding the piastres away. For the accounts screens.
///
/// `maximumFractionDigits` and not `minimum`: a figure with no piastres still
/// renders as a bare «١٬٢٠٠». Only a figure that actually has fractions grows,
/// which is precisely when hiding them lies.
String formatPiastres(int cents) =>
    NumberFormat('#,##0.##', 'ar_EG').format(cents / 100);
