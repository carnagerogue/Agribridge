# Agribridge workspace guide

These instructions describe the application, not agronomic recommendations.

## Get guidance wherever you are

Every signed-in section has **Guide me**, with three clear steps for that screen.
The guide remains available without an AI request. **Ask AI about this** prepares
a question for the assistant; review it and give consent before sending.
No private records are copied into these questions, and opening a guide or an
assistant link does not change records or send an AI request.

Home shows a farm journey and, for cooperative staff, a cooperative journey.
Progress means a relevant record exists in the current workspace. It does not
verify quality, delivery or payment. Follow **Take the next step** to the tool
you need. Cooperative tools remain restricted by account role.

## Start with a farm

Open **Farms**, choose **Add a farm**, and enter the plot name, farmer name,
district, area, crop, planting date and growth stage. Use real records. Tasks
can belong to a farm or be general: create them from Home or Farms, set a title and due date, then
mark them complete or reopen them as work changes.

## Plan a season

Create a season linked to a farm in **Season planner**. Record planned and actual
costs, harvest targets and sales. Comparisons are calculated from your entries;
they are not forecasts of market prices or guaranteed returns.

## Record harvests and collections

In **Harvest & collection**, record a lot against a farm, optionally linked to a season, including
harvest date, weight and quality observations. Cooperative staff review lots.
Only accepted lots can be allocated to buyer collections. A collection manifest
records the allocation; it does not confirm a payment.
Linked lots must fit within the season's recorded harvested weight.

## Coordinate the cooperative

**Farmers & CRM** lets cooperative staff manage contacts, follow-ups and consent.
**Trade desk** tracks deals and readiness; it does not execute payments or provide
customs clearance. Administrators manage user access in **Administration**.

## Use information with its source

**Prices** distinguishes dated WFP/HDX monthly reference prices from local price
records and offers. Reference prices are not today's buyer quotes.
**Weather** displays dated model forecasts, separately from official warnings.
MET Norway forecasts show rain amounts; that provider does not supply rain
probabilities here.

**Community reports** request human review and do not diagnose crops. Crop
treatment, planting rates, fertiliser or chemical decisions need qualified local
advice. The assistant provides instructions and sourced explanations; it cannot
create records, contact people, make payments or perform actions for you.

## Learning, access and connection

**Learn** provides learning resources and short field guides. Check the review
status before relying on a guide. Draft agronomic content requires qualified
review. Read a lesson and answer its knowledge check when available.

**Settings & connection** lets you enable storage on a trusted device while
connected. Farmers can retain essential farm records and lessons. Private
financial, contact and cooperative records remain online. Review pending
changes and wait for sync confirmation before clearing device data.

Administrators manage accounts in **Administration** and inspect integration
status and audit activity. At this handover, WhatsApp, SMS, USSD and automated
voice are pending provider setup. Contact preferences and previews do not
prove delivery. After setup, inspect message delivery status.

## Forecast configuration

Set `WEATHER_PROVIDER=met-no` to use the public MET Norway Locationforecast.
The server identifies its requests, caches responses and displays CC BY 4.0
attribution. Temperature ranges and rain totals use the available forecast
periods grouped by their start date in Uganda; today may be partial and later
periods span six hours.

Alternatively, configure a licensed or self-hosted Open-Meteo endpoint using
`OPEN_METEO_BASE_URL`. Keep API keys on the server.
