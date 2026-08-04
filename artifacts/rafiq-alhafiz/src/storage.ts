import { SURAHS } from "./quranData";

export interface UserProfile {
  name: string;
  gender: "male" | "female";
  prayerRole: "imam" | "maamoom";
  nightPrayerRakats: number;
  lat: number;
  lng: number;
  useSunnah: boolean;
  memorizationDirection: "forward" | "backward";
  autoOpenMushaf: boolean;
  streakDays: number;
  lastActiveDate: string; // YYYY-MM-DD
  enableNotifications?: boolean;
  notifyPrayerTimes?: boolean;
  notifyReviewReminder?: boolean;
  notifyPrayerReviewBefore?: boolean;
  prayerReminderOffsetMinutes?: number;
  prayerReminderOffsets?: {
    fajr?: number;
    dhuhr?: number;
    asr?: number;
    maghrib?: number;
    isha?: number;
  };
  mushafNightMode?: boolean;
  duhaRakats?: number;
  appTrack?: "hifz_and_review" | "review_only";
  reviewOnlyDirection?: "forward" | "backward";
  reviewOnlyDailyAmountType?: "pages" | "hizb" | "juz" | "surah_ayah";
  reviewOnlyDailyAmountValue?: number;
  reviewOnlySurahId?: number;
  reviewOnlyFromAyah?: number;
  reviewOnlyToAyah?: number;
  reviewOnlyCurrentPage?: number;
  reviewOnlyCompletedDates?: string[];
  mainReviewStartSurahId?: number;
  mainReviewEndSurahId?: number;
  mainReviewProgressPages?: number;
}

export interface MemorizationBlock {
  id: string;
  surahId: number;
  fromAyah: number;
  toAyah: number;
  repetitionTarget: number;
  startDate: string; // YYYY-MM-DD
  status: "active" | "completed";
}

export interface RepetitionState {
  [blockId: string]: number; // remaining repetitions for today
}

export interface CompletedReviews {
  [dateStr: string]: string[]; // list of blockIds reviewed on that date
}

export interface AppState {
  profile: UserProfile | null;
  blocks: MemorizationBlock[];
  completedReviews: CompletedReviews;
  repetitions: RepetitionState;
  mushafCache: number[]; // downloaded pages
  activityLog: { id: string; timestamp: string; title: string; desc: string }[];
}

const STORAGE_KEY = "rafiq_alhafiz_state_v1";

const DEFAULT_PROFILE: UserProfile = {
  name: "الاسم",
  gender: "male",
  prayerRole: "imam",
  nightPrayerRakats: 8,
  lat: 21.4225, // Mecca
  lng: 39.8262, // Mecca
  useSunnah: true,
  memorizationDirection: "forward",
  autoOpenMushaf: true,
  streakDays: 3,
  lastActiveDate: new Date().toISOString().split("T")[0],
  enableNotifications: true,
  notifyPrayerTimes: true,
  notifyReviewReminder: true,
  notifyPrayerReviewBefore: true,
  prayerReminderOffsetMinutes: 15,
  prayerReminderOffsets: {
    fajr: 15,
    dhuhr: 15,
    asr: 15,
    maghrib: 15,
    isha: 15
  },
  mushafNightMode: false,
  duhaRakats: 4,
  appTrack: "hifz_and_review",
  reviewOnlyDirection: "forward",
  reviewOnlyDailyAmountType: "juz",
  reviewOnlyDailyAmountValue: 20,
  reviewOnlySurahId: 2,
  reviewOnlyFromAyah: 1,
  reviewOnlyToAyah: 100,
  reviewOnlyCurrentPage: 1,
  reviewOnlyCompletedDates: [],
  mainReviewStartSurahId: 114,
  mainReviewEndSurahId: 18,
  mainReviewProgressPages: 0
};

// Generates some mock completed and pending blocks for first-time use
function generateMockState(): AppState {
  const today = new Date();
  const formatOffsetDate = (daysAgo: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split("T")[0];
  };

  const block1: MemorizationBlock = {
    id: "mock-b1",
    surahId: 1, // Al-Fatihah
    fromAyah: 1,
    toAyah: 7,
    repetitionTarget: 30,
    startDate: formatOffsetDate(3), // started 3 days ago is on Day 4 of review (Intensive review)
    status: "active"
  };

  const block2: MemorizationBlock = {
    id: "mock-b2",
    surahId: 2, // Al-Baqarah
    fromAyah: 1,
    toAyah: 5,
    repetitionTarget: 50,
    startDate: formatOffsetDate(13), // started 13 days ago is on Day 14 (Spaced Repetition)
    status: "active"
  };

  const block3: MemorizationBlock = {
    id: "mock-b3",
    surahId: 67, // Al-Mulk
    fromAyah: 1,
    toAyah: 10,
    repetitionTarget: 100,
    startDate: formatOffsetDate(0), // started today (New Memorization)
    status: "active"
  };

  return {
    profile: DEFAULT_PROFILE,
    blocks: [block1, block2, block3],
    completedReviews: {
      [formatOffsetDate(2)]: ["mock-b1"],
      [formatOffsetDate(1)]: ["mock-b1"]
    },
    repetitions: {
      "mock-b3": 100
    },
    mushafCache: [1, 2, 562],
    activityLog: [
      {
        id: "l-1",
        timestamp: new Date(Date.now() - 3 * 24 * 3600000).toISOString(),
        title: "بدء خطة الحفظ",
        desc: "تمت إضافة مقرر سورة الفاتحة من الآية 1 إلى 7"
      },
      {
        id: "l-2",
        timestamp: new Date(Date.now() - 2 * 24 * 3600000).toISOString(),
        title: "إتمام مراجعة",
        desc: "تمت مراجعة سورة الفاتحة بنجاح"
      }
    ]
  };
}

export function loadAppState(): AppState {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (!serialized) {
      const mockState = generateMockState();
      saveAppState(mockState);
      return mockState;
    }
    const state = JSON.parse(serialized) as AppState;
    
    // Automatically reset repetition counters if day changed
    const todayStr = new Date().toISOString().split("T")[0];
    if (state.profile && state.profile.lastActiveDate !== todayStr) {
      // Calculate streak
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];
      
      let newStreak = state.profile.streakDays;
      if (state.profile.lastActiveDate === yesterdayStr) {
        // Keep or increment streak
      } else {
        // Broke streak
        newStreak = 1;
      }
      
      state.profile.streakDays = newStreak;
      state.profile.lastActiveDate = todayStr;
      
      // Reset today's new memorization repetition counters
      state.repetitions = {};
      state.blocks.forEach(b => {
        if (b.startDate === todayStr) {
          state.repetitions[b.id] = b.repetitionTarget;
        }
      });
      
      saveAppState(state);
    }
    
    return state;
  } catch (error) {
    console.error("Failed to load app state, falling back to mock", error);
    return generateMockState();
  }
}

export function saveAppState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Failed to save app state", error);
  }
}

export function logActivity(state: AppState, title: string, desc: string): AppState {
  const newLog = {
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    title,
    desc
  };
  const updated = {
    ...state,
    activityLog: [newLog, ...state.activityLog.slice(0, 100)]
  };
  saveAppState(updated);
  return updated;
}
