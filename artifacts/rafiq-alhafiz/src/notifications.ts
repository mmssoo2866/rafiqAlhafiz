/**
 * Notifications — إشعارات رفيق الحافظ (نسخة ويب)
 *
 * يستخدم Web Notifications API القياسية.
 * ملاحظة: الإشعارات تحتاج إذناً وتعمل فقط في تبويب متصفح مستقل،
 * وليس داخل iframe مضمّن (مثل معاينة Replit).
 */

/** هل التطبيق مفتوح داخل iframe؟ */
const isInIframe = (): boolean => {
  try {
    return window.self !== window.top;
  } catch {
    return true; // cross-origin iframe
  }
};

export async function requestNotificationPermission(): Promise<void> {
  try {
    if (!("Notification" in window) || isInIframe()) return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
  } catch (e) {
    console.warn("Notification permission request failed:", e);
  }
}

/**
 * يرسل إشعاراً تجريبياً.
 * @returns رسالة نصية توضح ما حدث (نجاح أو سبب الفشل)
 */
export async function sendTestNotification(): Promise<string> {
  try {
    // الحالة 1: داخل iframe — الإشعارات محظورة بواسطة المتصفح
    if (isInIframe()) {
      return "iframe";
    }

    // الحالة 2: المتصفح لا يدعم الإشعارات
    if (!("Notification" in window)) {
      return "unsupported";
    }

    // الحالة 3: اطلب الإذن إذا لم يُمنح بعد
    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        return "denied";
      }
    }

    // الحالة 4: الإذن ممنوح — أرسل الإشعار
    if (Notification.permission === "granted") {
      new Notification("رفيق الحافظ 📖", {
        body: "إذا ظهر هذا التنبيه فنظام الإشعارات يعمل بنجاح!",
        icon: "/icon.png",
      });
      return "sent";
    }

    return "denied";
  } catch (e) {
    console.warn("Failed to send test notification:", e);
    return "error";
  }
}

export async function scheduleReviewReminder(
  title: string,
  body: string,
  _id: number,
  date: Date
): Promise<void> {
  try {
    if (isInIframe()) return;
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
