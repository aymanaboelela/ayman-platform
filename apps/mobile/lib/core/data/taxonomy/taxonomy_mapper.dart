import '../network/json_parse.dart';
import 'taxonomy.dart';

/// Parses `GET /api/taxonomy`.
///
/// Hand-written against `TaxonomySchema` in
/// `packages/contracts/src/taxonomy.ts`. Only the fields a mobile screen
/// actually reads are parsed — the elective groups are on the wire and are not
/// mapped, because nothing in the app picks an elective subject: onboarding
/// fills it from `FIXED_ELECTIVE_SUBJECT_SLUG` exactly as the web does.
abstract final class TaxonomyMapper {
  static Taxonomy fromJson(Map<String, dynamic> json) {
    return Taxonomy(
      governorates: jsonList(json['governorates'], _governorate),
      pinnedGovernorateCodes: jsonStrings(json['pinnedGovernorateCodes']),
      systems: jsonList(json['systems'], _system),
    );
  }

  static Governorate _governorate(Map<String, dynamic> json) {
    return Governorate(
      code: json['code'] as String,
      nameAr: json['nameAr'] as String,
      slug: json['slug'] as String,
      region: json['region'] as String,
      sortOrder: (json['sortOrder'] as num).toInt(),
    );
  }

  static EducationSystem _system(Map<String, dynamic> json) {
    return EducationSystem(
      id: json['id'] as String,
      slug: json['slug'] as String,
      nameAr: json['nameAr'] as String,
      years: jsonList(json['years'], _year),
      tracks: jsonList(json['tracks'], _track),
    );
  }

  static AcademicYear _year(Map<String, dynamic> json) {
    return AcademicYear(
      year: (json['year'] as num).toInt(),
      labelAr: json['labelAr'] as String,
      badgeAr: json['badgeAr'] as String,
    );
  }

  static Track _track(Map<String, dynamic> json) {
    return Track(
      id: json['id'] as String,
      slug: json['slug'] as String,
      labelAr: json['labelAr'] as String,
      minYear: (json['minYear'] as num).toInt(),
    );
  }
}
