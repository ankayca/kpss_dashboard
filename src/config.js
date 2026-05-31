/* ============================================================
   Static configuration & domain constants.
   ============================================================ */

export const APP_BUILD = "2026-05-31-alan-denemeleri";

export const SECTIONS = {
  turkce:      { label: "Türkçe",      topics: ["Sözcükte Anlam", "Cümlede Anlam", "Deyim-Atasözü", "Ses Bilgisi", "Yazım Kuralları", "Noktalama", "Cümle Bilgisi", "Paragraf"] },
  matematik:   { label: "Matematik",   topics: ["Temel Kavramlar", "Sayı Basamakları", "Bölme-Bölünebilme", "OBEB-OKEK", "Kesirler", "Ondalık Sayılar", "Yüzdeler", "Oran-Orantı", "Problemler", "Kümeler", "Permütasyon-Kombinasyon"] },
  tarih:       { label: "Tarih",       topics: ["Tarih Bilimine Giriş", "İlk Uygarlıklar", "İlk Türk Devletleri", "İslamiyet ve Türkler", "Selçuklular", "Osmanlı Kuruluş", "Osmanlı Yükselme", "Osmanlı Duraklama-Gerileme", "Osmanlı Dağılma", "Kurtuluş Savaşı", "Atatürk İlkeleri", "Türkiye Cumhuriyeti Tarihi"] },
  cografya:    { label: "Coğrafya",    topics: ["Harita Bilgisi", "İklimler", "Türkiye'nin Yüzey Şekilleri", "Türkiye İklimi", "Nüfus", "Yerleşme", "Tarım", "Sanayi", "Ulaşım", "Çevre Sorunları", "Dünya Coğrafyası"] },
  vatandaslik: { label: "Vatandaşlık", topics: ["Hukuka Giriş", "Anayasa", "Temel Haklar", "Yasama", "Yürütme", "Yargı", "Yerel Yönetimler", "Ekonomi Temelleri", "Gelir Dağılımı", "Türkiye Ekonomisi"] }
};

export const SECTION_KEYS = Object.keys(SECTIONS);

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
