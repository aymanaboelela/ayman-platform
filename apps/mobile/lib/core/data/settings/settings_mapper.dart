import 'public_settings.dart';

/// Parses `GET /api/settings/public`.
///
/// Hand-written against `PublicSettingsReadSchema` in
/// `packages/contracts/src/admin/settings.ts`. The SEO half of that payload is
/// on the wire and deliberately not mapped — nothing in the app renders a
/// meta tag.
abstract final class SettingsMapper {
  static PublicSettings fromJson(Map<String, dynamic> json) {
    final contact = json['contact'];
    return PublicSettings(
      contact: contact is Map<String, dynamic>
          ? _contact(contact)
          : const ContactSettings(),
    );
  }

  static ContactSettings _contact(Map<String, dynamic> json) {
    return ContactSettings(
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      whatsapp: json['whatsapp'] as String?,
      instapay: json['instapay'] as String?,
      whatsappChannel: json['whatsappChannel'] as String?,
      whatsappGroup: json['whatsappGroup'] as String?,
      facebook: json['facebook'] as String?,
      facebookGroup: json['facebookGroup'] as String?,
      youtube: json['youtube'] as String?,
      telegram: json['telegram'] as String?,
      instagram: json['instagram'] as String?,
      tiktok: json['tiktok'] as String?,
    );
  }
}
