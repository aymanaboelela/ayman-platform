/*
 * k6 load test: N students signed in at once, doing what students do.
 *
 *   k6 run -e PROFILE=smoke scripts/load/student-journey.js
 *   k6 run -e PROFILE=1000  scripts/load/student-journey.js
 *
 * ⚠️ Never point this at a live stack (CLAUDE.md §5): the three tenants share
 * one 4-core VPS, and Hostinger's automatic CPU cap after a spike takes all of
 * them down for days. Run it against a local production build on a throwaway
 * database with `loadtest-NNNN@load.test` accounts (see README.md here).
 *
 * Each VU is one student with its own `cf-connecting-ip`, so the per-IP and
 * per-session throttlers see 1000 different people — which is what Cloudflare
 * hands the origin in production. From one IP without that header, every
 * number below would be the rate limiter, not the app.
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const WEB = __ENV.WEB || 'http://127.0.0.1:3250';
const API = __ENV.API || 'http://localhost:3350';
const APP_ORIGIN = __ENV.APP_ORIGIN || 'http://localhost:3250';
const PASSWORD = __ENV.PASSWORD || 'correct-horse-battery-staple-1';
const COURSE = __ENV.COURSE || 'dx-cs-python';
const LESSONS = (
  __ENV.LESSONS ||
  '019fe002-0000-7000-8000-000000000301,019fe002-0000-7000-8000-000000000302,019fe002-0000-7000-8000-000000000303,019fe002-0000-7000-8000-000000000304,019fe002-0000-7000-8000-000000000305'
).split(',');

const PROFILES = {
  smoke: [
    { duration: '30s', target: 20 },
    { duration: '30s', target: 20 },
  ],
  // Ramp to 1000 concurrent students, hold, ramp down.
  1000: [
    { duration: '2m', target: 250 },
    { duration: '2m', target: 1000 },
    { duration: '5m', target: 1000 },
    { duration: '1m', target: 0 },
  ],
  // Exam-start shape: everyone arrives inside one minute.
  spike: [
    { duration: '1m', target: 1000 },
    { duration: '3m', target: 1000 },
    { duration: '30s', target: 0 },
  ],
  // Keep climbing until it breaks.
  breakpoint: [{ duration: '10m', target: 3000 }],
};

export const options = {
  scenarios: {
    students: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: PROFILES[__ENV.PROFILE || 'smoke'],
      gracefulRampDown: '20s',
    },
  },
  thresholds: {
    // A test that has already proven the stack is down stops hammering it.
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '1m' }],
    'http_req_duration{kind:page}': ['p(95)<3000'],
    'http_req_duration{kind:api}': ['p(95)<1000'],
    'http_req_duration{kind:login}': ['p(95)<3000'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  discardResponseBodies: true,
};

const throttled = new Counter('throttled_429');
const serverErrors = new Counter('server_5xx');
const loginTime = new Trend('login_duration', true);

// One IP per VU, inside 10.0.0.0/8 so it never collides with a real address.
function ipFor(vu) {
  return `10.${(vu >> 16) & 255}.${(vu >> 8) & 255}.${vu & 255}`;
}

let cookie = null;

function headers(extra) {
  const h = { 'cf-connecting-ip': ipFor(__VU), 'user-agent': 'k6-load (student-journey)' };
  if (cookie) h.cookie = cookie;
  return Object.assign(h, extra || {});
}

function tally(res) {
  if (res.status === 429) throttled.add(1);
  if (res.status >= 500) serverErrors.add(1);
  return res;
}

function page(path, name) {
  const res = tally(http.get(`${WEB}${path}`, { headers: headers(), tags: { kind: 'page', name } }));
  check(res, { [`${name} 200`]: (r) => r.status === 200 });
  return res;
}

function api(method, path, name, body) {
  const params = {
    headers: headers(
      method === 'GET'
        ? {}
        : { 'content-type': 'application/json', origin: APP_ORIGIN, 'x-csrf-token': '1' },
    ),
    tags: { kind: 'api', name },
  };
  const res = tally(
    method === 'GET'
      ? http.get(`${API}${path}`, params)
      : http.request(method, `${API}${path}`, body ? JSON.stringify(body) : '{}', params),
  );
  check(res, { [`${name} 2xx`]: (r) => r.status >= 200 && r.status < 300 });
  return res;
}

function signIn() {
  const email = `loadtest-${String(((__VU - 1) % 1000) + 1).padStart(4, '0')}@load.test`;
  const res = tally(
    http.post(`${API}/api/auth/sign-in/email`, JSON.stringify({ email, password: PASSWORD }), {
      headers: headers({ 'content-type': 'application/json', origin: APP_ORIGIN }),
      tags: { kind: 'login', name: 'sign-in' },
      responseType: 'none',
    }),
  );
  loginTime.add(res.timings.duration);
  // __Host- cookies are Secure, and k6's jar will not replay a Secure cookie
  // over plain http — so carry it by hand.
  const set = res.headers['Set-Cookie'] || '';
  const match = /(__Host-session_token|session_token)=[^;]+/.exec(set);
  check(res, { 'sign-in 200 + cookie': (r) => r.status === 200 && !!match });
  cookie = match ? match[0] : null;
}

function think(min, max) {
  sleep(min + Math.random() * (max - min));
}

export default function () {
  if (!cookie) {
    group('arrive', () => {
      page('/', 'landing');
      think(1, 4);
      signIn();
    });
    if (!cookie) {
      think(5, 10);
      return;
    }
    page('/dashboard', 'dashboard');
    api('GET', '/api/profile/me', 'profile');
    api('GET', '/api/me/notifications/unread-count', 'unread');
    think(2, 6);
  }

  const lesson = LESSONS[Math.floor(Math.random() * LESSONS.length)];
  const roll = Math.random();

  if (roll < 0.55) {
    // Watching a lesson: open the page, then heartbeat every ~15 s for a while.
    group('watch', () => {
      page(`/courses/${COURSE}/lessons/${lesson}`, 'lesson-page');
      api('GET', `/api/lessons/${lesson}/player`, 'player');
      api('POST', `/api/lessons/${lesson}/open`, 'open');
      let position = Math.floor(Math.random() * 600);
      for (let i = 0; i < 4; i++) {
        think(13, 17);
        position += 15;
        api('POST', `/api/lessons/${lesson}/heartbeat`, 'heartbeat', { position, delta: 15 });
      }
    });
  } else if (roll < 0.75) {
    group('browse', () => {
      page(`/courses/${COURSE}`, 'course-page');
      api('GET', `/api/courses/${COURSE}/outline`, 'outline');
      think(3, 8);
      page('/library', 'library');
    });
  } else if (roll < 0.9) {
    group('home', () => {
      page('/dashboard', 'dashboard');
      api('GET', '/api/me/dashboard', 'me-dashboard');
      api('GET', '/api/me/notifications/unread-count', 'unread');
    });
  } else {
    group('public', () => {
      page('/courses', 'catalog-page');
      api('GET', '/api/catalog/courses', 'catalog');
    });
  }
  think(3, 10);
}
