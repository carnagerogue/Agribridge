import { baseline } from "./001-baseline.js";
import { typedRecords } from "./002-typed-records.js";
import type { Migration } from "./runner.js";

/** Append new migrations here. Never reorder, rename or edit an applied one. */
export const MIGRATIONS: readonly Migration[] = [baseline, typedRecords];
