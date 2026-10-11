import {
  foldArabic,
  localEgyptianPhone,
  placeFor,
  readAddOrdersResponse,
  torodCitiesFor,
  torodOrderFor,
} from './torod';

/* A slice of Torod's live lists (GET /api/Client/getareas, 2026-10-05). */
const AREAS = new Map<number, string[]>([
  [1, ['العباسية', 'مدينة نصر', 'القاهرة الجديدة', 'مصر الجديده', 'مجهول', 'شبرا الخيمة']],
  [2, ['الدقي  - المهندسين', 'فيصل', 'الهرم', 'قسم الجيزة']],
  [28, ['جيزة', 'الحوامديه', 'البدرشين - العياط']],
  [30, ['التجمع الخامس', 'السادس من اكتوبر', 'الشيخ زايد', 'العبور']],
  [31, ['اوسيم', 'كرداسة']],
  [29, ['منشاه القناطر']],
  [4, ['ابو المطامير', 'البحيرة', 'دمنهور']],
  [15, ['بنها', 'قليوب', 'قليوبية']],
]);

describe('foldArabic', () => {
  it('folds the spellings one place is written in', () => {
    expect(foldArabic('القاهرة الجديدة')).toBe(foldArabic('القاهره الجديده'));
    expect(foldArabic('أسيوط')).toBe(foldArabic('اسيوط'));
    expect(foldArabic('بني سويف')).toBe(foldArabic('بنى سويف'));
  });
});

describe('placeFor', () => {
  it('finds the district the student typed in the governorate city', () => {
    expect(placeFor('01', 'القاهرة', 'مدينه نصر', 'شارع عباس العقاد', AREAS)).toEqual({
      cityName: 'القاهرة',
      areaName: 'مدينة نصر',
      matched: true,
    });
  });

  it('looks beyond the governorate city — أكتوبر lives under «مدن جديده»', () => {
    expect(placeFor('21', 'الجيزة', '6 اكتوبر - السادس من أكتوبر', 'الحي الثاني', AREAS)).toMatchObject({
      cityName: 'مدن جديده',
      areaName: 'السادس من اكتوبر',
    });
  });

  it('matches one half of a compound area', () => {
    expect(placeFor('21', 'الجيزة', 'المهندسين', 'شارع جامعة الدول', AREAS)).toMatchObject({
      cityName: 'الجيزة',
      areaName: 'الدقي  - المهندسين',
    });
  });

  it('does not read «الجيزة» in the city field as the village «جيزة»', () => {
    // The city field only repeats the governorate; the street names the place.
    expect(placeFor('21', 'الجيزة', 'الجيزة', 'فيصل - الطالبية', AREAS)).toMatchObject({
      cityName: 'الجيزة',
      areaName: 'فيصل',
    });
  });

  it('does not read «القاهرة» as «القاهرة الجديدة»', () => {
    expect(placeFor('01', 'القاهرة', 'القاهرة', 'ش ١٢', AREAS)).toEqual({
      cityName: 'القاهرة',
      areaName: 'مجهول',
      matched: false,
    });
  });

  it('falls back to the area named after the governorate', () => {
    expect(placeFor('18', 'البحيرة', 'قرية مش في الليستة', 'ش ١', AREAS)).toEqual({
      cityName: 'البحيره',
      areaName: 'البحيرة',
      matched: false,
    });
  });

  it("keeps the student's own words when Torod has nothing better", () => {
    expect(placeFor('02', 'الإسكندرية', 'سيدي بشر', 'ش ١', new Map())).toEqual({
      cityName: 'الاسكندرية',
      areaName: 'سيدي بشر',
      matched: false,
    });
  });

  it('refuses a governorate Torod does not serve', () => {
    expect(torodCitiesFor('34')).toEqual([]);
    expect(placeFor('34', 'شمال سيناء', 'العريش', 'ش ١', AREAS)).toBeNull();
  });
});

