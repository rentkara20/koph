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
  "Reason is required": "السبب مطلوب",
  "A new future date is required": "اختر موعداً جديداً في المستقبل",
  "A planned date is required": "يوم التنفيذ مطلوب",
  "The planned date cannot be in the past": "لا يمكن اختيار يوم سابق",
  "Time window is required": "فترة التنفيذ مطلوبة",
  "Invalid time window": "فترة التنفيذ غير صحيحة",
  "Failed to update logistics": "تعذر تحديث بيانات التوصيل",
  "Failed to update receiver": "تعذر تحديث المستلم",
  "Failed to create receiver": "تعذر إنشاء المستلم واختياره",
  "Company name is required": "اسم الشركة مطلوب",
  "Location name is required": "اسم الموقع مطلوب",
  "Company location not found": "موقع الشركة غير موجود",
  "Failed to create company location": "تعذر إنشاء موقع الشركة",
  "Failed to set default company location": "تعذر تعيين الموقع الافتراضي",
  "Failed to delete company location": "تعذر حذف موقع الشركة",
  "Customer location not found": "موقع العميل غير موجود",
  "Customer location does not belong to this customer": "هذا الموقع لا يتبع العميل المحدد",
  "Receiver does not belong to this customer": "المستلم لا يتبع العميل المحدد",
  "Failed to create customer location": "تعذر إنشاء موقع العميل",
  "Failed to update customer location": "تعذر تحديث موقع العميل",
  "Failed to set default customer location": "تعذر تعيين موقع العميل الافتراضي",
  "Failed to delete customer location": "تعذر حذف موقع العميل",
  "Failed to update contact locations": "تعذر تحديث مواقع الموظف",
  "Item not found": "العنصر غير موجود",
  "Serial number already exists": "الرقم التسلسلي مستخدم من قبل",
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
  "Order line not found": "بند الطلبية غير موجود",
  "Asset tag already in use": "رقم الأصل مستخدم بالفعل",
  "Failed to create asset": "تعذر إنشاء الأصل",
  "No file provided": "لم يتم إرفاق ملف",
  "Unsupported file type": "نوع الملف غير مدعوم",
  "File too large": "حجم الملف كبير جداً",
  "Document not found": "المستند غير موجود",
  "Serial number already in use": "الرقم التسلسلي مستخدم بالفعل",
  "Purchase order line not found": "بند طلبية الشراء غير موجود",
  "PO number already exists": "رقم طلبية الشراء موجود بالفعل",
  "Cannot receive more than ordered": "لا يمكن استلام كمية أكبر من المطلوبة",
  "Cannot receive a cancelled line": "لا يمكن استلام بند ملغى",
  "Failed to receive line": "تعذر استلام البند",
  "QC rejection reason is required": "يجب اختيار سبب رفض الجهاز",
  "No devices selected": "لم يتم اختيار أجهزة للفحص",
  "Too many devices selected": "عدد الأجهزة المختارة كبير جدًا",
  "Supplier return reason is required": "يجب كتابة سبب إرجاع الجهاز للمورد",
  "Only a rejected device can be returned to its supplier": "يمكن إرجاع الجهاز المرفوض فقط للمورد",
  "This device is not linked to a supplier purchase order": "الجهاز غير مرتبط بأمر شراء ومورد",
  "This device already has an open supplier return": "يوجد بالفعل مرتجع مفتوح لهذا الجهاز",
  "Replacement serial number is required": "يجب إدخال سيريال الجهاز البديل",
  "Line is already cancelled": "البند ملغى بالفعل",
  "Cannot cancel a line that has received units": "لا يمكن إلغاء بند تم استلام وحدات منه",
  "Failed to cancel line": "تعذر إلغاء البند",
  "Warranty batch not found": "دفعة الضمان غير موجودة",
  "Warranty batch fully assigned": "تم تخصيص كل وحدات دفعة الضمان",
  "Asset already has an active warranty assignment": "لدى هذا الأصل ضمان فعّال بالفعل",
  "Failed to assign warranty": "تعذر تعيين الضمان",
  "Warranty assignment not found": "تعيين الضمان غير موجود",
  "Invalid action for current warranty status": "إجراء غير صالح لحالة الضمان الحالية",
  "Accessory item not found": "الملحق غير موجود",
  "Serial number required for this item": "هذا الصنف يتطلب رقماً تسلسلياً",
  "Not enough stock for this accessory": "الكمية المتوفرة غير كافية لهذا الملحق",
  "A specific unit is required for this accessory": "يتطلب هذا الملحق تحديد وحدة معينة",
  "Accessory unit not found": "وحدة الملحق غير موجودة",
  "Accessory unit is not available": "وحدة الملحق غير متاحة",
  "Failed to attach accessory": "تعذر إرفاق الملحق",
  "Accessory attachment not found": "إرفاق الملحق غير موجود",
  "Failed to update checklist": "تعذر تحديث الحالة",

  // Partner login
  "Partner not found": "الشريك غير موجود",
  "Partner already has a login": "الشريك لديه حساب بالفعل",
  "A user with this email already exists": "يوجد مستخدم بهذا البريد بالفعل",
  "Could not create the login account": "تعذر إنشاء الحساب",
  "Invalid email or password": "بريد أو كلمة مرور غير صالحة",
  "Link expired or invalid": "الرابط منتهي أو غير صالح",
  "Password is required": "كلمة المرور مطلوبة",
  "Partner has no login": "الشريك ليس لديه حساب دخول",

  // Orders / suppliers / customers
  "Order not found": "الطلبية غير موجودة",
  "Invalid confirmation date": "تاريخ موافقة العميل غير صالح",
  "A cancelled order cannot be confirmed": "لا يمكن تأكيد طلبية ملغاة",
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
  if (AR[message]) return AR[message]
  // Parameterized errors: "<known prefix>: <value>" keeps the value verbatim.
  const sep = message.indexOf(": ")
  if (sep > 0) {
    const prefix = message.slice(0, sep)
    if (AR[prefix]) return `${AR[prefix]}: ${message.slice(sep + 2)}`
  }
  return message
}
