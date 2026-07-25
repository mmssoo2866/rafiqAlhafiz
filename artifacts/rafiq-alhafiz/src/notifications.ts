/**
 * Notifications — إشعارات رفيق الحافظ
 *
 * إصلاح: استخدام Web Notifications API القياسية بدلاً من
 * @capacitor/local-notifications التي لا تعمل في بيئة الويب.
 * عند استخدام التطبيق على أندرويد (Capacitor) يمكن استبدال
 * هذه الدوال بنسختها الأصلية.
 */

export async function requestNotificationPermission(): Promise<void> {
  try {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
  } catch (e) {
    console.warn("Notification permission request failed:", e);
  }
}

export async function sendTestNotification(): Promise<void> {
  try {
    if (!("Notification" in window)) {
      alert("متصفحك لا يدعم الإشعارات.");
      return;
    }

    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        alert("يرجى السماح بالإشعارات من إعدادات المتصفح.");
        return;
      }
    }

    if (Notification.permission === "granted") {
      new Notification("تجربة رفيق الحافظ 📖", {
        body: "إذا ظهر هذا التنبيه، فهذا يعني أن نظام الإشعارات يعمل بنجاح!",
        icon: "/icon.png",
      });
    } else {
      alert("الإشعارات محظورة في إعدادات متصفحك.");
    }
  } catch (e) {
    console.warn("Failed to send test notification:", e);
  }
}

export async function scheduleReviewReminder(
  title: string,
  body: string,
  _id: number,
  date: Date
): Promise<void> {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted")
      return;

    const delay = Math.max(0, date.getTime() - Date.now());
    setTimeout(() => {
      new Notification(title, { body, icon: "/icon.png" });
    }, delay);
  } catch (e) {
    console.warn("Failed to schedule notification:", e);
  }
}