describe('torodOrderFor', () => {
  const order = {
    id: '0199a0b1-2c3d-7e4f-8a9b-0c1d2e3f4a5b',
    fullName: ' منى أحمد ',
    phone: '01012345678',
    altPhone: '01112345678',
    governorateNameAr: 'القاهرة',
    city: 'مدينة نصر',
    addressStreet: 'ش عباس العقاد',
    addressBuilding: '86',
    addressNote: 'الدور التالت',
    items: [
      { titleAr: 'كتاب البرمجة', quantity: 2 },
      { titleAr: 'كتاب المراجعة', quantity: 1 },
    ],
  };

  it('describes the parcel with the field names their Swagger declares', () => {
    const payload = torodOrderFor(order, { cityName: 'القاهرة', areaName: 'مدينة نصر', matched: true });
    expect(payload).toEqual({
      sender_Code: 'BK-3F4A5B',
      sender_UID: order.id,
      reciver_Name: 'منى أحمد',
      reciver_Phone: '01012345678',
      full_Address: 'القاهرة - مدينة نصر - ش عباس العقاد - عمارة 86 - الدور التالت',
      city_Name: 'القاهرة',
      area_Name: 'مدينة نصر',
      notes: 'BK-3F4A5B | رقم تاني: 01112345678',
      order_Content: 'كتاب البرمجة × 2، كتاب المراجعة',
      order_Quantity: 3,
      is_Order_Exchange: false,
      open_Shippment: true,
      // Paid already — the agent must not collect it again.
      order_Amt: 0,
    });
  });

  it('tells their desk to read the address when the area was a guess', () => {
    const payload = torodOrderFor(
      { ...order, altPhone: order.phone },
      { cityName: 'القاهرة', areaName: 'مجهول', matched: false },
    );
    expect(payload.notes).toBe('BK-3F4A5B | المنطقة مش متحددة — من فضلكم اقروا العنوان كامل');
  });
});

describe('localEgyptianPhone', () => {
  it('turns the stored E.164 form into the 11 digits their system keeps', () => {
    // BK-051C1C went out as «201225796476» and their panel showed «2012257964».
    expect(localEgyptianPhone('+201225796476')).toBe('01225796476');
    expect(localEgyptianPhone('00201225796476')).toBe('01225796476');
    expect(localEgyptianPhone('01225796476')).toBe('01225796476');
  });

  it('sends stored orders with the local number', () => {
    const payload = torodOrderFor(
      {
        id: '0199a0b1-2c3d-7e4f-8a9b-0c1d2e3f4a5b',
        fullName: 'منى',
        phone: '+201012345678',
        altPhone: '+201112345678',
        governorateNameAr: 'القاهرة',
        city: 'مدينة نصر',
        addressStreet: 'ش ١',
        addressBuilding: null,
        addressNote: null,
        items: [{ titleAr: 'كتاب', quantity: 1 }],
      },
      { cityName: 'القاهرة', areaName: 'مدينة نصر', matched: true },
    );
    expect(payload.reciver_Phone).toBe('01012345678');
    expect(payload.notes).toContain('رقم تاني: 01112345678');
  });
});

describe('readAddOrdersResponse', () => {
  it('accepts their success body', () => {
    expect(readAddOrdersResponse(200, { result: null, message: 'Success' })).toEqual({ ok: true });
  });

  it('passes their refusal through verbatim', () => {
    expect(readAddOrdersResponse(400, { code: 302, message: 'لا يوجد عميل بهذه البيانات' })).toEqual({
      ok: false,
      error: 'لا يوجد عميل بهذه البيانات',
    });
  });

  it('treats an error code inside a 200 as a refusal', () => {
    expect(readAddOrdersResponse(200, { code: 400, message: 'المنطقة غير موجودة' })).toEqual({
      ok: false,
      error: 'المنطقة غير موجودة',
    });
  });
});
