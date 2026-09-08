part of 'onboarding_cubit.dart';

class OnboardingState extends Equatable {
  const OnboardingState({
    this.step = 0,
    this.draft = const OnboardingDraft(),
    this.taxonomy,
    this.taxonomyLoaded = false,
    this.loading = false,
    this.submitting = false,
    this.done = false,
    this.fieldErrors = const {},
    this.formError,
  });

  final int step;
  final OnboardingDraft draft;

  /// ⚠️ Null after [taxonomyLoaded] means the read FAILED — a different state
  /// from "not asked yet", and the one the wizard cannot continue from.
  final Taxonomy? taxonomy;
  final bool taxonomyLoaded;

  final bool loading;
  final bool submitting;
  final bool done;

  /// Field path → the message, from the contract's own wording.
  final Map<String, String> fieldErrors;

  /// One sentence over the whole form.
  final String? formError;

  bool get taxonomyUnavailable => taxonomyLoaded && taxonomy == null;
  bool get isLastStep => step >= OnboardingCubit.lastStep;

  OnboardingState copyWith({
    int? step,
    OnboardingDraft? draft,
    Taxonomy? taxonomy,
    bool? taxonomyLoaded,
    bool? loading,
    bool? submitting,
    bool? done,
    Map<String, String>? fieldErrors,
    String? formError,
    bool clearErrors = false,
  }) {
    return OnboardingState(
      step: step ?? this.step,
      draft: draft ?? this.draft,
      taxonomy: taxonomy ?? this.taxonomy,
      taxonomyLoaded: taxonomyLoaded ?? this.taxonomyLoaded,
      loading: loading ?? this.loading,
      submitting: submitting ?? this.submitting,
      done: done ?? this.done,
      fieldErrors: clearErrors ? const {} : (fieldErrors ?? this.fieldErrors),
      formError: clearErrors ? null : (formError ?? this.formError),
    );
  }

  @override
  List<Object?> get props => [
    step,
    draft,
    taxonomy,
    taxonomyLoaded,
    loading,
    submitting,
    done,
    fieldErrors,
    formError,
  ];
}
