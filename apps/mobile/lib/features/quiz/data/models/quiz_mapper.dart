import '../../../../core/data/network/json_parse.dart';
import '../../domain/entities/attempt.dart';
import '../../domain/entities/attempt_review.dart';
import '../../domain/entities/quiz_overview.dart';

/// Parses the learner quiz routes.
///
/// Hand-written against `packages/contracts/src/quiz/**`. ⚠️ The field names
/// here are the ones the ANSWER-LEAK interceptor allows: `slotPosition` not
/// `position`, `status` not `state`, `answered` not a grading state. The
/// server will never send the other names on these routes, so do not
/// "normalise" them.
abstract final class QuizMapper {
  static QuizOverview overview(Map<String, dynamic> json) {
    final blocked = json['blocked'];
    return QuizOverview(
      quizId: json['quizId'] as String,
      lessonId: json['lessonId'] as String,
      questionCount: (json['questionCount'] as num?)?.toInt() ?? 0,
      sumMarks: (json['sumMarks'] as num?)?.toDouble() ?? 0,
      gradeOutOf: (json['gradeOutOf'] as num?)?.toDouble() ?? 0,
      durationSeconds: (json['durationSeconds'] as num?)?.toInt(),
      passPercent: (json['passPercent'] as num?)?.toDouble() ?? 0,
      attemptsUsed: (json['attemptsUsed'] as num?)?.toInt() ?? 0,
      allowsImprovement: json['allowsImprovement'] as bool? ?? false,
      nextPaper: json['nextPaper'] as String?,
      bestScore: (json['bestScore'] as num?)?.toDouble(),
      inProgressAttemptId: json['inProgressAttemptId'] as String?,
      blocked: blocked is Map<String, dynamic>
          ? QuizBlocked(
              code: blocked['code'] as String,
              availableAt: _date(blocked['availableAt']),
            )
          : null,
      attempts: jsonList(json['attempts'], _historyRow),
    );
  }

  static AttemptHistoryRow _historyRow(Map<String, dynamic> json) {
    return AttemptHistoryRow(
      id: json['id'] as String,
      attemptNo: (json['attemptNo'] as num).toInt(),
      state: json['state'] as String,
      paper: json['paper'] as String,
      counts: json['counts'] as bool? ?? false,
      submittedAt: _date(json['submittedAt']),
      scaledScore: (json['scaledScore'] as num?)?.toDouble(),
      passed: json['passed'] as bool?,
    );
  }

  static StartedAttempt startedAttempt(Map<String, dynamic> json) {
    return StartedAttempt(
      attemptId: json['attemptId'] as String,
      attemptToken: json['attemptToken'] as String,
      deadlineAt: _date(json['deadlineAt']),
      serverTime: _date(json['serverTime']) ?? DateTime.now(),
      status: json['status'] as String? ?? 'in_progress',
      navMethod: json['navMethod'] as String? ?? 'free',
      paper: json['paper'] as String? ?? 'original',
      gradeOutOf: (json['gradeOutOf'] as num?)?.toDouble() ?? 0,
      sumMarks: (json['sumMarks'] as num?)?.toDouble() ?? 0,
      nextSeq: (json['nextSeq'] as num?)?.toInt() ?? 1,
      graceSeconds: (json['graceSeconds'] as num?)?.toInt() ?? 0,
      overdueHandling: json['overdueHandling'] as String? ?? 'autosubmit',
      questions: jsonList(json['questions'], _question),
    );
  }

  static LearnerQuestion _question(Map<String, dynamic> json) {
    final settings = json['settings'];
    return LearnerQuestion(
      slotPosition: (json['slotPosition'] as num).toInt(),
      questionId: json['questionId'] as String,
      type: json['type'] as String,
      stemHtml: json['stemHtml'] as String? ?? '',
      maxMark: (json['maxMark'] as num?)?.toDouble() ?? 0,
      options: jsonList(json['options'], _option),
      response: response(json['response']),
      flagged: json['flagged'] as bool? ?? false,
      answered: json['answered'] as bool? ?? false,
      minWords: settings is Map<String, dynamic>
          ? (settings['minWords'] as num?)?.toInt()
          : null,
      maxWords: settings is Map<String, dynamic>
          ? (settings['maxWords'] as num?)?.toInt()
          : null,
    );
  }

