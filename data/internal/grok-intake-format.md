# Grok → Codex product handoff

The current catalogue is mapped by `itemId`. Keep Grok's original filename and confidence; do not reanalyse images to fill missing fields. Unknown brand, model and cost use `null`. Costs are integer ZAR cents, never retailer reference prices.

Save an array of records in a private JSON file:

```json
[
  {
    "itemId": "2DS-0046",
    "originalFilename": "original-photo-filename.jpg",
    "product": "Recorded product name",
    "brand": null,
    "model": null,
    "sourceCostCents": null,
    "condition": "USED",
    "visibleCondition": "Grok's actual visible condition",
    "visibleDamage": "Grok's visible damage or wear",
    "accessoriesIncluded": [],
    "confidence": "HIGH"
  }
]
```

This is a format example, not real product data. Valid confidence values: HIGH, MEDIUM, LOW. Valid condition values: VERY_GOOD, GOOD, USED, AS_IS.

Run `npm run catalogue:import -- path/to/grok.json` for a private change report. Add `--apply` to update existing drafts. Conflicting owner costs stop the import. Existing selling prices and all photos are retained. Actual-item review and specification verification reset after new observations. Manufacturer research is a separate step. The product edit page supports photo uploads, price recommendations and manual overrides.

Never publish this file or import reports as customer content. Source costs, supplier references and confidence are internal.
