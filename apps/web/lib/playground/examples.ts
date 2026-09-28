/**
 * The playground's ready-made programs — every one of them runs as written and
 * prints (or draws) something worth looking at.
 *
 * Data only: no React, no DOM. That keeps the whole library testable in Node
 * (`examples.test.ts` runs every JavaScript one and parses every Python one),
 * and keeps the icon choice a KEY the component maps to a glyph rather than an
 * import this module would drag into every consumer.
 *
 * ## The house rules for an example
 *
 * - **Arabic labels and comments, English code.** A variable named `اسم` is
 *   legal JavaScript and reads as a joke, and every reference the student will
 *   ever look up is in English. The comments are where the explaining happens.
 * - **Comments describe the code; they never address the reader.** «بتطبع»,
 *   not «اطبع» — an imperative in Egyptian Arabic has a gender, and the
 *   platform never asks which one the student is.
 * - **Output fits a phone.** Drawn output stays within ~32 columns so the
 *   console on a 360px screen shows the picture instead of wrapping it into
 *   noise.
 * - **HTML examples are self-contained.** No CDN, no web font, no image URL:
 *   the preview's policy blocks every request (`lib/html-preview.ts`), so a
 *   picture is an inline SVG, a CSS gradient or an emoji — which is also what
 *   makes each one work offline and on any tenant's stack.
 * - **The first five of each language keep their order**: they are the
 *   original set, and they build on each other (output → condition → loop →
 *   function → list).
 */

export type PlaygroundLanguage = 'js' | 'python' | 'web';

/** Glyph keys the component maps to icons. Adding one means adding it there. */
export type ExampleIcon =
  | 'hello'
  | 'branch'
  | 'loop'
  | 'function'
  | 'list'
  | 'pyramid'
  | 'grid'
  | 'dice'
  | 'sort'
  | 'chart'
  | 'prime'
  | 'heart'
  | 'report'
  | 'page'
  | 'card'
  | 'rocket'
  | 'orbit'
  | 'form'
  | 'layout'
  | 'buttons'
  | 'counter'
  | 'clock';

/** One of the six chart hues (`--viz-1…6`) — the card's colour. */
export type ExampleHue = 1 | 2 | 3 | 4 | 5 | 6;

interface ExampleBase {
  /** Stable — a React key, a test handle, and never shown. */
  id: string;
  title: string;
  /** One line, under the title on the card. */
  blurb: string;
  icon: ExampleIcon;
  hue: ExampleHue;
}

export interface CodeExample extends ExampleBase {
  language: 'js' | 'python';
  code: string;
}

export interface WebExample extends ExampleBase {
  language: 'web';
  html: string;
  css: string;
}

export type PlaygroundExample = CodeExample | WebExample;

/** Strips the one newline that follows the opening backtick. */
const src = (text: string) => text.replace(/^\n/, '').replace(/\s+$/, '');

// ── JavaScript ─────────────────────────────────────────────────────────────

