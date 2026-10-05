/**
 * «شركة الشحن» — Torod (Vision Soft's courier system), as plain functions.
 *
 * Everything here is pure on purpose: the payload a parcel is described with,
 * the governorate → city mapping and the area guess are the parts most likely
 * to be wrong in a way only a real shipment reveals, so they are the parts that
 * must be testable without one. `TorodClient` does the HTTP; this decides what
 * goes in it.
 *
 * ## What their documentation got wrong
 *
 * The PDF they send integrators shows two spellings of every order field
 * (`Code_sender` beside `sender_Code`, `Name_reciver` beside `reciver_Name`).
 * Their own Swagger (`/swagger/v1/swagger.json`, schema `Temp_Order_Api`) has
 * exactly one, and it is the one used below. It also lists the cities and areas
 * on a second host (`ordapi.meemexpress.com`) whose ids belong to a DIFFERENT
 * company's tree — «الدلتا», «الصعيد» — so everything here reads
 * `torodapi.torodegypt.com`, where the cities are governorates.
 */
import { bookOrderRef } from '@ayman/contracts/admin/book-orders';

export const TOROD_BASE_URL = 'https://torodapi.torodegypt.com';

/**
 * «ثابت لا يتغير» — the integration id their PDF tells every client to send.
 * Verified against the live API with this account's credentials: `8` and an
 * empty `orders` array answers `{"message":"Success"}`, wrong credentials
 * answer `302 لا يوجد عميل بهذه البيانات`.
 */
export const TOROD_INTEGRATION_ID = 8;

/**
 * The status codes their webhook sends, from the table at the end of the PDF.
 * Anything else is recorded on the order's trail and otherwise ignored.
 */
export const TOROD_STATUS = {
  /** «في الشحن مع المندوب» — the agent has the parcel. */
  withAgent: 3,
  /** «تسليم ناجح». */
  delivered: 4,
  /** «ملغي - مرتجع». */
  returned: 5,
  /** «مؤجل». */
  postponed: 6,
  /** «تسليم جزئي». */
  partial: 7,
} as const;

/**
 * Our governorate code → the Torod cities a parcel there may be filed under,
 * the default first.
 *
 * Their «cities» are mostly governorates, but not only: 6 أكتوبر, الشيخ زايد,
 * التجمع and العبور live under «مدن جديده», and Giza's villages under
 * «ضواحي الجيزه» — so a student in أكتوبر whose order says «الجيزة» has to be
 * looked for in more than one list. Names are copied byte for byte from
 * `GET /api/Client/getcities` (2026-10-05), including the leading space on
 * « بورسعيد», because `addorders` takes the NAME and nothing says it trims.
 *
 * ⚠️ شمال سيناء (34) has no entry: Torod lists no city there. The push refuses
 * it by name rather than filing the parcel somewhere it will never arrive.
 */
const TOROD_CITIES: Readonly<Record<string, readonly { id: number; name: string }[]>> = {
  '01': [
    { id: 1, name: 'القاهرة' },
    { id: 30, name: 'مدن جديده' },
    { id: 31, name: 'أطراف القاهره الجيزه' },
  ],
  '02': [{ id: 3, name: 'الاسكندرية' }],
  '03': [{ id: 20, name: ' بورسعيد' }],
  '04': [{ id: 11, name: 'السويس' }],
  '11': [{ id: 21, name: 'دمياط' }],
  '12': [{ id: 10, name: 'الدقهليه' }],
  '13': [
    { id: 12, name: 'الشرقية' },
    { id: 30, name: 'مدن جديده' },
  ],
  '14': [
    { id: 15, name: 'القليوبية' },
    { id: 1, name: 'القاهرة' },
    { id: 30, name: 'مدن جديده' },
  ],
  '15': [{ id: 24, name: 'كفر الشيخ' }],
  '16': [{ id: 13, name: 'الغربية' }],
  '17': [{ id: 16, name: 'المنوفية' }],
  '18': [{ id: 4, name: 'البحيره' }],
  '19': [{ id: 7, name: 'الاسماعيلية' }],
  '21': [
    { id: 2, name: 'الجيزة' },
    { id: 28, name: 'ضواحي الجيزه' },
    { id: 30, name: 'مدن جديده' },
    { id: 31, name: 'أطراف القاهره الجيزه' },
    { id: 29, name: 'منشأة القناطر' },
  ],
  '22': [{ id: 18, name: 'بنى سويف' }],
  '23': [{ id: 14, name: 'الفيوم' }],
  '24': [{ id: 17, name: 'المنيا' }],
  '25': [{ id: 6, name: 'اسيوط' }],
  '26': [{ id: 19, name: 'سوهاج' }],
  '27': [{ id: 23, name: 'قنا' }],
  '28': [{ id: 5, name: 'اسوان' }],
  '29': [{ id: 8, name: 'الاقصر' }],
  '31': [{ id: 9, name: 'البحر الاحمر' }],
  '32': [{ id: 27, name: 'الوادي الجديد' }],
  '33': [{ id: 25, name: 'مرسي مطروح' }],
  '35': [{ id: 26, name: 'شرم الشيخ' }],
};

