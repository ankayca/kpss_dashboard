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

/** AGS (Akademi Giriş Sınavı) — tüm branşlar için ORTAK genel oturum (80 soru).
    2026 resmî AGS müfredatına göredir. Bu altı ders her ÖABT branşında aynıdır;
    branşa özel kısım yalnızca ÖABT alan dersleridir. */
const AGS_COMMON_SECTIONS = {
  sozel:           { label: "Sözel Yetenek",        topics: ["Sözcükte Anlam", "Cümlede Anlam", "Paragrafta Anlam", "Sözel Mantık"] },
  sayisal:         { label: "Sayısal Yetenek",      topics: ["Temel Matematik", "Grafik ve Tablo Yorumlama", "Mantıksal Muhakeme Problemleri"] },
  tarih:           { label: "Tarih",                topics: ["Osmanlı Öncesi Türk Devletleri", "Osmanlı Tarihi", "Atatürk İlkeleri ve İnkılap Tarihi", "Çağdaş Türk ve Dünya Tarihi"] },
  cografya:        { label: "Türkiye Coğrafyası",   topics: ["Türkiye Fiziki Coğrafyası", "Türkiye Beşerî ve Ekonomik Coğrafyası"] },
  egitimBilimleri: { label: "Eğitim Bilimleri ve Türk Millî Eğitim Sistemi", topics: ["Eğitim Biliminin Temel Kavramları", "Öğretim Süreçleri", "Ölçme ve Değerlendirme", "Gelişim Psikolojisi ve Öğrenme Psikolojisi", "Eğitim ve Öğretim Teknolojileri", "Türk Millî Eğitim Sistemi", "Türkiye Yüzyılı Maarif Modeli", "Eğitim ve Öğretimde Etik"] },
  mevzuat:         { label: "Mevzuat",              topics: ["T.C. Anayasası", "İnsan Hakları", "1739 Sayılı Millî Eğitim Temel Kanunu", "222 Sayılı İlköğretim ve Eğitim Kanunu", "7528 Sayılı Öğretmenlik Mesleği Kanunu"] }
};

const AGS_COMMON_KEYS = Object.keys(AGS_COMMON_SECTIONS);

/** Branşa özel ÖABT alan dersleri (50 soru). Her branş bir Alan Bilgisi ve bir
    Alan Eğitimi dersine indirgenir; alt başlıklar konu olarak listelenir. */
