/**
 * «مين كلّمني على واتساب» — the labels for the chats that already existed on
 * the linked number before it was linked (`marketing/wa-history.ts`).
 *
 * A new module, not a block in `admin.ts`: module ids outlive a deploy
 * (pitfalls: Turbopack). Nothing here imports anything.
 *
 * Admin-only copy, in the teacher's own first person («كلّموني»), the way the
 * question was asked. No name of any teacher appears here.
 */
export const copy = {
  /** The students list's filter button and its two options. */
  filterTitle: 'واتساب',
  filterLabels: {
    chatted: 'كلّمني على واتساب',
    never: 'مكلّمنيش',
  },

  audience: {
    title: 'كلّموني على واتساب قبل كده؟',
    options: {
      any: 'الكل',
      chatted: 'اللي كلّموني بس',
      never: 'اللي مكلّمونيش بس',
    },
    hints: {
      any: 'من غير فلتر على المحادثات.',
      chatted:
        'أأمن جمهور للرقم: المحادثة موجودة أصلاً، فالرسالة بتوصل زي أي رسالة عادية مش زي رسالة لحد غريب.',
      never: 'أرقام عمرها ما كان ليها محادثة على الرقم ده — كل رسالة هنا محادثة جديدة.',
    },
    /** Shown in red beside «مكلّمونيش», for as long as it is picked. */
    neverWarning:
      'ده أخطر جمهور على الرقم. واتساب بيعدّ المحادثات الجديدة لوحدها، وكتير منها ورا بعض بيوقف الرقم عن فتح محادثات (رفض ٤٦٣) وممكن يتحظر. السرعة رجعت للهادية، والأحسن تفضل كده وعدد قليل في اليوم.',
    pacingSlowed: 'السرعة اتظبطت على الهادية عشان الجمهور ده.',
    /** No history has arrived on this stack yet. */
    noHistory:
      'لسه مفيش محادثات قديمة وصلت من الرقم المربوط، فـ«مكلّمونيش» دلوقتي معناها كل الناس. المحادثات القديمة بتوصل مرة واحدة بس، أول ما الرقم يتربط.',
    summary: '{chats} رقم ليهم محادثة على الرقم · منهم {students} طالب و{parents} ولي أمر',
  },
} as const;