  static QuestionOption _option(Map<String, dynamic> json) => QuestionOption(
        id: json['id'] as String,
        bodyHtml: json['bodyHtml'] as String? ?? '',
      );

  /// The stored response object, in either of its two shapes.
  ///
  /// An unrecognised `kind` reads as NO answer rather than throwing: the
  /// question then shows as unanswered, which is recoverable, where a crash in
  /// the middle of an exam is not.
  static AnswerResponse? response(dynamic raw) {
    if (raw is! Map<String, dynamic>) return null;
    return switch (raw['kind']) {
      'choice' => ChoiceAnswer(jsonStrings(raw['optionIds'])),
      'text' => TextAnswer(raw['text'] as String? ?? ''),
      _ => null,
    };
  }

  static SaveResult saveResult(Map<String, dynamic> json) {
    return SaveResult(
      savedSlots: (json['savedSlots'] as List?)
              ?.map((slot) => (slot as num).toInt())
              .toList() ??
          const [],
      serverTime: _date(json['serverTime']) ?? DateTime.now(),
      deadlineAt: _date(json['deadlineAt']),
      answeredCount: (json['answeredCount'] as num?)?.toInt() ?? 0,
    );
  }

  static AttemptResult attemptResult(Map<String, dynamic> json) {
    return AttemptResult(
      attemptId: json['attemptId'] as String,
      rawScore: (json['rawScore'] as num?)?.toDouble() ?? 0,
      scaledScore: (json['scaledScore'] as num?)?.toDouble() ?? 0,
      passed: json['passed'] as bool? ?? false,
      needsGrading: json['needsGrading'] as bool? ?? false,
      attemptState: json['attemptState'] as String? ?? 'submitted',
    );
  }

  static ReviewPayload review(Map<String, dynamic> json) {
    if (json['locked'] == true) {
      return ReviewLocked(json['reason'] as String? ?? 'during');
    }

    return ReviewUnlocked(
      attemptId: json['attemptId'] as String,
      window: json['window'] as String? ?? 'afterClose',
      rawScore: (json['rawScore'] as num?)?.toDouble(),
      scaledScore: (json['scaledScore'] as num?)?.toDouble(),
      gradeOutOf: (json['gradeOutOf'] as num?)?.toDouble() ?? 0,
      sumMarks: (json['sumMarks'] as num?)?.toDouble() ?? 0,
      passPercent: (json['passPercent'] as num?)?.toDouble() ?? 0,
      passed: json['passed'] as bool?,
      questions: jsonList(json['questions'], _reviewQuestion),
    );
  }

  /// ⚠️ Every gated field is read through `containsKey`, never through a null
  /// check — see [ReviewQuestion]. Omission is the control.
  static ReviewQuestion _reviewQuestion(Map<String, dynamic> json) {
    return ReviewQuestion(
      slotPosition: (json['slotPosition'] as num).toInt(),
      questionId: json['questionId'] as String,
      attemptQuestionId: json['attemptQuestionId'] as String,
      type: json['type'] as String,
      stemHtml: json['stemHtml'] as String? ?? '',
      options: jsonList(json['options'], _option),
      hasResponse: json.containsKey('response'),
      response: response(json['response']),
      hasCorrectness: json.containsKey('correctness'),
      correctness: json['correctness'] as String?,
      hasMarks: json.containsKey('mark') || json.containsKey('maxMark'),
      mark: (json['mark'] as num?)?.toDouble(),
      maxMark: (json['maxMark'] as num?)?.toDouble(),
      feedbackHtml: json['feedbackHtml'] as String?,
      generalFeedbackHtml: json['generalFeedbackHtml'] as String?,
      rightAnswerText: json['rightAnswerText'] as String?,
      rightAnswerOptionIds: json.containsKey('rightAnswerOptionIds')
          ? jsonStrings(json['rightAnswerOptionIds'])
          : null,
    );
  }

  static DateTime? _date(dynamic value) {
    if (value is! String || value.isEmpty) return null;
    return DateTime.tryParse(value)?.toLocal();
  }
}