const OABT_BRANCHES = {
  agsOkulOncesi: {
    branchName: "Okul Öncesi",
    alanBilgisi: ["Erken Çocukluk Eğitimine Giriş", "Çocuk Sağlığı ve İlk Yardım", "Erken Çocukluk Döneminde Gelişim", "Çocuk Ruh Sağlığı", "Erken Çocukluk Dönemi Edebiyatı", "Erken Çocuklukta Program, Yöntem ve Yaklaşımlar", "Anne-Baba Eğitimi", "Çocuk Hakları"],
    alanEgitimi: ["Fen Eğitimi", "Matematik Eğitimi", "Güzel Sanatlar Eğitimi", "Müzik Eğitimi", "Oyun", "Drama", "Öğrenme Yaklaşımları", "Okula Uyum", "Erken Okuryazarlık Eğitimi"]
  },
  agsSinifOgretmenligi: {
    branchName: "Sınıf Öğretmenliği",
    alanBilgisi: ["İlkokulda Temel Matematik", "İlkokulda Temel Fen Bilimleri", "Türk Dili", "Türk Tarihi ve Kültürü", "Türkiye Coğrafyası ve Jeopolitiği", "Çocuk Edebiyatı"],
    alanEgitimi: ["Hayat Bilgisi Öğretimi", "Sosyal Bilgiler Öğretimi", "Din Kültürü ve Ahlak Bilgisi Öğretimi", "Fen Bilgisi Öğretimi", "Drama", "Görsel Sanatlar Öğretimi", "Müzik Öğretimi", "Matematik Öğretimi", "İlk Okuma ve Yazma Öğretimi"]
  },
  agsTurkce: {
    branchName: "Türkçe",
    alanBilgisi: ["Anlama ve Anlatma Teknikleri", "Dil Bilgisi ve Dil Bilimi", "Çocuk Edebiyatı", "Türk Halk Edebiyatı", "Eski Türk Edebiyatı", "Yeni Türk Edebiyatı"],
    alanEgitimi: ["Edebiyat Bilgi ve Kuramları"]
  },
  agsTurkDiliEdebiyati: {
    branchName: "Türk Dili ve Edebiyatı",
    alanBilgisi: ["Eski Türk Dili", "Yeni Türk Dili", "Türk Halk Edebiyatı", "Eski Türk Edebiyatı", "Yeni Türk Edebiyatı"],
    alanEgitimi: ["Edebiyat Bilgi ve Kuramları"]
  },
  agsIlkogretimMatematik: {
    branchName: "İlköğretim Matematik",
    alanBilgisi: ["Analiz", "Cebir", "Geometri", "Uygulamalı Matematik"],
    alanEgitimi: ["İlköğretim Matematik Öğretimi Yöntem ve Teknikleri"]
  },
  agsMatematik: {
    branchName: "Matematik",
    alanBilgisi: ["Analiz", "Cebir", "Geometri", "Uygulamalı Matematik"],
    alanEgitimi: ["Matematik Öğretimi Yöntem ve Teknikleri"]
  },
  agsFenBilimleri: {
    branchName: "Fen Bilimleri",
    alanBilgisi: ["Fizik", "Kimya", "Biyoloji", "Jeoloji / Yer Bilimi", "Astronomi", "Çevre Bilimi"],
    alanEgitimi: ["Fen Bilimleri Öğretimi Yöntem ve Teknikleri"]
  },
  agsFizik: {
    branchName: "Fizik",
    alanBilgisi: ["Mekanik", "Elektrik ve Manyetizma", "Maddenin Mekanik ve Isıl Özellikleri", "Dalgalar ve Optik", "Modern Fizik"],
    alanEgitimi: ["Fizik Öğretimi Yöntem ve Teknikleri"]
  },
  agsKimya: {
    branchName: "Kimya / Kimya Teknolojisi",
    alanBilgisi: ["Temel Kimya", "Analitik Kimya", "Anorganik Kimya", "Organik Kimya", "Fizikokimya"],
    alanEgitimi: ["Kimya Öğretimi Yöntem ve Teknikleri"]
  },
  agsBiyoloji: {
    branchName: "Biyoloji",
    alanBilgisi: ["Hücre ve Metabolizma", "Bitki Biyolojisi", "İnsan ve Hayvan Biyolojisi", "Ekoloji", "Canlıların Sınıflandırılması", "Genetik"],
    alanEgitimi: ["Biyoloji Öğretimi Yöntem ve Teknikleri"]
  },
  agsSosyalBilgiler: {
    branchName: "Sosyal Bilgiler",
    alanBilgisi: ["Tarih", "Coğrafya", "Siyaset Bilimi", "Sosyal Bilgilerin Temelleri", "Bilim Teknoloji ve Toplum", "Sosyal Antropoloji ve Medeniyet Tarihi", "Ekonomi", "İnsan İlişkileri ve İletişim", "Sosyoloji", "Sosyal Proje Geliştirme"],
    alanEgitimi: ["Sosyal Bilgiler Öğretimi Yöntem ve Teknikleri"]
  },
  agsTarih: {
    branchName: "Tarih",
    alanBilgisi: ["Tarih Metodolojisi", "Osmanlı Türkçesi", "Eski Çağ Tarihi", "İlk Türk Devletleri Tarihi", "Orta Çağ İslam Tarihi", "Osmanlı Tarihi", "Türkiye Cumhuriyeti Tarihi", "Orta Çağ'dan XX. Yüzyıl'a Dünya Tarihi", "XX. Yüzyıl Türk ve Dünya Tarihi"],
    alanEgitimi: ["Tarih Öğretimi Yöntem ve Teknikleri"]
  },
  agsCografya: {
    branchName: "Coğrafya",
    alanBilgisi: ["Fiziki Coğrafya", "Beşerî ve Ekonomik Coğrafya", "Kıtalar ve Ülkeler Coğrafyası"],
    alanEgitimi: ["Coğrafya Öğretimi Yöntem ve Teknikleri"]
  },
  agsRehberlik: {
    branchName: "Rehberlik",
    alanBilgisi: ["Temel Psikolojik Kavramlar", "Psikolojik Danışma Kuram, İlke ve Teknikleri", "Davranış ve Uyum Problemleri", "Bireyi Tanıma Teknikleri", "Bireyle Psikolojik Danışma", "Grupla Psikolojik Danışma", "Mesleki Rehberlik ve Kariyer Danışmanlığı", "Psikolojik Danışma ve Rehberlikte Araştırma ve Program Geliştirme", "Meslek Etiği ve Yasal Konular"],
    alanEgitimi: ["Rehberlik Uygulamaları ve Okul Psikolojik Danışmanlığı"]
  },
  agsBedenEgitimi: {
    branchName: "Beden Eğitimi",
    alanBilgisi: ["Beden Eğitimi ve Sporun Temelleri", "İnsan Anatomisi ve Kinesiyoloji", "Sağlık Bilgisi ve İlk Yardım", "Egzersiz Fizyolojisi", "Antrenman Bilgisi", "Fiziksel Uygunluk", "Egzersiz ve Beslenme", "Engelliler İçin Beden Eğitimi ve Spor", "Psikomotor Gelişim", "Beden Eğitimi ve Spor Yönetimi", "Beceri Öğrenimi", "Atletizm", "Takım Sporları", "Ritim Eğitimi ve Dans / Halk Oyunları", "Jimnastik", "Eğitsel Oyunlar"],
    alanEgitimi: ["Beden Eğitimi Öğretimi Yöntem ve Teknikleri"]
  },
  agsDinKulturu: {
    branchName: "Din Kültürü ve Ahlak Bilgisi / İHL",
    alanBilgisi: ["Kur'an-ı Kerim ve Tecvid", "Tefsir", "Hadis", "Fıkıh", "Akaid", "Kelam", "İslam Mezhepleri ve Akımları", "Siyer", "İslam Tarihi, Kültür ve Medeniyeti", "İslam Felsefesi", "Din Felsefesi", "Din Sosyolojisi", "Din Psikolojisi", "Din Eğitimi", "Dinler Tarihi"],
    alanEgitimi: ["DKAB / İHL Meslek Dersleri Öğretimi Yöntem ve Teknikleri"]
  },
  agsOzelEgitim: {
    branchName: "Özel Eğitim",
    alanBilgisi: ["Zihin Yetersizliği ve Otizm Spektrum Bozukluğu", "Öğrenme Güçlüğü ve Özel Yetenek", "İşitme Yetersizliği", "Görme Yetersizliği", "Erken Çocuklukta Özel Eğitim", "Uygulamalı Davranış Analizi", "Bireyselleştirilmiş Eğitim Programları (BEP)", "Özel Eğitimde Değerlendirme", "Dil ve İletişim Becerilerinin Desteklenmesi", "Özel Eğitim Politikaları ve Yasal Düzenlemeler"],
    alanEgitimi: ["Özel Eğitimde Okuma-Yazma Öğretimi", "Özel Eğitimde Fen ve Sosyal Bilgiler Öğretimi", "Özel Eğitimde Matematik Öğretimi", "Özel Eğitimde Sanatsal Becerilerin Öğretimi", "Özel Eğitimde Fiziksel Eğitim ve Spor", "Özel Eğitimde Sosyal Uyum Becerilerinin Öğretimi", "Özel Eğitimde Türkçe Öğretimi", "Özel Eğitimde Oyun ve Müzik", "Özel Eğitimde Aile Eğitimi", "2024 TYMM Özel Eğitim Programları"]
  }
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
// numbered independently, so they form two booklets. Every AGS branch shares
// the same booklet shape; only the ÖABT alan topics differ.
const AGS_BOOKLETS = [
  { key: "ags", label: "AGS Oturumu (Genel)", sections: AGS_COMMON_KEYS },
  { key: "oabt", label: "ÖABT · Alan Oturumu", sections: ["alanBilgisi", "alanEgitimi"] }
];

/** Build a full AGS branch profile: shared AGS sections + the branch's ÖABT
    alan dersleri, plus the standard two-booklet split. */
function buildAgsProfile(id, spec) {
  return {
    id,
    examName: `AGS · ${spec.branchName}`,
    examType: "ags",
    branchName: spec.branchName,
    sections: {
      ...AGS_COMMON_SECTIONS,
      alanBilgisi: { label: `${spec.branchName} · Alan Bilgisi`, topics: spec.alanBilgisi },
      alanEgitimi: { label: `${spec.branchName} · Alan Eğitimi`, topics: spec.alanEgitimi }
    },
    booklets: AGS_BOOKLETS
  };
}

export const PROFILES = {
  kpssLisans: { id: "kpssLisans", examName: "KPSS Lisans (GY-GK)", examType: "kpss", sections: KPSS_LISANS_SECTIONS, booklets: KPSS_LISANS_BOOKLETS }
};
for (const [id, spec] of Object.entries(OABT_BRANCHES)) {
  PROFILES[id] = buildAgsProfile(id, spec);
}

export const DEFAULT_PROFILE = "kpssLisans";

/** List for the signup exam-profile picker. */
export const PROFILE_OPTIONS = Object.values(PROFILES).map((p) => ({
  id: p.id,
  examName: p.examName
}));

/* ---------------------------------------------------------------
   SIGNUP PICKER — two-step exam-type → (AGS only) branch.
   --------------------------------------------------------------- */

/** Top-level exam types. KPSS maps straight to a profile; AGS needs a branch. */
export const EXAM_TYPES = [
  { type: "kpss", label: "KPSS Lisans (GY-GK)", profileId: "kpssLisans" },
  { type: "ags", label: "AGS (Akademi Giriş Sınavı)" }
];

/** AGS branches for the second-step dropdown ({ id, branchName }). */
export const AGS_BRANCH_OPTIONS = Object.values(PROFILES)
  .filter((p) => p.examType === "ags")
  .map((p) => ({ id: p.id, branchName: p.branchName }));

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
  { page: "deneme",  label: "Denemeler",       ic: "DN", group: "Yanlış Analizi" },
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
