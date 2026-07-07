// Client-side translation for server-action error envelopes.
//
// Server actions return stable English error strings (also used as logic
// markers, e.g. "PHOTO_REQUIRED"), so the UI maps them to Arabic here instead
// of localizing inside the action. Plain function (not a hook) so it can be
// called from any handler; the locale cookie is the same one next-intl uses,
// and a locale switch triggers router.refresh() so staleness isn't an issue.

const AR: Record<string, string> = {
  "Unauthorized": "غير مصرّح لك بهذا الإجراء",
  "Not found": "غير موجود",
  "Too many attempts. Please wait a minute and try again.":
    "محاولات كثيرة. انتظر دقيقة وحاول مرة أخرى.",

  // Requests
  "Request not found": "الطلب غير موجود",
  "Request no longer exists": "الطلب لم يعد موجوداً",
  "Cannot cancel a completed request": "لا يمكن إلغاء طلب مكتمل",
  "Only draft requests can be marked as sent": "فقط الطلبات في وضع المسودة يمكن تحديدها كمرسلة",
  "Signed requests cannot be deleted": "لا يمكن حذف طلب تم توقيعه",
  "Request is not paused": "الطلب ليس متوقفاً مؤقتاً",
  "Failed to update logistics": "تعذر تحديث بيانات التوصيل",
  "Failed to update receiver": "تعذر تحديث المستلم",
  "Item not found": "العنصر غير موجود",
  "Name is required": "الاسم مطلوب",

  // Tasks
  "Task not found": "المهمة غير موجودة",
  "Task is already cancelled": "المهمة ملغاة بالفعل",
  "Closed tasks cannot be cancelled": "لا يمكن إلغاء مهمة مغلقة",
  "Closed tasks cannot be deleted": "لا يمكن حذف مهمة مغلقة",
  "Task is not awaiting sign-off": "المهمة ليست بانتظار الاعتماد",
  "Task is not in progress": "المهمة ليست قيد التنفيذ",
  "Task is not active for on-site signing": "المهمة غير نشطة للتوقيع الميداني",
  "Task has no linked request": "المهمة غير مرتبطة بطلب",
  "Invalid action for current task status": "إجراء غير صالح لحالة المهمة الحالية",
  "Invalid action": "إجراء غير صالح",
  "Invalid failure reason": "سبب فشل غير صالح",
  "Failure reason is required": "سبب الفشل مطلوب",
  "Cannot sign off a task on a cancelled request": "لا يمكن اعتماد مهمة على طلب ملغى",
  "Quantity is required for this contract's pricing model": "الكمية مطلوبة لنموذج تسعير هذا العقد",
  "Partner is required": "الشريك مطلوب",
  "Link expired": "انتهت صلاحية الرابط",

  // Signatures
  "Signature request not found": "طلب التوقيع غير موجود",
  "This request is no longer active": "هذا الطلب لم يعد نشطاً",
  "This link has not been activated yet": "هذا الرابط لم يتم تفعيله بعد",
  "This signing link has expired": "انتهت صلاحية رابط التوقيع",
  "This document is already signed or cancelled": "هذا المستند موقّع أو ملغى بالفعل",
  "The receiver must sign first": "يجب أن يوقّع المستلم أولاً",
  "Could not find or create signature request": "تعذر إيجاد أو إنشاء طلب توقيع",
  "No authorised signatory is flagged for this customer": "لا يوجد مفوّض بالتوقيع محدد لهذا العميل",
  "National ID / Iqama is required": "رقم الهوية / الإقامة مطلوب",

  // Payments
  "An open batch already exists for this partner and period": "توجد دفعة مفتوحة بالفعل لهذا الشريك والفترة",
  "No pending payments for this partner and period": "لا توجد مستحقات معلقة لهذا الشريك والفترة",
  "Only draft batches can be approved": "فقط الدفعات في وضع المسودة يمكن اعتمادها",
  "Only approved batches can be sent to finance": "فقط الدفعات المعتمدة يمكن إرسالها للمالية",
  "Only sent batches can be marked as paid": "فقط الدفعات المرسلة يمكن تحديدها كمدفوعة",
  "Only held items can be released": "فقط البنود المعلقة يمكن الإفراج عنها",
  "Paid items cannot be held": "لا يمكن تعليق بنود مدفوعة",
  "Invalid unit price": "سعر وحدة غير صالح",

  // Assets
  "Asset not found": "الأصل غير موجود",
  "Invalid action for current asset status": "إجراء غير صالح لحالة الأصل الحالية",
  "Invalid note": "ملاحظة غير صالحة",
  "Invalid input": "مدخلات غير صالحة",

  // Partner login
  "Partner not found": "الشريك غير موجود",
  "Partner already has a login": "الشريك لديه حساب بالفعل",
  "A user with this email already exists": "يوجد مستخدم بهذا البريد بالفعل",
  "Could not create the login account": "تعذر إنشاء الحساب",
  "Invalid email or password (min 8 characters)": "بريد أو كلمة مرور غير صالحة (٨ أحرف على الأقل)",

  // Orders / suppliers / customers
  "Order not found": "الطلبية غير موجودة",
  "Order number already exists": "رقم الطلبية موجود بالفعل",
  "Order number is required": "رقم الطلبية مطلوب",
  "Invalid line reference": "مرجع بند غير صالح",
  "Cannot remove an item whose devices are already assigned to a request":
    "لا يمكن حذف بند تم تعيين أجهزته لطلب بالفعل",
  "Arabic name is required": "الاسم العربي مطلوب",
  "English name is required": "الاسم الإنجليزي مطلوب",
  "Contract name is required": "اسم العقد مطلوب",
}

function isArabicLocale(): boolean {
  if (typeof document === "undefined") return false
  return /(?:^|;\s*)lang=ar(?:;|$)/.test(document.cookie)
}

/**
 * Maps a server-action error string to the active locale. Unknown strings
 * (zod messages, new errors) pass through unchanged so nothing is hidden.
 */
export function translateActionError(message: string): string {
  if (!isArabicLocale()) return message
  return AR[message] ?? message
}
