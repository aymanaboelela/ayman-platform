/**
 * موسيقى «من سيربح المليون» — متركّبة بـWebAudio، مفيش ولا ملف صوت.
 *
 * ## ليه مش موسيقى البرنامج نفسها
 *
 * موسيقى البرنامج ليها حقوق، وتشغيلها على منصة بفلوس مش «استلهام». اللي هنا
 * تأليف أصلي بنفس الروح: فرشة توتر تحت كل سؤال، ضربة قلب لما الإجابة تتقفل،
 * فانفير لما تطلع صح، وهبوط لما تطلع غلط.
 *
 * ## الفرشة بتعلى مع السلّم
 *
 * `intensity` من ٠ لـ١ (رقم السؤال على طول الجولة): الكورد بيطلع أعلى، والنبض
 * أسرع، والفلتر بيفتح. وآخر ١٠ ثواني في التايمر (`urgent`) التكّة بتتضاعف.
 * نفس اللي بيخلّي السؤال الـ١٥ في البرنامج أتقل من الأول، من غير ما حد يقول.
 */

type Loop = { stop: (fade?: number) => void };

/** ترددات بالنوتة — A4 = 440. */
const hz = (semitonesFromA4: number) => 440 * 2 ** (semitonesFromA4 / 12);

export class ShowScore {
  private master: GainNode;
  private musicBus: GainNode;
  private noise: AudioBuffer;
  private bed: Loop | null = null;
  private tension: Loop | null = null;
  private urgent = false;

  constructor(private ctx: AudioContext) {
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    // كومبريسور خفيف في الآخر: الفانفير والبوم فوق الفرشة مايقطّعوش السماعة.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 1;
    this.musicBus.connect(this.master);
    this.noise = this.makeNoise();
  }

  /** الفرشة تحت الكلام: القراية شغّالة = الموسيقى بتوطى لحد ما تخلص. */
  duck(on: boolean) {
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setTargetAtTime(on ? 0.35 : 1, t, 0.15);
  }

  setUrgent(on: boolean) {
    this.urgent = on;
  }

  stopAll(fade = 0.4) {
    this.bed?.stop(fade);
    this.tension?.stop(fade);
    this.bed = null;
    this.tension = null;
  }

  // ── الفرشة ─────────────────────────────────────────────────────────────

  /** توتر السؤال: كورد صغير ماسك، ونبض واطي، وتكّة بتسرع في الآخر. */
  startBed(intensity: number) {
    this.stopAll(0.25);
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.2);
    out.connect(this.musicBus);

    // الكورد: La صغير، وبيطلع نص تون كل خمس أسئلة — «السلّم» بالودن.
    const lift = Math.round(intensity * 4);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500 + intensity * 900;
    filter.Q.value = 6;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.18;
    lfoGain.gain.value = 250;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    const pad = ctx.createGain();
    pad.gain.value = 0.05;
    pad.connect(filter).connect(out);
    const oscs: OscillatorNode[] = [lfo];
    for (const note of [-24, -21, -17, -12]) {
      for (const detune of [-7, 7]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = hz(note + lift);
        osc.detune.value = detune;
        osc.connect(pad);
        osc.start();
        oscs.push(osc);
      }
    }

    // النبض والتكّة، بجدولة قدّام بشوية (look-ahead) عشان ماتتأخرش.
    const beat = 0.62 - intensity * 0.16;
    let next = ctx.currentTime + 0.4;
    let n = 0;
    const timer = window.setInterval(() => {
      while (next < ctx.currentTime + 0.3) {
        if (n % 2 === 0) this.thump(out, next, 52 + lift * 2, 0.55);
        const ticks = this.urgent ? 4 : 2;
        for (let k = 0; k < ticks; k += 1) this.tick(out, next + (k * beat) / ticks, this.urgent ? 0.05 : 0.03);
        next += beat;
        n += 1;
      }
    }, 60);

