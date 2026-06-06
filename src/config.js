/* ============================================================
   Static configuration & domain constants.

   The set of sections/topics is per-user (each user studies for a
   different exam). `SECTIONS` / `SECTION_KEYS` are live bindings
   that point at the active user's profile; call setActiveProfile()
   once at startup (before anything renders) to select it.
   ============================================================ */

export const APP_BUILD = "2026-05-31-pi-storage-profiles";

/* ---------------------------------------------------------------
   PROFILES — one per exam type. A user picks one at signup; the
   chosen profileId is stored on their account on the server.
   --------------------------------------------------------------- */

/** KPSS Lisans — Genel Yetenek / Genel Kültür. */
const KPSS_LISANS_SECTIONS = {
  turkce:      { label: "Türkçe",      topics: ["Sözcükte Anlam", "Cümlede Anlam", "Deyim-Atasözü", "Ses Bilgisi", "Yazım Kuralları", "Noktalama", "Cümle Bilgisi", "Paragraf"] },
  matematik:   { label: "Matematik",   topics: ["Temel Kavramlar", "Sayı Basamakları", "Bölme-Bölünebilme", "OBEB-OKEK", "Kesirler", "Ondalık Sayılar", "Yüzdeler", "Oran-Orantı", "Problemler", "Kümeler", "Permütasyon-Kombinasyon", "Üçgenler", "Açılar", "Çokgenler ve Dörtgenler", "Çember ve Daire", "Katı Cisimler", "Analitik Geometri"] },
  tarih:       { label: "Tarih",       topics: ["Tarih Bilimine Giriş", "İlk Uygarlıklar", "İlk Türk Devletleri", "İslamiyet ve Türkler", "Selçuklular", "Osmanlı Kuruluş", "Osmanlı Yükselme", "Osmanlı Duraklama-Gerileme", "Osmanlı Dağılma", "Kurtuluş Savaşı", "Atatürk İlkeleri", "Türkiye Cumhuriyeti Tarihi"] },
  cografya:    { label: "Coğrafya",    topics: ["Harita Bilgisi", "İklimler", "Türkiye'nin Yüzey Şekilleri", "Türkiye İklimi", "Nüfus", "Yerleşme", "Tarım", "Sanayi", "Ulaşım", "Çevre Sorunları", "Dünya Coğrafyası"] },
  vatandaslik: { label: "Vatandaşlık", topics: ["Hukuka Giriş", "Anayasa", "Temel Haklar", "Yasama", "Yürütme", "Yargı", "Yerel Yönetimler", "Ekonomi Temelleri", "Gelir Dağılımı", "Türkiye Ekonomisi"] }
};

/** AGS (Akademi Giriş Sınavı) + ÖABT Okul Öncesi Öğretmenliği.
    Konu dağılımı ÖSYM/MEB resmî AGS müfredatına göredir (80 soru):
    Sözel 15, Sayısal 15, Tarih 6, Coğrafya 6, Eğitim Bilimleri 30, Mevzuat 8.
    Not: AGS Sayısal Yetenek'te geometri YOKTUR. */
