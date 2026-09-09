# Dilute at the probe tip: a fan-flushed mixing box is the only rig that keeps a $40 PM sensor alive on a smoker stack

Ticket: [#673](https://github.com/benjr70/Smart-Smoker-V2/issues/673) (part of wayfinder map [#671](https://github.com/benjr70/Smart-Smoker-V2/issues/671) — Smoke Quality — map). Researched on 2026-09-08.

Sources:

- US EPA, _Method 5G — Determination of Particulate Matter Emissions from Wood Heaters (Dilution Tunnel Sampling Location)_, 8/3/2017 — <https://www.epa.gov/sites/default/files/2017-08/documents/method_5g.pdf> (downloaded and read with `pdftotext -layout`).
- US EPA, _Method 5H — Determination of Particulate Matter Emissions from Wood Heaters from a Stack Location_, 8/3/2017 — <https://www.epa.gov/sites/default/files/2017-08/documents/method_5h.pdf>.
- US EPA, _Method 5 — Determination of Particulate Matter Emissions from Stationary Sources_, 8/2/2017 — <https://www.epa.gov/sites/default/files/2017-08/documents/method_5.pdf>.
- US EPA, _Method 201A — Determination of PM10 and PM2.5 Emissions from Stationary Sources (Constant Sampling Rate Procedure)_, 8/2/2017 — <https://www.epa.gov/sites/default/files/2017-08/documents/method_201a.pdf>.
- US EPA, _Method 202 — Dry Impinger Method for Determining Condensable Particulate Matter from Stationary Sources_, 8/2/2017 — <https://www.epa.gov/sites/default/files/2017-08/documents/method_202.pdf>.
- IEA Bioenergy Task 32, _Advanced Test Methods for Firewood Stoves_ (2018) — <https://www.ieabioenergy.com/wp-content/uploads/2018/11/IEA_Bioenergy_Task32_Test-Methods.pdf>. Used for NS 3058, EN 16510 / prEN 16510, CEN/TS 15883 and the Ecodesign emission-limit conversions.
- Sensirion, _Mechanical Design and Assembly Guidelines for SPS30 Particulate Matter Sensor_, Version 1.0 – D1, January 2019 — <https://cdn.sparkfun.com/assets/4/6/0/6/1/SPS30_Mechanical_Design_and_Assembly_Guidelines_v1.0_D1.pdf> (identical Mouser mirror: <https://www.mouser.com/pdfdocs/PS_AN_SPS30_Mechanical_Design_and_Assembly_Guidelines_v10_D2.pdf>).
- Sensirion, _Datasheet SPS30_, Version 2.0 – D1, June 2023 — <https://sensirion.com/media/documents/8600FF88/64A3B8D6/Sensirion_PM_Sensors_Datasheet_SPS30.pdf>.
- S.-L. von der Weiden, F. Drewnick, S. Borrmann, _Particle Loss Calculator – a new software tool for the assessment of the performance of aerosol inlet systems_, Atmos. Meas. Tech. 2, 479–494, 2009 — <https://amt.copernicus.org/articles/2/479/2009/amt-2-479-2009.pdf>.
- Dekati Ltd., _Dekati® Diluter_ product page — <https://www.dekati.com/products/dekati-diluter/>.
- N. A. H. Janssen et al. (16-volunteer barbecue exposure study), _Short-term associations between barbecue fumes and respiratory health in young adults_, Environmental Research, 2022, doi [10.1016/j.envres.2021.111868](https://doi.org/10.1016/j.envres.2021.111868); abstract retrieved from Europe PMC REST (`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:34453901&resultType=core&format=json`) because ScienceDirect returns HTTP 403.
- US Patent US11291332B2, _Systems and methods for an automated barbecue smoker_ (Harvard University, priority 2015-01-26) — <https://patents.google.com/patent/US11291332B2/en>.
- US Patent US10674866B2, _Smoke generation cooking system and methods_ — <https://patents.google.com/patent/US10674866B2/en>.
- ThermoWorks, _Smoke™ TRIM Function Guide_ (PDF) — <https://www.thermoworks.com/content/pdf/smoke_calibration_guide_a.pdf>.
- Sibling finding in this repo: `docs/research/smoke-quality-map/smoke-quality-sensors.md` (#672).

## TL;DR

- **Dilution is not optional and it is not primarily about fouling — it is about range.** Field-measured firewood-stove PM emission factors reach 150 mg/MJ (IEA Task 32), which converts to roughly **230 000 µg/m³** in the flue using IEA's own 40 mg/m³ ⟷ 26 mg/MJ factor. The SPS30's specified mass range is **0–1 000 µg/m³** and its number range is **0–3 000 #/cm³**. Raw stack gas is ~230× over full scale on mass. A sensor in the stack is not just dying, it is pinned.
- **The classic ~10:1 tunnel dilution used by the standards is far too weak for us.** NS 3058:2 dilutes "about 10 times with ambient air which resulted in sampling conditions of about 30–35 °C"; EPA Method 5G's 4 dscm/min tunnel over a ≤3 kg/h heater works out to roughly 8:1; the Dekati ejector diluter is "~1:8". That ratio is tuned to a *gravimetric filter*, which has no upper range limit. For an optical sensor we need **~1:100 to 1:300**, trimmed empirically.
- **No, 1:100 does not kill the dirty/clean contrast.** The contrast is a *ratio* (#672: ~10× PM swing plus a mean-diameter shift), and the SPS30's precision above 100 µg/m³ is specified as a **percentage of measured value** (10 % m.v. for PM1/PM2.5), not an absolute floor. At 1:100 the dirty phase lands ~2 300 µg/m³ and the clean phase ~230 µg/m³ — a 10:1 separation with per-reading noise of ~10 %. Trim to ~1:300 so the dirty peak sits mid-scale (~700 µg/m³) and the clean phase (~70 µg/m³) still sits an order of magnitude above suburban background.
- **Read the stack, not the plume.** The barbecue exposure study measured **553–1 062 µg/m³ PM2.5 and 109 000–463 000 particles/cm³** in outdoor air around people *sitting near* barbecues. A standoff plume hood is therefore already at or over the SPS30's mass full scale and **36–154× over its number full scale**, with a dilution ratio that swings with wind. Plume sampling buys you an uncontrolled, saturating signal — it does not buy you safety.
- **Recommended rig (Design A): a ~3 in. stainless stub probe through the stack wall discharging directly into a fan-flushed sheet-metal mixing box, standing off the stack on a bracket, with the SPS30 in a baffled dead-air pocket inside the box.** Diluting *at the probe tip* is what prevents tar: 100 volumes of dry ambient air per volume of exhaust drops the mixture's dew point to essentially ambient, so nothing condenses anywhere downstream. Keeping the probe stub short (a few inches) means there is no long cold tube for tar to plate out in. Rig parts estimate **$25–35**.
- **Sensor lifetime: expect a season, not a decade.** The SPS30's ">10 years" is an MTTF figure at 24 h/day operation, not a fouling figure. Fire `Start Fan Cleaning` (`0x56`) after **every** cook (the auto-clean timer "is reset to 0" on power-down), inspect the stub probe every ~5 cooks, and budget one replacement sensor per year until bench data says otherwise.

## 1. What the standards actually do, and what each approach costs us

### 1.1 Dilution tunnel (EPA Method 5G / ASTM E2515 / NS 3058)

Method 5G §2.1, verbatim:

> "The exhaust from a wood heater is collected with a total collection hood, and is combined with ambient dilution air. Particulate matter is withdrawn proportionally from a single point in a sampling tunnel, and is collected on two glass fiber filters in series. The filters are maintained at a temperature of no greater than 32 °C (90 °F)."

The hardware is specified tightly enough to copy in miniature (§6.1.4):

| Element | Method 5G spec |
| --- | --- |
| Hood | steel, "minimum diameter of 0.3 m (1 ft) on the large end" (§6.1.4.1) |
| Duct | steel, 0.15–0.3 m dia.; **0.15 m (6 in.) in the sampling section** (§6.1.4.3) |
| Mixing baffles | "Steel semicircles (two) attached at 90° to the duct axis on opposite sides of the duct midway between the two elbows upstream of sampling section. The space between the baffles shall be about 0.3 m (1 ft)." (§6.1.4.4) |
| Mixing length | "at least 1.2 m (4 ft) downstream of the elbow" to the traverse ports, then "At least 1.2 m (4 ft) downstream of the velocity traverse ports" to the sampling port; total hood-to-port run "shall not exceed 9.1 m (30 ft)" (§6.1.4.3) |
| Tunnel flow | "Verify that the flow rate is 4 ±0.40 dscm/min (140 ±14 dscf/min)" (§8.5.1) |
| Tunnel velocity | "the sampling section velocity shall be at least 220 m/min (720 fpm)" (§8.5.1 note) |
| Probe | "Stainless steel (e.g., 316 or grade more corrosion resistant) or glass about 9.5 mm (3/8 in.) I.D., 0.6 m (24 in.) in length" (§6.1.1.1) |
| Sample flow | "The initial sample flow rate shall be approximately 0.015 m³/min (0.5 cfm)" (§8.10.x) |
| Filter temp | "a filter holder temperature of no greater than 32 °C (90 °F)" |
| Hood standoff | set by draft: "Adjust the distance between the top of the wood heater stack exhaust and the dilution tunnel hood so that the dilution tunnel induced draft is less than 1.25 Pa (0.005 in. H₂O)" (§8.2), then re-adjusted for "100 percent of the exhaust gas is collected by the dilution tunnel hood" (§8.4) |

**Why it prevents fouling:** the sample is cooled and diluted *before* it touches any collection surface, so it arrives at the filter at ≤32 °C, below its dew point margin, and the condensable organics are already condensed onto airborne particles rather than onto tubing walls. **What it does to the signal:** it converts everything into a diluted-ambient measurement (that is the *point* — Method 202 §3.1 defines condensable PM as material that "condenses and/or reacts upon cooling and dilution in the ambient air"). **Complexity:** high — a 6 in. duct, a squirrel-cage blower, 8+ ft of run. **Consumables:** filters, which we do not need.

**The ratio.** Method 5G never states a dilution ratio. Two other sources do:

- IEA Task 32 on the Norwegian NS 3058:2 method: *"the flue gas is diluted about 10 times with ambient air which resulted in sampling conditions of about 30-35°C. Therefore, condensation of volatile organic compounds is promoted."*
- Dekati's commercial ejector diluter: *"Nominal dilution factor ~1:8, can be modified to higher dilution factors up to 1:50"*, with *"Dilution factors up to 10 000 possible by connecting diluters in series"*, operating principle *"Purified pressurised dilution air flows at high speed around an ejector nozzle and causes a pressure drop which draws the sample into the diluter"*, and *"Suitable for sampling high temperature aerosols up to 450 °C"*.

Cross-check on Method 5G, **my arithmetic, flagged as derived**: IEA's Ecodesign conversion gives a specific flue gas volume of 26 mg/MJ ÷ 40 mg/m³ = **0.65 m³(STP, dry, 13 % O₂) per MJ**. Method 5G's note applies below a 3 kg/h burn rate; at an assumed ~15 MJ/kg for seasoned firewood (**assumption, not cited**) that is 45 MJ/h → ~29 m³/h of flue gas against a 240 m³/h tunnel = **≈8:1**. Consistent with NS 3058's "about 10 times" and Dekati's 1:8. So **~1:10 is the industry-standard number, and it is a thermal/condensation target, not a range target.**

### 1.2 Heated sample line (EPA Method 5 / 5H)

Method 5 §6.1.1.2: *"Probe Liner. Borosilicate or quartz glass tubing with a heating system capable of maintaining a probe gas temperature during sampling of 120 ±14 °C (248 ±25 °F)"*, with the filter held at the same 120 ±14 °C (§6.1.1.6). Method 5H §2 keeps *"The first filter … at a temperature of no greater than 120 °C"* and then cools *"the second filter and the impinger system … such that the temperature of the gas exiting the second filter is no greater than 20 °C (68 °F)"*.

**Why it prevents fouling:** it keeps the sample *above* its dew point all the way to the filter, so tar never condenses in the line. **Fatal for us:** the sample arrives at 120 °C, and every candidate sensor's absolute maximum is 50–60 °C (#672). A heated line delivers the gas in exactly the state we cannot use, and it needs mains-powered heat tape along a 10 ft run. **Ruled out.**

### 1.3 Cooled side-draw with condensate trap (Method 5H / Method 202 pattern)

Method 5H's impingers sit "immersed in an ice water bath"; Method 202 §2.1 collects condensable PM "in dry impingers … a condenser followed by a water dropout impinger immediately after the final in-stack or heated filter."

**Why it prevents fouling:** it deliberately condenses the tar somewhere replaceable. **What it does to the signal:** it *removes* the condensable fraction — and per #672 the condensable/organic-carbon fraction is precisely the thing that swings 57 % → 14 % between O₂-starved and O₂-rich burning. **A condensate trap upstream of the sensor deletes our best discriminator.** A drip leg at the *lowest point of a diluted, ambient-temperature line* is still worth having as insurance, but a deliberate chiller is not.

### 1.4 Cyclone / impactor pre-separator (Method 201A)

Method 201A §1.5 kills this for us outright: *"You cannot use this method to measure emissions in which water droplets are present because the size separation of the water droplets may not be representative of the dry particle size released into the air."* Wood-smoke exhaust is water-saturated. Worse, §1.2: cyclones collect *"in stack"* — they sit at stack temperature, so they do not solve the heat problem; §6.1.1 requires *"stainless steel (316 or equivalent) or fluoropolymer-coated stainless steel nozzles with a sharp tapered leading edge"* sized from a velocity traverse, and the constant flow is *"necessary to maintain the size cuts of the cyclones."*

**And it destroys the signal.** The whole discriminator in #672 is the shape of the size distribution. A pre-separator with a defined cut point removes part of that distribution before the sensor sees it. **Do not fit a cyclone.**

### 1.5 Inline filter

Any filter fine enough to protect the optics removes the particles we are trying to count. Only defensible use is a **coarse** trap (stainless wool, ~mm-scale voids) purely to catch creosote flakes and insects, accepting an unknown-but-hopefully-stable loss of the largest particles. Treat as optional.

### 1.6 Standoff / plume sampling above the stack

This is Method 5G's hood without the tunnel, and the standard tells you the standoff distance is a *tuned* parameter, not a fixed one: §8.2 sets it by measured draft (<1.25 Pa induced) and §8.4 re-sets it for 100 % capture. Outdoors, with wind, neither is repeatable.

The quantitative objection is stronger. The barbecue exposure study measured, in outdoor air at bystander distance: *"High PM2.5 levels and PNCs were observed during barbecue sessions, with averages ranging from 553 to 1062 μg/m³ and 109,000-463,000 pt/cm³."* Against SPS30 full scale (1 000 µg/m³ mass, 3 000 #/cm³ number), the **number channel is already 36–154× over range at bystander distance** — and number concentration plus typical particle size is exactly what #672 selected the SPS30 for. A plume hood at 12–18 in. above a stack is far worse than bystander distance.

**Conclusion: sample the stack, then dilute hard.** Standoff sampling is a fallback only for the no-drilling case (§4.3), and even then it needs its own secondary dilution.

### 1.7 Sensor hood / shroud orientation — what Sensirion actually requires

The SPS30 mechanical guidelines are unusually prescriptive and they constrain the rig more than the stack does:

- §1: *"SPS30 features two air inlets and one air outlet that should not be obstructed and should be properly coupled to ambient air. The ambient particulate matter will flow through the sensor thanks to an integrated fan."*
- §2.1: *"Ideally, the sensor is placed as close as possible to the device's outer shell using large openings … The larger the opening, the better the air exchange … A tightly sealed separation between inlet and outlet will result in the best performance."* And: *"A constricted volume in front of inlets/outlet results in air flowing back from outlet to inlets, affecting the real measurement."* Also *"There should be no pressure difference between the two inlets and the outlet."*
- §2.2 (orientation): *"Placing the sensor with the inlets/outlet facing down avoids dust accumulation and accelerated sensor aging."* For lateral placement: *"Inlets should always be above outlet to avoid particles getting back from the outlet to the inlets due to gravity."*
- §2.3 (the load-bearing one): *"External airflows can generate a pressure drop between inlets and outlet and alter the sensor reading. Very strong flows can also physically prevent particles from entering the sensor inlet channels. The sensor should be isolated from the airflow of the final device (e.g., air purifier) if the velocity of this flow is greater than 1 m/s."*
- §2.4: *"it should be avoided to design the SPS30 in close vicinity to heat sources. It is further recommended to place the SPS30 below heat sources as air convection arising from heat sources might heat up the sensor."*
- §2.5: *"Exposing the SPS30 to direct sunlight might introduce temperature gradients and accelerate the aging of the SPS30."*
- §3: *"If an all-around casing is used, it is recommended to not cover the entire sensor surface to avoid overheating."*

**Design consequence, and it is the single most important constraint in this document: you must never plumb the SPS30 inline in a duct.** It self-aspirates and it must sit in a quiescent volume with <1 m/s crossflow, inlets down or above the outlet, out of the sun, below and away from any heat source. The rig's job is to deliver *diluted, ambient-temperature smoke into a calm box* — not to push gas through the sensor.

### 1.8 Tubing material and particle losses

The Particle Loss Calculator paper gives the rules we need:

- **Metal, grounded**: *"the loss of charged aerosol particles due to electrostatic deposition is negligible if the sampling lines are grounded and consist of conductive material (e.g. metal). Under these circumstances, no electrical field will exist in the interior of the tube (Faraday cage)."* → use copper or stainless, not silicone/Tygon/PVC.
- **Bends**: inertial deposition in a bend is one of the modelled loss terms, and *"loss in a bend is insignificant for 5≤R₀≤30"* where *"The curvature ratio R₀ is defined as the radius of the bend divided by the radius of the tube."* → make any bend's radius at least 5× the tube radius; avoid hard mitre elbows.
- **Enlargements**: *"In an enlargement in a piece of tubing, eddies form if the angle of enlargement is larger than 8° … care should be taken when designing an inlet that angles of enlargement be kept small."*
- **Thermophoresis**: *"Under most ambient aerosol measurement situations the temperature gradient between the tube walls and the aerosol is smaller than 40 K and the particle loss due thermophoresis is negligible."* → **our un-diluted case violates this badly** (300 °C gas in a 20 °C tube is a 280 K gradient), which is another way of saying: a long cold probe plates particles onto its own wall. Dilute at the tip so the gradient downstream is small.
- **Coagulation**: *"aerosol particle loss due to coagulation can be neglected if particle concentrations are smaller than 100 000 particles per cm³ and if the residence time of the aerosol in the sampling lines amounts to only a few seconds."* The barbecue study measured 109 000–463 000 pt/cm³ *in the diluted outdoor plume*, so raw stack gas is orders above this threshold. **Undiluted residence time must be sub-second, i.e. millimetres of probe, not metres.**

That last pair is the physical argument for the recommended design, stated compactly: **every metre of undiluted tube between stack and dilution point costs you particles, changes your size distribution, and grows tar. So dilute at the tip.**

## 2. Prior art: what BBQ/pellet-grill "smoke" products actually sense

Short version: **nothing on the consumer market senses smoke.** Everything sells "smoke" as a *control mode* or a *product name*.

| Product / patent | What it actually senses | Evidence |
| --- | --- | --- |
| ThermoWorks **Smoke™** | Temperature only — two probes, calibrated against an ice bath, "±1.8 °F". The word "Smoke" is the product name. | ThermoWorks' own [TRIM Function Guide PDF](https://www.thermoworks.com/content/pdf/smoke_calibration_guide_a.pdf): "Turn Smoke on and immerse probe 1 into the ice bath … It should be close to 32 °F." |
| MEATER | Internal meat temperature + ambient temperature. No PM/gas sensing found. | [MEATER Support: "Ambient Temperature Sensor"](https://support.meater.com/hc/en-us/articles/37182246162331-Ambient-Temperature-Sensor) — "The ambient sensor … measures the air temperature directly outside the meat." |
| Traeger **Super Smoke** | **Open-loop.** Modulates fan and auger to promote smouldering at 165–225 °F. Traeger's own support page returned HTTP 403 to automated fetch (**not verified from primary**), but the marketing page <https://www.traeger.com/smoke-science> and the patent below are consistent: no smoke measurement. | see next row |
| US10674866B2, *Smoke generation cooking system and methods* | Temperature sensors + timed pellet dosing. "adding a specified amount of combustible pellets to a combustion area" and "measuring a current internal temperature". **No optical, particulate or gas sensor appears in the description.** | <https://patents.google.com/patent/US10674866B2/en> |
| US11291332B2, *Systems and methods for an automated barbecue smoker* (Harvard, priority 2015-01-26) | Lists a "smoke sensor" but **never implements it**: "The sensors 125 may include, but are not limited to, any of temperature sensors, smoke sensors, air sensors, and humidity sensors" and "may measure … amount of smoke particles, chemical components of the smoke". No technology, mounting, or anti-fouling detail. | <https://patents.google.com/patent/US11291332B2/en> |
| Traeger pellet sensor | **Fuel level in the hopper**, not smoke. | Traeger's own marketing; widely reported. |
| HeaterMeter (open-source BBQ controller) | Thermistor/thermocouple pit and food temps driving a blower. No PM channel found in the project. | <https://www.raspberrypi.com/news/heatermeter-open-source-barbecue-controller/> |

I looked for a hobbyist BBQ PM write-up that reports measured numbers and **found none that cites measurements**. The nearest primary quantitative data on barbecue-smoke PM is the Environmental Research volunteer study cited above (553–1 062 µg/m³ PM2.5, 109 000–463 000 pt/cm³). **Flag for the map: this project appears to be doing something nobody has published.** That is a reason to expect a bench-tuning phase, not a reason to expect it to fail.

## 3. Does diluting kill the dirty/clean contrast? No — arithmetic

Inputs, all cited above:

| Quantity | Value | Source |
| --- | --- | --- |
| Firewood-stove PM emission factor, worst field study | 150 mg/MJ | IEA Task 32, field-test overview (SPITZER et al.) |
| Ecodesign PM limit | 40 mg/m³ (STP, dry, 13 % O₂) ⟷ 26 mg/MJ | IEA Task 32 §"transfer of ELVs" |
| ⇒ specific flue gas volume | 0.65 m³/MJ (derived: 26 ÷ 40) | my arithmetic |
| ⇒ raw flue PM, worst field case | 150 ÷ 0.65 ≈ **230 mg/m³ = 230 000 µg/m³** | my arithmetic |
| ⇒ raw flue PM, a compliant modern stove at the limit | **40 000 µg/m³** | IEA |
| SPS30 mass range | 0–1 000 µg/m³ | SPS30 datasheet Table 1 |
| SPS30 number range | 0–3 000 #/cm³ | SPS30 datasheet Table 1 |
| SPS30 precision, 100–1 000 µg/m³, PM1/PM2.5 | **10 % of measured value** | SPS30 datasheet Table 1 |
| SPS30 precision, 0–100 µg/m³, PM1/PM2.5 | 5 µg/m³ + 5 % m.v. | SPS30 datasheet Table 1 |
| Dirty:clean PM ratio | ~10× | #672 (BNL review) |

So:

- **Minimum dilution to be in range at all: ~40:1** (compliant stove) to **~230:1** (dirty field case). Standard-practice 10:1 is *not enough*.
- **At 1:100**: dirty ≈ 2 300 µg/m³ (still clipping in the worst case), clean ≈ 230 µg/m³.
- **At 1:300** (recommended target): dirty ≈ 770 µg/m³ — comfortably mid-scale — clean ≈ 77 µg/m³, i.e. ~10× above where the 5 µg/m³ absolute precision floor starts to bite, and far above suburban ambient background.
- **Contrast survives because precision is specified as % of measured value in the band we care about.** A 10:1 separation against 10 % m.v. noise is a ~50σ discrimination on mass alone, before you add the typical-particle-size channel.
- **Dilution also rescues the number channel**, which is the one that was hopeless in the plume: 1:300 brings a 400 000 #/cm³ raw plume to ~1 300 #/cm³, inside the 0–3 000 #/cm³ range.
- **Dilution has to be stable, not accurate.** We never report absolute µg/m³. We report *change over the cook* and *ratios* (PM10:PM2.5, typical particle size, number-vs-mass). Those are invariant under a constant dilution ratio, so what matters is that the geometry does not drift between cooks — hence "no adjustable damper", "fixed orifice", "same fan".

## 4. Recommended rigs

### 4.1 Design A (recommended) — stub probe + fan-flushed mixing box on a standoff bracket

Dilute **at the probe tip**. The probe is a few inches long, discharges straight into a box that is being continuously flushed with ambient air, and nothing between stack and sensor is ever hot, wet or slow.

```
                      exhaust stack (hot, ~150-300 C)
                      ||
                      ||
                      ||          <-- 3/8" SS stub probe, ~3" long, angled
                      ||\             DOWNWARD, through a drilled + welded
                      || \            bung; only ~1-2 in. protrudes inside
                      ||  \
                      ||   \  air gap (standoff bracket, 3-6 in.)
                      ||    \
                      ||   +-\--------------------------------+
                      ||   |  \  MIXING BOX  (4x4x6 in. steel |
   ambient air in --> ||   |   >-- junction box, painted, or   |
   (large screened    ||   |  /    a small stove-pipe tee)     |
    port, 2-3 in.)    ||   | /                                 |
                      ||   | |        [baffle]                 |
                      ||   | |                                 |
                      ||   | |     +-------------+             |
                      ||   | |     |   SPS30     |  <- inlets  |
                      ||   | |     | inlets DOWN |     facing  |
                      ||   | |     +-------------+     down    |
                      ||   |                                   |
                      ||   |   [80 mm 5 V fan, EXHAUSTING] --> |--> out
                      ||   +-----------------------------------+
                      ||          |
                      ||       drip leg / 1/8" weep hole at lowest point
                      ||
```

How it works:

- **The stub probe is the only hot part.** 3/8 in. 316 stainless, matching Method 5G §6.1.1.1's material and bore, but ~3 in. long instead of 24 in. Point the outboard end **downward** so gravity drains anything that does condense back out of the tube instead of into the box, and so the box is not in the probe's thermal shadow.
- **Flow through the probe is a bleed driven by stack draft**, on the order of a few mL/s. That is why the box's flush flow (an 80 mm fan moving litres per second) gives a dilution ratio in the hundreds. The ratio is set by geometry — probe bore and length vs fan flow — and is therefore repeatable as long as nobody changes either.
- **Nothing condenses**, because 300 volumes of dry ambient air per volume of exhaust puts the mixture's dew point at essentially ambient dew point. This is the same reasoning Method 202 §3.1 uses in reverse ("condenses and/or reacts upon cooling and dilution in the ambient air"): the condensables end up on airborne particles inside the box, where the sensor counts them, rather than on tube walls.
- **The SPS30 never sees the flush stream.** It sits behind a baffle in a dead-air pocket, satisfying Sensirion §2.3 (<1 m/s), §2.2 (inlets facing down), §2.4 (below and away from the heat source — the box stands off the stack on a bracket with an air gap, and the fan exhausts *away* from the sensor), §2.5 (box body shades it from sun).
- **The fan exhausts, it does not blow onto the sensor.** Pulling rather than pushing keeps the box slightly below ambient pressure so leaks draw clean room air in, not smoke out, and it satisfies §2.1's "no pressure difference between the two inlets and the outlet" better than a pressurised box.
- **Drip leg / weep hole** at the lowest point of the box catches anything that does drop out. Method 5G's train includes a dryer downstream for the same reason; ours is a $0 hole.
- **Optional coarse trap**: a loose plug of stainless wool inside the outboard end of the stub probe, changed every few cooks. Cheap insurance against creosote flakes. Accept an unknown loss of the coarsest particles; do **not** fit anything finer (§1.4, §1.5).
- **Bends**: keep any bend radius ≥ 5× tube radius (PLC's 5≤R₀≤30 rule); with a 3 in. straight stub there are none, which is the point.

Part list (US hardware-store / online; **prices are my estimates and were not verified against a live cart — flagged**):

| Part | Qty | Est. |
| --- | --- | --- |
| 3/8 in. OD 316 stainless tube, 12 in. (cut to ~3 in. + spare) | 1 | $8 |
| 3/8 in. stainless compression bulkhead fitting / weld bung for the stack | 1 | $6 |
| 4×4×6 in. steel electrical junction box (or a 3 in. stove-pipe tee + end caps) | 1 | $8 |
| 80 mm 5 V USB fan | 1 | $6 |
| Aluminium/steel insect screen + a scrap of sheet for the baffle | — | $3 |
| Standoff bracket (scrap angle iron — builder fabricates) | 1 | $0 |
| High-temp silicone / stove cement, screws, zip ties | — | $4 |
| **Rig total** | | **≈ $35** |

The fan needs 5 V; run it off the same USB hub as the sensor's USB-UART adapter (Pi 4 downstream USB budget is ~1.1 A aggregate per #672 §3.4, and an 80 mm fan is ~150 mA). The sensor stays plug-and-play on its 10 ft USB cable; nothing in this rig touches the electronics.

**Commissioning / trimming procedure** (must be done once, on the box, by the builder + a cook):

1. Run a cook with the rig as built. Log SPS30 PM2.5.
2. If the dirty phase pins at 1 000 µg/m³ → increase dilution: shorten the probe's *effective* bore by inserting a length of smaller tube into it, or move the probe further out of the stack. If the dirty phase never exceeds ~150 µg/m³ → decrease dilution: slow the fan (series resistor) or lengthen the probe insertion.
3. Target: dirty-phase peak **500–800 µg/m³**, clean phase **50–120 µg/m³**.
4. **Then never touch it again.** Record the geometry in the repo.

**Maintenance routine**: fire `Start Fan Cleaning` (`0x56`) after every cook — the SPS30 datasheet §4.2 is explicit that *"If the sensor is switched off, the time counter is reset to 0. Make sure to trigger a cleaning cycle at least every week if the sensor is switched off and on periodically."* Pull and wire-brush the stub probe every ~5 cooks (Method 5G §8.1 does the analogous thing: *"Clean the dilution tunnel with an appropriately sized wire chimney brush before each certification test"*). Wipe the box interior and check the weep hole every ~10 cooks. Read the SPS30 Device Status Register every cook and alert on the FAN/LASER bits (#672 §2.3) — that is the remote-diagnosis channel.

**Expected sensor lifetime**: the datasheet's *"Lifetime … 24 h/day operation … > 10 years"* is footnoted *"based on mean-time-to-failure (MTTF) calculation. Lifetime might vary depending on different operating conditions"* — it is not a contamination figure and no primary source quantifies laser fouling vs particle loading. **Honest estimate: plan for one season (~20–40 cooks) before the first calibration drift shows, and budget an annual replacement.** The datasheet does bound *drift*, which is the useful number: max long-term mass-concentration precision-limit drift of **1.25 % m.v./year** above 100 µg/m³ — but that is under normal ambient operation, not behind a smoker.

### 4.2 Design B (fallback, no drilling) — standoff plume hood with forced secondary dilution

If the builder will not penetrate the stack:

```
              ambient in (screened) --> +----------+
                                        | MIXING   |
   plume  ~~~~^^^^~~~~                  |   BOX    |--> fan out
              |                         | [SPS30]  |
        +-----+-----+                   +----------+
        |  hood     |                        ^
        | (funnel,  |----- 3/8" SS pickup ---+
        |  6-8 in.) |      tube, <12 in.
        +-----------+
              ^  fixed standoff h = 12-18 in., set once and BOLTED
              ||
              ||  stack
```

A steel funnel or a cut-down 6 in. stove-pipe elbow is held a **fixed, bolted** distance above the stack outlet, and a short stainless pickup tube takes a bleed from the hood throat into the same fan-flushed mixing box as Design A. The hood's only job is to make the pickup see plume rather than wind.

**Why it is second choice**: the standoff distance is exactly the parameter Method 5G tunes by measurement (§8.2 draft, §8.4 capture), and outdoors you cannot hold it — wind changes the entrainment ratio cook to cook. It still needs the secondary dilution box (per §1.6 arithmetic, plume alone saturates the number channel), so it is not actually simpler; it just avoids a hole. **Choose it only if drilling is vetoed.**

### 4.3 Explicit verdict: stack or plume?

**Stack, via a small bleed, diluted at the tip.** The plume above the stack is (a) already over the sensor's number-concentration range at bystander distance, (b) wind-dependent, and (c) not actually safer, because the failure mode that killed the previous sensor was condensation of tars on a cold surface — which a plume-mounted sensor also suffers. A tiny stack bleed diluted 100–300:1 into a room-temperature box is the only configuration where the gas reaching the optics is, thermodynamically, just slightly smoky room air.

### 4.4 Explicitly rejected, with reasons

- **Sensor anywhere in the stack, with any shroud** — every candidate's absolute max is 50–60 °C (#672); no shroud fixes 300 °C plus condensables.
- **Heated 120 °C sample line (Method 5)** — delivers gas above the sensor's absolute maximum; needs mains heat along a 10 ft run.
- **Cyclone/impactor (Method 201A)** — invalid with water droplets per §1.5, sits at stack temperature, and removes the size information we are measuring.
- **Chilled condensate trap upstream of the sensor (Method 5H/202 pattern)** — removes the condensable organic fraction, which is the discriminator.
- **Fine inline filter** — removes the measurand.
- **Ejector diluter (Dekati)** — technically ideal ("~1:8 … up to 1:50 … series … up to 10 000", "up to 450 °C"), but it needs a supply of purified compressed air and costs orders of magnitude more than $40. Cite it as the design we are approximating with a fan.

## 5. Open questions — these need a bench test, not a literature search

1. **The actual dilution ratio of Design A is not calculable from sources.** Bleed flow through a short stub under a few pascals of natural stack draft depends on the smoker's draft, which is unmeasured. The trimming procedure in §4.1 exists precisely because of this. A proper measurement would use the NS 3058 trick — IEA: *"The calculation of the dilution ratio is based on parallel CO₂ measurements in diluted and undiluted flue gas"* — which we cannot do without a CO₂ analyser. **Proxy test: burn a known reference (a candle, or a fixed mass of pellets) and compare box reading against a co-located reference sensor in the plume.**
2. **Is the ratio actually stable cook-to-cook?** Draft varies with fire size, ambient temperature and wind. If the ratio swings 2×, absolute thresholds are useless and the classifier must key on *shape* metrics (typical particle size, PM10:PM2.5) which are ratio-invariant. **This is the single biggest risk to the whole map.**
3. **Smoker exhaust dew point and water fraction are unknown.** Method 5G assumes *"The moisture may be assumed to be 4 percent (100 percent relative humidity at 85 °F)"* for its *diluted* tunnel gas — not for raw exhaust. Whether 1:300 ambient dilution is enough to stay non-condensing on a 0 °C winter morning is untested.
4. **No source quantifies laser/optics fouling as a function of particle loading** for any of the candidate sensors. Sensirion markets "contamination-resistance technology" (product page) but publishes no loading-vs-drift curve. Lifetime estimates here are engineering judgement.
5. **Particle losses in the stub probe are not calculated.** The Particle Loss Calculator would answer it, but it needs the actual bleed flow rate (open question 1) as an input. Qualitatively, a 3 in. straight 3/8 in. tube at low Reynolds number should lose mostly the >5 µm tail — acceptable, since our signal lives at 0.03–0.3 µm (#672).
6. **Whether the stainless-wool coarse trap changes the size distribution enough to matter.** Test: run one cook with and one without.
7. **Whether an 80 mm fan's flow is repeatable enough** across years and dust loading, or whether the fan itself needs periodic replacement as a calibration item.
8. **Traeger's Super Smoke implementation is not verified from a primary source** — their support page returns HTTP 403 to automated fetch. The patent evidence (US10674866B2) says open-loop temperature/pellet control, and that is what I am relying on.
