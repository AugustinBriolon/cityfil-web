/** Numbers in a notification, written the device's way: the server words nothing else (the app's strings do). */

/** "350 m" below a kilometre, "1,2 km" above (French), "1.2 km" (English). */
export function formatPushDistance(meters: number, locale: string): string {
  if (meters < 1000) {
    return new Intl.NumberFormat(locale, { style: "unit", unit: "meter", maximumFractionDigits: 0 }).format(
      Math.round(meters / 10) * 10,
    );
  }
  return new Intl.NumberFormat(locale, { style: "unit", unit: "kilometer", maximumFractionDigits: 1 }).format(
    meters / 1000,
  );
}

/**
 * Same rule as the app's city share: whole percents, one decimal under 1 %, "< 0,1 %" under a tenth;
 * always rounded down, so a city never reads finished before it is.
 */
export function formatPushShare(share: number, locale: string): string {
  const percent = (digits: number) =>
    new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: digits, minimumFractionDigits: digits });
  if (share >= 0.01 || share <= 0) return percent(0).format(Math.floor(share * 100) / 100);
  const tenths = Math.floor(share * 1000) / 1000;
  return tenths > 0 ? percent(1).format(tenths) : `< ${percent(1).format(0.001)}`;
}
