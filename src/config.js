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

/** AGS (Akademi Giriş Sınavı) + ÖABT Okul Öncesi Öğretmenliği. */
const AGS_OKUL_ONCESI_SECTIONS = {
  sozel:           { label: "Sözel Yetenek",        topics: ["Sözcükte Anlam", "Cümlede Anlam", "Anlatımın Oluşması", "Paragrafta Anlam", "Sözel Mantık"] },
  sayisal:         { label: "Sayısal Yetenek",      topics: ["Temel Matematik", "Grafik ve Tablo Yorumlama", "Mantıksal Muhakeme Problemleri"] },
  tarih:           { label: "Tarih",                topics: ["Osmanlı Öncesi Türk Devletleri", "Osmanlı Tarihi", "Atatürk İlkeleri ve İnkılap Tarihi", "Çağdaş Türk ve Dünya Tarihi"] },
  cografya:        { label: "Türkiye Coğrafyası",   topics: ["Türkiye Fiziki Coğrafyası", "Türkiye Beşeri ve Ekonomik Coğrafyası"] },
  egitimBilimleri: { label: "Eğitim Bilimleri",     topics: ["Eğitimin Temelleri", "Öğretim Yöntem ve Teknikleri", "Sınıf Yönetimi", "Program Okuryazarlığı", "Ölçme ve Değerlendirme", "Öğrenme Psikolojisi", "Gelişim Psikolojisi", "Rehberlik", "Eğitim ve Öğretim Teknolojileri", "Türk Millî Eğitim Sistemi", "Türkiye Yüzyılı Maarif Modeli"] },
  mevzuat:         { label: "Mevzuat",              topics: ["Anayasa ve İnsan Hakları", "1739 Millî Eğitim Temel Kanunu", "222 İlköğretim ve Eğitim Kanunu", "7528 Öğretmenlik Mesleği Kanunu"] },
  alanBilgisi:     { label: "Okul Öncesi · Alan Bilgisi", topics: ["Erken Çocukluk Eğitimine Giriş", "Çocuk Sağlığı ve İlk Yardım", "Erken Çocukluk Döneminde Gelişim", "Çocuk Ruh Sağlığı", "Erken Çocukluk Dönemi Edebiyatı", "Erken Çocuklukta Program, Yöntem ve Yaklaşımlar", "Anne-Baba Eğitimi", "Çocuk Hakları"] },
  alanEgitimi:     { label: "Okul Öncesi · Alan Eğitimi", topics: ["Erken Çocuklukta Fen Eğitimi", "Erken Çocuklukta Matematik Eğitimi", "Erken Çocuklukta Güzel Sanatlar Eğitimi", "Erken Çocuklukta Müzik Eğitimi", "Erken Çocuklukta Oyun", "Erken Çocuklukta Drama", "Öğrenme Yaklaşımları", "Okula Uyum ve Erken Okuryazarlık"] }
};

export const PROFILES = {
  kpssLisans:    { id: "kpssLisans",    examName: "KPSS Lisans (GY-GK)",              sections: KPSS_LISANS_SECTIONS },
  agsOkulOncesi: { id: "agsOkulOncesi", examName: "AGS · Okul Öncesi Öğretmenliği",   sections: AGS_OKUL_ONCESI_SECTIONS }
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

/** Point the app's section config at a given user's profile. */
export function setActiveProfile(profileId) {
  ACTIVE_PROFILE = PROFILES[profileId] || PROFILES[DEFAULT_PROFILE];
  SECTIONS = ACTIVE_PROFILE.sections;
  SECTION_KEYS = Object.keys(SECTIONS);
  return ACTIVE_PROFILE;
}

export const REASON_META = [
  { id: "Bilgi eksiği", abbr: "BE", key: "1" },
  { id: "Dikkatsizlik", abbr: "DK", key: "2" },
  { id: "Süre yetmedi", abbr: "SY", key: "3" },
  { id: "Soruyu yanlış anladım", abbr: "YA", key: "4" }
];

export const REVIEW_INTERVALS = [1, 3, 7, 14, 30]; // gün

export const PAGES = ["konu", "deneme", "alan", "analiz", "tekrar", "ayarlar"];

/** Penalty applied to a net score per wrong answer (KPSS: 4 wrong cancel 1 correct). */
export const WRONG_PENALTY = 0.25;
