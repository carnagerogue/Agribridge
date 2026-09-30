export const crops = [
  "Maize",
  "Beans",
  "Coffee",
  "Cassava",
  "Banana",
  "Rice",
  "Groundnuts",
  "Sorghum",
  "Tomato",
];
export const districts = [
  { name: "Nakaseke", latitude: 0.7517, longitude: 32.385 },
  { name: "Kampala", latitude: 0.3476, longitude: 32.5825 },
  { name: "Wakiso", latitude: 0.398, longitude: 32.479 },
  { name: "Luwero", latitude: 0.8492, longitude: 32.4731 },
  { name: "Gulu", latitude: 2.7746, longitude: 32.299 },
  { name: "Lira", latitude: 2.2499, longitude: 32.8999 },
  { name: "Mbale", latitude: 1.0821, longitude: 34.175 },
  { name: "Jinja", latitude: 0.4479, longitude: 33.2026 },
  { name: "Mbarara", latitude: -0.6072, longitude: 30.6545 },
  { name: "Masaka", latitude: -0.3338, longitude: 31.7341 },
  { name: "Kabale", latitude: -1.2486, longitude: 29.9899 },
  { name: "Arua", latitude: 3.0201, longitude: 30.9111 },
  { name: "Fort Portal", latitude: 0.671, longitude: 30.275 },
  { name: "Soroti", latitude: 1.7146, longitude: 33.6111 },
  { name: "Hoima", latitude: 1.4331, longitude: 31.3524 },
  { name: "Kasese", latitude: 0.183, longitude: 30.083 },
];
export const ugx = (amount: number) =>
  `UGX ${new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(amount)}`;
export const number = (amount: number) =>
  new Intl.NumberFormat("en-UG", { maximumFractionDigits: 1 }).format(amount);
export const date = (value?: string) =>
  value && !Number.isNaN(Date.parse(value))
    ? new Intl.DateTimeFormat("en-UG", {
        day: "numeric",
        month: "short",
        timeZone: "Africa/Kampala",
      }).format(new Date(value))
    : "Not set";
export const dateTime = (value?: string) =>
  value && !Number.isNaN(Date.parse(value))
    ? new Intl.DateTimeFormat("en-UG", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Kampala",
      }).format(new Date(value))
    : "Not synced";
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function dueLabel(value: string) {
  return value.slice(0, 10) === today() ? "Today" : date(value);
}
export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
export function label(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (s) => s.toUpperCase());
}
