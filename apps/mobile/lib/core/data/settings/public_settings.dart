import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// The admin-editable contact details every public surface reads.
@immutable
class ContactSettings extends Equatable {
  const ContactSettings({
    this.email,
    this.phone,
    this.whatsapp,
    this.instapay,
    this.whatsappChannel,
    this.whatsappGroup,
    this.facebook,
    this.facebookGroup,
    this.youtube,
    this.telegram,
    this.instagram,
    this.tiktok,
  });

  final String? email;

  /// E.164.
  final String? phone;
  final String? whatsapp;

  /// Where a student sends the money. E.164, or null when the admin has not
  /// configured one — in which case the subscribe flow says so instead of
  /// showing a form that cannot be paid.
  final String? instapay;

  final String? whatsappChannel;
  final String? whatsappGroup;
  final String? facebook;
  final String? facebookGroup;
  final String? youtube;
  final String? telegram;
  final String? instagram;
  final String? tiktok;

  @override
  List<Object?> get props => [
    email,
    phone,
    whatsapp,
    instapay,
    whatsappChannel,
    whatsappGroup,
    facebook,
    facebookGroup,
    youtube,
    telegram,
    instagram,
    tiktok,
  ];
}

/// `GET /api/settings/public` — what an unauthenticated caller may read.
@immutable
class PublicSettings extends Equatable {
  const PublicSettings({required this.contact});

  final ContactSettings contact;

  /// What a caller gets when the endpoint could not be read.
  ///
  /// Every field null, which every consumer already handles: the InstaPay
  /// number is nullable by design, and so is every social link. A screen that
  /// treats "not loaded" and "not configured" the same is a screen that cannot
  /// be broken by a failed settings read.
  static const empty = PublicSettings(contact: ContactSettings());

  @override
  List<Object?> get props => [contact];
}