const AGS_OKUL_ONCESI_SECTIONS = {
  sozel:           { label: "Sözel Yetenek",        topics: ["Sözcükte Anlam", "Cümlede Anlam", "Anlatımın Oluşması", "Paragrafta Anlam", "Sözel Mantık"] },
  sayisal:         { label: "Sayısal Yetenek",      topics: ["Temel Kavramlar", "Sayılar ve Sayı Basamakları", "Bölme ve Bölünebilme", "Asal Sayılar - Faktöriyel", "OBEB - OKEK", "Rasyonel ve Ondalık Sayılar", "Üslü Sayılar", "Köklü Sayılar", "Çarpanlara Ayırma", "Denklem ve Eşitsizlikler", "Mutlak Değer", "Fonksiyonlar", "Oran - Orantı", "Yüzde - Kâr/Zarar - Faiz", "Sayı ve Kesir Problemleri", "Yaş Problemleri", "Hareket (Hız) Problemleri", "İşçi - Havuz Problemleri", "Karışım Problemleri", "Grafik ve Tablo Yorumlama", "Mantıksal Muhakeme Problemleri"] },
  tarih:           { label: "Tarih",                topics: ["Osmanlı Öncesi Türk Devletleri", "Osmanlı Tarihi", "Atatürk İlkeleri ve İnkılap Tarihi", "Çağdaş Türk ve Dünya Tarihi"] },
  cografya:        { label: "Türkiye Coğrafyası",   topics: ["Türkiye Fiziki Coğrafyası", "Türkiye Beşeri ve Ekonomik Coğrafyası"] },
  egitimBilimleri: { label: "Eğitim Bilimleri ve Türk Millî Eğitim Sistemi", topics: ["Eğitimin Temelleri", "Öğretim Yöntem ve Teknikleri", "Sınıf Yönetimi", "Program Okuryazarlığı", "Eğitimde Ölçme ve Değerlendirme", "Öğrenme Psikolojisi", "Gelişim Psikolojisi", "Rehberlik", "Eğitim ve Öğretim Teknolojileri", "Türk Millî Eğitim Sisteminin Genel Yapısı", "Türkiye Yüzyılı Maarif Modeli"] },
  mevzuat:         { label: "Mevzuat",              topics: ["Hukukun Temel Kavramları", "Türkiye Cumhuriyeti Anayasası", "1739 sayılı Millî Eğitim Temel Kanunu", "222 sayılı İlköğretim ve Eğitim Kanunu", "7528 sayılı Öğretmenlik Mesleği Kanunu"] },
  alanBilgisi:     { label: "Okul Öncesi · Alan Bilgisi", topics: ["Erken Çocukluk Eğitimine Giriş", "Çocuk Sağlığı ve İlk Yardım", "Erken Çocukluk Döneminde Gelişim", "Çocuk Ruh Sağlığı", "Erken Çocukluk Dönemi Edebiyatı", "Erken Çocuklukta Program, Yöntem ve Yaklaşımlar", "Anne-Baba Eğitimi", "Çocuk Hakları"] },
  alanEgitimi:     { label: "Okul Öncesi · Alan Eğitimi", topics: ["Erken Çocuklukta Fen Eğitimi", "Erken Çocuklukta Matematik Eğitimi", "Erken Çocuklukta Güzel Sanatlar Eğitimi", "Erken Çocuklukta Müzik Eğitimi", "Erken Çocuklukta Oyun", "Erken Çocuklukta Drama", "Öğrenme Yaklaşımları", "Okula Uyum ve Erken Okuryazarlık"] }
};

/* Booklets = separate question-numbering spaces in one sitting. Each booklet
   restarts numbering at 1, so a wrong number like "7" is ambiguous across
   booklets. Photo import is scoped to one booklet at a time to disambiguate
   (and to send only that booklet's taxonomy to the AI). */
const KPSS_LISANS_BOOKLETS = [
  { key: "gy", label: "Genel Yetenek (GY)", sections: ["turkce", "matematik"] },
  { key: "gk", label: "Genel Kültür (GK)", sections: ["tarih", "cografya", "vatandaslik"] }
];

// AGS sitting: AGS booklet (80 soru) and ÖABT alan booklet (50 soru) are
// numbered independently, so they form two booklets.
const AGS_OKUL_ONCESI_BOOKLETS = [
  { key: "ags", label: "AGS Oturumu (Genel)", sections: ["sozel", "sayisal", "tarih", "cografya", "egitimBilimleri", "mevzuat"] },
  { key: "oabt", label: "ÖABT · Alan Oturumu", sections: ["alanBilgisi", "alanEgitimi"] }
];