export const JS_EXAMPLES: readonly CodeExample[] = [
  {
    id: 'js-hello',
    language: 'js',
    title: 'أول برنامج',
    blurb: 'سطرين بيطبعوا تحية على الشاشة.',
    icon: 'hello',
    hue: 1,
    code: src(`
// console.log بتطبع أي حاجة على الشاشة
console.log("أهلاً يا برمجة!");

const name = "نور";
console.log("إزيك يا " + name);
`),
  },
  {
    id: 'js-branch',
    language: 'js',
    title: 'شرط',
    blurb: 'الدرجة بتحدد التقدير بـ if و else.',
    icon: 'branch',
    hue: 2,
    code: src(`
const grade = 78;

if (grade >= 85) {
  console.log("ممتاز");
} else if (grade >= 65) {
  console.log("جيد جدًا");
} else {
  console.log("مقبول");
}
`),
  },
  {
    id: 'js-loop',
    language: 'js',
    title: 'حلقة',
    blurb: 'جدول ضرب السبعة بحلقة for.',
    icon: 'loop',
    hue: 3,
    code: src(`
// جدول الضرب بتاع ٧
for (let i = 1; i <= 10; i++) {
  console.log(7 + " x " + i + " = " + 7 * i);
}
`),
  },
  {
    id: 'js-function',
    language: 'js',
    title: 'دالة',
    blurb: 'دالة بتحسب متوسط أي مجموعة درجات.',
    icon: 'function',
    hue: 4,
    code: src(`
function average(numbers) {
  let total = 0;
  for (const n of numbers) total += n;
  return total / numbers.length;
}

console.log(average([80, 92, 67, 75]));
`),
  },
  {
    id: 'js-array',
    language: 'js',
    title: 'مصفوفة',
    blurb: 'أعلى درجة، وعددها، واللي عدّوا الـ٧٥.',
    icon: 'list',
    hue: 5,
    code: src(`
const marks = [80, 92, 67, 75, 88];

console.log("العدد:", marks.length);
console.log("الأعلى:", Math.max(...marks));
console.log("الناجحين:", marks.filter((m) => m >= 75));
`),
  },
  {
    id: 'js-pyramid',
    language: 'js',
    title: 'هرم نجوم',
    blurb: 'حلقة بترسم هرم، وكل دور أعرض من اللي فوقه.',
    icon: 'pyramid',
    hue: 1,
    code: src(`
// كل سطر فيه نجمتين زيادة عن اللي قبله
const height = 8;

for (let row = 1; row <= height; row++) {
  const spaces = " ".repeat(height - row);
  const stars = "*".repeat(row * 2 - 1);
  console.log(spaces + stars);
}
`),
  },
  {
    id: 'js-times-grid',
    language: 'js',
    title: 'جدول الضرب كله',
    blurb: 'حلقتين جوّه بعض بيطلّعوا الجدول من ١ لـ ٩.',
    icon: 'grid',
    hue: 6,
    code: src(`
// حلقة جوّه حلقة: الخارجية للصفوف والداخلية للأعمدة
for (let a = 1; a <= 9; a++) {
  let row = "";
  for (let b = 1; b <= 9; b++) {
    // padStart بتخلّي كل رقم واخد نفس المساحة
    row += String(a * b).padStart(3);
  }
  console.log(row);
}
`),
  },
  {
    id: 'js-guess',
    language: 'js',
    title: 'خمّن الرقم',
    blurb: 'البرنامج بيخمّن رقم سرّي بأقل عدد محاولات.',
    icon: 'dice',
    hue: 4,
    code: src(`
// رقم سرّي عشوائي من ١ لـ ١٠٠ — بيتغيّر كل تشغيلة
const secret = Math.floor(Math.random() * 100) + 1;

// البحث الثنائي: كل تخمينة بتشيل نص الأرقام الباقية
let low = 1;
let high = 100;
let tries = 0;

while (low <= high) {
  const guess = Math.floor((low + high) / 2);
  tries++;

  if (guess === secret) {
    console.log("🎯 " + guess + " — لقيناه في " + tries + " محاولات!");
    break;
  } else if (guess < secret) {
    console.log(guess + " صغيّر… نطلع لفوق ⬆️");
    low = guess + 1;
  } else {
    console.log(guess + " كبير… ننزل لتحت ⬇️");
    high = guess - 1;
  }
}
`),
  },
  {
    id: 'js-bubble',
    language: 'js',
    title: 'ترتيب الفقاعات',
    blurb: 'ترتيب خطوة بخطوة، وفي الآخر أعمدة مترتّبة.',
    icon: 'sort',
    hue: 2,
    code: src(`
const nums = [5, 2, 8, 1, 6, 3, 7, 4];
console.log("البداية:", nums.join(" "));

// كل لفّة، الرقم الأكبر بيطفو لآخر المصفوفة زي الفقاعة
for (let pass = 1; pass < nums.length; pass++) {
  let swapped = false;
  for (let i = 0; i < nums.length - pass; i++) {
    if (nums[i] > nums[i + 1]) {
      [nums[i], nums[i + 1]] = [nums[i + 1], nums[i]]; // تبديل
      swapped = true;
    }
  }
  console.log("لفّة " + pass + ":", nums.join(" "));
  // لفّة كاملة من غير ولا تبديل = المصفوفة اترتّبت خلاص
  if (!swapped) break;
}

console.log("");
for (const n of nums) {
  console.log("█".repeat(n * 3) + " " + n);
}
`),
  },
  {
    id: 'js-chart',
    language: 'js',
    title: 'رسم بالأعمدة',
    blurb: 'درجات المواد متحوّلة لرسم بياني بالحروف.',
    icon: 'chart',
    hue: 3,
    code: src(`
const marks = {
  "برمجة": 98,
  "رياضة": 91,
  "فيزيا": 76,
  "إنجليزي": 84,
  "عربي": 69,
};

for (const [subject, mark] of Object.entries(marks)) {
  // كل مربع = ٥ درجات
  const bar = "█".repeat(Math.round(mark / 5));
  console.log(bar.padEnd(20) + " " + mark + " " + subject);
}
`),
  },
  {
    id: 'js-primes',
    language: 'js',
    title: 'الأعداد الأولية',
    blurb: 'أول ٢٠ عدد أولي — مالهمش قاسم غير ١ ونفسهم.',
    icon: 'prime',
    hue: 5,
    code: src(`
function isPrime(n) {
  if (n < 2) return false;
  // كفاية نجرّب لحد الجذر التربيعي
  for (let d = 2; d * d <= n; d++) {
    if (n % d === 0) return false;
  }
  return true;
}

const primes = [];
for (let n = 2; primes.length < 20; n++) {
  if (isPrime(n)) primes.push(n);
}

console.log("أول ٢٠ عدد أولي:");
console.log(primes.join(", "));
console.log("مجموعهم:", primes.reduce((sum, p) => sum + p, 0));
`),
  },
  {
    id: 'js-heart',
    language: 'js',
    title: 'قلب بمعادلة',
    blurb: 'معادلة رياضية بترسم قلب كامل من النجوم.',
    icon: 'heart',
    hue: 4,
    code: src(`
// النقطة (x, y) بتبقى نجمة لو المعادلة دي ≤ صفر:
// (x² + y² − 1)³ − x²·y³
for (let row = 12; row >= -12; row--) {
  let line = "";
  for (let col = -15; col <= 15; col++) {
    const x = col / 12;
    const y = row / 10;
    const a = x * x + y * y - 1;
    line += a * a * a - x * x * y * y * y <= 0 ? "*" : " ";
  }
  if (line.trim() !== "") console.log(line);
}
`),
  },
];

