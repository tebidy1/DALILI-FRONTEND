import type { SVGProps } from 'react'

/*
 * أيقونات SVG مسطّحة (ستايل Flat) — stroke واحد بلون النص الحالي.
 * قاعدة UX-03: الأيقونة الزخرفية aria-hidden، والاتجاهية منها تحمل
 * .icon-flip لتنعكس في RTL عبر قاعدة [dir='rtl'].
 */

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number
}

function Svg({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export function IconPlus({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  )
}

/** EDT-05: أداة النص المكتوب على اللقطة — حرف «ن» عربي واضح */
export function IconTypeText({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M5 19h7M8.5 19V5H19M15.5 5v3" />
    </Svg>
  )
}

export function IconCheck({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  )
}

export function IconRetry({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
      <path d="M3 3v5h5" />
    </Svg>
  )
}

export function IconBookOpen({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
    </Svg>
  )
}

export function IconSearchX({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
      <path d="m8.5 8.5 5 5m0-5-5 5" />
    </Svg>
  )
}

export function IconCloudOff({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="m2 2 20 20" />
      <path d="M5.8 5.8A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.3-.2" />
      <path d="M21.5 16.5A4.5 4.5 0 0 0 17.5 10h-1.8A7 7 0 0 0 10 5.1" />
    </Svg>
  )
}

export function IconPlay({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M7 5.5v13l11-6.5z" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function IconPause({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M8 5v14" />
      <path d="M16 5v14" />
    </Svg>
  )
}

export function IconTrash({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M9 7V4h6v3" />
    </Svg>
  )
}

export function IconArrowUp({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </Svg>
  )
}

export function IconArrowDown({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M12 5v14" />
      <path d="M6 13l6 6 6-6" />
    </Svg>
  )
}

/** سهم الرجوع — في RTL يعود المستخدم نحو اليمين، فلا يُقلب */
export function IconArrowRight({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M5 12h14" />
      <path d="M12 5l7 7-7 7" />
    </Svg>
  )
}

/** S6: تكرار — ورقتان متراكبتان، إشارة النسخ المتعارفة */
export function IconCopy({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </Svg>
  )
}

export function IconWand({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M15 4V2M15 10V8M11 6H9M21 6h-2" />
      <path d="M4 20l11-11 1 1-11 11z" />
    </Svg>
  )
}

export function IconComment({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-6.5A8 8 0 0 1 11 4h2a8 8 0 0 1 8 8z" />
    </Svg>
  )
}

/** دربني — هدف/تصويب: يقود المستخدم للعنصر المطلوب (بديل رسمي عن الجري) */
export function IconTarget({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 1v3M12 20v3M1 12h3M20 12h3" />
    </Svg>
  )
}

/** واتساب — سمّاعة داخل فقاعة محادثة، أحادية اللون لتتّسق مع الجرافيت */
export function IconWhatsapp({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z" />
      <path d="M8.5 8.5c0 3.5 3.5 7 7 7 .9 0 1.5-1 1-1.7l-1.4-1c-.4-.3-.9-.2-1.2.1l-.5.5c-1.3-.6-2.3-1.6-2.9-2.9l.5-.5c.3-.3.4-.8.1-1.2l-1-1.4c-.5-.7-1.7-.4-1.7.6z" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function IconCrop({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M6 2v16h16" />
      <path d="M2 6h16v16" />
    </Svg>
  )
}

export function IconShare({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.6l6.8-4.2M8.6 13.4l6.8 4.2" />
    </Svg>
  )
}

export function IconEye({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  )
}

export function IconClock({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  )
}

export function IconList({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </Svg>
  )
}

/** مقبض السحب المعروف: ٦ نقاط (عمودان × ثلاثة صفوف) — النقاط أوامر «h.01» بغطاء دائري */
export function IconGrip({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />
    </Svg>
  )
}

/** VER-02: ثلاث نقاط عمودية — زر «المزيد» في شريط المحرر */
export function IconMoreVertical({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M12 5h.01M12 12h.01M12 19h.01" />
    </Svg>
  )
}

export function IconGlobe({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
    </Svg>
  )
}

export function IconPencil({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M4 20h4L20 8l-4-4L4 16z" />
      <path d="M14 6l4 4" />
    </Svg>
  )
}

export function IconLink({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M9 15l6-6" />
      <path d="M11 6l1-1a4 4 0 0 1 6 6l-1 1M13 18l-1 1a4 4 0 0 1-6-6l1-1" />
    </Svg>
  )
}

export function IconExternalLink({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14L21 3" />
    </Svg>
  )
}

export function IconCode({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M9 8l-5 4 5 4M15 8l5 4-5 4" />
    </Svg>
  )
}

export function IconDownload({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 21h16" />
    </Svg>
  )
}

/** ANNO-01: ريشة الرسم — قلم/ريشة سوداء يفتح لوحة الشرح */
export function IconFeather({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M20 4a7 7 0 0 0-10 0L5 9v10h10l5-5a7 7 0 0 0 0-10z" />
      <path d="M16 8 5 19" />
      <path d="M12 9h4M10 12h4" />
    </Svg>
  )
}

/** مستطيل الشرح */
export function IconSquare({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </Svg>
  )
}

/** دائرة/بيضاوي منتظم */
export function IconCircle({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <circle cx="12" cy="12" r="8" />
    </Svg>
  )
}

/** بيضاوي مرسوم باليد — إطار متموّج */
export function IconOval({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M12 4.5c4.7-.3 8 2.9 7.4 6-.5 3-4 5.5-8 5.4-4.4-.1-7.4-2.7-6.7-6C5.3 7 8 4.8 12 4.5z" />
    </Svg>
  )
}

/** سهم مستقيم — اتجاهي، ينعكس في RTL عبر .icon-flip عند اللزوم */
export function IconArrowUpRight({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </Svg>
  )
}

/** سهم منحنٍ */
export function IconCurvedArrow({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M5 18c1-7 7-11 13-11" />
      <path d="M13 4l5 3-3 5" />
    </Svg>
  )
}

/** شارة ترقيم — دائرة برقم */
export function IconNumber({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <circle cx="12" cy="12" r="9" />
      <path d="M11 8.5 12.5 8v8M10 16h5" />
    </Svg>
  )
}

/** مؤشّر — أداة «لا أداة»: تصفّح ومعاينة بلا رسم */
export function IconCursor({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M5 3.5 18.5 11l-6 1.6L9.6 18 5 3.5Z" />
    </Svg>
  )
}

/* S7: أزرار المنظار في عمود الأدوات — عدسة بزائد/ناقص، ومربع ملاءمة بأسهم للخارج */

/** تكبير — عدسة بعلامة زائد */
export function IconZoomIn({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.4 15.4 21 21M8 10.5h5M10.5 8v5" />
    </Svg>
  )
}

/** تصغير — عدسة بعلامة ناقص */
export function IconZoomOut({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.4 15.4 21 21M8 10.5h5" />
    </Svg>
  )
}

/** ملاءمة الشاشة — زوايا إطار وأسهم تتمدّد نحوها */
export function IconFit({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5" />
      <path d="M9 15 4.5 19.5M15 9 19.5 4.5M9 9 4.5 4.5M15 15l4.5 4.5" />
    </Svg>
  )
}

export function IconUser({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Svg>
  )
}

export function IconSettings({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  )
}

export function IconHome({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </Svg>
  )
}

export function IconBookmark({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </Svg>
  )
}

export function IconUsers({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  )
}

/** شكل المجلد المعروف لويندوز — ممتلئ بلسانته، أوضح من المفرّغ (طلب المالك 2026-09-03) */
export function IconFolder({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path
        d="M2.5 6.2A1.7 1.7 0 0 1 4.2 4.5h4.4a1.7 1.7 0 0 1 1.2.5l1.5 1.5h8.5a1.7 1.7 0 0 1 1.7 1.7v9.6a1.7 1.7 0 0 1-1.7 1.7H4.2a1.7 1.7 0 0 1-1.7-1.7V6.2Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconMagnifier({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </Svg>
  )
}

export function IconFilter({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M22 3H2l8 9.46V19l4 2v-8.54z" />
    </Svg>
  )
}

export function IconGrid({ size, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Svg>
  )
}