export function torodCitiesFor(governorateCode: string): readonly { id: number; name: string }[] {
  return TOROD_CITIES[governorateCode] ?? [];
}

/**
 * Arabic folded to what a person means rather than how they typed it: hamzas,
 * taa marbuta, alef maqsura, tatweel and diacritics all collapse, and so does
 * everything that is not a letter or a digit. «القاهرة الجديدة» and «القاهره
 * الجديده» are one place, and so are «أسيوط» and Torod's own «أٍسيوط».
 */
export function foldArabic(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^ال(?=\S{3,})/u, '')
    .replace(/ ال(?=\S{3,})/gu, ' ');
}

/** «الدقي - المهندسين» is two places a student may have written either of. */
function areaParts(area: string): string[] {
  return area
    .split(/[-–(),/]/)
    .map(foldArabic)
    .filter((part) => part.length >= 3);
}

/**
 * How well a Torod area matches what the student wrote: 3 for the same place,
 * 2 for one of the places a compound area names, 1 for one containing the
 * other, 0 for nothing. Containment needs 3+ letters on the shorter side —
 * otherwise «نصر» finds «مدينة نصر» and so does every street with «نصر» in it.
 */
function score(area: string, written: string): number {
  const folded = foldArabic(written);
  if (folded.length < 3) return 0;
  if (foldArabic(area) === folded) return 3;
  const parts = areaParts(area);
  if (parts.includes(folded)) return 2;
  if (parts.some((part) => folded.includes(part) || part.includes(folded))) return 1;
  return 0;
}

export interface TorodPlace {
  cityName: string;
  areaName: string;
  /** False when nothing matched and `areaName` is a fallback — surfaced in
   *  the order's notes so their desk knows to read the full address. */
  matched: boolean;
}

/**
 * Where to file a parcel in Torod's tree: their city, and the area inside it.
 *
 * Their areas are a closed list and ours is free text («المدينة» on the order
 * form is typed, not picked), so this is a guess, made in the order a person
 * would make it: the city the student typed, then the street line (people
 * write «مدينة نصر» under street as often as under city), across every Torod
 * city the governorate could be filed under, the default one first.
 *
 * When nothing matches it does NOT invent a district: it uses the area named
 * after the governorate itself where Torod has one («البحيرة», «المنيا»), or
 * «مجهول» where they offer that (Cairo), or the student's own words — and
 * `full_Address` always carries the whole address regardless, so the desk can
 * route by reading it.
 */
export function placeFor(
  governorateCode: string,
  governorateNameAr: string,
  city: string,
  street: string,
  areasByCity: ReadonlyMap<number, readonly string[]>,
): TorodPlace | null {
  const cities = torodCitiesFor(governorateCode);
  if (cities.length === 0) return null;

  /*
   * ⚠️ «المدينة: الجيزة» says nothing about the district — it is the
   * governorate again. Scored anyway, it matches Torod's area «جيزة» under
   * «ضواحي الجيزه» exactly and files a Dokki parcel in the villages; «القاهرة»
   * does the same to «القاهرة الجديدة». So a field that only repeats the
   * governorate (or a Torod city name) is not evidence, and is skipped.
   */
  const noInformation = new Set([foldArabic(governorateNameAr), ...cities.map((c) => foldArabic(c.name))]);

  type Candidate = { cityName: string; areaName: string; score: number };
  let best = null as Candidate | null;
  for (const written of [city, street]) {
    if (noInformation.has(foldArabic(written))) continue;
    for (const torodCity of cities) {
      for (const area of areasByCity.get(torodCity.id) ?? []) {
        const s = score(area, written);
        // Strictly greater: on a tie the earlier city — the default — wins.
        if (s > 0 && (best === null || s > best.score)) {
          best = { cityName: torodCity.name, areaName: area, score: s };
        }
      }
    }
    // The city field is the better witness; only fall through to the street
    // line when it found nothing at all.
    if (best !== null) break;
  }
  if (best !== null) return { cityName: best.cityName, areaName: best.areaName, matched: true };

  const home = cities[0]!;
  const homeAreas = areasByCity.get(home.id) ?? [];
  const governorate = foldArabic(governorateNameAr);
  const named =
    homeAreas.find((area) => foldArabic(area) === governorate) ??
    homeAreas.find((area) => foldArabic(area) === foldArabic(home.name)) ??
    homeAreas.find((area) => area.trim() === 'مجهول');
  return { cityName: home.name, areaName: named ?? city.trim(), matched: false };
}

