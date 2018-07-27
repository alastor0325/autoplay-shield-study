# Autoplay Shield Studies Add-On

## Goal
In order to understand how do people think about the "doorhanger" project which provides a prompt to ask autoplay permission for site, we need to write a shield-study extension to collect related data and response. See [bug1475099](https://bugzilla.mozilla.org/show_bug.cgi?id=1475099) for more information.

## Seeing the add-on in action
See [TESTPLAN.md](./docs/TESTPLAN.md) for more details on how to get the add-on installed and tested.

## Data Collected / Telemetry Pings
See [TELEMETRY.md](./docs/TELEMETRY.md) for more details on what pings are sent by this add-on.

## Analyzing data
Telemetry pings are loaded into S3 and re:dash. Sample query:
* [All pings](https://sql.telemetry.mozilla.org/queries/{#your-id}/source#table)

## Improving this add-on
See [DEV.md](./docs/DEV.md) for more details on how to work with this add-on as a developer.
