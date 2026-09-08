import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/data/taxonomy/taxonomy.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/inputs/app_phone_field.dart';
import '../../../../core/presentation/widgets/inputs/app_select_field.dart';
import '../../../../core/presentation/widgets/inputs/app_text_field.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../domain/entities/onboarding_draft.dart';
import 'onboarding_choice_group.dart';

/// Step 1 — «مين إنت»: the name, the gender, the phone.
class OnboardingStepWho extends StatelessWidget {
  const OnboardingStepWho({
    required this.draft,
    required this.errors,
    required this.onChanged,
    required this.nameController,
    required this.phoneController,
    super.key,
  });

  final OnboardingDraft draft;
  final Map<String, String> errors;
  final void Function(OnboardingDraft Function(OnboardingDraft)) onChanged;

  /// ⚠️ Owned by the PAGE, not built here. A controller rebuilt with the step
  /// resets the caret to the start on every keystroke.
  final TextEditingController nameController;
  final TextEditingController phoneController;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.x16,
      children: [
        AppTextField(
          label: tr(CopyKeys.onboardingFullName),
          hintText: tr(CopyKeys.onboardingFullNamePlaceholder),
          controller: nameController,
          isRequired: true,
          errorText: errors['fullName'],
          textInputAction: TextInputAction.next,
          onChanged: (value) =>
              onChanged((draft) => draft.copyWith(fullName: value)),
        ),
        OnboardingChoiceGroup<String>(
          label: tr(CopyKeys.onboardingGender),
          value: draft.gender,
          errorText: errors['gender'],
          options: [
            (
              value: 'male',
              label: tr(CopyKeys.onboardingGenderMale),
              icon: Icons.man_rounded,
            ),
            (
              value: 'female',
              label: tr(CopyKeys.onboardingGenderFemale),
              icon: Icons.woman_rounded,
            ),
          ],
          onChanged: (value) =>
              onChanged((draft) => draft.copyWith(gender: value)),
        ),
        AppPhoneField(
          label: tr(CopyKeys.onboardingPhone),
          controller: phoneController,
          isRequired: true,
          errorText: errors['phone'],
          onChanged: (value) =>
              onChanged((draft) => draft.copyWith(phone: value)),
        ),
      ],
    );
  }
}

/// Step 2 — «إنت فين»: the governorate, the school, the stream.
class OnboardingStepWhere extends StatelessWidget {
  const OnboardingStepWhere({
    required this.draft,
    required this.errors,
    required this.taxonomy,
    required this.onChanged,
    required this.schoolController,
    super.key,
  });

  final OnboardingDraft draft;
  final Map<String, String> errors;
  final Taxonomy? taxonomy;
  final void Function(OnboardingDraft Function(OnboardingDraft)) onChanged;
  final TextEditingController schoolController;

  /// ⚠️ Pinned codes FIRST, in the order the server pinned them, then the rest
  /// in the taxonomy's own order. The big governorates are where most students
  /// are, and making them scroll past twenty others to find القاهرة is the
  /// whole reason the server sends a pinned list.
  List<AppSelectOption<String>> get _governorates {
    final all = taxonomy?.governorates ?? const <Governorate>[];
    final pinned = taxonomy?.pinnedGovernorateCodes ?? const <String>[];
    final byCode = {for (final row in all) row.code: row};

    return [
      for (final code in pinned)
        if (byCode.containsKey(code))
          AppSelectOption(value: code, label: byCode[code]!.nameAr),
      for (final row in all)
        if (!pinned.contains(row.code))
          AppSelectOption(value: row.code, label: row.nameAr),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.x16,
      children: [
        AppSelectField<String>(
          label: tr(CopyKeys.onboardingGovernorate),
          placeholder: tr(CopyKeys.onboardingGovernoratePlaceholder),
          options: _governorates,
          value: draft.governorateCode,
          isRequired: true,
          errorText: errors['governorateCode'],
          // Twenty-seven rows is past the point where scanning beats typing.
          searchHint: tr(CopyKeys.onboardingGovernoratePlaceholder),
          emptyLabel: tr(CopyKeys.commonEmpty),
          onChanged: (value) =>
              onChanged((draft) => draft.copyWith(governorateCode: value)),
        ),
        AppTextField(
          label: tr(CopyKeys.onboardingSchoolName),
          hintText: tr(CopyKeys.onboardingSchoolNamePlaceholder),
          controller: schoolController,
          isRequired: true,
          errorText: errors['schoolName'],
          onChanged: (value) =>
              onChanged((draft) => draft.copyWith(schoolName: value)),
        ),
        OnboardingChoiceGroup<String>(
          label: tr(CopyKeys.onboardingSchoolStream),
          value: draft.schoolStream,
          errorText: errors['schoolStream'],
          // ⚠️ The labels come from `copy.stream.*`, NOT from the onboarding
          // namespace — so the student's answer and a course's badge cannot be
          // spelled differently.
          options: [
            (
              value: 'general',
              label: tr(CopyKeys.streamGeneral),
              icon: Icons.school_outlined,
            ),
            (
              value: 'languages',
              label: tr(CopyKeys.streamLanguages),
              icon: Icons.translate_rounded,
            ),
          ],
          onChanged: (value) =>
              onChanged((draft) => draft.copyWith(schoolStream: value)),
        ),
      ],
    );
  }
}

/// Step 3 — «إنت في سنة كام».
class OnboardingStepYear extends StatelessWidget {
  const OnboardingStepYear({
    required this.draft,
    required this.errors,
    required this.taxonomy,
    required this.onChanged,
    super.key,
  });

  final OnboardingDraft draft;
  final Map<String, String> errors;
  final Taxonomy? taxonomy;
  final void Function(OnboardingDraft Function(OnboardingDraft)) onChanged;

  @override
  Widget build(BuildContext context) {
    // ⚠️ Only the years the platform actually TEACHES — not every year the
    // education system has. Offering a third year with nothing in it is a
    // student choosing an empty library.
    final years = taxonomy == null
        ? const <AcademicYear>[]
        : FixedSection.offeredYears(taxonomy!);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.x16,
      children: [
        OnboardingChoiceGroup<int>(
          label: tr(CopyKeys.onboardingYear),
          value: draft.year,
          errorText: errors['year'],
          options: [
            for (final year in years)
              (
                value: year.year,
                label: year.badgeAr,
                icon: Icons.workspace_premium_outlined,
              ),
          ],
          onChanged: (value) =>
              onChanged((draft) => draft.copyWith(year: value)),
        ),
      ],
    );
  }
}

/// Step 4 — «تليفون ولي الأمر».
class OnboardingStepGuardian extends StatelessWidget {
  const OnboardingStepGuardian({
    required this.errors,
    required this.onChanged,
    required this.controller,
    super.key,
  });

  final Map<String, String> errors;
  final void Function(OnboardingDraft Function(OnboardingDraft)) onChanged;
  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.x16,
      children: [
        AppPhoneField(
          label: tr(CopyKeys.onboardingFatherPhone),
          controller: controller,
          isRequired: true,
          errorText: errors['fatherPhone'],
          // WHY it is being asked, on the screen that asks. A guardian's
          // number with no reason given is the field a student invents an
          // answer for.
          helperText: tr(CopyKeys.onboardingParentPhonesWhy),
          onChanged: (value) =>
              onChanged((draft) => draft.copyWith(fatherPhone: value)),
        ),
      ],
    );
  }
}
