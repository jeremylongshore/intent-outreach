# 035-DR-DATA — Residential pack: free public data sources, verified live

> **2026-10-10 policy supersession:** [Council record037](037-AT-DECR-delegated-outreach-council.md)
> replaces personal-owner decision waits and governs production use. Baldwin's vendor endpoint
> stays disabled pending official programmatic-use evidence; Mobile tax-only/no-mailing data is
> excluded from outreach and absentee inference; disputed Okaloosa use stays held pending primary
> terms, while independently permitted FL DOR use remains separate. AL SOS is documented manual
> lookup only. Skip OpenCorporates commercial/private-store use absent a subscriber contract:
> [current terms](https://opencorporates.com/terms-of-use-2/) are stricter than this inventory's
> historical free-tier summary. No purchase is authorized. Historical field/endpoint observations
> below are retained; an accessible endpoint does not establish permitted reuse.


**Type:** Data reference (research, no code)
**Date verified:** 2026-10-06 (every endpoint below was hit with `curl` from the dev box on this date)
**Author:** Jeremy Longshore (intentsolutions.io)
**Feeds:** Phase 6 of `031-AT-DECR` (the `residential-re` pack: "free-tier data first"); epic
[#83](https://github.com/jeremylongshore/intent-outreach/issues/83)
**Fixtures:** `tests/fixtures/property/` (see §8)

---

## 0. Verdicts at a glance

| Source | Verdict | Why |
|---|---|---|
| Baldwin County AL parcels (KCS-hosted ArcGIS) | **Usable with limits** | Owner, mailing address, values, acres, deed date. No year built, no sale price, no situs ZIP or city. The host is the county's GIS vendor, not a documented public API. |
| Mobile County AL parcels (Revenue Commission, ArcGIS Online) | **Usable with limits (not for absentee detection)** | Owner and situs only. **No owner mailing address, no values, no sale, no year built.** The licence text says "for tax purposes only". |
| Escambia County FL parcels (county ArcGIS) | **Usable with limits** | Owner, mailing address, situs, values, land use, acres. No sale or year built (use the FL DOR layer for those). Confidential owners come back masked. |
| Okaloosa County FL parcels (county ArcGIS) | **Usable with limits** | Owner, mailing address, values, use code, year built, last 3 sales, acres. **No situs address on the parcel layer** (use the FL DOR layer). |
| Florida statewide cadastral (FL DOR roll via FDEP/FGIO ArcGIS Online) | **Usable** (best FL source) | One schema for both FL counties: owner, mailing, situs, just value, DOR use code, year built, last 2 sales. Annual roll snapshot, owner name cut at 30 characters. |
| FEMA NFHL flood hazard zones | **Usable** | Point query returns `FLD_ZONE` and `SFHA_TF`. The host drops connections now and then, so retries are required. |
| US Census Geocoder | **Usable** | Free, keyless, not Google. Fails on some non-standard addresses. Parcel geometry is the better source of a lat/lon. |
| OpenCorporates API v0.4 | **Not usable (free tier)** | Token required (no anonymous access, verified 401). Free tier is 50 calls/day and 200/month under ODbL share-alike, which a private outreach store cannot meet. Commercial use needs a paid licence. |
| Florida Sunbiz bulk data (SFTP) | **Usable** | Free public SFTP, daily and quarterly fixed-width files with up to 6 officers per entity. The best free LLC-to-person path in FL. |
| Alabama SOS business entity search | **Usable with limits** | No API and no bulk download. An HTML form you would have to scrape; terms UNVERIFIED. |

**None of this is legal advice.** "Terms" below quotes what each publisher says. No publisher said anything about
marketing use either way, except Mobile ("for tax purposes only") and Okaloosa (see §1.4). The send-time compliance
gates (TCPA, CAN-SPAM, DNC, fair housing) apply whatever the data source.

---

## 1. County parcel data

Every county layer is an ArcGIS REST `MapServer` or `FeatureServer` layer with the standard `query` operation.
Shared conventions:

- **Query URL:** `<layer>/query?where=<SQL>&outFields=*&returnGeometry=false&f=json`
- **By area:** `geometry=<xmin>,<ymin>,<xmax>,<ymax>&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects`.
  A polygon works the same way with `geometryType=esriGeometryPolygon` and an Esri JSON ring.
- **Paging:** `resultOffset=<n>&resultRecordCount=<m>&orderByFields=OBJECTID`. Every layer below reports
  `supportsPagination: true`. A page that hits the cap returns `"exceededTransferLimit": true`.
- **Counting:** `returnCountOnly=true`.
- **Coordinates:** pass `outSR=4326` to get lat/lon geometry; `returnCentroid=true` works on the ArcGIS Online layers.
- **Rate limits:** **none published by any county.** UNVERIFIED. Recommendation: one request at a time, at most
  about 1 per second, with backoff on 429/5xx (the existing `httpJson` already retries those).
- **APN normalization:** every county formats its parcel ID differently (dashes, spaces, `.XXX` suffixes, padded
  strings). The connector must store the county's canonical form as `apn` and build the key with `propertyKey()`.

### 1.1 Baldwin County, AL — FIPS 01003 (verified via Census `geographies/coordinates`)

- **Layer:** `https://web6.kcsgis.com/kcsgis/rest/services/Baldwin/Baldwin_Public_ISV/MapServer/31` ("Parcels")
- **Found by:** the Revenue Commission's official parcel viewer `https://isv.kcsgis.com/al.baldwin_revenue/` loads
  this layer (from `js/config/viewer.js`). KCS (Keet Consulting Services) is the county's GIS vendor. The URL in
  search results (`al05baldrevenue.kcsgis.com/.../Baldwin/Public/MapServer`) returns **404**, and
  `mapservices.baldwincountyal.gov` no longer resolves.
- **maxRecordCount:** 2000. **Total rows:** 162,219 (`where=1=1&returnCountOnly=true`). **Native SR:** 102100.
- **Alternative (not recommended):** the State of Alabama OGB layer
  `https://map.ogb.state.al.us/arcgis/rest/services/CMP/Political/MapServer/168` ("Baldwin County community
  parcels"). It is a different, older schema with no stated update date. Use it only as a fallback.

| Need | Field(s) | Notes |
|---|---|---|
| APN / parcel ID | `PARCELID` (16 digits), `PID` (dashed: `05-23-02-09-4-402-034.000`), `PIN` (account PIN) | Use `PARCELID` as `apn`. |
| Situs address | `SitusAddNumber` + `SitusAddName` | `SitusAddCity` is a smallint code, null in every sampled row. **No situs ZIP.** |
| Owner name(s) | `Owner`; `PreviousOwner` | One string, no split between co-owners. |
| Owner mailing address | `MailAdd1`, `MailAdd2`, `MailAdd3`, `MailCity`, `MailState`, `MailZip1`, `MailZip2` | Values are padded with spaces (`" P O BOX 2609"`), so trim them. |
| Assessed / market value | `TTV` (total true value), `TAV` (total assessed), `CLandValue`, `CImpValue`, `AssessedRate` | `AssessedRate` "9.00%" vs "20.00%" distinguishes class III owner-occupied from class II. Treat that as a hint only. |
| Land use / class | `PropertyClass`, `PropertySubClass`, `ImpDescrip`, `ZoningCode` | `PropertyClass` was null in every sampled row. |
| Last sale | `DeedRecorded`, `DeedSigned` (epoch ms), `DeedBook`, `DeedPage` | **No sale price field.** |
| Year built | — | **Not in the layer.** |
| Acreage | `CalcAcres` / `CalcAcre`, `DeededAcres` | |
| Other useful | `exemption`, `HasCurrentUse`, `TotalTaxDue`, `TaxYearDue`, `Subdivision`, `LegalDescription` | Homestead is not exposed as a flag. |

Query templates (all verified):

```text
By parcel:  .../MapServer/31/query?where=PARCELID='2302094402034000'&outFields=*&returnGeometry=false&f=json
            (or where=PIN='32370')
By situs:   .../MapServer/31/query?where=SitusAddNumber=410 AND SitusAddName='COURTHOUSE SQ'&outFields=*&f=json
By area:    .../MapServer/31/query?geometry=-87.7740,30.8800,-87.7700,30.8840&geometryType=esriGeometryEnvelope
            &inSR=4326&spatialRel=esriSpatialRelIntersects&returnCountOnly=true&f=json   -> {"count":111}
```

There is no ZIP query by situs, because there is no situs ZIP. Query by envelope or polygon, for example a Census
ZCTA polygon.

**Terms:** the viewer's disclaimer (`js/viewer/options.js`), verbatim: *"The data referenced in this online mapping
and GIS application has been assembled from a variety of public data sources. No warranty or representation is made
as to the accuracy and availability of said information. Measurements are approximate. Information displayed is
continuously updated, but its accuracy cannot be guaranteed. Independent verification is advised prior to making
project commitments."* It says nothing about commercial or marketing use. The layer has an empty `copyrightText`.
**Whether a vendor-hosted service that backs the official viewer may be called by a third-party app is UNVERIFIED.**
Ask the Baldwin Revenue Commission before production use.

### 1.2 Mobile County, AL — FIPS 01097 (verified via Census geocoder: 205 Government St → GEOID 01097)

- **Layer:** `https://services8.arcgis.com/HND1NcQt6vgOGn1z/arcgis/rest/services/MCRC_Public_Parcels/FeatureServer/0`
  (ArcGIS Online item `07c93ca64bbf4fb8a8d49b7ea80ef067`, owner `pellison_revenue`, "Mobile County Alabama Tax Parcels").
- **maxRecordCount:** 2000. **Last updated:** 2026-09-22 (item `modified`; the description reads "Updated 9/22/2026").

| Need | Field(s) | Notes |
|---|---|---|
| APN / parcel ID | `Parcel_Number` (`2906390004035.000`), `ParcelNo` (spaced: `29 06 39 0 004 035.XXX`), `Account_Number`, `KeyNum` | Use `Parcel_Number`. |
| Situs address | `PropAddr1`, `PropAddr2`, `PropCity`, `PropState`, `PropZip` | **This is the property address, not the mailing address.** Verified: the 19,620 rows with a `PropState` other than `AL` are typos such as `A` or `AO`, never real out-of-state states. Every field is right-padded with spaces. |
| Owner name(s) | `Name1`, `Name2` | `Name2` is a continuation or second line. |
| Owner mailing address | — | **Not published.** Absentee-owner detection is impossible from this source. |
| Value, land use, sale, year built | — | **Not published.** |
| Acreage | `Acreage`, `Sqft` | Both were 0 on the sampled government parcels. |

The only other source found is the Revenue Commission's Citizen Access Portal (`https://mobile.capturecama.com/`,
built by E-Ring). It is a JavaScript single-page app with an undocumented internal API, so do not build on it. Bulk
roll data (with mailing address) would have to be requested from the Revenue Commission (251-574-8530).
Availability and cost are UNVERIFIED.

Query templates (verified):

```text
By parcel:  .../FeatureServer/0/query?where=Parcel_Number='2906390004035.000'&outFields=*&returnGeometry=false&f=json
By situs:   .../FeatureServer/0/query?where=PropAddr1 LIKE '1150 GOVERNMENT ST%'&outFields=*&f=json
By ZIP:     .../FeatureServer/0/query?where=PropZip LIKE '36604%'&returnCountOnly=true&f=json        -> {"count":4263}
By area:    ...&geometry=-88.05,30.68,-88.04,30.69&geometryType=esriGeometryEnvelope&inSR=4326   -> {"count":571}
```

**Terms (item `licenseInfo`, verbatim):** *"DISCLAIMER: This product is for informational purposes only and is not
suitable for legal, engineering, or surveying purposes. ... By employing this data, the user acknowledges and
accepts all limitations. This data is for tax purposes only."* **"For tax purposes only" can be read as a use
restriction.** Flag it for the owner or counsel before Mobile parcel data feeds outreach. Until then a connector
should stamp `licenseTerms.outreachRestricted: true` on Mobile facts.

### 1.3 Escambia County, FL — FIPS 12033 (verified via Census geocoder: 221 Palafox Pl → GEOID 12033)

- **Layer:** `https://gismaps.myescambia.com/arcgis/rest/services/Individual_Layers/parcels/MapServer/0`
  ("Escambia County Parcels - Updated Monthly", copyright "Escambia County Property Appraiser").
- **maxRecordCount:** 1000. **Total rows:** 164,073. **Native SR:** 2883 (FL North, feet).
- The county also publishes `Parcel_Locator_by_Ref_Num` and `Parcel_Locator_by_Site_Address` geocode services on
  the same host. They were not tested.

| Need | Field(s) | Notes |
|---|---|---|
| APN / parcel ID | `REFNUM` (`08-2S-30-5005-000-002`), `REFERENCE` (no dashes: `082S305005000002`) | `REFERENCE` equals the FL DOR `PARCEL_ID`, which makes it the join key. |
| Situs address | `SITEADDR`, `CITY`, `ZIP` | |
| Owner name(s) | `OWNER`; `OWNERSPLITPCT` | |
| Owner mailing address | `MAILADDRESS1`, `MAILADDRESS2`, `MAILCITY`, `MAILSTATE`, `MAILZIP`, `MAILCOUNTRY` | |
| Assessed / market value | `CURRMKT`, `CURRASDLAND`, `CURRASDBLDG`, `CURRASDXF`, `CAPPEDVALUE`, `PREV*` | |
| Land use / class | `DORCD` (4-digit DOR use code, e.g. `8600` county), `LANDTYPE` | |
| Last sale | — | **Not in the layer.** Use FL DOR `SALE_PRC1`/`SALE_YR1`/`SALE_MO1` (§1.5). |
| Year built | — | **Not in the layer.** Use FL DOR `ACT_YR_BLT`. |
| Acreage | `LANDSIZE` (acres: 0.8196 for a 36,138 sq ft polygon) | |
| Exemptions | `EXEMPTION` (text), `SOHYEAR` (Save Our Homes year), `AGEXEMPT` | Homestead appears in `EXEMPTION`. |
| **Confidential flag** | `CONFCD` (`Y`/`N`) | **596 rows are `Y`.** Those rows have `OWNER`, all mailing fields and `SITEADDR` replaced with asterisks (`"********************"`). This is the Ch. 119 F.S. exemption for protected persons such as law enforcement and judges. A connector **must** drop or refuse `CONFCD='Y'` rows, never emit a party from them, and must not try to re-identify them from another source. |

Query templates (verified):

```text
By parcel:  .../MapServer/0/query?where=REFNUM='08-2S-30-5005-000-002'&outFields=*&returnGeometry=false&f=json
By situs:   .../MapServer/0/query?where=SITEADDR LIKE '4109 N PALAFOX%'&outFields=*&f=json
By ZIP:     .../MapServer/0/query?where=ZIP='32502'&returnCountOnly=true&f=json                      -> {"count":3744}
By area:    ...&geometry=-87.22,30.41,-87.21,30.42&geometryType=esriGeometryEnvelope&inSR=4326   -> {"count":899}
Paging:     ...&where=ZIP='32502'&resultOffset=1000&resultRecordCount=5&orderByFields=OBJECTID   (verified)
```

**Terms:** the official site `escpa.org`, verbatim: *"The primary use of the assessment data is for the preparation
of the current year tax roll. Use of this data for any other purpose is not warranted. Parcel information is NOT
survey quality."* That is a no-warranty statement, not a use prohibition. Note that
`escambiapropertyappraiser.org` is a **private, unaffiliated** site ("not operated by the official Escambia County
Property Appraiser's office") and prohibits commercial reuse of its own content. Never use it as a source.

### 1.4 Okaloosa County, FL — FIPS 12091 (verified via Census geocoder: 1250 N Eglin Pkwy → GEOID 12091)

- **Layer:** `https://gis.myokaloosa.com/arcgis/rest/services/BaseMap_Layers/MapServer/111` ("PARCELS",
  copyright "Okaloosa County GIS Department", data maintained by the Okaloosa County Property Appraiser).
- **maxRecordCount:** 1000. **Total rows:** 114,000. **Native SR:** 102660 (FL North, feet).
- The layer description says property values are from the **previous** year's certified roll, while other CAMA data
  is current year.
- `http://ags.co.okaloosa.fl.us/arcgis/rest/services/LocalGovernment/AssessmentInformation/MapServer` (seen in search
  results) **timed out** and should be treated as dead.
- The "SITE ADDRESS" layer (`.../MapServer/106`) has the right schema (`PIN`, `SITE_ADDR`, `ZIP`, `ZIP_CITY`) but
  returns **0 rows** for every query (`where=1=1&returnCountOnly=true` → `{"count":0}`). It is unusable.

| Need | Field(s) | Notes |
|---|---|---|
| APN / parcel ID | `PATPCL_PIN` (`23-2S-24-221A-0000-0650`), `PATPCL_STRAP` | The FL DOR `PARCEL_ID` is the PIN with dashes removed (`232S24221A00000650`). |
| Situs address | — | **Not on this layer.** Use FL DOR `PHY_ADDR1`/`PHY_CITY`/`PHY_ZIPCD` (§1.5). |
| Owner name(s) | `PATPCL_OWNER` | |
| Owner mailing address | `PATPCL_ADDR1`, `PATPCL_ADDR2`, `PATPCL_ADDR3`, `PATPCL_CITY`, `PATPCL_STATE`, `PATPCL_ZIPCODE`, `PATPCL_CNTRY` | City is abbreviated (`SHALIMR`). |
| Assessed / market value | `PATPCL_JUSTVAL` (**string**), `PATPCL_ASSEDVAL`, `PATPCL_TAXVAL`, `PATPCL_BLDGVAL`, `PATPCL_MKTLAND`, `PATPCL_TOTALAPPR` | |
| Land use / class | `PATPCL_USECODE` (`2100`), `PATPCL_USEDESC` (`RESTAURANT/CAFE`) | |
| Last sale | `PATPCL_SALE1..3` (price), `PATPCL_SALEDT1..3` (int `YYYYMMDD`), `PATPCL_QUAL1..3`, `PATPCL_SALEBK/PG1..3` | |
| Year built | `PATPCL_BLDGAYB` (actual), `PATPCL_BLDGEYB` (effective) | |
| Acreage | `PATPCL_GIS_ACRE`, `PATPCL_LGL_ACRE` | |
| Exemptions | `PATPCL_EXCODE`, `PATPCL_EXMPTVAL` | |

Query templates (verified):

```text
By parcel:  .../MapServer/111/query?where=PATPCL_PIN='23-2S-24-221A-0000-0650'&outFields=*&returnGeometry=false&f=json
By owner:   .../MapServer/111/query?where=PATPCL_OWNER LIKE 'OKALOOSA COUNTY%'&outFields=*&f=json
By area:    ...&geometry=-86.62,30.40,-86.61,30.41&geometryType=esriGeometryEnvelope&inSR=4326   -> {"count":577}
```

You cannot query by situs on this layer. Go through FL DOR `PHY_ADDR1`, then join on the parcel ID.

**Terms:** `okaloosapa.com` blocks scripted fetches (HTTP 403), so the disclaimer could not be read directly. Search
results quote it as: no warranties; "not to be used for Financing Purposes, Insurance Purposes, &/or Address
Verification"; maps "to be used for assessment purposes only". **UNVERIFIED verbatim.** If accurate, "address
verification" is close to how an outreach pipeline would use the mailing address. Flag it for the owner or counsel,
as with Mobile.

### 1.5 Florida statewide cadastral (FL DOR roll) — covers Escambia and Okaloosa

- **Layer:** `https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0`
  ("CADASTRAL_DOR", owner FDEPMapDirect and FloridaGIO). Centroid twin:
  `.../Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0` ("FDOR Cadastral Centroids 2026", points).
- **maxRecordCount:** 2000. Last edit 2026-09-30. The data is the July roll submission each property appraiser
  sends to DOR, so it is an **annual snapshot**: up to 15 months stale on ownership.
- **County filter:** `CO_NO` is the **DOR county number, not FIPS**. Verified: Escambia = `27`, Okaloosa = `56`.
- **Gotchas:** `OWN_NAME` is cut at 30 characters (`ESCAMBIA COUNTY BOARD OF COUNT`). The ZIP fields are
  doubles. `returnCountOnly` with a ZIP filter returned HTTP 400 ("Unable to perform query"), but the same filter
  with paged record retrieval works. Each county is responsible for leaving Ch. 119 confidential records out.

| Need | Field(s) |
|---|---|
| APN | `PARCEL_ID` (with `CO_NO`) |
| Situs | `PHY_ADDR1`, `PHY_ADDR2`, `PHY_CITY`, `PHY_ZIPCD` |
| Owner | `OWN_NAME` (30 characters); fiduciary `FIDU_NAME`/`FIDU_*`/`FIDU_CD` |
| Mailing | `OWN_ADDR1`, `OWN_ADDR2`, `OWN_CITY`, `OWN_STATE`, `OWN_ZIPCD`, `OWN_STATE_` (country) |
| Value | `JV` (just value), `AV_SD`/`AV_NSD`, `TV_SD`/`TV_NSD`, `LND_VAL`, `JV_HMSTD` (non-zero = homestead) |
| Land use | `DOR_UC` (3-digit), `PA_UC` |
| Last sale | `SALE_PRC1`, `SALE_YR1`, `SALE_MO1`, `QUAL_CD1`, `OR_BOOK1`/`OR_PAGE1`; second sale `*2` |
| Year built | `ACT_YR_BLT`, `EFF_YR_BLT`; `TOT_LVG_AR`, `NO_RES_UNT` |
| Area | `LND_SQFOOT` |

Query templates (verified):

```text
By parcel:  .../FeatureServer/0/query?where=CO_NO=27 AND PARCEL_ID='082S305005000002'&outFields=*&returnGeometry=false&f=json
By ZIP:     .../FeatureServer/0/query?where=CO_NO=56 AND PHY_ZIPCD=32548&outFields=PARCEL_ID&resultRecordCount=2000&f=json
By area:    ...&geometry=-86.62,30.40,-86.61,30.41&geometryType=esriGeometryEnvelope&inSR=4326   -> {"count":577}
Centroid:   ...&where=CO_NO=56 AND PARCEL_ID='232S24221A00000650'&returnCentroid=true&outSR=4326
            -> {"x":-86.6349,"y":30.4060}
```

**Terms (item `licenseInfo`, verbatim excerpt):** *"The Department does not generate or maintain the data used to
compile this statewide parcel map. The Department does not guarantee the accuracy, or completeness, or the
compliance with public records laws of this parcel GIS data. The data is owned and maintained by each Florida
county's property appraiser's office..."* No use restriction is stated.

**Recommended FL design:** use FL DOR as the primary record (one schema, both counties, sale and year built), and
the county layer as a freshness overlay for owner, mailing address and `CONFCD`. A county `CONFCD='Y'` must
suppress the parcel even if the DOR row is present.

### 1.6 FIPS codes (verified 2026-10-06 via the Census geocoder `layers=Counties`)

| County | FIPS | Confirmed by |
|---|---|---|
| Baldwin, AL | `01003` | `geographies/coordinates` at -87.7743, 30.8821 (Bay Minette) |
| Mobile, AL | `01097` | 205 Government St, Mobile |
| Escambia, FL | `12033` | 221 N Palafox St, Pensacola |
| Okaloosa, FL | `12091` | 1250 Eglin Pkwy, Shalimar |

---

## 2. FEMA National Flood Hazard Layer

- **Layer:** `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28` ("Flood Hazard Zones").
  maxRecordCount 2000.
- **Point query (verified):**

```text
https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query
  ?geometry=<lon>,<lat>&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects
  &outFields=DFIRM_ID,FLD_AR_ID,FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,V_DATUM,DEPTH,SOURCE_CIT
  &returnGeometry=false&f=json
```

- **Fields:** `FLD_ZONE` (`A`, `AE`, `AO`, `VE`, `X`, ...), `ZONE_SUBTY` (e.g. `0.2 PCT ANNUAL CHANCE FLOOD HAZARD`),
  `SFHA_TF` (`T` = inside the Special Flood Hazard Area, `F` = outside), `STATIC_BFE` (base flood elevation; `-9999`
  = none), `V_DATUM`, `DFIRM_ID` (`01003C` = Baldwin).
- **Verified results:** Gulf Shores City Hall (-87.68882, 30.27177) returned `X` / 0.2% annual chance / `SFHA_TF=F`.
  A beach point (-87.7000, 30.2462) returned `AE` / `SFHA_TF=T` / BFE 13 ft NAVD88.
- **Gotchas:** the host **reset connections repeatedly** during testing (`curl: (35) Connection reset by peer`,
  including four failures in a row on the service-root request). Queries succeeded with `--retry 3`, so retry with
  backoff. A point on a
  boundary can return more than one polygon; take the most hazardous (`SFHA_TF=T` wins; `V*` > `A*` > `X`).
- **Terms:** the FEMA NFHL web services page states no restriction on third-party use. It limits **WFS** requests to
  1,000 features and points bulk users to the Map Service Center county downloads. It also warns that
  preliminary or pending data "cannot be used to rate flood insurance policies". NFHL is a US federal government
  work (17 U.S.C. § 105, no copyright). FEMA's own explicit licence statement for the REST service is
  **UNVERIFIED**. A pack must present flood zone as informational, never as an insurance or lending determination.

---

## 3. Owner entities: LLC → person

### 3.1 OpenCorporates API v0.4

- **Endpoints** (from `api.opencorporates.com/documentation/API-Reference`):
  - Company search: `GET https://api.opencorporates.com/v0.4/companies/search?q=<name>&jurisdiction_code=us_al|us_fl&per_page=100&page=<n>&api_token=<token>`
    (per_page max 100, page max 100)
  - Company with officers: `GET https://api.opencorporates.com/v0.4/companies/<jurisdiction_code>/<company_number>?api_token=<token>`
    (the response carries an `officers` array)
  - Officer search: `GET https://api.opencorporates.com/v0.4/officers/search?q=<name>&jurisdiction_code=us_fl&api_token=<token>`
  - The token can also go in the `X-API-TOKEN` header, which keeps it out of URLs and logs.
- **Live check:** both the search and the company endpoints return **HTTP 401** `{"error":{"message":"Invalid Api
  Token. ..."}}` with no token. There is **no anonymous access** (fixture `opencorporates-401-no-token.json`).
- **Free tier:** the docs say *"By default you're allowed up to 200 requests per month, and 50 requests per day"*.
  Free accounts are for open-data projects that publish under share-alike attribution.
  **This corrects `032-RA-SYNT` §2**, which says "~1,000 req/day".
- **Licence:** the database is ODbL. Use requires a visible "from OpenCorporates" attribution link, and **combined
  data must be republished under ODbL (share-alike)**. A private outreach store cannot meet that, so commercial or
  marketing use needs a paid non-share-alike licence (quoted tiers start around GBP 2,250/yr; vendor-page figures,
  UNVERIFIED).
- **US officer coverage:** the API docs do not state how complete officer data is for US states. **UNVERIFIED for
  `us_al` and `us_fl`.** For FL it duplicates Sunbiz anyway.
- **Verdict:** not usable on the free tier for this product. Use the state sources below.

### 3.2 Florida Division of Corporations (Sunbiz) bulk data — usable, free

- **Access (verified live):** SFTP `sftp.floridados.gov`, user `Public`. The state publishes the shared public
  password on `dos.fl.gov/sunbiz/other-services/data-downloads/`. It is deliberately not copied here: the state can
  rotate it, and the repo's secret scan rightly flags inline credentials. A connector should read it from
  configuration like any other value. Example:
  `curl -u "Public:${SUNBIZ_SFTP_PASSWORD}" sftp://sftp.floridados.gov/Public/doc/cor/`
- **Files:**
  - Daily corporate filings `Public/doc/cor/YYYYMMDDc.txt`, e.g. `20261005c.txt` (4.9 MB). Events:
    `Public/doc/cor/Events/`.
  - Quarterly full active file `Public/doc/Quarterly/Cor/cordata_2026-07.zip` (1.8 GB). Events: `corevent.zip`.
- **Format** (`https://dos.sunbiz.org/data-definitions/cor.html`): fixed width, **1440-byte records** (verified).
  Document number 1–12; name 13 (192); status 205 (1); filing type 206 (15, e.g. `FLAL` = FL LLC); principal
  address 221; mailing address 347; registered agent name 545 (42) and address 588.
  **Up to 6 officer blocks of 128 bytes, starting at byte 669** (verified: title `AMBR` at 669, type `P` at 673).
  Each block: title (4), type (1: `P` person / `C` corp), name (42), address (42), city (28), state (2), ZIP+4 (9).
- **Terms:** "offered as is and may be changed, replaced or deleted at any time", "for informational purposes". The
  SFTP banner reads "UNAUTHORIZED ACCESS IS PROHIBITED". Access with the published credentials is authorized. No
  restriction on commercial use or solicitation is stated. The definitions page warns that officer and address data
  "may not reflect the most current information on sunbiz.org because of the limited space in the file."
- **Design note:** this is a bulk download, not a lookup API. A connector would index the quarterly file locally
  (under `~/.intent-outreach/`) plus the daily deltas, then match owner names, which is probabilistic. That is what
  `EntityLink.confidence` is for.

### 3.3 Alabama Secretary of State — usable with limits

- **No API and no bulk download.** The "Business Downloads" page only offers filing forms (PDFs).
- **Search (verified live):** an HTML form, `POST https://arc-sos.state.al.us/cgi/corpname.mbr/output` with
  `search=<name>&type=ALL&place=ALL&city=&stat=ALL`. Results link to
  `GET https://arc-sos.state.al.us/cgi/corpdetail.mbr/detail?corp=<entity_id>&page=name&file=&type=ALL&status=ALL&place=ALL&city=`.
  The GET form with query parameters returns "No matches found", so it has to be a POST.
- **Detail page labels seen:** Entity ID Number, Entity Type, Principal Address, Status, Formation Date, Registered
  Agent Name, Incorporators (name, street and mailing address). Which member or manager fields an LLC carries is
  **UNVERIFIED**. Alabama LLCs file no annual report with the SOS, so member lists may be only what was in the
  formation filing.
- **Terms:** no terms page specific to automated access was found. **UNVERIFIED.** Scraping is fragile and possibly
  unwelcome. Rate-limit it hard (well under 1 request per second) or ask the SOS Government Records office first.

---

## 4. Geocoding (address → lat/lon for the FEMA query)

**First choice: parcel geometry, not geocoding.** Baldwin, Escambia, Okaloosa and FL DOR all return polygons with
`outSR=4326`. The ArcGIS Online layers (FL DOR, Mobile) also support `returnCentroid=true`, and FL DOR has a centroid
layer. A polygon centroid or label point is more accurate than a street-segment interpolation.

**Fallback: US Census Geocoder** (free, no key, US federal, no Google):

```text
Address -> point:
  https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=<urlencoded>&benchmark=Public_AR_Current&format=json
  -> result.addressMatches[0].coordinates {x: lon, y: lat}
Address -> point + county FIPS:
  https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=<...>&benchmark=Public_AR_Current
  &vintage=Current_Current&layers=Counties&format=json   -> geographies.Counties[0].GEOID
Point -> county:
  https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=<lon>&y=<lat>&benchmark=Public_AR_Current
  &vintage=Current_Current&layers=Counties&format=json
Batch: up to 10,000 records per file (documented limit).
```

- **Verified:** "1905 W 1st St, Gulf Shores, AL 36542" → (-87.68882, 30.27177). The three county seat addresses
  above resolved with the correct FIPS. **"312 Courthouse Sq, Bay Minette, AL 36507" returned no match**, because
  non-standard street names do fail. The geocoder interpolates along TIGER street segments, so the point is
  approximate.
- **Terms:** the API docs publish no rate limit and no terms text. No key is required. Census data is a US federal
  government work. Any explicit usage policy is **UNVERIFIED**, so throttle politely.

---

## 5. Mapping onto the schema v6 model (guidance only, no code)

- **Property:** `countyFips` from §1.6; `apn` = the county's canonical parcel ID (§1.1–1.5);
  `key = propertyKey(countyFips, apn)`. `address` = situs. Every other column becomes an `attributes` Fact
  (`assessedValueCents`, `marketValueCents`, `yearBuilt`, `landUse`, `acres`, `lastSaleDate`, `lastSalePriceCents`,
  `floodZone`, `sfha`), each with `source`, `fetchedAt` and the `responseHash` of the raw body.
- **Party** from the owner name: `kind: "entity"` when it matches LLC/INC/CORP/TRUST/COUNTY/CITY/BOARD patterns
  (`entityType: "government"` for public owners, which a pack should exclude from outreach). `mailingAddress` comes
  from the mailing fields. **Absentee owner = mailing address ≠ situs address**, which is possible for Baldwin,
  Escambia, Okaloosa and FL DOR, and **not possible for Mobile**.
- **Ownership:** `role: "owner"`; `share` from Escambia `OWNERSPLITPCT` when it is below 100; `asOf` from the deed or
  sale date when present.
- **EntityLink:** from Sunbiz officer blocks (FL) or AL SOS detail pages, with `confidence` below 1 for any
  name-only match.
- **LicenseTerms** (proposed ids): `public-record-baldwin-al`, `public-record-escambia-fl`, `public-record-okaloosa-fl`,
  `fl-dor-roll`, `fema-nfhl`, `sunbiz-bulk`, `al-sos-web` with `outreachRestricted` left undeclared (a gate treats
  that as restricted) until the owner decides; `mobile-mcrc-tax-only` with `outreachRestricted: true` (see §1.2).
- **Masking:** treat a run of `*` in any name or address as absent, and drop the record (Escambia `CONFCD='Y'`).

---

## 6. Open items for the owner

1. **Mobile County:** the only REST layer has no mailing address and says "for tax purposes only". Decide whether
   to request bulk roll data from the Revenue Commission, or leave Mobile out of absentee-owner campaigns.
2. **Baldwin County:** the working endpoint is the Revenue Commission vendor's (KCS) server behind the official
   viewer, not a documented public API. Confirm with the Revenue Commission that programmatic use is fine.
3. **Okaloosa:** confirm the verbatim PA disclaimer ("Address Verification" exclusion). The site blocks scripted
   fetches.
4. **Alabama SOS:** no API exists. Decide between polite scraping and manual lookup for AL LLC owners.
5. **OpenCorporates:** paid licence or skip. The free tier is incompatible with a private store.

---

## 7. Sources

- Baldwin viewer and config: https://isv.kcsgis.com/al.baldwin_revenue/ (`js/config/viewer.js`, `js/viewer/options.js`)
- Baldwin layer: https://web6.kcsgis.com/kcsgis/rest/services/Baldwin/Baldwin_Public_ISV/MapServer/31
- Alabama OGB fallback: https://map.ogb.state.al.us/arcgis/rest/services/CMP/Political/MapServer/168
- Mobile layer: https://services8.arcgis.com/HND1NcQt6vgOGn1z/arcgis/rest/services/MCRC_Public_Parcels/FeatureServer/0
  (item https://www.arcgis.com/home/item.html?id=07c93ca64bbf4fb8a8d49b7ea80ef067)
- Mobile Citizen Access Portal: https://mobile.capturecama.com/
- Escambia layer: https://gismaps.myescambia.com/arcgis/rest/services/Individual_Layers/parcels/MapServer/0
- Escambia PA disclaimer: https://www.escpa.org/
- Unaffiliated look-alike (do not use): https://escambiapropertyappraiser.org/disclaimer/
- Okaloosa layer: https://gis.myokaloosa.com/arcgis/rest/services/BaseMap_Layers/MapServer/111
- Okaloosa PA GIS page (403 to scripts): https://www.okaloosapa.com/gis-mapping/
- FL statewide cadastral: https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0
  (items `64a6281f835c4b09a8abcc4e309230de`, `efa909d6b1c841d298b0a649e7f71cf2`)
- FEMA NFHL: https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28 and
  https://hazards.fema.gov/femaportal/wps/portal/NFHLWMS
- Census Geocoder API: https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html
- OpenCorporates API reference: https://api.opencorporates.com/documentation/API-Reference
- OpenCorporates terms (ODbL, attribution, share-alike): https://opencorporates.com/terms-of-use-2/
- Sunbiz data downloads: https://dos.fl.gov/sunbiz/other-services/data-downloads/ and definitions
  https://dos.sunbiz.org/data-definitions/cor.html
- Alabama SOS entity search: https://arc-sos.state.al.us/CGI/CORPNAME.MBR/INPUT and
  https://www.sos.alabama.gov/business-entities/business-downloads

---

## 8. Fixtures (`tests/fixtures/property/`)

All fixtures are raw responses captured on 2026-10-06. Every owner in them is a government body, and every address
is a public building or a public beach. The one record of a protected owner is sanitized.

| File | What it shows |
|---|---|
| `baldwin-al-parcel-by-pin.json` | Baldwin layer 31, `where=PIN='32370'` (owner Baldwin County, 410 Courthouse Sq) |
| `mobile-al-parcel-by-number.json` | Mobile MCRC layer, `Parcel_Number='2906390004035.000'` (owner Mobile County); shows the space padding |
| `escambia-fl-parcel-by-refnum.json` | Escambia layer, `REFNUM='08-2S-30-5005-000-002'` (owner Escambia BOCC) |
| `escambia-fl-confidential-masked.sanitized.json` | A `CONFCD='Y'` row as the county masks it. Parcel IDs, legal description, subdivision and shape replaced with placeholders. |
| `okaloosa-fl-parcel-by-pin.json` | Okaloosa layer 111, `PATPCL_PIN='23-2S-24-221A-0000-0650'` (owner Okaloosa County, 3 sales, year built) |
| `florida-dor-statewide-escambia-parcel.json` | FL DOR layer, `CO_NO=27 AND PARCEL_ID='082S305005000002'` (the same parcel as the Escambia fixture) |
| `fema-nfhl-point-zone-x.json` | NFHL point query at Gulf Shores City Hall: zone X, `SFHA_TF=F` |
| `fema-nfhl-point-sfha.json` | NFHL point query on Gulf Shores public beach: zone AE, `SFHA_TF=T`, BFE 13 |
| `census-geocoder-onelineaddress.json` | Census `locations/onelineaddress` for Gulf Shores City Hall |
| `opencorporates-401-no-token.json` | The 401 body OpenCorporates returns without a token |
