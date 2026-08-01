import React, { useState, useEffect, useRef } from "react";
import { 
  BookOpen, 
  Calendar, 
  Flame, 
  User, 
  Settings, 
  Book, 
  CheckCircle, 
  Download, 
  Upload, 
  Trash2, 
  Plus, 
  Search, 
  Bell, 
  BellRing,
  BellOff,
  ChevronLeft, 
  ChevronRight, 
  Info, 
  Clock, 
  Compass, 
  MapPin, 
  RotateCcw, 
  Check, 
  Activity, 
  AlertCircle,
  Moon,
  Sun 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { SURAHS, getSurahById, getPageForAyah, getSurahName, getSurahForPage } from "./quranData";
import { loadAppState, saveAppState, logActivity, AppState, MemorizationBlock, UserProfile, CompletedReviews } from "./storage";
import { getTasksForDate, getCumulativeGroups, hasDay66TriggerToday, ScheduledTask } from "./scheduler";
import { calculateTodayPrayers, distributeReviewsToPrayers, distributeKhatmahReviewToPrayers, DistributedSlot } from "./prayerEngine";

const QURAN_PAGE_CDNS = [
  (page: number) => `https://raw.githubusercontent.com/Quran/quran.com-images/master/images_1920/page${String(page).padStart(3, "0")}.png`,
  (page: number) => `https://everyayah.com/data/quranpages/page${String(page).padStart(3, "0")}.png`,
  (page: number) => `https://cdn.islamic.network/quran/images/high-resolution/page${page}.png`,
  (page: number) => `https://android.quran.com/data/single_page/images_1920/page${String(page).padStart(3, "0")}.png`
];

const PRAYER_KEY_MAP: Record<string, "fajr" | "dhuhr" | "asr" | "maghrib" | "isha"> = {
  "الفجر": "fajr",
  "الظهر": "dhuhr",
  "العصر": "asr",
  "المغرب": "maghrib",
  "العشاء": "isha"
};

function getPrayerOffsetMinutes(profile: UserProfile, prayerArabicName: string): number {
  const key = PRAYER_KEY_MAP[prayerArabicName];
  if (key && profile.prayerReminderOffsets && profile.prayerReminderOffsets[key] !== undefined) {
    return profile.prayerReminderOffsets[key]!;
  }
  return profile.prayerReminderOffsetMinutes ?? 15;
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [activeTab, setActiveTab] = useState<"home" | "hifz" | "review" | "prayers" | "mushaf" | "settings">("home");
  const [todayStr, setTodayStr] = useState<string>("");
  
  // Geolocation loading state
  const [gpsLoading, setGpsLoading] = useState(false);

  // Notification permission state
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default"
  );
  
  // Onboarding wizard if active
  const [isOnboarding, setIsOnboarding] = useState(false);
  
  // Form states
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null);
  const [newHifz, setNewHifz] = useState({
    surahId: 67, // Al-Mulk default
    fromAyah: 1,
    toAyah: 10,
    repetitions: 100
  });

  // Mushaf viewer state
  const [mushafPage, setMushafPage] = useState<number>(1);
  const [mushafViewMode, setMushafViewMode] = useState<"image" | "offline">("image");
  const [searchSurahId, setSearchSurahId] = useState<number>(1);
  const [mushafCdnIndex, setMushafCdnIndex] = useState<number>(0);
  const [mushafImgLoading, setMushafImgLoading] = useState<boolean>(true);
  const [mushafImgFailed, setMushafImgFailed] = useState<boolean>(false);
  const [pageTextData, setPageTextData] = useState<{ surahName: string; ayahs: { numberInSurah: number; text: string }[] } | null>(null);
  const [loadingPageText, setLoadingPageText] = useState<boolean>(false);

  // Reset image states on page change
  useEffect(() => {
    setMushafCdnIndex(0);
    setMushafImgLoading(true);
    setMushafImgFailed(false);
  }, [mushafPage]);

  // Fetch digital page text when offline mode or failover occurs
  useEffect(() => {
    if (mushafViewMode === "offline" || mushafImgFailed) {
      let isMounted = true;
      setLoadingPageText(true);
      fetch(`https://api.alquran.cloud/v1/page/${mushafPage}/quran-uthmani`)
        .then(res => res.json())
        .then(data => {
          if (isMounted && data?.data?.ayahs) {
            const ayahs = data.data.ayahs.map((a: any) => ({
              numberInSurah: a.numberInSurah,
              text: a.text,
              surahName: a.surah?.name || ""
            }));
            const primarySurah = data.data.ayahs[0]?.surah?.name || "القرآن الكريم";
            setPageTextData({ surahName: primarySurah, ayahs });
          }
        })
        .catch(() => {
          if (isMounted) setPageTextData(null);
        })
        .finally(() => {
          if (isMounted) setLoadingPageText(false);
        });
      return () => { isMounted = false; };
    }
  }, [mushafPage, mushafViewMode, mushafImgFailed]);

  // Setup today's initial date 
  useEffect(() => {
    const today = new Date();
    setTodayStr(today.toISOString().split("T")[0]);
    
    // Load app state
    const loaded = loadAppState();
    setState(loaded);
    
    if (!loaded.profile || loaded.profile.name === "عبد الله" && loaded.blocks.length === 3 && localStorage.getItem("onboarding_complete") !== "true") {
      setIsOnboarding(true);
    }
  }, []);

  // Automated background timer to send pre-prayer review notification when time is reached
  const notifiedPrayersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!state || !state.profile) return;
    const profile = state.profile;
    if (profile.enableNotifications === false || profile.notifyPrayerReviewBefore === false) {
      return;
    }

    const interval = setInterval(() => {
      if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
        return;
      }

      const tasks = getTasksForDate(state, todayStr);
      const prayerList = calculateTodayPrayers(profile);
      const slots = profile.appTrack === "review_only" 
        ? distributeKhatmahReviewToPrayers(profile) 
        : distributeReviewsToPrayers(tasks, profile);

      const now = new Date();
      prayerList.forEach((p) => {
        const offset = getPrayerOffsetMinutes(profile, p.arabicName);
        const reminderTime = new Date(p.time.getTime() - offset * 60 * 1000);
        const notifKey = `${todayStr}_${p.arabicName}`;

        const diffSeconds = (now.getTime() - reminderTime.getTime()) / 1000;
        if (diffSeconds >= 0 && diffSeconds < 90 && !notifiedPrayersRef.current.has(notifKey)) {
          notifiedPrayersRef.current.add(notifKey);

          const matchedSlots = slots.filter(s => s.parentPrayer === p.arabicName);
          const reviewsText = matchedSlots.length > 0 
            ? matchedSlots.map(s => `${s.prayerName}: ${s.assignedContent}`).join(" | ")
            : "لا يوجد ورد مراجعة مخصص لهذه الصلاة اليوم.";

          new Notification(`⏰ تذكير بمراجعة صلاة ${p.arabicName} (بقي ${offset} دقيقة على الأذان)`, {
            body: `وردك المخصص للركعات: ${reviewsText}`,
            dir: "rtl"
          });
        }
      });
    }, 20000);

    return () => clearInterval(interval);
  }, [state, todayStr]);

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-emerald-950 font-sans">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-lg font-medium">جاري تهيئة رفيق الحافظ...</p>
        </div>
      </div>
    );
  }

  const { profile, blocks, completedReviews, repetitions, activityLog } = state;

  // Save utility helper
  const updateState = (updated: AppState) => {
    setState(updated);
    saveAppState(updated);
  };

  // Onboarding finish handler
  const handleOnboardingSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = (data.get("name") as string) || "عبد الله";
    const gender = (data.get("gender") as "male" | "female") || "male";
    const prayerRole = (data.get("prayerRole") as "imam" | "maamoom") || "imam";
    const useSunnah = data.get("useSunnah") === "on";
    const nightPrayerRakats = data.get("nightPrayerRakats") !== null ? Number(data.get("nightPrayerRakats")) : 8;
    const direction = (data.get("direction") as "forward" | "backward") || "forward";

    const updatedProfile: UserProfile = {
      ...DEFAULT_PROFILE_FALLBACK(),
      name,
      gender,
      prayerRole,
      useSunnah,
      nightPrayerRakats,
      memorizationDirection: direction,
      streakDays: 1,
      lastActiveDate: todayStr
    };

    const updatedState: AppState = {
      ...state,
      profile: updatedProfile
    };

    localStorage.setItem("onboarding_complete", "true");
    setIsOnboarding(false);
    updateState(logActivity(updatedState, "التهيئة الأولى", `أهلاً بك يا ${name}! تم إعداد تطبيق رفيق الحافظ بنجاح.`));
  };

  // Helper defaults
  function DEFAULT_PROFILE_FALLBACK(): UserProfile {
    return {
      name: "عبد الله",
      gender: "male",
      prayerRole: "imam",
      nightPrayerRakats: 8,
      lat: 21.4225,
      lng: 39.8262,
      useSunnah: true,
      memorizationDirection: "forward",
      autoOpenMushaf: true,
      streakDays: 3,
      lastActiveDate: todayStr,
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
      duhaRakats: 4,
      appTrack: "hifz_and_review",
      reviewOnlyDirection: "forward",
      reviewOnlyDailyAmountType: "juz",
      reviewOnlyDailyAmountValue: 20,
      reviewOnlyCurrentPage: 1,
      reviewOnlyCompletedDates: []
    };
  }

  // Request browser notification permission
  const handleRequestNotifPermission = async () => {
    if (!("Notification" in window)) {
      alert("متصفحك الحالي لا يدعم ميزة إشعارات النظام.");
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
      if (perm === "granted") {
        new Notification("رفيق الحافظ 📖", {
          body: "تم تفعيل الإشعارات بنجاح! سنقوم بتنبيهك بمواقيت الصلاة وجدول المراجعات اليومية.",
          dir: "rtl"
        });
        if (state) {
          const updated = { ...state, profile: { ...userProfile, enableNotifications: true } };
          updateState(logActivity(updated, "تفعيل الإشعارات", "تم إعطاء إذن الإشعارات من المتصفح بنجاح."));
        }
      } else if (perm === "denied") {
        alert("تم رفض إذن الإشعارات في المتصفح. يمكنك السماح بها بالضغط على أرقام/أيقونة الموقع في شريط العناوين بالمتصفح.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Test notification function
  const handleTestNotification = () => {
    if (!("Notification" in window)) {
      alert("متصفحك لا يدعم الإشعارات.");
      return;
    }
    if (Notification.permission === "granted") {
      new Notification("رفيق الحافظ 📖 (إشعار تجريبي)", {
        body: "الحمد لله! نظام التنبيهات يعمل بنجاح في تطبيق رفيق الحافظ.",
        dir: "rtl"
      });
    } else {
      handleRequestNotifPermission();
    }
  };

  // Test prayer specific reminder notification
  const handleTestPrayerReminderNotification = (prayerArabicName: string, slots: DistributedSlot[]) => {
    if (!("Notification" in window)) {
      alert("متصفحك لا يدعم الإشعارات.");
      return;
    }

    const offset = getPrayerOffsetMinutes(userProfile, prayerArabicName);
    const matchedSlots = slots.filter(s => s.parentPrayer === prayerArabicName);
    const reviewsText = matchedSlots.length > 0 
      ? matchedSlots.map(s => `${s.prayerName}: ${s.assignedContent}`).join(" | ")
      : "لا يوجد ورد مراجعة مخصص لهذه الصلاة اليوم.";

    if (Notification.permission === "granted") {
      new Notification(`⏰ تذكير مراجعة صلاة ${prayerArabicName} (قبل الأذان بـ ${offset} دقيقة)`, {
        body: `وردك المخصص لركعات صلاة ${prayerArabicName}: ${reviewsText}`,
        dir: "rtl"
      });
    } else {
      handleRequestNotifPermission();
    }
  };

  // Get active user profile
  const userProfile = profile || DEFAULT_PROFILE_FALLBACK();

  // Grab location
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      alert("متصفحك لا يدعم خدمات تحديد الموقع الجغرافي.");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLoading(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const updatedProfile = { ...userProfile, lat, lng };
        const updatedState = { ...state, profile: updatedProfile };
        updateState(logActivity(updatedState, "تحديث الموقع", `تم رصد إحداثياتك بدقة: (${lat.toFixed(4)}, ${lng.toFixed(4)}) لتعديل مواقيت الصلاة.`));
      },
      (err) => {
        setGpsLoading(false);
        alert("فشل تحديد الموقع. يرجى إعطاء الإذن أو الاعتماد على إحداثيات مكة الافتراضية.");
      },
      { timeout: 8000 }
    );
  };

  // Add new memorization block
  const handleAddHifz = (e: React.FormEvent) => {
    e.preventDefault();
    const surah = getSurahById(newHifz.surahId);
    if (!surah) return;

    if (newHifz.fromAyah <= 0 || newHifz.toAyah <= 0) {
      alert("يرجى إدخال أرقام آيات صحيحة أكبر من الصفر.");
      return;
    }
    if (newHifz.toAyah < newHifz.fromAyah) {
      alert("آية النهاية يجب أن تكون أكبر من أو تساوي آية البداية.");
      return;
    }
    if (newHifz.toAyah > surah.ayahs) {
      alert(`سورة ${surah.name} تحتوي على ${surah.ayahs} آية فقط.`);
      return;
    }

    const newBlock: MemorizationBlock = {
      id: `block-${Date.now()}`,
      surahId: newHifz.surahId,
      fromAyah: newHifz.fromAyah,
      toAyah: newHifz.toAyah,
      repetitionTarget: newHifz.repetitions,
      startDate: todayStr,
      status: "active"
    };

    const updatedState: AppState = {
      ...state,
      blocks: [newBlock, ...state.blocks],
      repetitions: {
        ...state.repetitions,
        [newBlock.id]: newHifz.repetitions
      }
    };

    updateState(logActivity(updatedState, "إضافة مقرر حفظ جديد", `تم تسجيل مقرر سورة ${surah.name} (من الآية ${newHifz.fromAyah} إلى ${newHifz.toAyah}) وتوليد جدول المراجعات تلقائياً.`));
    alert(`تمت إضافة المقرر بنجاح وتوليد 17 جلسة مراجعة متباعدة تلقائياً!`);
    
    // reset form
    setNewHifz(prev => ({ ...prev, fromAyah: 1, toAyah: Math.min(10, surah.ayahs) }));
  };

  // Delete a block
  const handleDeleteBlock = (blockId: string) => {
    const block = state.blocks.find(b => b.id === blockId);
    if (!block) return;
    const sName = getSurahName(block.surahId);

    const filteredBlocks = state.blocks.filter(b => b.id !== blockId);
    const cleanRepetitions = { ...state.repetitions };
    delete cleanRepetitions[blockId];

    // Also clean completed reviews references for this block
    const cleanCompleted: CompletedReviews = {};
    Object.entries(state.completedReviews).forEach(([date, ids]) => {
      cleanCompleted[date] = (ids as string[]).filter(id => id !== blockId);
    });

    const updatedState = {
      ...state,
      blocks: filteredBlocks,
      repetitions: cleanRepetitions,
      completedReviews: cleanCompleted
    };

    updateState(logActivity(updatedState, "حذف مقرر حفظ", `تم حذف مقرر سورة ${sName} (الآيات ${block.fromAyah} - ${block.toAyah})`));
    setDeletingBlockId(null);
  };

  // Complete a review task
  const handleToggleReviewComplete = (blockId: string) => {
    const todayList = completedReviews[todayStr] ? [...completedReviews[todayStr]] : [];
    const isCompleted = todayList.includes(blockId);
    
    let updatedList: string[];
    let title: string;
    let desc: string;

    const block = state.blocks.find(b => b.id === blockId);
    const surahName = block ? getSurahName(block.surahId) : "";

    if (isCompleted) {
      updatedList = todayList.filter(id => id !== blockId);
      title = "إلغاء مراجعة";
      desc = `تم التراجع عن إكمال مراجعة سورة ${surahName}`;
    } else {
      updatedList = [...todayList, blockId];
      title = "إنجاز مراجعة";
      desc = `تم إتمام المراجعة اليومية لسورة ${surahName} (الآيات ${block?.fromAyah} - ${block?.toAyah})`;
      
      // Play a audio helper (subtle synthesized tone of success)
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        oscillator.start();
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);
        oscillator.stop(audioCtx.currentTime + 0.3);
      } catch (e) {}
    }

    const updatedState = {
      ...state,
      completedReviews: {
        ...completedReviews,
        [todayStr]: updatedList
      }
    };

    updateState(logActivity(updatedState, title, desc));
  };

  // Mark block as fully retired/completed
  const handleToggleBlockStatus = (blockId: string) => {
    const updatedBlocks = state.blocks.map(b => {
      if (b.id === blockId) {
        const newStatus = b.status === "completed" ? "active" : "completed";
        return { ...b, status: newStatus as "active" | "completed" };
      }
      return b;
    });

    const block = state.blocks.find(b => b.id === blockId);
    const sName = block ? getSurahName(block.surahId) : "";

    const updatedState = { ...state, blocks: updatedBlocks };
    updateState(logActivity(updatedState, "تحديث حالة المقرر", `تم وضع مقرر سورة ${sName} في وضع ${block?.status === "completed" ? "النشط" : "الأرشفة المكتملة"}`));
  };

  // Repetition logic
  const handleDecrementRepetition = (blockId: string) => {
    const currentVal = repetitions[blockId] !== undefined ? repetitions[blockId] : 100;
    if (currentVal <= 0) return;

    const newVal = currentVal - 1;
    const updatedState = {
      ...state,
      repetitions: {
        ...repetitions,
        [blockId]: newVal
      }
    };

    // Subtly play ticking audio
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.setValueAtTime(newVal === 0 ? 880 : 330, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.08);
      osc.stop(audioCtx.currentTime + 0.08);
    } catch (e) {}

    if (newVal === 0) {
      const block = state.blocks.find(b => b.id === blockId);
      const sName = block ? getSurahName(block.surahId) : "";
      updateState(logActivity(updatedState, "إكمال تكرار الحفظ", `تبارك الله! أكملت المائة تكرار لمقرر سورة ${sName} بنجاح تام وتم تثبيت الحفظ.`));
    } else {
      updateState(updatedState);
    }
  };

  // Khatmah Review complete handler
  const handleCompleteKhatmahReviewToday = () => {
    const isSurahAyah = userProfile.reviewOnlyDailyAmountType === "surah_ayah";
    const completedDates = userProfile.reviewOnlyCompletedDates || [];
    const isAlreadyDone = completedDates.includes(todayStr);

    let updatedProfile: UserProfile;

    if (isSurahAyah) {
      const sId = userProfile.reviewOnlySurahId || 2;
      const fA = userProfile.reviewOnlyFromAyah || 1;
      const tA = userProfile.reviewOnlyToAyah || 100;
      const surahObj = getSurahById(sId);
      const maxA = surahObj ? surahObj.ayahs : 286;
      const span = Math.abs(tA - fA) + 1;

      let nextSId = sId;
      let nextFA = tA + 1;
      let nextTA = nextFA + span - 1;

      if (nextFA > maxA) {
        nextSId = (sId % 114) + 1;
        nextFA = 1;
        const nextSurahObj = getSurahById(nextSId);
        const nextMaxA = nextSurahObj ? nextSurahObj.ayahs : 100;
        nextTA = Math.min(span, nextMaxA);
      } else if (nextTA > maxA) {
        nextTA = maxA;
      }

      const nextPage = getPageForAyah(nextSId, nextFA);

      let updatedDates = completedDates;
      if (!isAlreadyDone) {
        updatedDates = [...completedDates, todayStr];
      }

      updatedProfile = {
        ...userProfile,
        reviewOnlySurahId: nextSId,
        reviewOnlyFromAyah: nextFA,
        reviewOnlyToAyah: nextTA,
        reviewOnlyCurrentPage: nextPage,
        reviewOnlyCompletedDates: updatedDates,
        streakDays: userProfile.streakDays + (isAlreadyDone ? 0 : 1)
      };

      const surahName = getSurahById(nextSId)?.name || "";
      const updatedState = { ...state, profile: updatedProfile };
      updateState(logActivity(updatedState, "إنجاز ورد المراجعة اليومي", `تم إتمام ورد المراجعة بالسورة والآيات. الانتقال لموضع: سورة ${surahName} (آية ${nextFA}-${nextTA}).`));
      alert(`هنيئاً لك! تم إتمام ورد المراجعة لهذا اليوم بنجاح وتقدم موضعك إلى سورة ${surahName} من الآية ${nextFA} إلى ${nextTA} 📖✨`);
    } else {
      const curPage = userProfile.reviewOnlyCurrentPage || 1;
      const amount = userProfile.reviewOnlyDailyAmountValue || 20;
      const dir = userProfile.reviewOnlyDirection || "forward";

      let nextPage = curPage;
      if (dir === "forward") {
        nextPage = ((curPage - 1 + amount) % 604) + 1;
      } else {
        nextPage = ((curPage - 1 - amount + 604000) % 604) + 1;
      }

      let updatedDates = completedDates;
      if (!isAlreadyDone) {
        updatedDates = [...completedDates, todayStr];
      }

      updatedProfile = {
        ...userProfile,
        reviewOnlyCurrentPage: nextPage,
        reviewOnlyCompletedDates: updatedDates,
        streakDays: userProfile.streakDays + (isAlreadyDone ? 0 : 1)
      };

      const updatedState = { ...state, profile: updatedProfile };
      const dirLabel = dir === "forward" ? "من البقرة إلى الناس" : "من الناس إلى البقرة";
      updateState(logActivity(updatedState, "إنجاز ورد المراجعة اليومي", `تم بحمد الله إتمام ورد المراجعة لليوم (${amount} صفحة - اتجاه ${dirLabel}). الانتقال للصحيفة ${nextPage}.`));
      alert(`هنيئاً لك! تم إتمام ورد المراجعة لهذا اليوم بنجاح وتقدم موضعك إلى الصحيفة رقم ${nextPage} 📖✨`);
    }

    // Tone feedback
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.15); // E5
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.4);
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {}
  };

  // Open Mushaf at exact page representing a Surah/Ayah
  const navigateToMushaf = (surahId: number, ayahNum: number) => {
    const targetPage = getPageForAyah(surahId, ayahNum);
    setMushafPage(targetPage);
    setActiveTab("mushaf");
  };

  // Get current scheduled tasks for today
  const todayTasks = getTasksForDate(state, todayStr);
  
  // Calculate prayer times
  const prayerTimesList = calculateTodayPrayers(userProfile);
  
  // Distribute reviews dynamically across prayers based on active track
  const distributionSlots = userProfile.appTrack === "review_only"
    ? distributeKhatmahReviewToPrayers(userProfile)
    : distributeReviewsToPrayers(todayTasks, userProfile);

  // Group blocks for cumulative reviews
  const cumulativeGroups = getCumulativeGroups(state.blocks);

  // Main Review Assignment computations
  const mainStartSurahId = userProfile.mainReviewStartSurahId || 114;
  const mainEndSurahId = userProfile.mainReviewEndSurahId || 18;
  const mainStartPage = getPageForAyah(mainStartSurahId, 1);
  const mainEndPage = getPageForAyah(mainEndSurahId, 1);
  const totalPagesInMainAssignment = Math.max(1, Math.abs(mainStartPage - mainEndPage) + 1);

  const reviewedPagesSoFar = userProfile.mainReviewProgressPages || 0;
  const mainDailyPortion = userProfile.reviewOnlyDailyAmountValue || 10;

  const mainProgressPercentage = Math.min(100, Math.max(0, Math.round((reviewedPagesSoFar / totalPagesInMainAssignment) * 1000) / 10));
  const remainingMainPages = Math.max(0, totalPagesInMainAssignment - reviewedPagesSoFar);
  const estimatedDaysRemaining = Math.ceil(remainingMainPages / Math.max(1, mainDailyPortion));

  const handleRecordMainReviewDailyPortion = () => {
    const newProgressPages = Math.min(totalPagesInMainAssignment, reviewedPagesSoFar + mainDailyPortion);
    const updated = {
      ...state,
      profile: {
        ...userProfile,
        mainReviewProgressPages: newProgressPages,
        streakDays: userProfile.streakDays + 1
      }
    };
    updateState(logActivity(updated, "إنجاز ورد المراجعة الرئيسي", `تم إنجاز ${mainDailyPortion} صفحة من مقرر المراجعة الرئيسي. نسبة الإنجاز الحالية: ${Math.round((newProgressPages / totalPagesInMainAssignment) * 100)}%`));

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
      osc.stop(audioCtx.currentTime + 0.35);
    } catch (e) {}

    alert(`تبارك الله! تم إنجاز ورد اليوم لـ مقرر المراجعة الرئيسي (+${mainDailyPortion} صفحة). نسبة إنجازك الكلية أصبحت ${Math.round((newProgressPages / totalPagesInMainAssignment) * 100)}% 📖✨`);
  };

  const handleResetMainReviewProgress = () => {
    if (confirm("هل تريد إعادة ضبط حسبة تقدم مقرر المراجعة الرئيسي إلى 0 صفحة؟")) {
      const updated = {
        ...state,
        profile: {
          ...userProfile,
          mainReviewProgressPages: 0
        }
      };
      updateState(updated);
    }
  };

  // Export JSON backup
  const handleExportBackup = () => {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(state, null, 2)
    )}`;
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", jsonString);
    downloadAnchor.setAttribute("download", `rafiq_alhafiz_backup_${todayStr}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import JSON backup
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    const files = e.target.files;
    if (!files || files.length === 0) return;

    fileReader.readAsText(files[0], "UTF-8");
    fileReader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string) as AppState;
        if (parsed.profile && parsed.blocks) {
          updateState(parsed);
          alert("تم استعادة نسختك الاحتياطية بنجاح ومزامنة جميع السجلات!");
        } else {
          alert("الملف المرفوع غير متوافق مع معايير تطبيق رفيق الحافظ.");
        }
      } catch (err) {
        alert("فشل قراءة الملف. يرجى التأكد من اختيار ملف JSON صحيح.");
      }
    };
  };

  // Reset progress entirely to default
  const handleResetApp = () => {
    if (confirm("تحذير: سيتم حذف جميع الخطط، التقدم، البيانات والإعدادات وإعادة تشغيل رفيق الحافظ، هل تود الاستمرار؟")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  // Calculated Stats
  const memorizedVersesCount = blocks.reduce((sum, b) => sum + (b.toAyah - b.fromAyah + 1), 0);
  const totalCompletedReviewsCount = Object.values(completedReviews).reduce((sum: number, arr) => sum + (arr as string[]).length, 0);
  const quranCompletionPercent = ((memorizedVersesCount / 6236) * 100).toFixed(1);

  return (
    <div className="min-h-screen bg-[#f4f7f5] text-gray-800 font-sans flex flex-col antialiased select-none" dir="rtl">
      
      {/* ONBOARDING MODAL IF ACTIVE */}
      {isOnboarding && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-3xl shadow-xl max-w-lg w-full overflow-hidden border border-emerald-100"
          >
            <div className="bg-emerald-800 text-white p-6 text-center space-y-2">
              <h2 className="text-2xl font-bold font-serif">مرحباً بك في رفيق الحافظ 📖</h2>
              <p className="text-emerald-100 text-sm">مساعدك الذكي والمبتكر ومحركك التفاعلي لتثبيت كتاب الله الممتد بالتكرار المتباعد والربط مع الركعات والصلوات</p>
            </div>
            
            <form onSubmit={handleOnboardingSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700">الاسم الكريم</label>
                <input 
                  type="text" 
                  name="name" 
                  defaultValue="عبد الله" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-gray-50 text-right" 
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700">الجنس</label>
                  <select name="gender" className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-gray-50">
                    <option value="male">ذكر</option>
                    <option value="female">أنثى</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700">دور الصلاة</label>
                  <select name="prayerRole" className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-gray-50">
                    <option value="imam">إمام (أقرأ جهراً وسراً)</option>
                    <option value="maamoom">مأموم (أستمع جهراً وأقرأ سراً)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700">ركعات قيام الليل</label>
                  <select name="nightPrayerRakats" defaultValue="8" className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-gray-50">
                    <option value="2">ركعتان</option>
                    <option value="4">4 ركعات</option>
                    <option value="8">8 ركعات (مستحسن)</option>
                    <option value="11">11 ركعة</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700">اتجاه خطة الحفظ</label>
                  <select name="direction" className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-gray-50">
                    <option value="forward">من الفاتحة إلى الناس</option>
                    <option value="backward">من الناس إلى الفاتحة (الحفظ العكسي)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center space-x-2 space-x-reverse pt-2">
                <input type="checkbox" name="useSunnah" id="useSunnah" defaultChecked className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500" />
                <label htmlFor="useSunnah" className="text-sm text-gray-600 font-medium select-none">
                  تفصيل مراجعات الصلاة ليشمل السنن والرواتب المؤكدة
                </label>
              </div>

              <div className="bg-emerald-50 p-3 rounded-2xl text-xs text-emerald-800 flex items-start space-x-2 space-x-reverse">
                <Info className="w-4 h-4 shrink-0 text-emerald-600" />
                <p>تخطيط رفيق الحافظ يعتمد بالكامل على تثبيت الحفظ عبر توزيعه آلياً في ركعات اليوم، مما يجعل المراجعة عملية عبادية مستمرة مدمجة بنشاطك اليومي.</p>
              </div>

              <button 
                type="submit" 
                className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold shadow-md hover:shadow-lg transition-all"
              >
                حفظ الإعدادات وبدء الرحلة المباركة 🚀
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* HEADER SECTION */}
      <header className="bg-emerald-900 text-white shadow-md relative overflow-hidden shrink-0 border-b border-amber-500/20">
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-36 h-36 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="max-w-6xl mx-auto px-4 py-4 md:py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="w-12 h-12 bg-amber-500/10 border-2 border-amber-500 rounded-2xl flex items-center justify-center shadow-inner">
              <span className="text-amber-400 font-serif text-2xl font-bold">📖</span>
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold font-serif tracking-tight text-white flex items-center gap-2">
                رفيق الحافظ <span className="text-[10px] md:text-xs px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full font-sans font-normal">v1.0.0</span>
              </h1>
              <p className="text-xs text-emerald-200">الجدولة التفاعلية والمراجعة المدمجة بالصلوات وتكرار الحفظ</p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-4 bg-emerald-950/40 p-2 rounded-2xl border border-emerald-800/40 divide-x divide-x-reverse divide-emerald-800">
            <div className="px-3 text-center">
              <div className="flex items-center justify-center gap-1 text-amber-400">
                <Flame className="w-4 h-4 fill-amber-500 text-amber-500 animate-pulse" />
                <span className="font-bold text-lg">{userProfile.streakDays}</span>
              </div>
              <p className="text-[9px] text-emerald-200">أيام متصلة</p>
            </div>
            
            <div className="px-3 text-center">
              <div className="font-bold text-amber-100 text-lg">{memorizedVersesCount}</div>
              <p className="text-[9px] text-emerald-200">آية محفوظة</p>
            </div>

            <div className="px-3 text-center">
              <div className="font-bold text-amber-100 text-lg">{quranCompletionPercent}%</div>
              <p className="text-[9px] text-emerald-200">نسبة الختمة</p>
            </div>
          </div>
        </div>
      </header>

      {/* CORE VIEWPORT */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-3 md:p-6 overflow-y-auto space-y-6 pb-24">
        
        {/* DAY 66 ALERT NOTIFIER */}
        {hasDay66TriggerToday(state, todayStr) && (
          <div className="bg-amber-50 border-r-4 border-amber-500 p-4 rounded-xl flex items-start space-x-3 space-x-reverse shadow-sm">
            <div className="p-1 bg-amber-500/10 rounded-lg text-amber-600">
              <Bell className="w-5 h-5 animate-bounce" />
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-amber-900 text-sm">مراجعة تراكمية مدعومة لليوم 66!</h4>
              <p className="text-xs text-amber-700 mt-1">لقد بلغ أحد مقرراتك اليوم 66 من الحفظ. ينصح نظام التثبيت بالقيام بمراجعة تراكمية كبرى للمجموعة (1 - 15) المدمجة بالتقويم لتثبيت الحصاد طويل المدى.</p>
            </div>
          </div>
        )}

        {/* TRACK BANNER */}
        <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-emerald-950 text-white rounded-3xl p-4 md:p-5 shadow-lg flex flex-col md:flex-row items-center justify-between gap-4 border border-emerald-700/50">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="w-12 h-12 bg-amber-400/20 border-2 border-amber-400/40 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
              <Compass className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-amber-300">مسار النظام النشط:</span>
                <span className="text-xs font-bold bg-white/10 px-3 py-0.5 rounded-full border border-white/20">
                  {userProfile.appTrack === "review_only" ? "🔵 مسار المراجعة فقط" : "🟢 مسار الحفظ والمراجعة"}
                </span>
              </div>
              <p className="text-xs text-emerald-200 mt-1">
                {userProfile.appTrack === "review_only"
                  ? "مخصص للحُفّاظ لمراجعة القرآن كاملاً بتسلسل محدد أو بالسورة والآيات وتوزيعه على الصلوات والسنن"
                  : "مخصص للطلاب للحفظ الجديد مع عداد مائة التكرار والمراجعات التراكمية المتباعدة"}
              </p>
            </div>
          </div>

          <button
            onClick={() => setActiveTab("settings")}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-amber-300 hover:text-amber-200 font-bold text-xs rounded-2xl border border-white/20 transition flex items-center justify-center gap-2 shrink-0 self-stretch md:self-auto"
          >
            <Settings className="w-4 h-4 text-amber-300" />
            <span>تغيير المسار من الإعدادات</span>
          </button>
        </div>

        {/* TABS CONTAINER */}
        <AnimatePresence mode="wait">
          
          {/* TAB 1: HOME (DASHBOARD) */}
          {activeTab === "home" && (
            <motion.div 
              key="tab-home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {userProfile.appTrack === "review_only" ? (
                /* TRACK 2: REVIEW ONLY HOME VIEW */
                <div className="space-y-6">
                  {/* Track 2 Review Controller Card */}
                  <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 bg-blue-100 text-blue-900 font-bold text-xs rounded-full">مسار المراجعة فقط</span>
                          <span className="text-xs text-gray-500">ختمة المراجعة الشاملة المتسلسلة</span>
                        </div>
                        <h3 className="text-xl font-serif font-bold text-gray-800 mt-2">
                          {userProfile.reviewOnlyDailyAmountType === "surah_ayah" 
                            ? `مقرر مراجعة اليوم: سورة ${getSurahById(userProfile.reviewOnlySurahId || 2)?.name || "البقرة"} (آية ${userProfile.reviewOnlyFromAyah || 1} إلى ${userProfile.reviewOnlyToAyah || 100})`
                            : `مقرر مراجعة اليوم: الصحيفة ${userProfile.reviewOnlyCurrentPage || 1} من 604`}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                          {userProfile.reviewOnlyDailyAmountType === "surah_ayah"
                            ? `من الصحيفة ${getPageForAyah(userProfile.reviewOnlySurahId || 2, userProfile.reviewOnlyFromAyah || 1)} إلى ${getPageForAyah(userProfile.reviewOnlySurahId || 2, userProfile.reviewOnlyToAyah || 100)}`
                            : `السورة الحالية: سورة ${getSurahForPage(userProfile.reviewOnlyCurrentPage || 1)} • اتجاه المراجعة: ${userProfile.reviewOnlyDirection === "forward" ? "من البقرة إلى الناس (تصاعدي)" : "من الناس إلى البقرة (تنازلي)"}`}
                        </p>
                      </div>

                      <button 
                        onClick={() => {
                          const p = userProfile.reviewOnlyDailyAmountType === "surah_ayah"
                            ? getPageForAyah(userProfile.reviewOnlySurahId || 2, userProfile.reviewOnlyFromAyah || 1)
                            : (userProfile.reviewOnlyCurrentPage || 1);
                          setMushafPage(p);
                          setActiveTab("mushaf");
                        }}
                        className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition border border-emerald-200/60"
                      >
                        <BookOpen className="w-4 h-4 text-emerald-700" />
                        <span>فتح المصحف الشريف عند الموضع</span>
                      </button>
                    </div>

                    {/* Review Options Form */}
                    <div className="space-y-4 bg-gray-50/80 p-4 rounded-2xl border border-gray-200/60">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        
                        {/* 1. Review Direction */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-700 block">1. اتجاه المراجعة المتسلسلة</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              onClick={() => {
                                const updated = { ...state, profile: { ...userProfile, reviewOnlyDirection: "forward" as const } };
                                updateState(updated);
                              }}
                              className={`py-2 px-2 text-xs font-bold rounded-xl border transition ${
                                (userProfile.reviewOnlyDirection || "forward") === "forward"
                                  ? "bg-emerald-700 text-white border-emerald-800 shadow-sm"
                                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-100"
                              }`}
                            >
                              من البقرة إلى الناس
                            </button>
                            <button
                              onClick={() => {
                                const updated = { ...state, profile: { ...userProfile, reviewOnlyDirection: "backward" as const } };
                                updateState(updated);
                              }}
                              className={`py-2 px-2 text-xs font-bold rounded-xl border transition ${
                                userProfile.reviewOnlyDirection === "backward"
                                  ? "bg-emerald-700 text-white border-emerald-800 shadow-sm"
                                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-100"
                              }`}
                            >
                              من الناس إلى البقرة
                            </button>
                          </div>
                        </div>

                        {/* 2. Daily Review Amount */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-700 block">2. مقدار المراجعة هذا اليوم</label>
                          <select
                            value={userProfile.reviewOnlyDailyAmountType === "surah_ayah" ? "surah_ayah" : (userProfile.reviewOnlyDailyAmountValue || 20)}
                            onChange={(e) => {
                              const valStr = e.target.value;
                              if (valStr === "surah_ayah") {
                                const sId = userProfile.reviewOnlySurahId || 2;
                                const fAyah = userProfile.reviewOnlyFromAyah || 1;
                                const tAyah = userProfile.reviewOnlyToAyah || 100;
                                const startP = getPageForAyah(sId, fAyah);
                                const endP = getPageForAyah(sId, tAyah);
                                const amtP = Math.abs(endP - startP) + 1;
                                const updated = {
                                  ...state,
                                  profile: {
                                    ...userProfile,
                                    reviewOnlyDailyAmountType: "surah_ayah" as const,
                                    reviewOnlyDailyAmountValue: amtP
                                  }
                                };
                                updateState(updated);
                              } else {
                                const val = Number(valStr);
                                let type: "pages" | "hizb" | "juz" = "pages";
                                if (val === 10) type = "hizb";
                                if (val === 20 || val === 40) type = "juz";
                                const updated = {
                                  ...state,
                                  profile: {
                                    ...userProfile,
                                    reviewOnlyDailyAmountValue: val,
                                    reviewOnlyDailyAmountType: type
                                  }
                                };
                                updateState(updated);
                              }
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white text-xs font-bold text-gray-800"
                          >
                            <option value="1">1 صفحة واحدة في اليوم</option>
                            <option value="2">صفحتان (وجهان في اليوم)</option>
                            <option value="5">5 صفحات في اليوم</option>
                            <option value="10">حزب واحد (~10 صفحات)</option>
                            <option value="20">جزء واحد كامل (20 صفحة)</option>
                            <option value="40">جزآن (40 صفحة)</option>
                            <option value="60">3 أجزاء (60 صفحة)</option>
                            <option value="surah_ayah">📖 مخصص بناءً على اسم السورة والآيات</option>
                          </select>
                        </div>

                        {/* 3. Set Current Page position */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-700 block">3. موضع الصحيفة الحالية في الختمة</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              max="604"
                              value={userProfile.reviewOnlyCurrentPage || 1}
                              onChange={(e) => {
                                const p = Math.max(1, Math.min(604, Number(e.target.value) || 1));
                                const updated = { ...state, profile: { ...userProfile, reviewOnlyCurrentPage: p } };
                                updateState(updated);
                              }}
                              className="w-full px-3 py-1.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white text-xs font-bold font-mono text-center"
                            />
                            <span className="text-xs font-bold text-gray-500 whitespace-nowrap">من 604</span>
                          </div>
                        </div>
                      </div>

                      {/* SURAH & AYAH CONTROLS IF SELECTED */}
                      {userProfile.reviewOnlyDailyAmountType === "surah_ayah" && (
                        <div className="bg-emerald-50/90 p-4 rounded-2xl border border-emerald-200/80 space-y-3 mt-2">
                          <div className="text-xs font-bold text-emerald-950 flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-emerald-700" />
                            <span>تخصيص ورد المراجعة اليومية بناءً على اسم السورة ونطاق الآيات:</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {/* Surah select */}
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-gray-700 block">اسم السورة</label>
                              <select
                                value={userProfile.reviewOnlySurahId || 2}
                                onChange={(e) => {
                                  const sId = Number(e.target.value);
                                  const surahObj = getSurahById(sId);
                                  const maxA = surahObj ? surahObj.ayahs : 286;
                                  const fAyah = 1;
                                  const tAyah = Math.min(100, maxA);
                                  const startP = getPageForAyah(sId, fAyah);
                                  const endP = getPageForAyah(sId, tAyah);
                                  const amtP = Math.abs(endP - startP) + 1;

                                  const updated = {
                                    ...state,
                                    profile: {
                                      ...userProfile,
                                      reviewOnlySurahId: sId,
                                      reviewOnlyFromAyah: fAyah,
                                      reviewOnlyToAyah: tAyah,
                                      reviewOnlyCurrentPage: startP,
                                      reviewOnlyDailyAmountValue: amtP,
                                      reviewOnlyDailyAmountType: "surah_ayah" as const
                                    }
                                  };
                                  updateState(updated);
                                }}
                                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-xl bg-white text-xs font-bold text-gray-800"
                              >
                                {SURAHS.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.id}. سورة {s.name} ({s.ayahs} آية)
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* From Ayah */}
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-gray-700 block">من الآية رقم</label>
                              <input
                                type="number"
                                min="1"
                                max={getSurahById(userProfile.reviewOnlySurahId || 2)?.ayahs || 286}
                                value={userProfile.reviewOnlyFromAyah || 1}
                                onChange={(e) => {
                                  const fAyah = Math.max(1, Number(e.target.value) || 1);
                                  const sId = userProfile.reviewOnlySurahId || 2;
                                  const tAyah = userProfile.reviewOnlyToAyah || 100;
                                  const startP = getPageForAyah(sId, fAyah);
                                  const endP = getPageForAyah(sId, tAyah);
                                  const amtP = Math.abs(endP - startP) + 1;

                                  const updated = {
                                    ...state,
                                    profile: {
                                      ...userProfile,
                                      reviewOnlyFromAyah: fAyah,
                                      reviewOnlyCurrentPage: startP,
                                      reviewOnlyDailyAmountValue: amtP
                                    }
                                  };
                                  updateState(updated);
                                }}
                                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-xl bg-white text-xs font-bold text-center font-mono"
                              />
                            </div>

                            {/* To Ayah */}
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-gray-700 block">إلى الآية رقم</label>
                              <input
                                type="number"
                                min="1"
                                max={getSurahById(userProfile.reviewOnlySurahId || 2)?.ayahs || 286}
                                value={userProfile.reviewOnlyToAyah || 100}
                                onChange={(e) => {
                                  const tAyah = Math.max(1, Number(e.target.value) || 1);
                                  const sId = userProfile.reviewOnlySurahId || 2;
                                  const fAyah = userProfile.reviewOnlyFromAyah || 1;
                                  const startP = getPageForAyah(sId, fAyah);
                                  const endP = getPageForAyah(sId, tAyah);
                                  const amtP = Math.abs(endP - startP) + 1;

                                  const updated = {
                                    ...state,
                                    profile: {
                                      ...userProfile,
                                      reviewOnlyToAyah: tAyah,
                                      reviewOnlyDailyAmountValue: amtP
                                    }
                                  };
                                  updateState(updated);
                                }}
                                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-xl bg-white text-xs font-bold text-center font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Today's portion banner */}
                    {(() => {
                      const isSurahAyah = userProfile.reviewOnlyDailyAmountType === "surah_ayah";
                      let curP = userProfile.reviewOnlyCurrentPage || 1;
                      let endP = curP;
                      let bannerTitle = "";
                      let bannerSubtitle = "";
                      let amtLabel = "";

                      if (isSurahAyah) {
                        const sId = userProfile.reviewOnlySurahId || 2;
                        const fA = userProfile.reviewOnlyFromAyah || 1;
                        const tA = userProfile.reviewOnlyToAyah || 100;
                        const surahObj = getSurahById(sId);
                        const surahName = surahObj ? surahObj.name : "البقرة";
                        const startP = getPageForAyah(sId, fA);
                        const endPVal = getPageForAyah(sId, tA);
                        curP = Math.min(startP, endPVal);
                        endP = Math.max(startP, endPVal);
                        const pageSpan = Math.abs(endPVal - startP) + 1;

                        bannerTitle = `سورة ${surahName} (الآيات من ${fA} إلى ${tA})`;
                        bannerSubtitle = `تغطي الصحائف من ${curP} إلى ${endP} (${pageSpan} صفحة)`;
                        amtLabel = `ورد مخصص بالسور والآيات`;
                      } else {
                        const amt = userProfile.reviewOnlyDailyAmountValue || 20;
                        const dir = userProfile.reviewOnlyDirection || "forward";
                        
                        if (dir === "forward") {
                          endP = curP + amt - 1;
                          if (endP > 604) endP = ((endP - 1) % 604) + 1;
                        } else {
                          endP = curP - amt + 1;
                          if (endP < 1) endP = 604 + (endP % 604);
                        }

                        bannerTitle = `الصحائف من ${curP} إلى ${endP}`;
                        bannerSubtitle = `تغطية سورة ${getSurahForPage(curP)} ➔ سورة ${getSurahForPage(endP)}`;
                        amtLabel = `${amt} صفحة`;
                      }

                      const isCompletedToday = (userProfile.reviewOnlyCompletedDates || []).includes(todayStr);

                      return (
                        <div className="bg-emerald-50/70 p-5 rounded-2xl border border-emerald-200 space-y-3">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-200/80 px-2.5 py-0.5 rounded-md">
                                ورد اليوم المعتمد ({amtLabel})
                              </span>
                              <h4 className="text-lg font-bold text-emerald-950 mt-1">
                                {bannerTitle}
                              </h4>
                              <p className="text-xs text-emerald-800 mt-0.5">
                                {bannerSubtitle}
                              </p>
                            </div>

                            <button
                              onClick={handleCompleteKhatmahReviewToday}
                              className={`px-5 py-3 rounded-2xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 ${
                                isCompletedToday
                                  ? "bg-emerald-200 text-emerald-900 border border-emerald-300 hover:bg-emerald-300"
                                  : "bg-gradient-to-r from-emerald-700 to-emerald-900 text-white hover:from-emerald-800 hover:to-emerald-950 hover:shadow-lg"
                              }`}
                            >
                              <CheckCircle className="w-5 h-5 text-emerald-300" />
                              <span>{isCompletedToday ? "تم إتمام ورد اليوم (انقر للانتقال للورد القادم)" : "إتمام ورد المراجعة لهذا اليوم 🌟"}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Prayer Distribution & Prayer Times Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Prayer Distribution for Today's Review Portion */}
                    <div className="md:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 space-y-4">
                      <h3 className="text-lg font-serif font-bold text-emerald-900 border-b border-gray-100 pb-3 flex items-center justify-between">
                        <span>🕌 تقسيم مقرر المراجعة على الصلوات والسنن</span>
                        <span className="text-xs font-sans text-gray-500 bg-emerald-50 px-2 py-0.5 rounded-md">موزع آلياً على الركعات</span>
                      </h3>

                      <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                        {distributionSlots.length === 0 ? (
                          <p className="text-xs text-gray-500 text-center py-6">جاري توزيع ورد المراجعة على الصلوات...</p>
                        ) : (
                          distributionSlots.map((slot, idx) => (
                            <div key={slot.id || idx} className="p-3 bg-gray-50/80 hover:bg-gray-50 rounded-2xl border border-gray-200/70 flex items-center justify-between gap-3 text-xs transition">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-gray-800">{slot.prayerName}</span>
                                  <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full ${
                                    slot.prayerType === "fard" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"
                                  }`}>
                                    {slot.prayerType === "fard" ? "فرض" : slot.prayerType === "sunnah" ? "سنة" : "قيام"}
                                  </span>
                                </div>
                                <p className="text-emerald-800 font-semibold mt-1">{slot.assignedContent}</p>
                              </div>

                              <button
                                onClick={() => {
                                  const match = slot.assignedContent.match(/\d+/);
                                  if (match) {
                                    setMushafPage(Number(match[0]));
                                    setActiveTab("mushaf");
                                  }
                                }}
                                className="px-2.5 py-1 bg-white hover:bg-emerald-50 border border-gray-200 text-emerald-800 rounded-xl text-[10px] font-bold shrink-0 transition"
                              >
                                قراءة بالمصحف 📖
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* GPS Prayer Widget */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 flex flex-col justify-between space-y-4">
                      <div>
                        <h3 className="text-lg font-serif font-bold text-emerald-900 border-b border-gray-100 pb-3 flex items-center justify-between">
                          <span>🕌 مواقيت الصلاة للأذان</span>
                          <button 
                            onClick={handleDetectLocation}
                            disabled={gpsLoading}
                            className="p-1 px-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs flex items-center gap-1 transition"
                          >
                            <Compass className={`w-3.5 h-3.5 ${gpsLoading ? "animate-spin" : ""}`} />
                            <span>رصد GPS</span>
                          </button>
                        </h3>

                        <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 p-2 rounded-xl border border-gray-100">
                          <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                          <span>الموقع:</span>
                          <span className="font-mono bg-white px-1.5 py-0.5 rounded border text-[10px]">
                            {userProfile.lat.toFixed(3)}°N, {userProfile.lng.toFixed(3)}°E
                          </span>
                        </div>

                        <div className="space-y-2 mt-4">
                          {prayerTimesList.map((p) => (
                            <div key={p.name} className="flex items-center justify-between text-xs p-1.5 px-2.5 rounded-xl bg-gray-50/50 hover:bg-gray-50 border border-transparent hover:border-gray-100 transition">
                              <span className="font-semibold text-gray-700">{p.arabicName}</span>
                              <span className="font-mono text-gray-600">
                                {p.time.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <p className="text-[9px] text-gray-400 bg-emerald-50/30 p-2 rounded-xl text-center">
                        * يتم جلب مواقيت الصلاة بدقة بناءً على إحداثيات موقعك وفق مرجع أم القرى.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* TRACK 1: ORIGINAL HIFZ & REVIEW HOME VIEW */
                <div className="space-y-6">
                  {/* Daily status box and geolocation state */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Repetitions counter box */}
                <div className="md:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 space-y-4">
                  <h3 className="text-lg font-serif font-bold text-emerald-900 border-b border-gray-100 pb-3 flex items-center justify-between">
                    <span>🔁 عداد مائة التكرار لحفظ اليوم الجديد</span>
                    <span className="text-xs font-sans text-gray-400 font-normal">اضغط على الدائرة بعد كل تلاوة متقنة</span>
                  </h3>
                  
                  {/* Find today's new memorization task */}
                  {todayTasks.filter(t => t.type === "memorization").length === 0 ? (
                    <div className="h-44 flex flex-col items-center justify-center text-center space-y-2 text-gray-500">
                      <Book className="w-10 h-10 text-emerald-600/30" />
                      <p className="text-sm font-medium">لا يوجد مقرر حفظ مضاف لتاريخ اليوم.</p>
                      <button 
                        onClick={() => setActiveTab("hifz")}
                        className="px-4 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl transition"
                      >
                        إضافة أول مقرر اليوم ➕
                      </button>
                    </div>
                  ) : (
                    todayTasks.filter(t => t.type === "memorization").map((task) => {
                      const remCount = repetitions[task.block.id] !== undefined ? repetitions[task.block.id] : task.block.repetitionTarget;
                      const sName = getSurahName(task.block.surahId);
                      const isTargetMet = remCount === 0;
                      const pct = ((task.block.repetitionTarget - remCount) / task.block.repetitionTarget) * 100;

                      return (
                        <div key={task.block.id} className="flex flex-col md:flex-row items-center justify-around gap-6 py-2">
                          <div className="text-center md:text-right space-y-2">
                            <span className="px-2 py-0.5 bg-amber-500/10 text-amber-800 text-[10px] font-bold rounded-md">مقرر اليوم الجديد</span>
                            <h4 className="text-xl font-bold text-gray-800">سورة {sName}</h4>
                            <p className="text-sm text-gray-500">الآيات من {task.block.fromAyah} إلى {task.block.toAyah}</p>
                            
                            <button 
                              onClick={() => navigateToMushaf(task.block.surahId, task.block.fromAyah)}
                              className="inline-flex items-center text-xs font-semibold text-emerald-700 hover:text-emerald-800 gap-1 bg-emerald-50 px-3 py-1 rounded-xl transition mt-2"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                              عرض موضع الحفظ بالمصحف
                            </button>
                          </div>

                          {/* Incremental Interactive Circular Box */}
                          <div className="relative flex items-center justify-center">
                            
                            {/* Animated circle bg */}
                            <svg className="w-36 h-36 transform -rotate-90">
                              <circle cx="72" cy="72" r="64" stroke="#e1e8e4" strokeWidth="6" fill="transparent" />
                              <circle 
                                cx="72" 
                                cy="72" 
                                r="64" 
                                stroke="#10b981" 
                                strokeWidth="6" 
                                fill="transparent" 
                                strokeDasharray={2 * Math.PI * 64}
                                strokeDashoffset={2 * Math.PI * 64 * (1 - pct / 100)}
                                className="transition-all duration-300"
                              />
                            </svg>

                            <button 
                              onClick={() => handleDecrementRepetition(task.block.id)}
                              disabled={isTargetMet}
                              className={`absolute w-28 h-28 rounded-full flex flex-col items-center justify-center transition-all ${
                                isTargetMet 
                                  ? "bg-emerald-100 text-emerald-800 border-2 border-emerald-300 cursor-not-allowed" 
                                  : "bg-gradient-to-br from-emerald-600 to-emerald-800 text-white hover:scale-105 active:scale-95 shadow-md shadow-emerald-700/20"
                              }`}
                            >
                              {isTargetMet ? (
                                <div className="space-y-1 text-center scale-95">
                                  <Check className="w-8 h-8 text-emerald-700 mx-auto stroke-[3]" />
                                  <span className="text-[10px] font-bold">تم التكرار!</span>
                                </div>
                              ) : (
                                <div className="text-center">
                                  <span className="text-3xl font-bold font-mono tracking-tight">{remCount}</span>
                                  <div className="text-[9px] text-emerald-200 mt-0.5">تبقّى تكرار</div>
                                </div>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* GPS and Prayer times quick widget */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 flex flex-col justify-between space-y-4">
                  <div>
                    <h3 className="text-lg font-serif font-bold text-emerald-900 border-b border-gray-100 pb-3 flex items-center justify-between">
                      <span>🕌 مواقيت الصلاة للأذان</span>
                      <button 
                        onClick={handleDetectLocation}
                        disabled={gpsLoading}
                        className="p-1 px-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs flex items-center gap-1 transition"
                      >
                        <Compass className={`w-3.5 h-3.5 ${gpsLoading ? "animate-spin" : ""}`} />
                        <span>رصد GPS</span>
                      </button>
                    </h3>

                    {/* Coordinates output badge */}
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 p-2 rounded-xl border border-gray-100">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                      <span>الموقع:</span>
                      <span className="font-mono bg-white px-1.5 py-0.5 rounded border text-[10px]">
                        {userProfile.lat.toFixed(3)}°N, {userProfile.lng.toFixed(3)}°E
                      </span>
                    </div>

                    {/* List of times */}
                    <div className="space-y-2 mt-4">
                      {prayerTimesList.map((p) => (
                        <div key={p.name} className="flex items-center justify-between text-xs p-1.5 px-2.5 rounded-xl bg-gray-50/50 hover:bg-gray-50 border border-transparent hover:border-gray-100 transition">
                          <span className="font-semibold text-gray-700">{p.arabicName}</span>
                          <span className="font-mono text-gray-600">
                            {p.time.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="text-[9px] text-gray-400 bg-emerald-50/30 p-2 rounded-xl text-center">
                    * يتم جلب مواقيت الصلاة بدقة بناءً على إحداثيات موقعك وفق مرجع أم القرى.
                  </p>
                </div>
              </div>

              {/* Today's review workload card list */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 space-y-4">
                <h3 className="text-xl font-serif font-bold text-emerald-900 border-b border-gray-100 pb-3 flex items-center justify-between">
                  <span>📅 جدول مراجعات اليوم ({todayTasks.filter(t => t.type === "review").length})</span>
                  <span className="text-xs font-sans text-gray-500 bg-emerald-50 px-2 py-0.5 rounded-md">مراجعة مكثفة ومتباعدة</span>
                </h3>

                {todayTasks.filter(t => t.type === "review").length === 0 ? (
                  <div className="h-32 flex flex-col items-center justify-center text-center space-y-2 text-gray-500">
                    <CheckCircle className="w-8 h-8 text-emerald-600/35" />
                    <p className="text-sm font-semibold text-emerald-800">الحمد لله! لا توجد مراجعات متباعدة مستحقة اليوم.</p>
                    <p className="text-xs text-gray-400">ستظهر المقررات التالية تلقائياً بحسب فترة الفواصل المحددة.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {todayTasks.filter(t => t.type === "review").map((task) => {
                      const sName = getSurahName(task.block.surahId);
                      const isCompleted = task.isCompleted;
                      
                      return (
                        <div 
                          key={task.block.id} 
                          className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
                            isCompleted 
                              ? "bg-emerald-50/40 border-emerald-100 opacity-75" 
                              : "bg-gradient-to-r from-white to-gray-50/30 border-gray-200/80 shadow-sm hover:translate-x-[-2px]"
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-bold text-gray-800">سورة {sName}</span>
                              <span className={`text-[9px] px-2 py-0.5 font-bold rounded-full ${
                                task.offset <= 10 
                                  ? "bg-amber-100 text-amber-900" 
                                  : "bg-blue-100 text-blue-900"
                              }`}>
                                {task.offset <= 10 ? `مكثفة: اليوم ${task.offset}` : `متباعدة: اليوم ${task.offset}`}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">الآيات من {task.block.fromAyah} إلى {task.block.toAyah}</p>
                            
                            <button 
                              onClick={() => navigateToMushaf(task.block.surahId, task.block.fromAyah)}
                              className="text-[10px] font-bold text-emerald-700 hover:underline flex items-center gap-1 transition"
                            >
                              📖 فتح الصفحة {getPageForAyah(task.block.surahId, task.block.fromAyah)} بالمصحف
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => handleToggleReviewComplete(task.block.id)}
                              className={`p-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all ${
                                isCompleted 
                                  ? "bg-emerald-600 border-emerald-700 text-white" 
                                  : "bg-white hover:bg-emerald-50 border-gray-300 text-gray-700"
                              }`}
                            >
                              {isCompleted ? (
                                <>
                                  <Check className="w-4 h-4 stroke-[3]" />
                                  <span>مُراجَع</span>
                                </>
                              ) : (
                                <span>تم المراجعة ✓</span>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
          </motion.div>
        )}

          {/* TAB 2: HIFZ / MEMORIZATION TARGETS */}
          {activeTab === "hifz" && (
            <motion.div 
              key="tab-hifz"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Form column */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 space-y-4">
                  <h3 className="text-lg font-serif font-bold text-emerald-900 border-b border-gray-100 pb-3 flex items-center gap-2">
                    <span>➕ تسجيل مقرر حفظ جديد</span>
                  </h3>

                  <form onSubmit={handleAddHifz} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-600 block">اختر السورة الكريمة</label>
                      <select 
                        value={newHifz.surahId}
                        onChange={(e) => {
                          const sId = Number(e.target.value);
                          const surah = getSurahById(sId);
                          setNewHifz(prev => ({
                            ...prev,
                            surahId: sId,
                            fromAyah: 1,
                            toAyah: surah ? Math.min(10, surah.ayahs) : 10
                          }));
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-gray-50"
                      >
                        {SURAHS.map((s) => (
                          <option key={s.id} value={s.id}>{s.id}. {s.name} ({s.ayahs} آية)</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-600 block">من آية</label>
                        <input 
                          type="number" 
                          min="1"
                          value={newHifz.fromAyah}
                          onChange={(e) => setNewHifz(prev => ({ ...prev, fromAyah: Number(e.target.value) }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 text-center bg-gray-50" 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-600 block">إلى آية</label>
                        <input 
                          type="number" 
                          min="1"
                          value={newHifz.toAyah}
                          onChange={(e) => setNewHifz(prev => ({ ...prev, toAyah: Number(e.target.value) }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 text-center bg-gray-50" 
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-600 block text-right">عدد التكرارات لليوم الأول (التثبيت)</label>
                      <input 
                        type="number" 
                        min="5"
                        value={newHifz.repetitions}
                        onChange={(e) => setNewHifz(prev => ({ ...prev, repetitions: Number(e.target.value) }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 text-center bg-gray-50 font-mono" 
                      />
                    </div>

                    <button 
                      type="submit"
                      className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold shadow-md shadow-emerald-700/10 hover:shadow-lg transition-all"
                    >
                      حفظ المقرر وتوليد الخطة ➔
                    </button>
                  </form>
                </div>

                {/* Blocks list (2 cols) */}
                <div className="md:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 space-y-4">
                  <h3 className="text-xl font-serif font-bold text-emerald-900 border-b border-gray-100 pb-3">
                    🗂️ مقرراتك المسجلة قيد المتابعة ({state.blocks.length})
                  </h3>

                  {state.blocks.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-center space-y-2 text-gray-500">
                      <BookOpen className="w-12 h-12 text-emerald-600/20" />
                      <p className="text-sm font-medium">ليس لديك أي مقررات حفظ مسجلة حالياً.</p>
                      <p className="text-xs text-gray-400">يرجى تسجيل أول سورة وآيات لبدء التكرار والتدريب.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                      {state.blocks.map((block) => {
                        const sNum = block.surahId;
                        const sName = getSurahName(sNum);
                        const isArchived = block.status === "completed";

                        return (
                          <div 
                            key={block.id}
                            className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                              isArchived 
                                ? "bg-gray-50 border-gray-200 opacity-60" 
                                : "bg-white border-emerald-100/50 shadow-sm"
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-gray-800">سورة {sName}</h4>
                                <span className={`text-[9px] px-2 py-0.5 font-bold rounded ${
                                  isArchived ? "bg-gray-200 text-gray-650" : "bg-emerald-100 text-emerald-900"
                                }`}>
                                  {isArchived ? "أرشيف مكتمل" : "نشط ومتابع"}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500">من آية {block.fromAyah} إلى آية {block.toAyah} (إجمالي {block.toAyah - block.fromAyah + 1} آية)</p>
                              <p className="text-[10px] text-gray-400 font-mono">تاريخ البداية: {block.startDate} • التكرار اليومي الأول: {block.repetitionTarget}</p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button 
                                onClick={() => navigateToMushaf(block.surahId, block.fromAyah)}
                                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition"
                                title="المصحف"
                              >
                                المصحف 📖
                              </button>

                              <button 
                                onClick={() => handleToggleBlockStatus(block.id)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                                  isArchived 
                                    ? "bg-amber-50 hover:bg-amber-100 text-amber-800" 
                                    : "bg-emerald-100 hover:bg-emerald-200 text-emerald-900"
                                }`}
                              >
                                {isArchived ? "تنشيط المقرر" : "إتمام المقرر"}
                              </button>

                              {deletingBlockId === block.id ? (
                                <div className="flex items-center gap-1.5 bg-red-50 p-1.5 rounded-xl border border-red-200 animate-fade-in">
                                  <span className="text-[11px] font-bold text-red-800">تأكيد الحذف؟</span>
                                  <button 
                                    onClick={() => handleDeleteBlock(block.id)}
                                    className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                                  >
                                    حذف
                                  </button>
                                  <button 
                                    onClick={() => setDeletingBlockId(null)}
                                    className="px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-bold transition cursor-pointer"
                                  >
                                    إلغاء
                                  </button>
                                </div>
                              ) : (
                                <button 
                                  onClick={() => setDeletingBlockId(block.id)}
                                  className="p-2 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-xl transition cursor-pointer"
                                  title="حذف المقرر"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 3: SMART REVIEW AGENDA (مستويات المراجعة) */}
          {activeTab === "review" && (
            <motion.div 
              key="tab-review"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Top intro */}
              <div className="bg-emerald-800 text-white rounded-3xl p-6 shadow-sm space-y-2">
                <h3 className="text-xl font-serif font-bold">🔁 خطة المراجعة اليومية ومتابعة مقرر المراجعة الرئيسي</h3>
                <p className="text-xs text-emerald-100 leading-relaxed">
                  يقوم رفيق الحافظ بجدولة مراجعتك اليومية بدقة، وحساب نسبة الإنجاز المئوية المنجزة من مقرر المراجعة الرئيسي المستهدف (مثل من سورة الناس إلى سورة الكهف) بناءً على وردك اليومي المخصص.
                </p>
              </div>

              {/* MAIN REVIEW ASSIGNMENT & PROGRESS PERCENTAGE CARD */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 space-y-6">
                {/* Card Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-100 pb-4">
                  <div className="space-y-1">
                    <h3 className="text-xl font-serif font-bold text-emerald-900 flex items-center gap-2">
                      <span>📊 نسبة ما تم مراجعته من مقرر المراجعة الرئيسي</span>
                    </h3>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      حدد نطاق مقرر المراجعة الرئيسي (مثال: من سورة الناس إلى سورة الكهف) وقسّمه لمقدار يومي لمتابعة نسبة الإنجاز يومياً.
                    </p>
                  </div>

                  <div className="bg-emerald-50 px-4 py-2.5 rounded-2xl border border-emerald-200/80 flex items-center gap-2 self-start md:self-auto shrink-0 shadow-2xs">
                    <span className="text-xs font-bold text-emerald-800">نسبة الإنجاز الكلية:</span>
                    <span className="text-2xl font-bold font-mono text-emerald-700">{mainProgressPercentage}%</span>
                  </div>
                </div>

                {/* Scope & Daily Portion Selection Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50/70 p-4 rounded-2xl border border-gray-100">
                  {/* Start Surah */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700 block">بداية المقرر الرئيسي (من سورة)</label>
                    <select
                      value={mainStartSurahId}
                      onChange={(e) => {
                        const sId = Number(e.target.value);
                        const updated = {
                          ...state,
                          profile: {
                            ...userProfile,
                            mainReviewStartSurahId: sId
                          }
                        };
                        updateState(updated);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-white text-xs font-bold text-gray-800 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                    >
                      {SURAHS.map((s) => (
                        <option key={`start-${s.id}`} value={s.id}>
                          {s.id}. سورة {s.name} ({s.ayahs} آية)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* End Surah */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700 block">نهاية المقرر الرئيسي (إلى سورة)</label>
                    <select
                      value={mainEndSurahId}
                      onChange={(e) => {
                        const sId = Number(e.target.value);
                        const updated = {
                          ...state,
                          profile: {
                            ...userProfile,
                            mainReviewEndSurahId: sId
                          }
                        };
                        updateState(updated);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-white text-xs font-bold text-gray-800 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                    >
                      {SURAHS.map((s) => (
                        <option key={`end-${s.id}`} value={s.id}>
                          {s.id}. سورة {s.name} ({s.ayahs} آية)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Daily Amount */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700 block">المقدار اليومي المخصص (صفحات/يوم)</label>
                    <input
                      type="number"
                      min="1"
                      max="604"
                      value={mainDailyPortion}
                      onChange={(e) => {
                        const val = Math.max(1, Number(e.target.value) || 1);
                        const updated = {
                          ...state,
                          profile: {
                            ...userProfile,
                            reviewOnlyDailyAmountValue: val
                          }
                        };
                        updateState(updated);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-white text-xs font-bold text-center font-mono focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Progress Visualizer & Interactive Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Visualizer & Details */}
                  <div className="md:col-span-3 bg-gradient-to-br from-emerald-900 to-emerald-950 text-white p-5 rounded-2xl shadow-md space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-800/80 pb-3">
                      <div>
                        <span className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider block">نطاق المقرر الرئيسي المحدد</span>
                        <h4 className="text-lg font-serif font-bold text-white">
                          من سورة {getSurahName(mainStartSurahId)} إلى سورة {getSurahName(mainEndSurahId)}
                        </h4>
                      </div>
                      <div className="text-xs text-emerald-200 font-mono bg-emerald-800/60 px-3 py-1 rounded-xl border border-emerald-700/50">
                        الصفحات: من ص {mainStartPage} إلى ص {mainEndPage} ({totalPagesInMainAssignment} صفحة)
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold text-emerald-200">
                        <span>تم مراجعته: {reviewedPagesSoFar} من أصل {totalPagesInMainAssignment} صفحة</span>
                        <span className="font-mono text-emerald-300">{mainProgressPercentage}%</span>
                      </div>
                      <div className="w-full bg-emerald-950/80 rounded-full h-4 p-0.5 border border-emerald-700/50 overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-emerald-400 to-teal-300 h-full rounded-full transition-all duration-500 shadow-sm"
                          style={{ width: `${mainProgressPercentage}%` }}
                        />
                      </div>
                    </div>

                    {/* Metrics stats */}
                    <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
                      <div className="bg-emerald-800/40 p-2 rounded-xl border border-emerald-700/30">
                        <span className="text-[10px] text-emerald-300 block">تم مراجعته</span>
                        <span className="font-bold text-white text-sm font-mono">{reviewedPagesSoFar} صفحة</span>
                      </div>
                      <div className="bg-emerald-800/40 p-2 rounded-xl border border-emerald-700/30">
                        <span className="text-[10px] text-emerald-300 block">المتبقي من المقرر</span>
                        <span className="font-bold text-white text-sm font-mono">{remainingMainPages} صفحة</span>
                      </div>
                      <div className="bg-emerald-800/40 p-2 rounded-xl border border-emerald-700/30">
                        <span className="text-[10px] text-emerald-300 block">الأيام المتبقية المقدرة</span>
                        <span className="font-bold text-amber-300 text-sm font-mono">{estimatedDaysRemaining} يوم</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions column */}
                  <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex flex-col justify-between space-y-3">
                    <div className="space-y-1 text-right">
                      <h5 className="text-xs font-bold text-emerald-950">تحديث الإنجاز اليومي</h5>
                      <p className="text-[11px] text-gray-600 leading-snug">
                        عند إتمام ورد اليوم ({mainDailyPortion} صفحة)، اضغط هنا لتحديث نسبة إنجازك تلقائياً.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <button
                        onClick={handleRecordMainReviewDailyPortion}
                        className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>إتمام ورد اليوم (+{mainDailyPortion} ص)</span>
                      </button>

                      <button
                        onClick={handleResetMainReviewProgress}
                        className="w-full py-1.5 bg-white hover:bg-gray-100 text-gray-600 border border-gray-300 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>إعادة ضبط الحسبة</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Intensive scheduled reviews list without (الأيام 2-10) */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 space-y-4">
                <h4 className="text-lg font-serif font-bold text-emerald-900 border-b border-gray-100 pb-2 flex items-center justify-between">
                  <span>🔥 مراجعة مكثفة مستحقة</span>
                  <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-sans font-bold">يومي متتالي</span>
                </h4>

                {todayTasks.filter(t => t.type === "review" && t.offset <= 10).length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-8">لا يوجد مراجعات مكثفة مستحقة اليوم.</p>
                ) : (
                  <div className="space-y-2">
                    {todayTasks.filter(t => t.type === "review" && t.offset <= 10).map(t => (
                      <div key={t.block.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl text-xs">
                        <div>
                          <span className="font-bold text-gray-800">سورة {getSurahName(t.block.surahId)}</span>
                          <span className="text-gray-400 font-mono block">من آية {t.block.fromAyah} إلى {t.block.toAyah} (يوم {t.offset})</span>
                        </div>
                        <button 
                          onClick={() => handleToggleReviewComplete(t.block.id)}
                          className={`px-3 py-1 font-bold rounded-lg border ${
                            t.isCompleted ? "bg-emerald-600 text-white border-emerald-700" : "bg-white hover:bg-emerald-50 text-gray-700 border-gray-300"
                          }`}
                        >
                          {t.isCompleted ? "✓ تمت" : "تعيين مراجعة"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* TAB 4: RECITATION PRAYER DISTRIBUTION */}
          {activeTab === "prayers" && (
            <motion.div 
              key="tab-prayers"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Role & Sunnah Header Card */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                <div className="md:col-span-2 space-y-1">
                  <h3 className="text-lg font-serif font-bold text-emerald-900 flex items-center gap-1.5">
                    <span>🕌 جدول الصلوات الخمس والسنن الرواتب ومحرك التثبيت</span>
                  </h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    منظم لصلوات اليوم الخمس بالترتيب الشرعي، مع سننها القبلية والبعدية وتوزيع مقاطع المراجعة على ركعات الفرض والسنن.
                  </p>
                </div>

                <div className="bg-gray-50 p-2.5 rounded-2xl border border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-600 mr-2">دوري في الصلاة:</span>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => {
                        const updated = { ...state, profile: { ...userProfile, prayerRole: "imam" as "imam" | "maamoom" } };
                        updateState(logActivity(updated, "تعديل الإعدادات في الصلاة", "تم تبديل دور الصلاة إلى: إمام"));
                      }}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                        userProfile.prayerRole === "imam" 
                          ? "bg-emerald-700 text-white shadow-sm" 
                          : "bg-white text-gray-600 border hover:bg-gray-100"
                      }`}
                    >
                      إمــام
                    </button>
                    <button 
                      onClick={() => {
                        const updated = { ...state, profile: { ...userProfile, prayerRole: "maamoom" as "imam" | "maamoom" } };
                        updateState(logActivity(updated, "تعديل الإعدادات في الصلاة", "تم تبديل دور الصلاة إلى: مأموم"));
                      }}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                        userProfile.prayerRole === "maamoom" 
                          ? "bg-emerald-700 text-white shadow-sm" 
                          : "bg-white text-gray-600 border hover:bg-gray-100"
                      }`}
                    >
                      مأمــوم
                    </button>
                  </div>
                </div>
              </div>

              {/* 5 Daily Prayers Detailed Breakdown */}
              <div className="space-y-5">
                {[
                  { 
                    key: "الفجر", 
                    name: "1. صلاة الفجر", 
                    timeBadge: "الفجر",
                    icon: "🌅", 
                    color: "border-sky-200 bg-sky-50/20",
                    badgeColor: "bg-sky-100 text-sky-900",
                    sunnahSummary: "سنة الفجر القبلية (ركعتان) ➔ فرض الفجر (ركعتان)" 
                  },
                  { 
                    key: "الضحى", 
                    name: "سنة الضحى (صلاة الأوابين)", 
                    timeBadge: "الضحى",
                    icon: "☀️", 
                    color: "border-teal-200 bg-teal-50/20",
                    badgeColor: "bg-teal-100 text-teal-900",
                    sunnahSummary: `نافلة الضحى (${userProfile.duhaRakats ?? 4} ركعات: من ركعتين إلى 8 ركعات حسب إعداداتك)` 
                  },
                  { 
                    key: "الظهر", 
                    name: "2. صلاة الظهر", 
                    timeBadge: "الظهر",
                    icon: "☀️", 
                    color: "border-amber-200 bg-amber-50/20",
                    badgeColor: "bg-amber-100 text-amber-900",
                    sunnahSummary: "سنة الظهر القبلية (4 ركعات: ركعتين ركعتين) ➔ فرض الظهر (4 ركعات) ➔ سنة الظهر البعدية (ركعتان)" 
                  },
                  { 
                    key: "العصر", 
                    name: "3. صلاة العصر", 
                    timeBadge: "العصر",
                    icon: "🌤️", 
                    color: "border-orange-200 bg-orange-50/20",
                    badgeColor: "bg-orange-100 text-orange-900",
                    sunnahSummary: "فرض العصر (4 ركعات) (صلاة سرية)" 
                  },
                  { 
                    key: "المغرب", 
                    name: "4. صلاة المغرب", 
                    timeBadge: "المغرب",
                    icon: "🌅", 
                    color: "border-emerald-200 bg-emerald-50/20",
                    badgeColor: "bg-emerald-100 text-emerald-900",
                    sunnahSummary: "فرض المغرب (3 ركعات) ➔ سنة المغرب البعدية (ركعتان)" 
                  },
                  { 
                    key: "العشاء", 
                    name: "5. صلاة العشاء والقيام", 
                    timeBadge: "العشاء",
                    icon: "🌙", 
                    color: "border-indigo-200 bg-indigo-50/20",
                    badgeColor: "bg-indigo-100 text-indigo-900",
                    sunnahSummary: "فرض العشاء (4 ركعات) ➔ سنة العشاء البعدية (ركعتان) ➔ صلاة الوتر وقيام الليل" 
                  }
                ].map((pInfo) => {
                  const prayerSlots = distributionSlots.filter(s => s.parentPrayer === pInfo.key);
                  
                  return (
                    <div key={pInfo.key} className={`bg-white rounded-3xl p-5 shadow-sm border-2 ${pInfo.color} space-y-4`}>
                      {/* Prayer Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl">{pInfo.icon}</span>
                          <div>
                            <h4 className="text-lg font-serif font-bold text-gray-900 flex items-center gap-2">
                              <span>{pInfo.name}</span>
                              <span className={`text-xs font-sans px-2.5 py-0.5 rounded-full font-bold ${pInfo.badgeColor}`}>
                                {pInfo.timeBadge}
                              </span>
                            </h4>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">
                              ترتيب الصلاة: <span className="text-emerald-950 font-bold">{pInfo.sunnahSummary}</span>
                            </p>
                          </div>
                        </div>

                        <span className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-xl font-bold self-start sm:self-auto shrink-0">
                          عدد مقاطع المراجعة: {prayerSlots.length}
                        </span>
                      </div>

                      {/* Reminder Info Banner */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-emerald-50/60 p-2.5 rounded-2xl border border-emerald-100 text-xs">
                        <div className="flex items-center gap-1.5 font-semibold text-emerald-900">
                          <Clock className="w-4 h-4 text-emerald-700 shrink-0" />
                          <span>وقت التذكير المفضل:</span>
                          <span className="font-bold text-emerald-950 bg-emerald-100/80 px-2 py-0.5 rounded-lg border border-emerald-200">
                            قبل وقت الصلاة بـ {getPrayerOffsetMinutes(userProfile, pInfo.key)} دقيقة
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleTestPrayerReminderNotification(pInfo.key, distributionSlots)}
                          className="text-[11px] font-bold text-emerald-800 hover:text-emerald-950 bg-white px-3 py-1 rounded-xl border border-emerald-200 shadow-2xs transition flex items-center gap-1 self-start sm:self-auto cursor-pointer"
                        >
                          <Bell className="w-3 h-3 text-emerald-600 shrink-0" />
                          إرسال تنبيه تجريبي 🔔
                        </button>
                      </div>

                      {/* Prayer Slots List */}
                      {prayerSlots.length === 0 ? (
                        <div className="p-3 bg-gray-50/70 rounded-2xl border border-dashed border-gray-200 text-center text-xs text-gray-500 font-medium">
                          لا توجد مراجعات مخصصة لهذه الصلاة حالياً، يمكنك مراجعتها تلاوة أو أداء السنن والنوافل.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {prayerSlots.map((slot) => {
                            const isSunnah = slot.prayerType === "sunnah";
                            const isQiyam = slot.prayerType === "qiyam";

                            return (
                              <div 
                                key={slot.id}
                                className={`p-3.5 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                                  isSunnah 
                                    ? "bg-amber-50/40 border-amber-200/70" 
                                    : isQiyam 
                                      ? "bg-purple-50/40 border-purple-200/70" 
                                      : "bg-emerald-50/30 border-emerald-200/70"
                                }`}
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-bold text-gray-900">{slot.prayerName}</span>
                                    <span className={`text-[9px] px-2 py-0.5 font-bold rounded-full ${
                                      isSunnah 
                                        ? "bg-amber-100 text-amber-900" 
                                        : isQiyam 
                                          ? "bg-purple-100 text-purple-900" 
                                          : "bg-emerald-100 text-emerald-900"
                                    }`}>
                                      {isSunnah ? "سنة " : isQiyam ? "قيام " : "الفرض "}
                                    </span>
                                    <span className="text-[10px] text-gray-400 font-mono">الركعة {slot.rakahNumber}</span>
                                  </div>
                                  <p className="text-xs text-gray-600 font-medium">سورة التلاوة المستهدفة:</p>
                                  <p className="text-xs text-emerald-900 font-bold bg-white p-1.5 pr-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                                    {slot.assignedContent}
                                  </p>
                                </div>

                                <button 
                                  onClick={() => {
                                    const match = slot.assignedContent.match(/سورة ([\u0600-\u06FF]+)/);
                                    if (match && match[1]) {
                                      const found = SURAHS.find(s => s.name === match[1]);
                                      if (found) {
                                        navigateToMushaf(found.id, 1);
                                        return;
                                      }
                                    }
                                    setActiveTab("mushaf");
                                  }}
                                  className="p-1 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-lg border border-emerald-200 transition shrink-0 self-center"
                                >
                                  المصحف ➔
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* TAB 5: MUSHAF VIEWER & QURAN READER */}
          {activeTab === "mushaf" && (
            <motion.div 
              key="tab-mushaf"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Controls bar */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-lg font-serif font-bold text-emerald-900 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-emerald-700" />
                      <span>📘 المصحف الشريف (المدينة المنورة - طبعة مجمع الملك فهد)</span>
                    </h3>
                    <p className="text-xs text-gray-500">تصفح المصحف كاملاً (604 صفحة) بقراءة مصورة أو نصية تفاعلية مع حماية أوفلاين</p>
                  </div>

                  {/* Mode switcher tabs & Quick Night Mode toggle */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        const updated = { ...state, profile: { ...userProfile, mushafNightMode: !userProfile.mushafNightMode } };
                        updateState(updated);
                      }}
                      title="التحكم بالوضع الليلي للمصحف"
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border shrink-0 ${
                        userProfile.mushafNightMode 
                          ? "bg-slate-900 text-amber-300 border-amber-400/40 shadow-inner" 
                          : "bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100"
                      }`}
                    >
                      {userProfile.mushafNightMode ? <Moon className="w-3.5 h-3.5 text-amber-300 fill-amber-300/30" /> : <Sun className="w-3.5 h-3.5 text-amber-600" />}
                      <span>{userProfile.mushafNightMode ? "الوضع الليلي 🌙" : "الوضع العادي ☀️"}</span>
                    </button>

                    <div className="flex gap-1.5 bg-gray-100 p-1 rounded-2xl shrink-0">
                      <button 
                        onClick={() => { setMushafViewMode("image"); setMushafImgFailed(false); }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                          mushafViewMode === "image" ? "bg-emerald-800 text-white shadow-sm" : "text-gray-600 hover:text-emerald-800"
                        }`}
                      >
                        <span>مصحف مصوّر</span>
                      </button>
                      <button 
                        onClick={() => setMushafViewMode("offline")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                          mushafViewMode === "offline" ? "bg-emerald-800 text-white shadow-sm" : "text-gray-600 hover:text-emerald-800"
                        }`}
                      >
                        <span>فهرس السور والنصوص</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100 font-sans text-xs">
                  
                  {/* Select Surah for quick jump */}
                  <div className="space-y-1">
                    <label className="font-bold text-gray-600 block">اختر السورة للانتقال</label>
                    <select 
                      value={searchSurahId}
                      onChange={(e) => {
                        const sId = Number(e.target.value);
                        setSearchSurahId(sId);
                        const s = getSurahById(sId);
                        if (s) {
                          setMushafPage(s.startPage);
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white font-medium"
                    >
                      {SURAHS.map((s) => (
                        <option key={s.id} value={s.id}>{s.id}. سورة {s.name} (ص {s.startPage})</option>
                      ))}
                    </select>
                  </div>

                  {/* Manual Page Number Input */}
                  <div className="space-y-1">
                    <label className="font-bold text-gray-600 block">رقم الصفحة المباشر</label>
                    <div className="flex gap-2 items-center">
                      <input 
                        type="number"
                        min="1"
                        max="604"
                        value={mushafPage}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (val >= 1 && val <= 604) {
                            setMushafPage(val);
                          }
                        }}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-xl text-center focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white font-mono font-bold text-emerald-900"
                      />
                      <span className="text-gray-400 font-bold whitespace-nowrap">/ 604</span>
                    </div>
                  </div>

                  {/* Quick Jump Shortcuts (+10 / -10) */}
                  <div className="space-y-1">
                    <label className="font-bold text-gray-600 block">تنقل سريع للصفحات</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button 
                        onClick={() => setMushafPage(p => Math.max(1, p - 10))}
                        className="py-1.5 bg-white hover:bg-emerald-50 border border-gray-200 text-gray-700 font-bold rounded-xl text-center transition"
                      >
                        10- صفحات
                      </button>
                      <button 
                        onClick={() => setMushafPage(p => Math.min(604, p + 10))}
                        className="py-1.5 bg-white hover:bg-emerald-50 border border-gray-200 text-gray-700 font-bold rounded-xl text-center transition"
                      >
                        10+ صفحات
                      </button>
                    </div>
                  </div>

                  {/* Cache / Offline Marker */}
                  <div className="space-y-1 flex flex-col justify-end">
                    <button 
                      onClick={() => {
                        const isCached = state.mushafCache.includes(mushafPage);
                        let updatedCached: number[];
                        if (isCached) {
                          updatedCached = state.mushafCache.filter(p => p !== mushafPage);
                        } else {
                          updatedCached = [...state.mushafCache, mushafPage];
                        }
                        updateState({ ...state, mushafCache: updatedCached });
                      }}
                      className={`w-full py-2 px-3 border rounded-xl font-bold flex items-center justify-center gap-1.5 transition ${
                        state.mushafCache.includes(mushafPage) 
                          ? "bg-emerald-100 border-emerald-300 text-emerald-900" 
                          : "bg-white hover:bg-gray-100 border-gray-300 text-gray-700"
                      }`}
                    >
                      <Check className={`w-3.5 h-3.5 ${state.mushafCache.includes(mushafPage) ? "opacity-100" : "opacity-30"}`} />
                      <span>{state.mushafCache.includes(mushafPage) ? "صفحة مرجعية محفوظة" : "حفظ الصفحة للمفضلة"}</span>
                    </button>
                  </div>

                </div>
              </div>

              {/* MUSHAF DIGITAL CANVAS Frame */}
              <div className={`min-h-[620px] border-4 shadow-lg rounded-3xl p-3 md:p-6 flex flex-col md:flex-row justify-between items-center gap-4 relative transition-colors duration-300 ${
                userProfile.mushafNightMode 
                  ? "bg-[#111317] border-[#252830]" 
                  : "bg-[#f0ede6] border-[#3a352c]/20"
              }`}>
                
                {/* Navigation: Previous Page Button (Turn Right in RTL) */}
                <button 
                  onClick={() => mushafPage > 1 && setMushafPage(prev => prev - 1)}
                  disabled={mushafPage === 1}
                  title="الصفحة السابقة"
                  className={`p-3 rounded-full shadow-md transition shrink-0 flex items-center justify-center disabled:opacity-30 ${
                    userProfile.mushafNightMode 
                      ? "bg-[#1e2229] hover:bg-[#282d37] text-amber-300 border border-gray-800" 
                      : "bg-[#e2dec9] hover:bg-[#d5d0b6] text-[#4c4436]"
                  }`}
                >
                  <ChevronRight className="w-7 h-7 shrink-0" />
                </button>

                {/* Main Render Sheet */}
                <div className={`flex-1 w-full rounded-2xl shadow-sm p-4 md:p-6 min-h-[520px] text-center flex flex-col justify-between items-center relative select-text border transition-colors duration-300 ${
                  userProfile.mushafNightMode 
                    ? "bg-[#181a1f] border-[#282d36] text-gray-100" 
                    : "bg-white border-[#e2dec9] text-gray-900"
                }`}>
                  
                  {mushafViewMode === "image" && !mushafImgFailed ? (
                    <div className="w-full flex flex-col items-center relative">
                      {/* Page Header Info */}
                      <div className={`text-[11px] font-bold font-serif w-full mb-3 flex items-center justify-between border-b pb-2 px-1 ${
                        userProfile.mushafNightMode ? "border-gray-800 text-amber-300" : "border-gray-100 text-emerald-900"
                      }`}>
                        <span className={`px-2.5 py-0.5 rounded-lg border ${
                          userProfile.mushafNightMode ? "bg-slate-900 border-slate-700 text-amber-300" : "bg-emerald-50 border-emerald-100 text-emerald-900"
                        }`}>الصفحة {mushafPage}</span>
                        <span className={`hidden sm:inline ${userProfile.mushafNightMode ? "text-gray-400" : "text-gray-500"}`}>مصحف مجمع الملك فهد لطباعة المصحف الشريف</span>
                        <span className={`px-2.5 py-0.5 rounded-lg border ${
                          userProfile.mushafNightMode ? "bg-slate-900 border-slate-700 text-amber-300" : "bg-emerald-50 border-emerald-100 text-emerald-900"
                        }`}>الحزب {Math.ceil(mushafPage / 10)}</span>
                      </div>
                      
                      {/* Loading Spinner */}
                      {mushafImgLoading && (
                        <div className="py-24 flex flex-col items-center justify-center space-y-3">
                          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                          <p className={`text-xs font-bold ${userProfile.mushafNightMode ? "text-amber-300" : "text-gray-500"}`}>جاري تحميل صورة الصفحة {mushafPage} من المصحف...</p>
                        </div>
                      )}

                      {/* Multi-CDN High-Quality Page Image (With Night Mode Filter) */}
                      <img 
                        referrerPolicy="no-referrer"
                        src={QURAN_PAGE_CDNS[mushafCdnIndex](mushafPage)} 
                        alt={`Quran Page ${mushafPage}`} 
                        style={userProfile.mushafNightMode ? { filter: "invert(0.92) hue-rotate(180deg) brightness(0.88) contrast(1.15)" } : undefined}
                        className={`max-h-[72vh] w-auto object-contain mx-auto transition-all duration-300 ${
                          mushafImgLoading ? "opacity-0 absolute inset-0" : "opacity-100"
                        }`}
                        onLoad={() => {
                          setMushafImgLoading(false);
                          setMushafImgFailed(false);
                        }}
                        onError={() => {
                          if (mushafCdnIndex < QURAN_PAGE_CDNS.length - 1) {
                            setMushafCdnIndex(prev => prev + 1);
                            setMushafImgLoading(true);
                          } else {
                            setMushafImgLoading(false);
                            setMushafImgFailed(true);
                          }
                        }}
                      />
                    </div>
                  ) : (
                    /* Digital Text & Surahs Explorer Mode */
                    <div className="w-full text-right p-2 md:p-4 space-y-6">
                      
                      {/* Header for text mode */}
                      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3 ${
                        userProfile.mushafNightMode ? "border-gray-800" : "border-gray-200"
                      }`}>
                        <div>
                          <h4 className={`text-xl font-serif font-bold ${userProfile.mushafNightMode ? "text-amber-300" : "text-emerald-950"}`}>
                            📖 الصفحة {mushafPage} (النص الإلكتروني المكتوب)
                          </h4>
                          <p className={`text-xs ${userProfile.mushafNightMode ? "text-gray-400" : "text-gray-500"}`}>تلاوة وقراءة النص العثماني لآيات الصفحة مباشرة</p>
                        </div>

                        <button 
                          onClick={() => {
                            setMushafCdnIndex(0);
                            setMushafImgFailed(false);
                            setMushafImgLoading(true);
                            setMushafViewMode("image");
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition shrink-0 ${
                            userProfile.mushafNightMode ? "bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700" : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200"
                          }`}
                        >
                          🔄 إعادة تجربة جلب الصورة المصورة
                        </button>
                      </div>

                      {/* Digital Text Viewer / Loading state */}
                      {loadingPageText ? (
                        <div className="py-16 text-center space-y-3">
                          <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                          <p className={`text-xs font-bold ${userProfile.mushafNightMode ? "text-amber-300" : "text-gray-500"}`}>جاري تحميل الآيات العثمانية للصفحة {mushafPage}...</p>
                        </div>
                      ) : pageTextData && pageTextData.ayahs.length > 0 ? (
                        <div className={`p-6 rounded-2xl border space-y-4 ${
                          userProfile.mushafNightMode ? "bg-[#21252b] border-[#2e343f]" : "bg-[#fcfbf9] border-[#e8e4d8]"
                        }`}>
                          <div className={`text-center font-serif text-lg font-bold py-2 rounded-xl border ${
                            userProfile.mushafNightMode ? "bg-emerald-950/80 text-amber-300 border-emerald-800/50" : "bg-emerald-50/80 text-emerald-900 border-emerald-100"
                          }`}>
                            سورة {pageTextData.surahName}
                          </div>

                          <div className={`leading-[2.6] text-xl font-serif text-justify dir-rtl p-2 ${
                            userProfile.mushafNightMode ? "text-amber-100" : "text-gray-900"
                          }`}>
                            {pageTextData.ayahs.map((a, idx) => (
                              <span key={idx} className="inline">
                                <span className={`transition rounded px-1 ${
                                  userProfile.mushafNightMode ? "hover:bg-slate-800" : "hover:bg-amber-100"
                                }`}>{a.text}</span>
                                <span className={`inline-flex items-center justify-center w-7 h-7 mx-1 text-xs font-bold rounded-full border font-mono align-middle ${
                                  userProfile.mushafNightMode ? "bg-amber-950/60 text-amber-300 border-amber-800" : "bg-emerald-50 text-emerald-800 border-emerald-200"
                                }`}>
                                  {a.numberInSurah}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        /* Index of Surahs Fallback */
                        <div className="space-y-4">
                          <h4 className={`text-sm font-bold ${userProfile.mushafNightMode ? "text-amber-300" : "text-gray-700"}`}>فهرس سور القرآن الكريم:</h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                            {SURAHS.map((s) => (
                              <div 
                                key={s.id} 
                                onClick={() => {
                                  setSearchSurahId(s.id);
                                  setMushafPage(s.startPage);
                                  setMushafViewMode("image");
                                }}
                                className={`p-3 border rounded-xl cursor-pointer transition ${
                                  userProfile.mushafNightMode ? "bg-[#21252b] border-[#2e343f] hover:bg-slate-800 text-amber-200" : "bg-gray-50 hover:border-emerald-600 hover:bg-emerald-50 text-gray-800"
                                }`}
                              >
                                <span className="text-xs font-mono text-gray-400 font-normal ml-1.5">#{s.id}</span>
                                <span className={`font-bold text-sm ${userProfile.mushafNightMode ? "text-amber-300" : "text-emerald-900"}`}>سورة {s.name}</span>
                                <span className="text-[10px] text-gray-400 block">صفحة {s.startPage} • {s.ayahs} آية</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  )}

                  {/* Page Footer Navigation Bar */}
                  <div className={`w-full text-xs font-bold font-sans pt-3 border-t flex flex-col sm:flex-row justify-between items-center gap-2 mt-3 ${
                    userProfile.mushafNightMode ? "border-gray-800 text-gray-400" : "border-gray-100 text-gray-500"
                  }`}>
                    <span>الصفحة {mushafPage} من 604</span>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setMushafPage(p => Math.max(1, p - 1))}
                        disabled={mushafPage === 1}
                        className={`px-3 py-1 rounded-lg disabled:opacity-30 transition ${
                          userProfile.mushafNightMode ? "bg-slate-800 hover:bg-slate-700 text-amber-200" : "bg-gray-100 hover:bg-emerald-100 text-gray-700"
                        }`}
                      >
                        السابقة ➔
                      </button>
                      <button 
                        onClick={() => setMushafPage(p => Math.min(604, p + 1))}
                        disabled={mushafPage === 604}
                        className={`px-3 py-1 rounded-lg disabled:opacity-30 transition ${
                          userProfile.mushafNightMode ? "bg-slate-800 hover:bg-slate-700 text-amber-200" : "bg-gray-100 hover:bg-emerald-100 text-gray-700"
                        }`}
                      >
                        ⬅ التالية
                      </button>
                    </div>
                    <span>الحزب {Math.ceil(mushafPage / 10)}</span>
                  </div>

                </div>

                {/* Navigation: Next Page Button (Turn Left in RTL) */}
                <button 
                  onClick={() => mushafPage < 604 && setMushafPage(prev => prev + 1)}
                  disabled={mushafPage === 604}
                  title="الصفحة التالية"
                  className={`p-3 rounded-full shadow-md transition shrink-0 flex items-center justify-center disabled:opacity-30 ${
                    userProfile.mushafNightMode 
                      ? "bg-[#1e2229] hover:bg-[#282d37] text-amber-300 border border-gray-800" 
                      : "bg-[#e2dec9] hover:bg-[#d5d0b6] text-[#4c4436]"
                  }`}
                >
                  <ChevronLeft className="w-7 h-7 shrink-0" />
                </button>

              </div>
            </motion.div>
          )}

          {/* TAB 6: SETTINGS, BACKUP, & DATA SYNC */}
          {activeTab === "settings" && (
            <motion.div 
              key="tab-settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Active Track Selection Card */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                      <Compass className="w-5 h-5 shrink-0" />
                    </div>
                    <div>
                      <h3 className="text-lg font-serif font-bold text-emerald-900">
                        🔀 تحديد مسار البرنامج النشط
                      </h3>
                      <p className="text-xs text-gray-500">اختر المسار الذي يناسب طريقة المراجعة والحفظ المطلوبة</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  {/* Option 1: Hifz & Review */}
                  <button
                    type="button"
                    onClick={() => {
                      const updated = { ...state, profile: { ...userProfile, appTrack: "hifz_and_review" as const } };
                      updateState(logActivity(updated, "تحديد المسار", "تم اختيار مسار الحفظ والمراجعة"));
                    }}
                    className={`p-5 rounded-2xl border text-right transition flex flex-col justify-between space-y-3 cursor-pointer ${
                      (userProfile.appTrack || "hifz_and_review") === "hifz_and_review"
                        ? "bg-emerald-50/90 border-emerald-600 shadow-sm ring-2 ring-emerald-500/20"
                        : "bg-gray-50 border-gray-200 hover:bg-gray-100/80"
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-950 text-sm flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                          مسار الحفظ والمراجعة
                        </span>
                        {(userProfile.appTrack || "hifz_and_review") === "hifz_and_review" && (
                          <span className="text-[10px] bg-emerald-700 text-white font-bold px-2.5 py-0.5 rounded-full">نشط حالياً</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        مخصص للطلاب للحفظ الجديد مع عداد مائة التكرار والمراجعات التراكمية المتباعدة تلقائياً.
                      </p>
                    </div>
                  </button>

                  {/* Option 2: Review Only */}
                  <button
                    type="button"
                    onClick={() => {
                      const updated = { ...state, profile: { ...userProfile, appTrack: "review_only" as const } };
                      updateState(logActivity(updated, "تحديد المسار", "تم اختيار مسار المراجعة فقط"));
                    }}
                    className={`p-5 rounded-2xl border text-right transition flex flex-col justify-between space-y-3 cursor-pointer ${
                      userProfile.appTrack === "review_only"
                        ? "bg-blue-50/90 border-blue-600 shadow-sm ring-2 ring-blue-500/20"
                        : "bg-gray-50 border-gray-200 hover:bg-gray-100/80"
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-blue-950 text-sm flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                          مسار المراجعة فقط
                        </span>
                        {userProfile.appTrack === "review_only" && (
                          <span className="text-[10px] bg-blue-700 text-white font-bold px-2.5 py-0.5 rounded-full">نشط حالياً</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        مخصص للحُفّاظ لمراجعة القرآن كاملاً بتسلسل محدد (من البقرة إلى الناس أو العكس أو بالسورة والآيات) وتوزيعه على الصلوات.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Profile Config */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 space-y-4">
                <h3 className="text-lg font-serif font-bold text-emerald-900 border-b border-gray-100 pb-3">
                  ⚙️ إعدادات حساب الحافظ الشخصي
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 block">اسم الحافظ الكريم</label>
                    <input 
                      type="text" 
                      value={userProfile.name}
                      onChange={(e) => {
                        const updated = { ...state, profile: { ...userProfile, name: e.target.value } };
                        updateState(updated);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-gray-50"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 block">دور ومسؤلية القراءة في الصلاة</label>
                    <select 
                      value={userProfile.prayerRole}
                      onChange={(e) => {
                        const updated = { ...state, profile: { ...userProfile, prayerRole: e.target.value as "imam" | "maamoom" } };
                        updateState(updated);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-gray-50"
                    >
                      <option value="imam">إمام (مراجعة جهرية وسرية)</option>
                      <option value="maamoom">مأموم (أستمع جهراً ومراجعة سرية)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 block">عدد ركعات سنة الضحى</label>
                    <select 
                      value={userProfile.duhaRakats ?? 4}
                      onChange={(e) => {
                        const updated = { ...state, profile: { ...userProfile, duhaRakats: Number(e.target.value) } };
                        updateState(updated);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-gray-50 text-xs font-bold"
                    >
                      <option value="0">بدون (لا أرغب بالمراجعة في صلاة الضحى)</option>
                      <option value="2">ركعتان (أقل الضحى)</option>
                      <option value="4">4 ركعات (مستحسنة)</option>
                      <option value="6">6 ركعات</option>
                      <option value="8">8 ركعات (أكثرها وصحّت عن النبي ﷺ)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 block">عدد ركعات نافلة قيام الليل</label>
                    <select 
                      value={userProfile.nightPrayerRakats ?? 0}
                      onChange={(e) => {
                        const updated = { ...state, profile: { ...userProfile, nightPrayerRakats: Number(e.target.value) } };
                        updateState(updated);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-gray-50 text-xs font-bold"
                    >
                      <option value="0">بدون (لا أرغب بالمراجعة في قيام الليل)</option>
                      <option value="2">ركعتان</option>
                      <option value="4">4 ركعات</option>
                      <option value="8">8 ركعات (مستحسن)</option>
                      <option value="11">11 ركعة</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 block">اتجاه تفصيل الخطة ومسار الحفظ</label>
                    <select 
                      value={userProfile.memorizationDirection}
                      onChange={(e) => {
                        const updated = { ...state, profile: { ...userProfile, memorizationDirection: e.target.value as "forward" | "backward" } };
                        updateState(updated);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-gray-50"
                    >
                      <option value="forward">من الفاتحة إلى الناس (ترتيب تصاعدي)</option>
                      <option value="backward">من الناس إلى الفاتحة (ترتيب عكسي)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center space-x-2 space-x-reverse pt-2">
                  <input 
                    type="checkbox" 
                    id="sett_useSunnah" 
                    checked={userProfile.useSunnah}
                    onChange={(e) => {
                      const updated = { ...state, profile: { ...userProfile, useSunnah: e.target.checked } };
                      updateState(updated);
                    }}
                    className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500" 
                  />
                  <label htmlFor="sett_useSunnah" className="text-sm text-gray-600 font-semibold select-none">
                    استغلال السنن والرواتب المؤكدة في توزيع التلاوة اليومية
                  </label>
                </div>
              </div>

              {/* Mushaf Night Mode Toggle Card */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 bg-slate-900 text-amber-400 rounded-2xl shadow-sm">
                      <Moon className="w-5 h-5 shrink-0 fill-amber-400/20" />
                    </div>
                    <div>
                      <h3 className="text-lg font-serif font-bold text-emerald-900">
                        🌙 الوضع الليلي المخصص للمصحف الشريف
                      </h3>
                      <p className="text-xs text-gray-500">تغيير ألوان خلفية وصفحات المصحف لتكون مريحة للعين أثناء القراءة في الإضاءة الخافتة</p>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input 
                      type="checkbox" 
                      id="sett_mushafNightMode"
                      checked={!!userProfile.mushafNightMode}
                      onChange={(e) => {
                        const updated = { ...state, profile: { ...userProfile, mushafNightMode: e.target.checked } };
                        updateState(updated);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-800"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
                  <div className="space-y-0.5">
                    <label htmlFor="sett_mushafNightMode" className="text-xs font-bold text-gray-800 block cursor-pointer">
                      تفعيل الخلفية الليلية الداكنة لصفحات وآيات المصحف
                    </label>
                    <span className="text-[11px] text-gray-500 block leading-relaxed">
                      يعمل هذا الخيار على تكييف ألوان الصفحات المصورة والنصوص العثمانية تلقائياً لتقليل إجهاد العين وحمايتها ليلاً
                    </span>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1.5 rounded-xl border shrink-0 ${
                    userProfile.mushafNightMode 
                      ? "bg-slate-900 text-amber-300 border-slate-800" 
                      : "bg-amber-50 text-amber-800 border-amber-200"
                  }`}>
                    {userProfile.mushafNightMode ? "مفعّل 🌙" : "معطّل ☀️"}
                  </span>
                </div>
              </div>

              {/* Notification Control Card */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 space-y-5">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                      <BellRing className="w-5 h-5 shrink-0" />
                    </div>
                    <div>
                      <h3 className="text-lg font-serif font-bold text-emerald-900">
                        🔔 التحكم بالإشعارات والتنبيهات
                      </h3>
                      <p className="text-xs text-gray-500">إدارة تذكيرات الصلوات ومراجعة ورد القرآن الكريم</p>
                    </div>
                  </div>

                  {/* Permission Badge */}
                  {notifPermission === "granted" ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full border border-emerald-200">
                      <Check className="w-3.5 h-3.5" />
                      مفعّلة في المتصفح
                    </span>
                  ) : notifPermission === "denied" ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-full border border-red-200">
                      <AlertCircle className="w-3.5 h-3.5" />
                      محظورة بالمتصفح
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full border border-amber-200">
                      <BellOff className="w-3.5 h-3.5" />
                      غير مفعّلة
                    </span>
                  )}
                </div>

                {/* Permission Request / Test Notification Banner */}
                {notifPermission !== "granted" ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-amber-900">إذن الإشعارات لم يتم منحه بعد</p>
                      <p className="text-[11px] text-amber-700 leading-relaxed">
                        قم بتفعيل إذن الإشعارات لتصلك تنبيهات أوقات الأذان والتذكير بمراجعة أورادك اليومية.
                      </p>
                    </div>
                    <button
                      onClick={handleRequestNotifPermission}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-sm shrink-0 flex items-center gap-1.5"
                    >
                      <Bell className="w-4 h-4" />
                      منح إذن الإشعارات
                    </button>
                  </div>
                ) : (
                  <div className="p-3.5 bg-emerald-50/60 border border-emerald-100 rounded-2xl flex items-center justify-between gap-3">
                    <span className="text-xs text-emerald-900 font-medium">الإشعارات مفعّلة وجاهزة للعمل</span>
                    <button
                      onClick={handleTestNotification}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      إرسال إشعار تجريبي 🔔
                    </button>
                  </div>
                )}

                {/* Specific Toggles */}
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="space-y-0.5">
                      <label htmlFor="sett_enableNotif" className="text-xs font-bold text-gray-800 block cursor-pointer">
                        تفعيل التنبيهات العامة بالتطبيق
                      </label>
                      <span className="text-[10px] text-gray-500 block">السماح للتطبيق بإرسال التنبيهات المنبثقة</span>
                    </div>
                    <input 
                      type="checkbox" 
                      id="sett_enableNotif" 
                      checked={userProfile.enableNotifications !== false}
                      onChange={(e) => {
                        const updated = { ...state, profile: { ...userProfile, enableNotifications: e.target.checked } };
                        updateState(updated);
                        if (e.target.checked && notifPermission !== "granted") {
                          handleRequestNotifPermission();
                        }
                      }}
                      className="w-5 h-5 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 cursor-pointer" 
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="space-y-0.5">
                      <label htmlFor="sett_notifyPrayer" className="text-xs font-bold text-gray-800 block cursor-pointer">
                        تنبيهات أوقات الصلوات الخمس والأذان
                      </label>
                      <span className="text-[10px] text-gray-500 block">التذكير لدخول وقت الصلاة حسب موقعك الجغرافي</span>
                    </div>
                    <input 
                      type="checkbox" 
                      id="sett_notifyPrayer" 
                      checked={userProfile.notifyPrayerTimes !== false}
                      onChange={(e) => {
                        const updated = { ...state, profile: { ...userProfile, notifyPrayerTimes: e.target.checked } };
                        updateState(updated);
                      }}
                      className="w-5 h-5 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 cursor-pointer" 
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="space-y-0.5">
                      <label htmlFor="sett_notifyReview" className="text-xs font-bold text-gray-800 block cursor-pointer">
                        تنبيهات ورد الحفظ والتكرار المتباعد
                      </label>
                      <span className="text-[10px] text-gray-500 block">تذكير يومي بالمراجعات المقررة والمجموعات التراكمية</span>
                    </div>
                    <input 
                      type="checkbox" 
                      id="sett_notifyReview" 
                      checked={userProfile.notifyReviewReminder !== false}
                      onChange={(e) => {
                        const updated = { ...state, profile: { ...userProfile, notifyReviewReminder: e.target.checked } };
                        updateState(updated);
                      }}
                      className="w-5 h-5 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 cursor-pointer" 
                    />
                  </div>
                </div>
              </div>

              {/* Prayer Reminder Offset Customization Card */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 space-y-5">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 bg-amber-50 text-amber-700 rounded-2xl shadow-sm border border-amber-100">
                      <Clock className="w-5 h-5 shrink-0" />
                    </div>
                    <div>
                      <h3 className="text-lg font-serif font-bold text-emerald-900">
                        ⏰ وقت التذكير المفضل لمراجعة ورد الصلاة
                      </h3>
                      <p className="text-xs text-gray-500">
                        ضبط الموعد المفضل للتنبيه قبل كل صلاة لمراجعة الآيات المحددة لركعاتها قبل الأذان
                      </p>
                    </div>
                  </div>

                  {/* Master Toggle */}
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input 
                      type="checkbox" 
                      id="sett_notifyPrayerReviewBefore"
                      checked={userProfile.notifyPrayerReviewBefore !== false}
                      onChange={(e) => {
                        const updated = { ...state, profile: { ...userProfile, notifyPrayerReviewBefore: e.target.checked } };
                        updateState(updated);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-800"></div>
                  </label>
                </div>

                {/* Quick Global Offset Selector */}
                <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-emerald-950 block">وقت التذكير المفضل لجميع الصلوات (افتراضي عام)</span>
                    <span className="text-[11px] text-gray-600 block">تطبيق موعد تذكير موحد قبل موعد الأذان بطلبك (مثلاً قبل الصلاة بـ 15 دقيقة)</span>
                  </div>

                  <select
                    value={userProfile.prayerReminderOffsetMinutes || 15}
                    onChange={(e) => {
                      const minutes = Number(e.target.value);
                      const updatedOffsets = {
                        fajr: minutes,
                        dhuhr: minutes,
                        asr: minutes,
                        maghrib: minutes,
                        isha: minutes
                      };
                      const updated = { 
                        ...state, 
                        profile: { 
                          ...userProfile, 
                          prayerReminderOffsetMinutes: minutes,
                          prayerReminderOffsets: updatedOffsets
                        } 
                      };
                      updateState(updated);
                    }}
                    className="px-3 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-bold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs shrink-0 cursor-pointer"
                  >
                    <option value="5">قبل الصلاة بـ 5 دقائق</option>
                    <option value="10">قبل الصلاة بـ 10 دقائق</option>
                    <option value="15">قبل الصلاة بـ 15 دقيقة (المستحسن)</option>
                    <option value="20">قبل الصلاة بـ 20 دقيقة</option>
                    <option value="30">قبل الصلاة بـ 30 دقيقة</option>
                    <option value="45">قبل الصلاة بـ 45 دقيقة</option>
                  </select>
                </div>

                {/* Individual Prayer Time Adjusters */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-gray-700 font-serif">
                    تخصيص وقت التذكير لكل صلاة من الصلوات الخمس بشكل مستقل:
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { key: "fajr", name: "صلاة الفجر", icon: "🌅", arabic: "الفجر" },
                      { key: "dhuhr", name: "صلاة الظهر", icon: "☀️", arabic: "الظهر" },
                      { key: "asr", name: "صلاة العصر", icon: "🌤️", arabic: "العصر" },
                      { key: "maghrib", name: "صلاة المغرب", icon: "🌅", arabic: "المغرب" },
                      { key: "isha", name: "صلاة العشاء", icon: "🌙", arabic: "العشاء" }
                    ].map((p) => {
                      const prayerInfo = prayerTimesList.find(pt => pt.arabicName === p.arabic);
                      const currentOffset = userProfile.prayerReminderOffsets?.[p.key as keyof typeof userProfile.prayerReminderOffsets] ?? userProfile.prayerReminderOffsetMinutes ?? 15;
                      
                      let reminderTimeStr = "";
                      if (prayerInfo?.time) {
                        const remDate = new Date(prayerInfo.time.getTime() - currentOffset * 60 * 1000);
                        reminderTimeStr = remDate.toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit", hour12: true });
                      }

                      return (
                        <div key={p.key} className="p-3.5 bg-gray-50/80 rounded-2xl border border-gray-200/80 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{p.icon}</span>
                              <span className="text-xs font-bold text-gray-900">{p.name}</span>
                            </div>
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
                              موعد الصلاة: {prayerInfo?.time ? prayerInfo.time.toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit", hour12: true }) : ""}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-gray-600 font-medium">التنبيه قبل الصلاة بـ:</span>
                            <select
                              value={currentOffset}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                const updatedOffsets = {
                                  ...(userProfile.prayerReminderOffsets || { fajr: 15, dhuhr: 15, asr: 15, maghrib: 15, isha: 15 }),
                                  [p.key]: val
                                };
                                const updated = {
                                  ...state,
                                  profile: {
                                    ...userProfile,
                                    prayerReminderOffsets: updatedOffsets
                                  }
                                };
                                updateState(updated);
                              }}
                              className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 cursor-pointer"
                            >
                              <option value="5">5 دقائق قبل الصلاة</option>
                              <option value="10">10 دقائق قبل الصلاة</option>
                              <option value="15">15 دقيقة قبل الصلاة</option>
                              <option value="20">20 دقيقة قبل الصلاة</option>
                              <option value="30">30 دقيقة قبل الصلاة</option>
                              <option value="45">45 دقيقة قبل الصلاة</option>
                            </select>
                          </div>

                          <div className="pt-2 border-t border-gray-200/60 flex items-center justify-between text-[10px]">
                            <span className="text-gray-600">
                              ⏰ موعد التذكير الموعد: <strong className="text-emerald-900 font-bold">{reminderTimeStr}</strong>
                            </span>

                            <button
                              type="button"
                              onClick={() => handleTestPrayerReminderNotification(p.arabic, distributionSlots)}
                              className="text-emerald-800 hover:text-emerald-950 font-bold underline flex items-center gap-1 cursor-pointer"
                            >
                              اختبار التنبيه 🔔
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Data Sync & Diagnostics Logs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Save backups card */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 space-y-4">
                  <h3 className="text-lg font-serif font-bold text-emerald-900 border-b border-gray-100 pb-2">
                    🔄 الاستيراد والتصدير للمزامنة والنسخ الاحتياطي
                  </h3>
                  
                  <p className="text-xs text-gray-500 leading-relaxed">
                    يتم تخزين بياناتك ومشاريع تكراراتك محلياً بشكل كامل على جهازك لتعمل 100% دون شبكة. يمكنك تحميل نسخة احتياطية من خطتك ومزامنتها على الهاتف بسهولة تامة.
                  </p>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button 
                      onClick={handleExportBackup}
                      className="py-2.5 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"
                    >
                      <Download className="w-4 h-4" />
                      تصدير النسخة الاحتياطية
                    </button>

                    <label className="py-2.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer text-center">
                      <Upload className="w-4 h-4" />
                      استعادة الـ JSON
                      <input 
                        type="file" 
                        accept=".json" 
                        onChange={handleImportBackup} 
                        className="hidden" 
                      />
                    </label>
                  </div>

                  <button 
                    onClick={handleResetApp}
                    className="p-1 px-3 text-red-500 hover:bg-red-50 text-[10px] font-bold rounded-lg border border-transparent hover:border-red-100 transition w-full text-center"
                  >
                    إعادة ضبط التطبيق ومسح البيانات ⚠️
                  </button>
                </div>

                {/* Activity Diagnostic Logs */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 space-y-4">
                  <h4 className="text-lg font-serif font-bold text-emerald-900 border-b border-gray-100 pb-2 flex items-center justify-between">
                    <span>📋 سجل النشاط والتدقيق البرمجي (Diagnostic Logs)</span>
                    <span className="text-[10px] font-mono text-gray-400">Offline History</span>
                  </h4>

                  <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                    {activityLog.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">سجل النشاط فارغ لتاريخ اليوم.</p>
                    ) : (
                      activityLog.map((log) => (
                        <div key={log.id} className="p-2 border-b last:border-b-0 space-y-0.5 text-right font-sans">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-emerald-950">{log.title}</span>
                            <span className="text-[9px] text-gray-400 font-mono">
                              {new Date(log.timestamp).toLocaleTimeString("ar-SA", { hour: "numeric", minute: "numeric" })}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-500">{log.desc}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>

      </main>

      {/* BOTTOM NAVIGATION BAR */}
      <footer className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200/80 shadow-lg py-2.5 z-40 shrink-0 select-none">
        <div className="max-w-md mx-auto flex items-center justify-around px-2">
          
          <button 
            onClick={() => setActiveTab("home")}
            className={`flex flex-col items-center gap-1 transition-all ${
              activeTab === "home" ? "text-emerald-700 scale-105" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <div className={`p-1 rounded-xl transition ${activeTab === "home" ? "bg-emerald-50" : ""}`}>
              <Clock className="w-5 h-5 shrink-0" />
            </div>
            <span className="text-[10px] font-bold">الرئيسية</span>
          </button>

          <button 
            onClick={() => setActiveTab("hifz")}
            className={`flex flex-col items-center gap-1 transition-all ${
              activeTab === "hifz" ? "text-emerald-700 scale-105" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <div className={`p-1 rounded-xl transition ${activeTab === "hifz" ? "bg-emerald-50" : ""}`}>
              <Plus className="w-5 h-5 shrink-0" />
            </div>
            <span className="text-[10px] font-bold">الحفظ الجديد</span>
          </button>

          <button 
            onClick={() => setActiveTab("review")}
            className={`flex flex-col items-center gap-1 transition-all ${
              activeTab === "review" ? "text-emerald-700 scale-105" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <div className={`p-1 rounded-xl transition ${activeTab === "review" ? "bg-emerald-50" : ""}`}>
              <RotateCcw className="w-5 h-5 shrink-0" />
            </div>
            <span className="text-[10px] font-bold">المراجعة</span>
          </button>

          <button 
            onClick={() => setActiveTab("prayers")}
            className={`flex flex-col items-center gap-1 transition-all ${
              activeTab === "prayers" ? "text-emerald-700 scale-105" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <div className={`p-1 rounded-xl transition ${activeTab === "prayers" ? "bg-emerald-50" : ""}`}>
              <Compass className="w-5 h-5 shrink-0" />
            </div>
            <span className="text-[10px] font-bold">الصلوات</span>
          </button>

          <button 
            onClick={() => setActiveTab("mushaf")}
            className={`flex flex-col items-center gap-1 transition-all ${
              activeTab === "mushaf" ? "text-emerald-700 scale-105" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <div className={`p-1 rounded-xl transition ${activeTab === "mushaf" ? "bg-emerald-50" : ""}`}>
              <BookOpen className="w-5 h-5 shrink-0" />
            </div>
            <span className="text-[10px] font-bold">المصحف</span>
          </button>

          <button 
            onClick={() => setActiveTab("settings")}
            className={`flex flex-col items-center gap-1 transition-all ${
              activeTab === "settings" ? "text-emerald-700 scale-105" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <div className={`p-1 rounded-xl transition ${activeTab === "settings" ? "bg-emerald-50" : ""}`}>
              <Settings className="w-5 h-5 shrink-0" />
            </div>
            <span className="text-[10px] font-bold">الإعدادات</span>
          </button>

        </div>
      </footer>

    </div>
  );
}