export const PROFILES = {
  kpssLisans:    { id: "kpssLisans",    examName: "KPSS Lisans (GY-GK)",              sections: KPSS_LISANS_SECTIONS,     booklets: KPSS_LISANS_BOOKLETS },
  agsOkulOncesi: { id: "agsOkulOncesi", examName: "AGS · Okul Öncesi Öğretmenliği",   sections: AGS_OKUL_ONCESI_SECTIONS, booklets: AGS_OKUL_ONCESI_BOOKLETS }
};

export const DEFAULT_PROFILE = "kpssLisans";

/** List for the signup exam-profile picker. */
export const PROFILE_OPTIONS = Object.values(PROFILES).map((p) => ({
  id: p.id,
  examName: p.examName
}));

/* ---------------------------------------------------------------
   ACTIVE PROFILE — live bindings consumed across the app.
   --------------------------------------------------------------- */

export let ACTIVE_PROFILE = PROFILES[DEFAULT_PROFILE];
export let SECTIONS = ACTIVE_PROFILE.sections;
export let SECTION_KEYS = Object.keys(SECTIONS);
export let BOOKLETS = bookletsFor(ACTIVE_PROFILE);

/** Booklets for a profile, falling back to a single implicit booklet that
    spans every section (so profiles without a split still work). */
function bookletsFor(profile) {
  const sectionKeys = Object.keys(profile.sections);
  if (Array.isArray(profile.booklets) && profile.booklets.length) {
    return profile.booklets.map((b) => ({
      key: b.key,
      label: b.label,
      sections: b.sections.filter((k) => sectionKeys.includes(k))
    }));
  }
  return [{ key: "all", label: "Tüm sorular", sections: sectionKeys }];
}

/** Point the app's section config at a given user's profile. */
export function setActiveProfile(profileId) {
  ACTIVE_PROFILE = PROFILES[profileId] || PROFILES[DEFAULT_PROFILE];
  SECTIONS = ACTIVE_PROFILE.sections;
  SECTION_KEYS = Object.keys(SECTIONS);
  BOOKLETS = bookletsFor(ACTIVE_PROFILE);
  return ACTIVE_PROFILE;
}

export const REASON_META = [
  { id: "Bilgi eksiği", abbr: "BE", key: "1" },
  { id: "Dikkatsizlik", abbr: "DK", key: "2" },
  { id: "Süre yetmedi", abbr: "SY", key: "3" },
  { id: "Soruyu yanlış anladım", abbr: "YA", key: "4" }
];

export const REVIEW_INTERVALS = [1, 3, 7, 14, 30]; // gün

/* ---------------------------------------------------------------
   NAVIGATION — single source of truth for the sidebar. Order here
   is the order shown. `group` clusters items under a heading; null
   means the item sits in the bottom (footer-adjacent) area. `ic` is
   the small monogram shown in the icon slot. `badge` is the id of a
   live counter span rendered inside the button.

   Wrong-question classification is the core feature, so the deneme
   pages lead; progress/tracking follows.
   --------------------------------------------------------------- */
export const NAV_ITEMS = [
  { page: "deneme",  label: "Genel Denemeler", ic: "GD", group: "Yanlış Analizi" },
  { page: "alan",    label: "Alan Denemeleri", ic: "AD", group: "Yanlış Analizi" },
  { page: "konu",    label: "Konu Testleri",   ic: "KT", group: "Yanlış Analizi" },
  { page: "analiz",  label: "Analiz",          ic: "AN", group: "İlerleme" },
  { page: "tekrar",  label: "Tekrar",          ic: "TK", group: "İlerleme", badge: "revBadge" },
  { page: "ayarlar", label: "Ayarlar",         ic: "AY", group: null }
];

/** Page keys, derived from NAV_ITEMS so order/membership stays in one place. */
export const PAGES = NAV_ITEMS.map((i) => i.page);

/** Landing page when none is requested via the URL hash. */
export const DEFAULT_PAGE = "deneme";

/** Penalty applied to a net score per wrong answer (KPSS: 4 wrong cancel 1 correct). */
export const WRONG_PENALTY = 0.25;