    this.bed = {
      stop: (fade = 0.4) => {
        window.clearInterval(timer);
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), t);
        out.gain.exponentialRampToValueAtTime(0.0001, t + fade);
        for (const osc of oscs) osc.stop(t + fade + 0.05);
      },
    };
  }

  /** «إجابة نهائية؟» اتقالت: كورد متوتر بيعلى، وضربة قلب مزدوجة لحد الكشف. */
  startTension() {
    this.bed?.stop(0.3);
    this.bed = null;
    this.tension?.stop(0.1);
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.4);
    out.connect(this.musicBus);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, ctx.currentTime);
    filter.frequency.linearRampToValueAtTime(2200, ctx.currentTime + 2.5);
    const pad = ctx.createGain();
    pad.gain.value = 0.045;
    pad.connect(filter).connect(out);
    const oscs: OscillatorNode[] = [];
    // كورد مخفّض (dim) — مفيش حل، فالودن بتستنى.
    for (const note of [-21, -18, -15, -12, -9]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = hz(note);
      osc.detune.value = note % 2 ? 6 : -6;
      osc.connect(pad);
      osc.start();
      oscs.push(osc);
    }
    let next = ctx.currentTime + 0.2;
    const timer = window.setInterval(() => {
      while (next < ctx.currentTime + 0.3) {
        this.thump(out, next, 48, 0.8);
        this.thump(out, next + 0.2, 44, 0.55);
        next += 0.78;
      }
    }, 60);
    this.tension = {
      stop: (fade = 0.2) => {
        window.clearInterval(timer);
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), t);
        out.gain.exponentialRampToValueAtTime(0.0001, t + fade);
        for (const osc of oscs) osc.stop(t + fade + 0.05);
      },
    };
  }

  // ── الضربات ─────────────────────────────────────────────────────────────

  /** دخول السؤال: هوا طالع وضربة كورد. */
  intro() {
    const t = this.ctx.currentTime;
    this.sweep(t, 1.1, 300, 5000, 0.18);
    this.chord(t + 1.0, [-12, -8, -5, 0], 0.9, 'sawtooth', 0.07);
    this.thump(this.master, t + 1.0, 60, 1);
  }

  /** الإجابة اتقفلت — ضربة قصيرة قبل التوتر. */
  lock() {
    const t = this.ctx.currentTime;
    this.chord(t, [-9, -5, 0], 0.35, 'square', 0.05);
    this.thump(this.master, t, 70, 0.9);
  }

  /** صح: أربيجيو كبير طالع وبريق. `big` للأمان والمليون. */
  right(big = false) {
    this.stopAll(0.15);
    const t = this.ctx.currentTime;
    const run = big ? [3, 7, 10, 15, 19, 22, 27] : [3, 7, 10, 15];
    run.forEach((note, i) => this.tone(t + i * 0.09, hz(note), 0.35, 'sawtooth', 0.09, 2400));
    this.chord(t + run.length * 0.09, big ? [3, 7, 10, 15, 19] : [3, 7, 10, 15], big ? 2.4 : 1.3, 'sawtooth', 0.06);
    this.shimmer(t + run.length * 0.09, big ? 2 : 1);
    this.thump(this.master, t + run.length * 0.09, 65, 1);
  }

  /** غلط: نازل ومعاه بوم. */
  wrong() {
    this.stopAll(0.1);
    const t = this.ctx.currentTime;
    [0, -3, -7, -12].forEach((note, i) => this.tone(t + i * 0.22, hz(note - 5), 0.4, 'sawtooth', 0.08, 900));
    this.thump(this.master, t + 0.66, 38, 1.4);
  }

  /** مساعدة: هوا وجرس. */
  lifeline() {
    const t = this.ctx.currentTime;
    this.sweep(t, 0.5, 4000, 400, 0.12);
    this.tone(t + 0.35, hz(19), 0.8, 'sine', 0.12);
    this.tone(t + 0.45, hz(26), 0.9, 'sine', 0.08);
  }

  /** نهاية الجولة بنجاح أو انسحاب: كورد كبير بيحل. */
  finale(won: boolean) {
    this.stopAll(0.2);
    const t = this.ctx.currentTime;
    if (won) {
      [3, 7, 10, 15, 19, 22, 27, 31].forEach((note, i) => this.tone(t + i * 0.08, hz(note), 0.4, 'sawtooth', 0.08, 3000));
      this.chord(t + 0.7, [3, 10, 15, 19, 22], 3.2, 'sawtooth', 0.06);
      this.shimmer(t + 0.7, 3);
      this.thump(this.master, t + 0.7, 55, 1.2);
    } else {
      this.chord(t, [-9, -5, -2, 3], 2, 'triangle', 0.08);
    }
  }

  // ── مكوّنات ─────────────────────────────────────────────────────────────

  private tone(at: number, frequency: number, duration: number, type: OscillatorType, level: number, cutoff?: number) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    let node: AudioNode = osc;
    if (cutoff) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      node = osc.connect(filter);
    }
    node.connect(gain).connect(this.master);
    osc.start(at);
    osc.stop(at + duration + 0.05);
  }

  private chord(at: number, notes: number[], duration: number, type: OscillatorType, level: number) {
    for (const note of notes) {
      this.tone(at, hz(note), duration, type, level, 2600);
      this.tone(at, hz(note) * 1.004, duration, type, level * 0.7, 2600);
    }
  }

  /** طبلة واطية: سين بينزل بسرعة — «البوم» و«ضربة القلب». */
  private thump(out: AudioNode, at: number, frequency: number, level: number) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency * 2.2, at);
    osc.frequency.exponentialRampToValueAtTime(frequency, at + 0.12);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level * 0.5, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + 0.5);
  }

  private tick(out: AudioNode, at: number, level: number) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    src.connect(filter).connect(gain).connect(out);
    src.start(at, Math.random() * 0.5, 0.06);
  }

  private sweep(at: number, duration: number, from: number, to: number, level: number) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 3;
    filter.frequency.setValueAtTime(from, at);
    filter.frequency.exponentialRampToValueAtTime(to, at + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + duration * 0.8);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration + 0.1);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(at);
    src.stop(at + duration + 0.15);
  }

  /** بريق: نغمات عالية متفرّقة — «الترتر» بتاع الفوز. */
  private shimmer(at: number, seconds: number) {
    const count = Math.round(seconds * 10);
    for (let i = 0; i < count; i += 1) {
      this.tone(at + (i / count) * seconds, hz(24 + ((i * 7) % 12)), 0.25, 'sine', 0.03);
    }
  }

  private makeNoise(): AudioBuffer {
    const length = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}
