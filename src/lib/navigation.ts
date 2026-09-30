import type { Role } from "../types";

export type NavigationIcon =
  | "home"
  | "farm"
  | "weather"
  | "prices"
  | "learn"
  | "season"
  | "harvest"
  | "community"
  | "assistant"
  | "farmers"
  | "trade"
  | "messages"
  | "admin";
export type NavigationItem = {
  to: string;
  label: string;
  icon: NavigationIcon;
};
export type NavigationGroup = "more" | "cooperative" | null;

export const CORE_NAVIGATION: readonly NavigationItem[] = [
  { to: "/", label: "Home", icon: "home" },
  { to: "/farms", label: "Farms", icon: "farm" },
  { to: "/weather", label: "Weather", icon: "weather" },
  { to: "/markets", label: "Prices", icon: "prices" },
  { to: "/learn", label: "Learn", icon: "learn" },
];
const MORE_NAVIGATION: readonly NavigationItem[] = [
  { to: "/seasons", label: "Season planner", icon: "season" },
  { to: "/harvest", label: "Harvest & collection", icon: "harvest" },
  { to: "/community", label: "Community reports", icon: "community" },
  { to: "/assistant", label: "Farm assistant", icon: "assistant" },
];
const COOPERATIVE_NAVIGATION: readonly NavigationItem[] = [
  { to: "/crm", label: "Farmers & CRM", icon: "farmers" },
  { to: "/trade", label: "Trade desk", icon: "trade" },
  { to: "/messages", label: "Messages", icon: "messages" },
  { to: "/admin", label: "Administration", icon: "admin" },
];

// Navigation only reflects permissions. API and route guards remain authoritative.
export function navigationFor(role: Role | null | undefined) {
  return {
    core: CORE_NAVIGATION,
    more: MORE_NAVIGATION,
    cooperative:
      role === "operator" || role === "admin" ? COOPERATIVE_NAVIGATION : [],
  };
}

export function routeMatches(pathname: string, route: string) {
  return (
    pathname === route || (route !== "/" && pathname.startsWith(`${route}/`))
  );
}

export function activeNavigationGroup(
  pathname: string,
  role: Role | null | undefined,
): NavigationGroup {
  const navigation = navigationFor(role);
  if (navigation.more.some((item) => routeMatches(pathname, item.to)))
    return "more";
  if (navigation.cooperative.some((item) => routeMatches(pathname, item.to)))
    return "cooperative";
  return null;
}

export function navigationLabel(
  pathname: string,
  role: Role | null | undefined,
) {
  const navigation = navigationFor(role);
  if (routeMatches(pathname, "/settings")) return "Settings & connection";
  return (
    [...navigation.core, ...navigation.more, ...navigation.cooperative].find(
      (item) => routeMatches(pathname, item.to),
    )?.label ?? "Agribridge"
  );
}
