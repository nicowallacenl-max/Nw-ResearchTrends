# Mock-ups

Design mock-ups (Autobodies "Workshop OS" style). Reference only: not part of the app build or the live site.

| File | Screen | Size |
| --- | --- | --- |
| `Main.dc.html` | Workshop dashboard: KPI tiles, repair bays, job pipeline | 1440 × 1080 |
| `JobDetail.dc.html` | Repair job detail: stage progress, damage scan, photos + viewer, estimate, activity log | 1440 × 1080 |
| `MobileTracker.dc.html` | Customer repair tracker (phone): progress ring, stage list, call shop / view photos | 390 × 844 |

Design notes: fonts Chakra Petch (headings), Inter (body), JetBrains Mono (labels); white grid background, cyan
accent `#00EEEA`, teal links `#007A78`, red in-progress `#E11D2E`, green done `#16A34A`, amber parts `#FB8E28`;
cut-corner panels.

These are design-tool exports: they load `./support.js` from the design tool, which isn't included, so they won't
render on their own if opened from this folder.