// ── Python ─────────────────────────────────────────────────────────────────

/**
 * The same ideas in Python, not a translation of the JavaScript.
 *
 * A student switching languages is comparing HOW each one says a thing, so the
 * programs are idiomatic in both — `for i in range(1, 11)` rather than a
 * transliterated C-style loop, an f-string rather than `+` concatenation.
 */
export const PY_EXAMPLES: readonly CodeExample[] = [
  {
    id: 'py-hello',
    language: 'python',
    title: 'أول برنامج',
    blurb: 'print بتطبع تحية، والـf-string بتحط الاسم جوّه الجملة.',
    icon: 'hello',
    hue: 1,
    code: src(`
# print بتطبع أي حاجة على الشاشة
print("أهلاً يا برمجة!")

name = "نور"
print(f"إزيك يا {name}")
`),
  },
  {
    id: 'py-branch',
    language: 'python',
    title: 'شرط',
    blurb: 'التقدير بـ if و elif و else.',
    icon: 'branch',
    hue: 2,
    code: src(`
grade = 78

if grade >= 85:
    print("ممتاز")
elif grade >= 65:
    print("جيد جدًا")
else:
    print("مقبول")
`),
  },
  {
    id: 'py-loop',
    language: 'python',
    title: 'حلقة',
    blurb: 'جدول ضرب السبعة بـ for و range.',
    icon: 'loop',
    hue: 3,
    code: src(`
# جدول الضرب بتاع ٧
for i in range(1, 11):
    print(f"7 x {i} = {7 * i}")
`),
  },
  {
    id: 'py-function',
    language: 'python',
    title: 'دالة',
    blurb: 'def بتعرّف دالة بتحسب المتوسط.',
    icon: 'function',
    hue: 4,
    code: src(`
def average(numbers):
    return sum(numbers) / len(numbers)

print(average([80, 92, 67, 75]))
`),
  },
  {
    id: 'py-list',
    language: 'python',
    title: 'قائمة',
    blurb: 'len و max وقائمة الناجحين في سطر واحد.',
    icon: 'list',
    hue: 5,
    code: src(`
marks = [80, 92, 67, 75, 88]

print("العدد:", len(marks))
print("الأعلى:", max(marks))
print("الناجحين:", [m for m in marks if m >= 75])
`),
  },
  {
    id: 'py-diamond',
    language: 'python',
    title: 'ماسة نجوم',
    blurb: 'هرم لفوق وهرم لتحت بيعملوا ماسة.',
    icon: 'pyramid',
    hue: 1,
    code: src(`
size = 7

# النص اللي فوق: السطور بتوسع
for row in range(1, size + 1):
    print(" " * (size - row) + "*" * (row * 2 - 1))

# النص اللي تحت: نفس الحكاية بالعكس
for row in range(size - 1, 0, -1):
    print(" " * (size - row) + "*" * (row * 2 - 1))
`),
  },
  {
    id: 'py-times-grid',
    language: 'python',
    title: 'جدول الضرب كله',
    blurb: 'حلقتين متداخلتين وتنسيق الأرقام بـ :>3.',
    icon: 'grid',
    hue: 6,
    code: src(`
# :>3 معناها: الرقم ياخد ٣ خانات ويتزق يمين
for a in range(1, 10):
    row = ""
    for b in range(1, 10):
        row += f"{a * b:>3}"
    print(row)
`),
  },
  {
    id: 'py-guess',
    language: 'python',
    title: 'خمّن الرقم',
    blurb: 'random بتختار رقم، والبحث الثنائي بيلاقيه.',
    icon: 'dice',
    hue: 4,
    code: src(`
import random

# رقم سرّي بيتغيّر كل تشغيلة
secret = random.randint(1, 100)
low, high = 1, 100
tries = 0

while low <= high:
    guess = (low + high) // 2
    tries += 1
    if guess == secret:
        print(f"🎯 {guess} — لقيناه في {tries} محاولات!")
        break
    elif guess < secret:
        print(f"{guess} صغيّر… نطلع لفوق ⬆️")
        low = guess + 1
    else:
        print(f"{guess} كبير… ننزل لتحت ⬇️")
        high = guess - 1
`),
  },
  {
    id: 'py-bubble',
    language: 'python',
    title: 'ترتيب الفقاعات',
    blurb: 'كل لفّة مطبوعة، وفي الآخر أعمدة.',
    icon: 'sort',
    hue: 2,
    code: src(`
nums = [5, 2, 8, 1, 6, 3, 7, 4]
print("البداية:", *nums)

for p in range(1, len(nums)):
    swapped = False
    for i in range(len(nums) - p):
        if nums[i] > nums[i + 1]:
            # تبديل في سطر واحد
            nums[i], nums[i + 1] = nums[i + 1], nums[i]
            swapped = True
    print(f"لفّة {p}:", *nums)
    # لفّة كاملة من غير ولا تبديل = القايمة اترتّبت خلاص
    if not swapped:
        break

print()
for n in nums:
    print("█" * (n * 3), n)
`),
  },
  {
    id: 'py-chart',
    language: 'python',
    title: 'رسم بالأعمدة',
    blurb: 'قاموس درجات بيتحوّل لرسم بياني.',
    icon: 'chart',
    hue: 3,
    code: src(`
marks = {
    "برمجة": 98,
    "رياضة": 91,
    "فيزيا": 76,
    "إنجليزي": 84,
    "عربي": 69,
}

for subject, mark in marks.items():
    # كل مربع = ٥ درجات
    bar = "█" * round(mark / 5)
    print(f"{bar:<20} {mark} {subject}")
`),
  },
  {
    id: 'py-primes',
    language: 'python',
    title: 'الأعداد الأولية',
    blurb: 'دالة بتفحص الرقم، وحلقة بتجمع أول ٢٠.',
    icon: 'prime',
    hue: 5,
    code: src(`
def is_prime(n):
    if n < 2:
        return False
    # كفاية نجرّب لحد الجذر التربيعي
    d = 2
    while d * d <= n:
        if n % d == 0:
            return False
        d += 1
    return True

primes = []
n = 2
while len(primes) < 20:
    if is_prime(n):
        primes.append(n)
    n += 1

print("أول ٢٠ عدد أولي:")
print(*primes, sep=", ")
print("مجموعهم:", sum(primes))
`),
  },
  {
    id: 'py-report',
    language: 'python',
    title: 'شهادة درجات',
    blurb: 'قاموس ودالة بيطلّعوا شهادة بالتقديرات.',
    icon: 'report',
    hue: 6,
    code: src(`
def letter(mark):
    if mark >= 90:
        return "A ⭐"
    if mark >= 80:
        return "B"
    if mark >= 65:
        return "C"
    return "D"

report = {"برمجة": 97, "رياضة": 88, "فيزيا": 71, "كيميا": 62}

print("━" * 24)
for subject, mark in report.items():
    print(f"{mark:>3}  {letter(mark):<4}  {subject}")
print("━" * 24)

average = sum(report.values()) / len(report)
print(f"المتوسط: {average:.1f} — تقدير {letter(average)}")
`),
  },
];

