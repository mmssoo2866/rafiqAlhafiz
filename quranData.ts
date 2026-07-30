export interface SurahInfo {
  id: number;
  name: string;
  english: string;
  ayahs: number;
  startPage: number;
}

export const SURAHS: SurahInfo[] = [
  { id: 1, name: "الفاتحة", english: "Al-Fatihah", ayahs: 7, startPage: 1 },
  { id: 2, name: "البقرة", english: "Al-Baqarah", ayahs: 286, startPage: 2 },
  { id: 3, name: "آل عمران", english: "Al-Imran", ayahs: 200, startPage: 50 },
  { id: 4, name: "النساء", english: "An-Nisa'", ayahs: 176, startPage: 77 },
  { id: 5, name: "المائدة", english: "Al-Ma'idah", ayahs: 120, startPage: 106 },
  { id: 6, name: "الأنعام", english: "Al-An'am", ayahs: 165, startPage: 128 },
  { id: 7, name: "الأعراف", english: "Al-A'raf", ayahs: 206, startPage: 151 },
  { id: 8, name: "الأنفال", english: "Al-Anfal", ayahs: 75, startPage: 177 },
  { id: 9, name: "التوبة", english: "At-Tawbah", ayahs: 129, startPage: 187 },
  { id: 10, name: "يونس", english: "Yunus", ayahs: 109, startPage: 208 },
  { id: 11, name: "هود", english: "Hud", ayahs: 123, startPage: 221 },
  { id: 12, name: "يوسف", english: "Yusuf", ayahs: 111, startPage: 235 },
  { id: 13, name: "الرعد", english: "Ar-Ra'd", ayahs: 43, startPage: 249 },
  { id: 14, name: "إبراهيم", english: "Ibrahim", ayahs: 52, startPage: 255 },
  { id: 15, name: "الحجر", english: "Al-Hijr", ayahs: 99, startPage: 262 },
  { id: 16, name: "النحل", english: "An-Nahl", ayahs: 128, startPage: 267 },
  { id: 17, name: "الإسراء", english: "Al-Isra'", ayahs: 111, startPage: 282 },
  { id: 18, name: "الكهف", english: "Al-Kahf", ayahs: 110, startPage: 293 },
  { id: 19, name: "مريم", english: "Maryam", ayahs: 98, startPage: 305 },
  { id: 20, name: "طه", english: "Ta-Ha", ayahs: 135, startPage: 312 },
  { id: 21, name: "الأنبياء", english: "Al-Anbiya'", ayahs: 112, startPage: 322 },
  { id: 22, name: "الحج", english: "Al-Hajj", ayahs: 78, startPage: 332 },
  { id: 23, name: "المؤمنون", english: "Al-Mu'minun", ayahs: 118, startPage: 342 },
  { id: 24, name: "النور", english: "An-Nur", ayahs: 64, startPage: 350 },
  { id: 25, name: "الفرقان", english: "Al-Furqan", ayahs: 77, startPage: 359 },
  { id: 26, name: "الشعراء", english: "Ash-Shu'ara'", ayahs: 227, startPage: 367 },
  { id: 27, name: "النمل", english: "An-Naml", ayahs: 93, startPage: 377 },
  { id: 28, name: "القصص", english: "Al-Qasas", ayahs: 88, startPage: 385 },
  { id: 29, name: "العنكبوت", english: "Al-Ankabut", ayahs: 69, startPage: 396 },
  { id: 30, name: "الروم", english: "Ar-Rum", ayahs: 60, startPage: 404 },
  { id: 31, name: "لقمان", english: "Luqman", ayahs: 34, startPage: 411 },
  { id: 32, name: "السجدة", english: "As-Sajdah", ayahs: 30, startPage: 415 },
  { id: 33, name: "الأحزاب", english: "Al-Ahzab", ayahs: 73, startPage: 418 },
  { id: 34, name: "سبأ", english: "Saba'", ayahs: 54, startPage: 428 },
  { id: 35, name: "فاطر", english: "Fatir", ayahs: 45, startPage: 434 },
  { id: 36, name: "يس", english: "Ya-Sin", ayahs: 83, startPage: 440 },
  { id: 37, name: "الصافات", english: "As-Saffat", ayahs: 182, startPage: 446 },
  { id: 38, name: "ص", english: "Sad", ayahs: 88, startPage: 453 },
  { id: 39, name: "الزمر", english: "Az-Zumar", ayahs: 75, startPage: 458 },
  { id: 40, name: "غافر", english: "Ghafir", ayahs: 85, startPage: 467 },
  { id: 41, name: "فصلت", english: "Fussilat", ayahs: 54, startPage: 477 },
  { id: 42, name: "الشورى", english: "Ash-Shura", ayahs: 53, startPage: 483 },
  { id: 43, name: "الزخرف", english: "Az-Zukhruf", ayahs: 89, startPage: 489 },
  { id: 44, name: "الدخان", english: "Ad-Dukhan", ayahs: 59, startPage: 496 },
  { id: 45, name: "الجاثية", english: "Al-Jathiyah", ayahs: 37, startPage: 499 },
  { id: 46, name: "الأحقاف", english: "Al-Ahqaf", ayahs: 35, startPage: 502 },
  { id: 47, name: "محمد", english: "Muhammad", ayahs: 38, startPage: 507 },
  { id: 48, name: "الفتح", english: "Al-Fath", ayahs: 29, startPage: 511 },
  { id: 49, name: "الحجرات", english: "Al-Hujurat", ayahs: 18, startPage: 515 },
  { id: 50, name: "ق", english: "Qaf", ayahs: 45, startPage: 518 },
  { id: 51, name: "الذاريات", english: "Adh-Dhariyat", ayahs: 60, startPage: 520 },
  { id: 52, name: "الطور", english: "At-Tur", ayahs: 49, startPage: 523 },
  { id: 53, name: "النجم", english: "An-Najm", ayahs: 62, startPage: 525 },
  { id: 54, name: "القمر", english: "Al-Qamar", ayahs: 55, startPage: 528 },
  { id: 55, name: "الرحمن", english: "Ar-Rahman", ayahs: 78, startPage: 531 },
  { id: 56, name: "الواقعة", english: "Al-Waqi'ah", ayahs: 96, startPage: 534 },
  { id: 57, name: "الحديد", english: "Al-Hadid", ayahs: 29, startPage: 537 },
  { id: 58, name: "المجادلة", english: "Al-Mujadilah", ayahs: 22, startPage: 542 },
  { id: 59, name: "الحشر", english: "Al-Hashr", ayahs: 24, startPage: 545 },
  { id: 60, name: "الممتحنة", english: "Al-Mumtahanah", ayahs: 13, startPage: 549 },
  { id: 61, name: "الصف", english: "As-Saff", ayahs: 14, startPage: 551 },
  { id: 62, name: "الجمعة", english: "Al-Jumu'ah", ayahs: 11, startPage: 553 },
  { id: 63, name: "المنافقون", english: "Al-Munafiqun", ayahs: 11, startPage: 554 },
  { id: 64, name: "التغابن", english: "At-Taghabun", ayahs: 18, startPage: 556 },
  { id: 65, name: "الطلاق", english: "At-Talaq", ayahs: 12, startPage: 558 },
  { id: 66, name: "التحريم", english: "At-Tahrim", ayahs: 12, startPage: 560 },
  { id: 67, name: "الملك", english: "Al-Mulk", ayahs: 30, startPage: 562 },
  { id: 68, name: "القلم", english: "Al-Qalam", ayahs: 52, startPage: 564 },
  { id: 69, name: "الحاقة", english: "Al-Haqqah", ayahs: 52, startPage: 566 },
  { id: 70, name: "المعارج", english: "Al-Ma'arij", ayahs: 44, startPage: 568 },
  { id: 71, name: "نوح", english: "Nuh", ayahs: 28, startPage: 570 },
  { id: 72, name: "الجن", english: "Al-Jinn", ayahs: 28, startPage: 572 },
  { id: 73, name: "المزمل", english: "Al-Muzzammil", ayahs: 20, startPage: 574 },
  { id: 74, name: "المدثر", english: "Al-Muddaththir", ayahs: 56, startPage: 575 },
  { id: 75, name: "القيامة", english: "Al-Qiyamah", ayahs: 40, startPage: 577 },
  { id: 76, name: "الإنسان", english: "Al-Insan", ayahs: 31, startPage: 578 },
  { id: 77, name: "المرسلات", english: "Al-Mursalat", ayahs: 50, startPage: 580 },
  { id: 78, name: "النبأ", english: "An-Naba'", ayahs: 40, startPage: 582 },
  { id: 79, name: "النازعات", english: "An-Nazi'at", ayahs: 46, startPage: 585 },
  { id: 80, name: "عبس", english: "Abasa", ayahs: 42, startPage: 587 },
  { id: 81, name: "التكوير", english: "At-Takwir", ayahs: 29, startPage: 589 },
  { id: 82, name: "الانفطار", english: "Al-Infitar", ayahs: 19, startPage: 590 },
  { id: 83, name: "المطففين", english: "Al-Mutaffifin", ayahs: 36, startPage: 591 },
  { id: 84, name: "الانشقاق", english: "Al-Inshiqaq", ayahs: 25, startPage: 593 },
  { id: 85, name: "البروج", english: "Al-Buruj", ayahs: 22, startPage: 594 },
  { id: 86, name: "الطارق", english: "At-Tariq", ayahs: 17, startPage: 595 },
  { id: 87, name: "الأعلى", english: "Al-A'la", ayahs: 19, startPage: 596 },
  { id: 88, name: "الغاشية", english: "Al-Ghashiyah", ayahs: 26, startPage: 597 },
  { id: 89, name: "الفجر", english: "Al-Fajr", ayahs: 30, startPage: 597 },
  { id: 90, name: "البلد", english: "Al-Balad", ayahs: 20, startPage: 599 },
  { id: 91, name: "الشمس", english: "Ash-Shams", ayahs: 15, startPage: 601 },
  { id: 92, name: "الليل", english: "Al-Layl", ayahs: 21, startPage: 601 },
  { id: 93, name: "الضحى", english: "Ad-Duha", ayahs: 11, startPage: 602 },
  { id: 94, name: "الشرح", english: "Ash-Sharh", ayahs: 8, startPage: 602 },
  { id: 95, name: "التين", english: "At-Tin", ayahs: 8, startPage: 603 },
  { id: 96, name: "العلق", english: "Al-Alaq", ayahs: 19, startPage: 603 },
  { id: 97, name: "القدر", english: "Al-Qadr", ayahs: 5, startPage: 604 },
  { id: 98, name: "البينة", english: "Al-Bayyinah", ayahs: 8, startPage: 604 },
  { id: 99, name: "الزلزلة", english: "Az-Zalzalah", ayahs: 8, startPage: 605 },
  { id: 100, name: "العاديات", english: "Al-Adiyat", ayahs: 11, startPage: 605 },
  { id: 101, name: "القارعة", english: "Al-Qari'ah", ayahs: 11, startPage: 606 },
  { id: 102, name: "التكاثر", english: "At-Taka-thur", ayahs: 8, startPage: 606 },
  { id: 103, name: "العصر", english: "Al-Asr", ayahs: 3, startPage: 607 },
  { id: 104, name: "الهمزة", english: "Al-Humazah", ayahs: 9, startPage: 607 },
  { id: 105, name: "الفيل", english: "Al-Fil", ayahs: 5, startPage: 608 },
  { id: 106, name: "قريش", english: "Quraysh", ayahs: 4, startPage: 608 },
  { id: 107, name: "الماعون", english: "Al-Ma'un", ayahs: 7, startPage: 608 },
  { id: 108, name: "الكوثر", english: "Al-Kawthar", ayahs: 3, startPage: 608 },
  { id: 109, name: "الكافرون", english: "Al-Kafirun", ayahs: 6, startPage: 609 },
  { id: 110, name: "النصر", english: "An-Nasr", ayahs: 3, startPage: 609 },
  { id: 111, name: "المسد", english: "Al-Masad", ayahs: 5, startPage: 610 },
  { id: 112, name: "الإخلاص", english: "Al-Ikhlas", ayahs: 4, startPage: 610 },
  { id: 113, name: "الفلق", english: "Al-Falaq", ayahs: 5, startPage: 610 },
  { id: 114, name: "الناس", english: "An-Nas", ayahs: 6, startPage: 610 }
];

export function getSurahById(id: number): SurahInfo | undefined {
  return SURAHS.find((s) => s.id === id);
}

export function getSurahName(id: number): string {
  const s = getSurahById(id);
  return s ? s.name : "غير معروف";
}

export function getPageForAyah(surahId: number, ayahNum: number): number {
  const current = getSurahById(surahId);
  if (!current) return 1;

  const next = getSurahById(surahId + 1);
  const nextStart = next ? next.startPage : 611;

  const pageRange = nextStart - current.startPage;
  if (pageRange <= 1) return current.startPage;

  // Linear interpolation for pages within surah
  const offset = Math.floor(((ayahNum - 1) / current.ayahs) * pageRange);
  const targetPage = current.startPage + offset;

  // Restrict to standard Quran 604 pages max
  return Math.max(1, Math.min(604, targetPage));
}
