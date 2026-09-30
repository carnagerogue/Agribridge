# Uganda market data: operator handoff

## Approved reference source

Use **WFP — Uganda Food Prices, via the Humanitarian Data Exchange (HDX)** as a monthly market reference. Public metadata and both CSV downloads were successfully retrieved without credentials during the September 2026 review.

- [Dataset and publisher](https://data.humdata.org/dataset/wfp-food-prices-for-uganda)
- [CKAN metadata API](https://data.humdata.org/api/3/action/package_show?id=wfp-food-prices-for-uganda)
- [Prices CSV](https://data.humdata.org/dataset/883929b1-521e-4834-97f5-0ccc2df75b89/resource/e082d683-cad5-4dcd-bf54-db76ae254d33/download/wfp_food_prices_uga.csv)
- [Market locations CSV](https://data.humdata.org/dataset/883929b1-521e-4834-97f5-0ccc2df75b89/resource/4ef683cd-ccdd-4f96-9dc3-e25e6af88d25/download/wfp_markets_uga.csv)

HDX declares **Creative Commons Attribution 3.0 IGO**. The [license](https://creativecommons.org/licenses/by/3.0/igo/) permits redistribution and adaptation, including commercial use, subject to attribution and its other conditions. Link the dataset and license, identify filtering or transformations, retain supplied notices, and never imply WFP/HDX endorsement. Do not apply restrictions that contradict the source license. Confirm these terms again before launch or changing providers; public accessibility alone is not permission to redistribute another provider's data.

Suggested attribution: “Source: WFP, Uganda Food Prices, via HDX. CC BY 3.0 IGO. Filtered and formatted by Agribridge. Not a firm trading quote.”

## Freshness and coverage actually verified

The downloaded prices file contained **34,328 observations**, 16 columns and 4,327,511 bytes. Coverage: **2006-01-15 to 2026-08-15**, with observations for **43 markets**. All rows were marked `actual`, denominated in UGX. The separate locations file contains 104 records; do not count those as 104 markets with price observations.

The resource publication timestamp was **2026-09-27T20:10:56.443347**. That is not the observation date. The newest 208 rows represent **August 2026**, exclusively across **13 refugee-settlement markets**.

| Series coverage | Latest observed period in this snapshot |
| --- | --- |
| Settlement retail markets | August 2026 |
| Owino/Kampala, Gulu, Jinja, Mbarara, Mbale, Arua, Fort Portal, Masaka | April 2026 |
| Wholesale prices, all markets | May 2022 |
| Generic `Maize` and `Rice` commodities | May 2022 |
| `Plantains` | November 2018 |

Representative verified rows, all **Retail, UGX per KG**:

| Source date | Market | Commodity | Price |
| --- | --- | --- | ---: |
| 2026-08-15 | Adjumani (refugee settlement) | Maize (white) | 1,500 |
| 2026-08-15 | Adjumani (refugee settlement) | Beans | 4,767 |
| 2026-08-15 | Adjumani (refugee settlement) | Cassava (fresh) | 996 |
| 2026-08-15 | Imvepi (refugee settlement) | Maize (white) | 1,825 |
| 2026-04-15 | Owino | Beans | 4,514 |

The [publisher's pipeline](https://github.com/OCHA-DAP/hdx-scraper-wfp-foodprices) consumes monthly prices. Every observed date in this snapshot falls on the 15th: display the month, not an exact-day live quote. Expected updates are monthly; metadata explicitly warns that updates can be more or less frequent. Daily polling does not make observations daily.

## Import and display rules

- Preserve `date`, market/commodity IDs and names, administrative labels, coordinates, `unit`, `priceflag`, `pricetype`, `currency`, and `price`. Keep observation period, source publication time, and Agribridge retrieval time separate.
- Observation key: date + market ID + commodity ID + unit + price type + flag + currency. The reviewed snapshot had no duplicate keys, missing fields, nonpositive prices, or unmatched priced-market IDs.
- Preserve distinctions between white maize, generic maize, maize flour, fresh cassava and cassava flour. Do not combine retail with wholesale. No current coffee series was present.
- Filter household/nonfood products explicitly. Units include KG, L, Unit, Pair and Packet; never label all values UGX/kg or invent conversions.
- Use per-series freshness. Do not apply August's date to April city observations, estimate a national price from settlement markets, or treat retail prices as farm-gate revenue.
- Fetch server-side with time/size limits and caching. HDX datastore is inactive: use the CSV resource. Handle optional HXL rows, schema changes, malformed data and upstream outages without replacing the last valid snapshot with empty data.
- Show “Monthly reference”, source, market, retail/wholesale, unit and observation month. Preserve stale warnings in offline views and any messaging summaries. Never promise availability, buyer demand, sale proceeds or executable prices.

## Daily prices and launch gates

No current, unrestricted daily Uganda feed was proven in this review. [Farmgain](https://farmgainafrica.org/) advertises weekly retail/wholesale coverage through a premium terminal; [InfoTrade](https://infotradeuganda.com/) advertises subscription-dependent custom APIs. A production daily feed requires an approved provider partnership with explicit API access, redistribution rights, coverage and update commitments, or an accountable local collection programme. Do not scrape subscription systems or describe an unconnected partnership as live.

[FEWS NET](https://help.fews.net/fdw/fews-net-api) public Uganda API queries covering 2025 onward returned no records in this review; that does not establish that no restricted data exists. Its [usage policy](https://help.fews.net/fdp/data-and-information-use-and-attribution-policy) requires attention to third-party source restrictions. [World Bank RTFP](https://microdata.worldbank.org/catalog/8241) includes model-imputed prices; never substitute these for observed quotes without distinct labeling.

Before real-user launch:

1. Assign an owner to approve attribution, provider terms and coverage claims.
2. Verify production fetches, bounded imports, duplicate prevention, stale/offline labeling and outage recovery using real source data.
3. Set explicit per-series freshness rules; exclude historical wholesale records from current-price decisions and alerts.
4. Require dated, unit-specific local confirmation before pricing a deal; capture grade, quantity, transport and payment terms separately.
5. Obtain contractual access before advertising daily coverage. Record corrections and source changes; do not silently overwrite provenance.
