import { baseline } from "./001-baseline.js";
import { typedRecords } from "./002-typed-records.js";
import { marketplace } from "./003-marketplace.js";
import { marketConversations } from "./004-market-conversations.js";
import { marketOrders } from "./005-market-orders.js";
import { marketNotifications } from "./006-market-notifications.js";
import { buyerMarketplace } from "./007-buyer-marketplace.js";
import type { Migration } from "./runner.js";

/** Append new migrations here. Never reorder, rename or edit an applied one. */
export const MIGRATIONS: readonly Migration[] = [
  baseline,
  typedRecords,
  marketplace,
  marketConversations,
  marketOrders,
  marketNotifications,
  buyerMarketplace,
];
