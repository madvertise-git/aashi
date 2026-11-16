// How numbers, money and times are shown. India first: lakhs and crores, rupees, India time.

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const rupeesShort = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-IN");

/** Whole paise → "₹50,000". */
export const money = (minor: number) => rupees.format(minor / 100);
/** Whole paise → "₹7.5L", for tiles and cards where space is tight. */
export const moneyShort = (minor: number) => (Math.abs(minor) < 10_000_000 ? rupees.format(minor / 100) : rupeesShort.format(minor / 100));
export const count = (n: number) => whole.format(n);

/** "just now", "5 min ago", "3 days ago", then a date. */
export function ago(iso: string): string {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} hr ago`;
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)} days ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** "Good morning" by the clock on the person's device. */
export function greeting(now = new Date()): string {
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** "Priya Sharma" → "PS". */
export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
