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
  ChevronLeft, 
  ChevronRight, 
  Info, 
  Clock, 
  Compass, 
  MapPin, 
  RotateCcw, 
  Check, 
  Activity, 
  AlertCircle 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { SURAHS, getSurahById, getPageForAyah, getSurahName } from "./quranData";
import { loadAppState, saveAppState, logActivity, AppState, MemorizationBlock, UserProfile, CompletedReviews } from "./storage";
import { getTasksForDate, getCumulativeGroups, hasDay66TriggerToday, ScheduledTask } from "./scheduler";
import { calculateTodayPrayers, distributeReviewsToPrayers, DistributedSlot } from "./prayerEngine";
import { requestNotificationPermission, sendTestNotification } from "./notifications";

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [activeTab, setActiveTab] = useState<"home" | "hifz" | "review" | "prayers" | "mushaf" | "settings">("home");
  const [todayStr, setTodayStr] = useState<string>("");
  
  // Geolocation loading state
  const [gpsLoading, setGpsLoading] = useState(false);
  
  // Onboarding wizard if active
  const [isOnboarding, setIsOnboarding] = useState(false);
  
  // Form states
  const [newHifz, setNewHifz] = useState({
    surahId: 67, // Al-Mulk default
    fromAyah: 1,
    toAyah: 10,
    repetitions: 100
  });

  // Mushaf viewer state
  const [mushafPage, setMushafPage] = useState<number>(1);
  const [mushafViewMode, setMushafViewMode] = useState<"image" | "offline">("image");
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isCached, setIsCached] = useState(false);
  const [downloadingSurah, setDownloadingSurah] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [searchSurahId, setSearchSurahId] = useState<number>(1);

  const QURAN_CACHE_NAME = "quran-images-v2";

  /** عنوان صورة صفحة المصحف — يمر عبر بروكسي الخادم لتجنب حجب CORS */
  const quranPageUrl = (page: number) =>
    `/api/quran-image/${page}`;

  // Check if page is cached
  const checkCacheStatus = async (page: number) => {
    try {
      const cache = await caches.open(QURAN_CACHE_NAME);
      const response = await cache.match(quranPageUrl(page));
      setIsCached(!!response);
    } catch (e) {
      setIsCached(false);
    }
  };

  // Trigger loading state and cache check when page changes
  useEffect(() => {
    if (activeTab === "mushaf" && mushafViewMode === "image") {
      setImageLoading(true);
      setImageError(false);
      checkCacheStatus(mushafPage);
    }
  }, [mushafPage, mushafViewMode, activeTab]);

  // Function to download a surah for offline use
  const handleDownloadSurah = async () => {
    const surah = getSurahById(searchSurahId);
    if (!surah) return;

    const nextSurah = getSurahById(searchSurahId + 1);
    const endPage = nextSurah ? nextSurah.startPage - 1 : 604;
    const pagesToDownload = Array.from(
      { length: endPage - surah.startPage + 1 },
      (_, i) => surah.startPage + i
    );

    setDownloadingSurah(true);
    setDownloadProgress(0);

    try {
      const cache = await caches.open(QURAN_CACHE_NAME);
      let count = 0;
      for (const page of pagesToDownload) {
        const url = quranPageUrl(page);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        await cache.put(url, resp);
        count++;
        setDownloadProgress(Math.round((count / pagesToDownload.length) * 100));
      }
      alert(`تم تحميل سورة ${surah.name} بنجاح للأوفلاين!`);
      checkCacheStatus(mushafPage);
    } catch (error) {
      alert("فشل التحميل. يرجى التأكد من اتصالك بالإنترنت.");
    } finally {
      setDownloadingSurah(false);
    }
  };

  // Setup today's initial date 
  useEffect(() => {
    const today = new Date();
    setTodayStr(today.toISOString().split("T")[0]);
    
    // Request notification permission
    requestNotificationPermission();

    // Load app state
    const loaded = loadAppState();
    setState(loaded);
    
    if (!loaded.profile || loaded.profile.name === "عبد الله" && loaded.blocks.length === 3 && localStorage.getItem("onboarding_complete") !== "true") {
      setIsOnboarding(true);
    }
  }, []);

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
    const nightPrayerRakats = Number(data.get("nightPrayerRakats")) || 8;
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
      lastActiveDate: todayStr
    };
  }

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

    if (confirm(`هل أنت متأكد من حذف هذا المقرر؟ سيؤدي ذلك لحذف تقدمه وجميع المراجعات المرتبطة به.`)) {
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
    }
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
  
  // Distribute reviews dynamically across prayers
  const distributionSlots = distributeReviewsToPrayers(todayTasks, userProfile);

  // Group blocks for cumulative reviews
  const cumulativeGroups = getCumulativeGroups(state.blocks);

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

                              <button 
                                onClick={() => handleDeleteBlock(block.id)}
                                className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition"
                                title="حذف"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
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
                <h3 className="text-xl font-serif font-bold">🔁 هيكل المراجعة الذكية بالتكرار المتباعد</h3>
                <p className="text-xs text-emerald-100 leading-relaxed">
                  يقوم رفيق الحافظ بجدولة مراجعتك تلقائياً لمدى الحفظ لـ 66 يوماً (المرحلة المكثفة أول 10 أيام متصلة، تليها مراجعة متباعدة دورية لتثبيت الذاكرة). في اليوم 66 يتم توجيه الحفظ لقسم مجمع (كل 15 مقرراً كحلقة واحدة) ليتم تدويره و مراجعته تجميعياً.
                </p>
              </div>

              {/* Sub categories grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* 1. Intensive scheduled reviews list */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 space-y-4">
                  <h4 className="text-lg font-serif font-bold text-emerald-900 border-b border-gray-100 pb-2 flex items-center justify-between">
                    <span>🔥 مراجعة مكثفة مستحقة (الأيام 2 - 10)</span>
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

                {/* 2. Spaced scheduled reviews list */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 space-y-4">
                  <h4 className="text-lg font-serif font-bold text-emerald-900 border-b border-gray-100 pb-2 flex items-center justify-between">
                    <span>🌌 مراجعة متباعدة مستحقة (الأيام 12 - 66)</span>
                    <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-sans font-bold font-normal">تباعد منتظم</span>
                  </h4>

                  {todayTasks.filter(t => t.type === "review" && t.offset > 10).length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-8">لا توجد مراجعات متباعدة مستحقة اليوم.</p>
                  ) : (
                    <div className="space-y-2">
                      {todayTasks.filter(t => t.type === "review" && t.offset > 10).map(t => (
                        <div key={t.block.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl text-xs">
                          <div>
                            <span className="font-bold text-gray-800">سورة {getSurahName(t.block.surahId)}</span>
                            <span className="text-gray-400 font-mono block">الآيات {t.block.fromAyah} - {t.block.toAyah} (يوم {t.offset})</span>
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
              </div>

              {/* Cumulative Groups section */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 space-y-4">
                <h3 className="text-lg font-serif font-bold text-emerald-900 border-b border-gray-100 pb-3 flex items-center justify-between">
                  <span>🧠 المجموعات التراكمية الكبرى (كل 15 مقرراً في حلقة)</span>
                  <span className="text-xs font-sans text-gray-400 font-normal">مستحسن للمراجعة الشاملة لتعزيز الحفظ طويل المدى</span>
                </h3>

                {cumulativeGroups.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">سيتم تعيين المجموعات تلقائيًا بمجرد تجاوز المقررات النشطة حاجز 15 مقرراً مضافاً.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {cumulativeGroups.map(g => (
                      <div key={g.id} className="p-4 rounded-2xl bg-emerald-50/20 border border-emerald-100/50 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-emerald-950 text-sm">{g.name}</h4>
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">{g.blocks.length} مقرر</span>
                        </div>
                        <div className="text-xs text-gray-500 space-y-1">
                          {g.blocks.map(b => (
                            <span key={b.id} className="inline-block bg-white px-2 py-1 rounded border border-gray-100 ml-1.5 mb-1.5">
                              سورة {getSurahName(b.surahId)} (الآيات {b.fromAyah} - {b.toAyah})
                            </span>
                          ))}
                        </div>
                        <button 
                          onClick={() => {
                            // Select the first block and display page in Mushaf
                            navigateToMushaf(g.blocks[0].surahId, g.blocks[0].fromAyah);
                            alert("تم توجيهك إلى المصحف الشريف للبدء في تلاوة المجموعة الكبرى مجمعة.");
                          }}
                          className="w-full py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition text-center"
                        >
                          تلاوة ومراجعة المجموعة مجمعة بالمصحف 📖
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
              {/* Role Toggle Card */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                <div className="md:col-span-2 space-y-1">
                  <h3 className="text-lg font-serif font-bold text-emerald-900 flex items-center gap-1.5">
                    <span>🕌 محرك توزيع المراجعة على الصلوات والركعات</span>
                  </h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    يقسم رفيق الحافظ تلقائياً مراجعاتك المفتوحة لتناسب الصلوات. الإمام يستغل الركعات الجهرية والسرية، بينما المأموم يعتمد على ركعات الفرد الصامتة (الظهر، العصر) بجانب السنن الرواتب المؤكدة وقيام الليل.
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

              {/* Schedule layout mapping */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500/10 space-y-4">
                <h3 className="text-xl font-serif font-bold text-emerald-900 border-b border-gray-100 pb-3 flex items-center justify-between">
                  <span>📿 خريطة توزيع ركعات التثبيت لليوم</span>
                  <span className="text-xs bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded font-sans font-bold">توليد آلي مرن</span>
                </h3>

                {distributionSlots.length === 0 ? (
                  <div className="h-44 flex flex-col items-center justify-center text-center space-y-2 text-gray-500">
                    <CheckCircle className="w-10 h-10 text-emerald-600/20" />
                    <p className="text-sm font-semibold text-emerald-800">الحمد لله! لا توجد مراجعات مستحقة للتوزيع اليوم.</p>
                    <p className="text-xs text-gray-400">ستظهر المراجعات المستحقة تلقائياً بعد إضافتك لبلورات الحفظ الجديدة.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {distributionSlots.map((slot) => {
                      const isSunnah = slot.prayerType === "sunnah";
                      const isQiyam = slot.prayerType === "qiyam";
                      
                      return (
                        <div 
                          key={slot.id} 
                          className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                            isSunnah 
                              ? "bg-amber-50/20 border-amber-200/50" 
                              : isQiyam 
                                ? "bg-purple-50/20 border-purple-200/50" 
                                : "bg-emerald-50/10 border-emerald-100/50"
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-gray-800">{slot.prayerName}</span>
                              <span className={`text-[9px] px-2 py-0.5 font-bold rounded-full ${
                                isSunnah 
                                  ? "bg-amber-100 text-amber-900" 
                                  : isQiyam 
                                    ? "bg-purple-100 text-purple-900" 
                                    : "bg-emerald-100 text-emerald-900"
                              }`}>
                                {isSunnah ? "رواتب وسنن " : isQiyam ? "قيام الليل" : "الفرض "}
                              </span>
                              <span className="text-[10px] text-gray-400">الركعة {slot.rakahNumber}</span>
                            </div>
                            <p className="text-xs text-gray-700 font-medium">سورة التلاوة المستهدفة:</p>
                            <p className="text-xs text-emerald-800 font-bold bg-[#edf4f0] p-1.5 pr-2.5 rounded-xl border border-emerald-100/50">
                              {slot.assignedContent}
                            </p>
                          </div>

                          <button 
                            onClick={() => {
                              // extract surah name to look up surahId and ayahNum
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
                            className="p-1 px-2 hover:bg-emerald-50 text-emerald-800 text-[10px] font-bold rounded-lg border border-transparent hover:border-emerald-100 transition shrink-0"
                          >
                            موضع المصحف ➔
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
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
                    <h3 className="text-lg font-serif font-bold text-emerald-900">📘 المصحف الشريف (المدينة المنورة المصور)</h3>
                    <p className="text-xs text-gray-500">انتقل مباشرة مابين أرقام الصفحات (1 - 604) أو اختر السورة لتحديد الموضع</p>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => setMushafViewMode("image")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        mushafViewMode === "image" ? "bg-emerald-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      مصحف مصوّر (رسم عثماني)
                    </button>
                    <button 
                      onClick={() => setMushafViewMode("offline")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        mushafViewMode === "offline" ? "bg-emerald-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      عناوين الأجزاء والسور
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100 font-sans">
                  
                  {/* Select Surah and slide */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500">اختر السورة للانتقال السريع</label>
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
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white"
                    >
                      {SURAHS.map((s) => (
                        <option key={s.id} value={s.id}>{s.id}. {s.name} ({s.startPage} ص)</option>
                      ))}
                    </select>
                  </div>

                  {/* Manual page page number input */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500">ادخل رقم الصفحة مباشرة</label>
                    <div className="flex gap-2">
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
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-xl text-center focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white font-mono"
                      />
                      <span className="text-xs self-center font-bold text-gray-400">/ 604</span>
                    </div>
                  </div>

                  {/* Cache action & storage indicator */}
                  <div className="space-y-1 flex flex-col justify-end">
                    <button 
                      onClick={handleDownloadSurah}
                      disabled={downloadingSurah}
                      className={`w-full py-2 px-3 border rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                        downloadingSurah
                          ? "bg-gray-100 border-gray-200 text-gray-400"
                          : "bg-white hover:bg-gray-50 border-gray-300 text-gray-700"
                      }`}
                    >
                      {downloadingSurah ? (
                        <span>جاري التحميل... {downloadProgress}%</span>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>تحميل السورة للأوفلاين</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* MUSHAF DIGITAL CANVAS Frame */}
              <div className="bg-[#f0ede6] min-h-[600px] border-4 border-[#3a352c]/20 shadow-lg rounded-3xl p-4 flex flex-col md:flex-row justify-between items-center gap-4 relative">
                
                {/* Navigation triggers */}
                <button 
                  onClick={() => mushafPage > 1 && setMushafPage(prev => prev - 1)}
                  disabled={mushafPage === 1}
                  className="p-3 bg-[#e2dec9] hover:bg-[#d5d0b6] disabled:opacity-40 text-[#4c4436] rounded-full shadow-inner tracking-tight transition shrink-0"
                >
                  <ChevronRight className="w-6 h-6 shrink-0" />
                </button>

                {/* Main render sheet */}
                <div className="flex-1 w-full bg-white rounded-2xl shadow-sm p-4 min-h-[500px] text-center flex flex-col justify-between items-center relative select-text">
                  
                  {mushafViewMode === "image" ? (
                    <div className="w-full flex flex-col items-center">
                      <div className="text-[10px] text-gray-400 font-mono tracking-wider w-full mb-3 flex items-center justify-between border-b pb-1.5">
                        <span className="flex items-center gap-1">
                          الصفحة {mushafPage}
                          {isCached && <CheckCircle className="w-3 h-3 text-emerald-600" title="محفوظة أوفلاين" />}
                        </span>
                        <span>مصحف مجمع الملك فهد لطباعة المصحف الشريف</span>
                        <span>رسم عثماني</span>
                      </div>
                      
                      {imageLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10 rounded-2xl">
                          <div className="flex flex-col items-center space-y-3">
                            <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-xs text-emerald-800 font-bold">جاري عرض الصفحة...</p>
                          </div>
                        </div>
                      )}

                      {imageError ? (
                        <div className="h-[60vh] flex flex-col items-center justify-center space-y-6 text-gray-500 px-6 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-200">
                          <div className="text-center space-y-2">
                            <AlertCircle className="w-16 h-16 text-amber-500 mx-auto" />
                            <h4 className="text-lg font-bold text-gray-800">تعذر عرض صفحة المصحف</h4>
                            <p className="text-xs text-gray-500 leading-relaxed">
                              قد يكون الاتصال بالإنترنت ضعيفاً أو أن مزود الخدمة يحجب رابط الصور. <br/>
                              يمكنك محاولة التحميل مرة أخرى أو الانتقال للوضع "أوفلاين" لعرض الفهرس.
                            </p>
                          </div>

                          <div className="flex gap-3">
                            <button
                              onClick={() => {
                                setImageError(false);
                                setImageLoading(true);
                                const img = document.getElementById("mushaf-img") as HTMLImageElement;
                                if (img) {
                                  const currentSrc = img.src.split('?')[0];
                                  img.src = `${currentSrc}?t=${Date.now()}`;
                                }
                              }}
                              className="px-6 py-2.5 bg-emerald-700 text-white rounded-xl font-bold shadow-md hover:bg-emerald-800 transition flex items-center gap-2"
                            >
                              <RotateCcw className="w-4 h-4" />
                              إعادة المحاولة
                            </button>
                            <button
                              onClick={() => setMushafViewMode("offline")}
                              className="px-6 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-xl font-bold transition"
                            >
                              عرض الفهرس
                            </button>
                          </div>
                        </div>
                      ) : (
                        <img
                          id="mushaf-img"
                          src={quranPageUrl(mushafPage)}
                          alt={`Quran Page ${mushafPage}`}
                          className={`max-h-[75vh] w-auto object-contain mx-auto select-none pointer-events-none transition-opacity duration-500 ${imageLoading ? 'opacity-0' : 'opacity-100'}`}
                          onLoad={() => {
                            setImageLoading(false);
                            checkCacheStatus(mushafPage);
                          }}
                          onError={() => {
                            setImageLoading(false);
                            setImageError(true);
                          }}
                        />
                      )}
                    </div>
                  ) : (
                    // Typographic Quran Verses Frame Explorer
                    <div className="w-full text-right p-4 space-y-6">
                      <h4 className="text-xl font-bold font-serif text-emerald-950 pb-2 border-b border-gray-100 flex items-center justify-between">
                        <span>📖 فهرس سور المصحف ومقررات الحفظ</span>
                        <span className="text-xs font-sans text-gray-400 font-normal">تصفح ورصد</span>
                      </h4>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {SURAHS.map((s) => (
                          <div 
                            key={s.id} 
                            onClick={() => {
                              setSearchSurahId(s.id);
                              setMushafPage(s.startPage);
                              setMushafViewMode("image");
                            }}
                            className="p-3 bg-gray-50 border hover:border-emerald-600 rounded-xl cursor-pointer hover:bg-emerald-50 transition"
                          >
                            <span className="text-xs font-mono text-gray-400 font-normal ml-1.5">#{s.id}</span>
                            <span className="font-bold text-emerald-900 text-sm">سورة {s.name}</span>
                            <span className="text-[10px] text-gray-450 block font-normal">تبدأ بالصفحة {s.startPage} • {s.ayahs} آية</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="w-full text-[10px] text-gray-400 font-mono tracking-wider pt-3 border-t flex justify-between items-center mt-3">
                    <span>رقم المجلد: 1</span>
                    <span>الصفحة {mushafPage} / 604</span>
                    <span>الحزب {Math.ceil(mushafPage / 10)}</span>
                  </div>

                </div>

                <button 
                  onClick={() => mushafPage < 604 && setMushafPage(prev => prev + 1)}
                  disabled={mushafPage === 604}
                  className="p-3 bg-[#e2dec9] hover:bg-[#d5d0b6] disabled:opacity-40 text-[#4c4436] rounded-full shadow-inner tracking-tight transition shrink-0"
                >
                  <ChevronLeft className="w-6 h-6 shrink-0" />
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
                    <label className="text-xs font-bold text-gray-600 block">عدد ركعات نافلة قيام الليل</label>
                    <select 
                      value={userProfile.nightPrayerRakats}
                      onChange={(e) => {
                        const updated = { ...state, profile: { ...userProfile, nightPrayerRakats: Number(e.target.value) } };
                        updateState(updated);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-gray-50"
                    >
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

                  <div className="pt-4 border-t border-gray-100">
                    <h4 className="text-sm font-bold text-gray-700 mb-2">🔔 تجربة النظام</h4>
                    <button
                      onClick={async () => {
                        const result = await sendTestNotification();
                        if (result === "sent") {
                          alert("✅ تم إرسال الإشعار! ابحث عنه في منطقة الإشعارات.");
                        } else if (result === "iframe") {
                          alert(
                            "⚠️ الإشعارات لا تعمل في نافذة المعاينة المضمّنة.\n\n" +
                            "افتح التطبيق في تبويب متصفح مستقل ثم جرّب مجدداً.\n" +
                            "(انقر على زر فتح في نافذة جديدة أعلى المعاينة)"
                          );
                        } else if (result === "denied") {
                          alert(
                            "🔕 الإشعارات محظورة.\n\n" +
                            "انقر على أيقونة القفل بجانب رابط الصفحة في المتصفح، وأعطِ إذن الإشعارات."
                          );
                        } else if (result === "unsupported") {
                          alert("❌ متصفحك لا يدعم الإشعارات. جرّب Chrome أو Edge.");
                        } else {
                          alert("❌ فشل إرسال الإشعار. يرجى المحاولة مرة أخرى.");
                        }
                      }}
                      className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border border-blue-200"
                    >
                      <Bell className="w-4 h-4" />
                      تجربة الإشعارات
                    </button>
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