/** One order line as the courier sees it — `Temp_Order_Api` in their Swagger. */
export interface TorodOrder {
  sender_Code: string;
  sender_UID: string;
  reciver_Name: string;
  reciver_Phone: string;
  full_Address: string;
  city_Name: string;
  area_Name: string;
  notes: string;
  order_Content: string;
  order_Quantity: number;
  is_Order_Exchange: boolean;
  open_Shippment: boolean;
  order_Amt: number;
}

export interface CourierOrderInput {
  id: string;
  fullName: string;
  phone: string;
  altPhone: string;
  governorateNameAr: string;
  city: string;
  addressStreet: string;
  addressBuilding: string | null;
  addressNote: string | null;
  items: readonly { titleAr: string; quantity: number }[];
}

/**
 * The parcel, described the way their `addorders` wants it.
 *
 * `sender_UID` is our order id — the key their webhook echoes back and the only
 * thing it is matched on — and `sender_Code` the short `BK-` reference the desk
 * writes on the box, so a call from their office can be answered from either.
 *
 * `order_Amt` is 0: every order here was paid before it reached this point
 * (Vodafone Cash / InstaPay, or given away), and anything else would have the
 * agent collect the price a second time at the door.
 *
 * `open_Shippment` is true — «السماح بفتح الشحنة». It is a book; letting the
 * student check it is the right copy before signing costs nothing and saves a
 * return trip.
 */
export function torodOrderFor(order: CourierOrderInput, place: TorodPlace): TorodOrder {
  const ref = bookOrderRef(order.id);
  const address = [
    order.governorateNameAr,
    order.city,
    order.addressStreet,
    order.addressBuilding ? `عمارة ${order.addressBuilding}` : null,
    order.addressNote,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' - ');

  const notes = [
    ref,
    order.altPhone && order.altPhone !== order.phone ? `رقم تاني: ${order.altPhone}` : null,
    place.matched ? null : 'المنطقة مش متحددة — من فضلكم اقروا العنوان كامل',
  ]
    .filter((part): part is string => part !== null)
    .join(' | ');

  const content = order.items
    .map((item) => (item.quantity > 1 ? `${item.titleAr} × ${item.quantity}` : item.titleAr))
    .join('، ');

  return {
    sender_Code: ref,
    sender_UID: order.id,
    reciver_Name: order.fullName.trim(),
    // «يجب ان لا يحتوي علي فواصل او +» — digits only.
    reciver_Phone: order.phone.replace(/\D/g, ''),
    full_Address: address,
    city_Name: place.cityName,
    area_Name: place.areaName,
    notes,
    order_Content: content || 'كتاب',
    order_Quantity: Math.max(
      1,
      order.items.reduce((sum, item) => sum + item.quantity, 0),
    ),
    is_Order_Exchange: false,
    open_Shippment: true,
    order_Amt: 0,
  };
}

/**
 * Whether `addorders` accepted the batch, and in what words if it did not.
 *
 * Their success body is `{"result": …, "message": "Success"}` (seen with an
 * empty batch); a refusal is `{"code": 302, "message": "لا يوجد عميل بهذه
 * البيانات"}` with HTTP 400. What `result` holds for a real order is not
 * documented anywhere, so this does not depend on it: HTTP 2xx, no `code` of
 * 300+, and a message that is not an error is acceptance, and the refusal text
 * is passed through verbatim because it is the only diagnosis there is.
 */
export function readAddOrdersResponse(httpStatus: number, body: unknown): { ok: true } | { ok: false; error: string } {
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const message = typeof record.message === 'string' ? record.message.trim() : '';
  const code = typeof record.code === 'number' ? record.code : null;
  if (httpStatus >= 200 && httpStatus < 300 && (code === null || code < 300)) return { ok: true };
  return {
    ok: false,
    error: message || `شركة الشحن ردت بـ${httpStatus}`,
  };
}