// ── HTML + CSS ─────────────────────────────────────────────────────────────

/**
 * Pages, not snippets: every one is a whole document with `lang="ar"
 * dir="rtl"`, because that is the shape a student should copy. The type face is
 * the system's (`system-ui`) — a web font would be a request, and the preview
 * makes none.
 */
export const WEB_EXAMPLES: readonly WebExample[] = [
  {
    id: 'web-first-page',
    language: 'web',
    title: 'أول صفحة',
    blurb: 'عناوين وفقرة وقايمة — ألف باء الـHTML.',
    icon: 'page',
    hue: 1,
    html: src(`
<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>أول صفحة</title>
</head>
<body>
  <h1>أهلاً بالعالم 👋</h1>
  <p>دي أول صفحة ويب — كل سطر هنا عنصر HTML ليه وظيفة.</p>

  <h2>حاجات بحبها</h2>
  <ul>
    <li>البرمجة 💻</li>
    <li>الكورة ⚽</li>
    <li>الرسم 🎨</li>
  </ul>

  <p>
    الكلام ممكن يبقى <strong>تقيل</strong>،
    أو <em>مايل</em>، أو <mark>متعلّم عليه</mark>.
  </p>
</body>
</html>
`),
    css: src(`
/* الـCSS بيقول لكل عنصر شكله إيه */
body {
  font-family: system-ui, "Segoe UI", Tahoma, sans-serif;
  background: #fff8ec;
  color: #2b2118;
  padding: 24px;
  line-height: 1.8;
}

h1 {
  color: #e8590c;
}

h2 {
  color: #5f3dc4;
  border-bottom: 3px solid #d0bfff;
  display: inline-block;
}

li {
  font-size: 18px;
}

mark {
  background: #ffe066;
  padding: 0 4px;
  border-radius: 4px;
}
`),
  },
  {
    id: 'web-profile-card',
    language: 'web',
    title: 'كارت تعريف',
    blurb: 'صورة من CSS، اسم، مهارات، وزراير.',
    icon: 'card',
    hue: 3,
    html: src(`
<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>كارت تعريف</title>
</head>
<body>
  <main class="card">
    <div class="avatar">ن</div>
    <h1>نور محمود</h1>
    <p class="role">طالبة ثانوي · بتحب البرمجة والرسم</p>

    <div class="tags">
      <span>HTML</span>
      <span>CSS</span>
      <span>Python</span>
    </div>

    <div class="stats">
      <div><b>12</b><small>مشروع</small></div>
      <div><b>340</b><small>ساعة كود</small></div>
      <div><b>7</b><small>شهادات</small></div>
    </div>

    <div class="actions">
      <button class="primary">متابعة</button>
      <button>رسالة</button>
    </div>
  </main>
</body>
</html>
`),
    css: src(`
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: system-ui, "Segoe UI", Tahoma, sans-serif;
  background: linear-gradient(135deg, #7048e8, #1c7ed6);
}

.card {
  width: min(320px, 90vw);
  padding: 28px 24px;
  border-radius: 24px;
  background: white;
  text-align: center;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}

/* الصورة دايرة بجريدينت — مفيش ملف صورة خالص */
.avatar {
  width: 96px;
  height: 96px;
  margin: -76px auto 12px;
  border-radius: 50%;
  border: 5px solid white;
  display: grid;
  place-items: center;
  font-size: 42px;
  font-weight: 700;
  color: white;
  background: conic-gradient(#f06595, #fcc419, #20c997, #339af0, #f06595);
}

h1 { margin: 0; font-size: 24px; color: #212529; }
.role { margin: 6px 0 16px; color: #868e96; }

.tags { display: flex; gap: 8px; justify-content: center; }
.tags span {
  direction: ltr;
  padding: 4px 12px;
  border-radius: 99px;
  font-size: 13px;
  background: #f3f0ff;
  color: #6741d9;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 20px 0;
  padding: 14px 0;
  border-block: 1px solid #f1f3f5;
}
.stats b { display: block; font-size: 22px; color: #212529; }
.stats small { color: #868e96; }

.actions { display: flex; gap: 10px; }
.actions button {
  flex: 1;
  padding: 12px;
  border-radius: 12px;
  border: 2px solid #7048e8;
  background: white;
  color: #7048e8;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.actions .primary { background: #7048e8; color: white; }
.actions button:hover { transform: translateY(-2px); }
`),
  },
  {
    id: 'web-hero',
    language: 'web',
    title: 'صفحة هبوط ملوّنة',
    blurb: 'قايمة فوق، عنوان كبير، زراير، ورسمة SVG.',
    icon: 'rocket',
    hue: 4,
    html: src(`
<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>صفحة هبوط</title>
</head>
<body>
  <nav>
    <b class="logo">✦ موقعي</b>
    <a href="#features">المميزات</a>
    <a href="#features">الأسعار</a>
  </nav>

  <header class="hero">
    <div class="text">
      <span class="badge">جديد 🎉</span>
      <h1>أول موقع ليّا<br>على الإنترنت</h1>
      <p>صفحة واحدة، شوية ألوان، وزرارين — ده كل اللي محتاجه موقع يبان حلو.</p>
      <div class="buttons">
        <button class="main">يلا نبدأ</button>
        <button class="ghost">تفاصيل أكتر</button>
      </div>
    </div>

    <!-- الرسمة SVG مكتوبة جوّه الصفحة نفسها -->
    <svg class="art" viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="80" fill="#ffffff22" />
      <circle cx="100" cy="100" r="55" fill="#ffffff33" />
      <path d="M100 40 C125 70 125 115 112 140 H88 C75 115 75 70 100 40Z" fill="#fff" />
      <circle cx="100" cy="88" r="12" fill="#4dabf7" />
      <path d="M88 140 L78 160 L96 150Z M112 140 L122 160 L104 150Z" fill="#ffd43b" />
      <path d="M94 150 L100 175 L106 150Z" fill="#ff922b" />
    </svg>
  </header>

  <section id="features" class="features">
    <div>⚡<b>سريع</b></div>
    <div>🎨<b>ملوّن</b></div>
    <div>📱<b>على الموبايل</b></div>
  </section>
</body>
</html>
`),
    css: src(`
* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, "Segoe UI", Tahoma, sans-serif;
  color: white;
  min-height: 100vh;
  background:
    radial-gradient(circle at 85% 15%, #f06595 0, transparent 40%),
    radial-gradient(circle at 10% 90%, #22b8cf 0, transparent 45%),
    linear-gradient(135deg, #5f3dc4, #1971c2);
}

nav { display: flex; gap: 20px; align-items: center; padding: 18px 24px; }
nav .logo { margin-inline-end: auto; font-size: 20px; }
nav a { color: #ffffffcc; text-decoration: none; }

.hero {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 24px;
}
.text { max-width: 340px; }

.badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 99px;
  background: #ffffff26;
  font-size: 14px;
}

h1 { font-size: 36px; line-height: 1.3; margin: 14px 0; }
p { color: #ffffffd9; line-height: 1.8; }

.buttons { display: flex; gap: 10px; margin-top: 18px; }
button {
  font: inherit;
  font-weight: 700;
  padding: 12px 22px;
  border-radius: 14px;
  border: 0;
  cursor: pointer;
}
.main { background: #ffd43b; color: #2b2118; box-shadow: 0 8px 20px #0003; }
.ghost { background: transparent; color: white; border: 2px solid #ffffff80; }

.art { width: 200px; animation: float 3s ease-in-out infinite; }
@keyframes float {
  50% { transform: translateY(-12px) rotate(3deg); }
}

.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  padding: 24px;
}
.features div {
  display: grid;
  gap: 6px;
  place-items: center;
  padding: 16px;
  font-size: 28px;
  border-radius: 16px;
  background: #ffffff1f;
}
.features b { font-size: 16px; }
`),
  },
  {
    id: 'web-solar',
    language: 'web',
    title: 'مجموعة شمسية بتلف',
    blurb: 'أنيميشن CSS بس: كواكب بتدور ونجوم بتلمع.',
    icon: 'orbit',
    hue: 5,
    html: src(`
<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>المجموعة الشمسية</title>
</head>
<body>
  <div class="space">
    <div class="sun"></div>

    <!-- كل مدار بيلف حوالين نفسه، والكوكب راكب على طرفه -->
    <div class="orbit o1"><span class="planet p1"></span></div>
    <div class="orbit o2"><span class="planet p2"></span></div>
    <div class="orbit o3"><span class="planet p3"></span></div>

    <i class="star" style="top: 12%; left: 18%"></i>
    <i class="star" style="top: 30%; left: 85%"></i>
    <i class="star" style="top: 78%; left: 12%"></i>
    <i class="star" style="top: 88%; left: 70%"></i>
  </div>
  <p>مفيش ولا سطر JavaScript هنا — الحركة كلها <code>@keyframes</code></p>
</body>
</html>
`),
    css: src(`
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 16px;
  background: radial-gradient(circle, #1b1f4b, #05060f 70%);
  color: #c5cae9;
  font-family: system-ui, "Segoe UI", Tahoma, sans-serif;
}

.space { position: relative; width: 300px; height: 300px; }

.sun {
  position: absolute;
  inset: 120px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #fff3bf, #fcc419 45%, #f76707);
  box-shadow: 0 0 40px #fab005, 0 0 90px #f76707;
  animation: glow 2s ease-in-out infinite alternate;
}

.orbit {
  position: absolute;
  border: 1px dashed #ffffff2e;
  border-radius: 50%;
  animation: spin linear infinite;
}
.o1 { inset: 85px; animation-duration: 4s; }
.o2 { inset: 45px; animation-duration: 7s; }
.o3 { inset: 5px;  animation-duration: 12s; }

.planet {
  position: absolute;
  top: -9px;
  left: calc(50% - 9px);
  width: 18px;
  height: 18px;
  border-radius: 50%;
}
.p1 { background: #ff8787; }
.p2 { background: #4dabf7; box-shadow: 0 0 12px #4dabf7; }
.p3 { background: #69db7c; width: 24px; height: 24px; top: -12px; }

.star {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: white;
  animation: twinkle 1.5s ease-in-out infinite alternate;
}
.star:nth-of-type(2n) { animation-delay: 0.7s; }

code { direction: ltr; unicode-bidi: isolate; color: #ffd43b; }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes glow { to { transform: scale(1.08); } }
@keyframes twinkle { to { opacity: 0.2; transform: scale(0.5); } }
`),
  },
  {
    id: 'web-form',
    language: 'web',
    title: 'فورم بيرد عليك',
    blurb: 'خانات إدخال وزرار، وJavaScript بترد بتحية.',
    icon: 'form',
    hue: 2,
    html: src(`
<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>فورم</title>
</head>
<body>
  <form id="hello-form" class="box">
    <h1>يلا نتعرّف 👋</h1>

    <label for="name">الاسم</label>
    <input id="name" placeholder="الاسم هنا" required>

    <label for="lang">اللغة المفضّلة</label>
    <select id="lang">
      <option>Python</option>
      <option>JavaScript</option>
      <option>HTML و CSS</option>
    </select>

    <button type="submit">إرسال</button>
    <p id="reply" class="reply" hidden></p>
  </form>

  <script>
    const form = document.getElementById("hello-form");
    const reply = document.getElementById("reply");

    form.addEventListener("submit", (event) => {
      // الفورم عادةً بيبعت البيانات ويحمّل الصفحة من الأول،
      // و preventDefault بتوقّف ده
      event.preventDefault();
      const name = document.getElementById("name").value.trim();
      const lang = document.getElementById("lang").value;

      reply.textContent = "أهلاً يا " + name + "! 🎉 " + lang + " اختيار جميل.";
      reply.hidden = false;
      console.log("اتبعت:", name, lang);
    });
  </script>
</body>
</html>
`),
    css: src(`
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: system-ui, "Segoe UI", Tahoma, sans-serif;
  background: #e6fcf5;
}

.box {
  display: grid;
  gap: 8px;
  width: min(320px, 90vw);
  padding: 24px;
  border-radius: 20px;
  background: white;
  box-shadow: 0 12px 30px rgba(12, 166, 120, 0.2);
}

h1 { margin: 0 0 8px; font-size: 22px; color: #087f5b; }
label { font-size: 14px; color: #495057; }

input,
select {
  font: inherit;
  padding: 10px 12px;
  border: 2px solid #c3fae8;
  border-radius: 10px;
  outline: none;
}
input:focus,
select:focus { border-color: #12b886; }

button {
  margin-top: 8px;
  padding: 12px;
  border: 0;
  border-radius: 12px;
  font: inherit;
  font-weight: 700;
  color: white;
  background: #12b886;
  cursor: pointer;
}
button:active { transform: scale(0.97); }

.reply {
  margin: 8px 0 0;
  padding: 12px;
  border-radius: 12px;
  background: #fff9db;
  color: #5c3d00;
  animation: pop 0.3s ease-out;
}
@keyframes pop { from { transform: scale(0.8); opacity: 0; } }
`),
  },
  {
    id: 'web-card-grid',
    language: 'web',
    title: 'شبكة كروت',
    blurb: 'CSS Grid بيرتّب الكروت لوحده على أي شاشة.',
    icon: 'layout',
    hue: 6,
    html: src(`
<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>شبكة كروت</title>
</head>
<body>
  <h1>المواد الدراسية</h1>
  <p class="hint">الكروت بتتلم وتتفرد لوحدها على حسب عرض الشاشة.</p>

  <section class="grid">
    <article style="--c: #7048e8">
      <span>💻</span><h2>البرمجة</h2><p>٢٤ درس</p>
    </article>
    <article style="--c: #1c7ed6">
      <span>📐</span><h2>الرياضيات</h2><p>٣٠ درس</p>
    </article>
    <article style="--c: #e8590c">
      <span>⚛️</span><h2>الفيزياء</h2><p>١٨ درس</p>
    </article>
    <article style="--c: #0ca678">
      <span>🧪</span><h2>الكيمياء</h2><p>٢٠ درس</p>
    </article>
    <article style="--c: #d6336c">
      <span>📖</span><h2>العربي</h2><p>٢٢ درس</p>
    </article>
    <article style="--c: #f59f00">
      <span>🌍</span><h2>الإنجليزي</h2><p>١٦ درس</p>
    </article>
  </section>
</body>
</html>
`),
    css: src(`
body {
  margin: 0;
  padding: 24px;
  font-family: system-ui, "Segoe UI", Tahoma, sans-serif;
  background: #f8f9fa;
  color: #212529;
}

h1 { margin: 0; }
.hint { color: #868e96; margin-top: 4px; }

/* auto-fit + minmax: كل كارت عرضه ١٣٠ على الأقل،
   والمساحة الباقية بتتقسم عليهم بالعدل */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 14px;
}

article {
  padding: 18px 14px;
  border-radius: 18px;
  background: white;
  border-top: 5px solid var(--c);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  text-align: center;
  transition: transform 0.2s, box-shadow 0.2s;
}
article:hover {
  transform: translateY(-6px);
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.12);
}

article span {
  display: inline-grid;
  place-items: center;
  width: 56px;
  height: 56px;
  font-size: 28px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--c) 15%, white);
}

article h2 { font-size: 18px; margin: 12px 0 4px; color: var(--c); }
article p { margin: 0; color: #868e96; font-size: 14px; }
`),
  },
  {
    id: 'web-buttons',
    language: 'web',
    title: 'مجموعة زراير',
    blurb: 'سبع أشكال زراير بـhover وحركة.',
    icon: 'buttons',
    hue: 1,
    html: src(`
<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>زراير</title>
</head>
<body>
  <h1>مجموعة زراير</h1>
  <p>كل زرار ليه شكل لما الماوس يعدّي عليه، وشكل تاني وهو بيتداس.</p>

  <div class="row">
    <button class="solid">عادي</button>
    <button class="outline">بإطار</button>
    <button class="pill">كبسولة</button>
    <button class="gradient">جريدينت</button>
    <button class="push">بيتداس</button>
    <button class="glow">بينوّر</button>
    <button class="icon">❤️ إعجاب</button>
  </div>
</body>
</html>
`),
    css: src(`
body {
  margin: 0;
  padding: 24px;
  font-family: system-ui, "Segoe UI", Tahoma, sans-serif;
  background: #fffaf0;
  color: #2b2118;
}

.row { display: flex; flex-wrap: wrap; gap: 14px; }

button {
  font: inherit;
  font-weight: 700;
  padding: 12px 22px;
  border: 0;
  border-radius: 10px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
}
button:hover { transform: translateY(-3px); }
button:active { transform: translateY(1px); }

.solid { background: #1c7ed6; color: white; }
.outline { background: transparent; color: #1c7ed6; border: 2px solid #1c7ed6; }
.outline:hover { background: #1c7ed6; color: white; }
.pill { border-radius: 99px; background: #0ca678; color: white; }
.gradient { background: linear-gradient(135deg, #f06595, #fab005); color: white; }

/* الزرار ده ليه "حافة" تحت، وبتختفي لما يتداس */
.push {
  background: #f76707;
  color: white;
  box-shadow: 0 6px 0 #c2410c;
}
.push:active { transform: translateY(6px); box-shadow: 0 0 0 #c2410c; }

.glow { background: #7048e8; color: white; }
.glow:hover { box-shadow: 0 0 0 4px #d0bfff, 0 0 24px #7048e8; }

.icon { background: white; color: #e03131; border: 2px solid #ffc9c9; }
.icon:hover { background: #fff5f5; }
`),
  },
  {
    id: 'web-counter',
    language: 'web',
    title: 'عدّاد تفاعلي',
    blurb: 'زرارين وسطر JavaScript بيغيّروا الرقم واللون.',
    icon: 'counter',
    hue: 3,
    html: src(`
<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>عدّاد</title>
</head>
<body>
  <main class="counter">
    <p>العدّاد</p>
    <output id="value">0</output>
    <div class="buttons">
      <button id="minus">−</button>
      <button id="reset">صفر</button>
      <button id="plus">+</button>
    </div>
  </main>

  <script>
    let count = 0;
    const value = document.getElementById("value");

    function render() {
      value.textContent = count;
      // اللون بيتغيّر حسب الإشارة: أخضر موجب، أحمر سالب
      value.className = count > 0 ? "up" : count < 0 ? "down" : "";
    }

    function change(step) {
      count = step === 0 ? 0 : count + step;
      render();
    }

    const byId = (id) => document.getElementById(id);
    byId("plus").addEventListener("click", () => change(+1));
    byId("minus").addEventListener("click", () => change(-1));
    byId("reset").addEventListener("click", () => change(0));
  </script>
</body>
</html>
`),
    css: src(`
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: system-ui, "Segoe UI", Tahoma, sans-serif;
  background: linear-gradient(160deg, #f3f0ff, #e7f5ff);
}

.counter {
  padding: 28px 36px;
  border-radius: 28px;
  background: white;
  text-align: center;
  box-shadow: 0 18px 40px rgba(76, 110, 245, 0.18);
}

.counter p { margin: 0; color: #868e96; }

output {
  display: block;
  margin: 8px 0 18px;
  font-size: 84px;
  font-weight: 800;
  color: #495057;
  transition: color 0.2s;
}
output.up { color: #2f9e44; }
output.down { color: #e03131; }

.buttons { display: flex; gap: 10px; justify-content: center; }
button {
  min-width: 64px;
  padding: 12px 16px;
  font: inherit;
  font-size: 22px;
  font-weight: 700;
  border: 0;
  border-radius: 16px;
  cursor: pointer;
  background: #edf2ff;
  color: #3b5bdb;
}
#plus { background: #4c6ef5; color: white; }
#reset { font-size: 16px; }
button:active { transform: scale(0.92); }
`),
  },
  {
    id: 'web-clock',
    language: 'web',
    title: 'ساعة ديجيتال',
    blurb: 'setInterval بتحدّث الوقت كل ثانية.',
    icon: 'clock',
    hue: 2,
    html: src(`
<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>ساعة</title>
</head>
<body>
  <div class="clock">
    <div id="time" class="time">00:00:00</div>
    <div id="date" class="date"></div>
  </div>

  <script>
    const clock = document.getElementById("time");
    const today = document.getElementById("date");

    // padStart بتخلّي الرقم دايمًا خانتين: 7 تبقى 07
    const two = (n) => String(n).padStart(2, "0");

    function tick() {
      const now = new Date();
      const parts = [now.getHours(), now.getMinutes(), now.getSeconds()];
      clock.textContent = parts.map(two).join(":");
      today.textContent = now.toLocaleDateString("ar-EG", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    }

    tick();
    setInterval(tick, 1000); // كل ١٠٠٠ مللي ثانية = كل ثانية
  </script>
</body>
</html>
`),
    css: src(`
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #0b0f1a;
  font-family: system-ui, "Segoe UI", Tahoma, sans-serif;
}

.clock {
  padding: 28px 34px;
  border-radius: 24px;
  text-align: center;
  background: linear-gradient(145deg, #131a2e, #0b0f1a);
  border: 1px solid #22d3ee44;
  box-shadow: 0 0 40px #22d3ee22;
}

.time {
  direction: ltr;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 52px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #67e8f9;
  text-shadow: 0 0 12px #22d3ee, 0 0 30px #0891b2;
}

.date { margin-top: 8px; color: #94a3b8; font-size: 18px; }
`),
  },
];

export const EXAMPLES_BY_LANGUAGE: Record<PlaygroundLanguage, readonly PlaygroundExample[]> = {
  js: JS_EXAMPLES,
  python: PY_EXAMPLES,
  web: WEB_EXAMPLES,
};

export const ALL_EXAMPLES: readonly PlaygroundExample[] = [
  ...JS_EXAMPLES,
  ...PY_EXAMPLES,
  ...WEB_EXAMPLES,
];
