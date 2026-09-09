# A USB laser PM sensor can see dirty-vs-clean smoke, but only behind a dilution probe

Ticket: [#672](https://github.com/benjr70/Smart-Smoker-V2/issues/672) (part of wayfinder map [#671](https://github.com/benjr70/Smart-Smoker-V2/issues/671) — Smoke Quality — map). Researched on 2026-09-08.

Sources:

- Nova Fitness, _Laser PM2.5 Sensor specification, product model SDS011, V1.3_ (2015-10-09), fetched as PDF via [reichelt mirror](https://cdn-reichelt.de/documents/datenblatt/X200/SDS011-DATASHEET.pdf) and read page-by-page.
- Plantower, _Digital universal particle concentration sensor — PMS5003 series data manual V2.3_ (2016-06-01), fetched via [AQ-SPEC / South Coast AQMD](https://www.aqmd.gov/docs/default-source/aq-spec/resources-page/plantower-pms5003-manual_v2-3.pdf).
- Sensirion, _Datasheet SPS30_, Version 2.0 – D1, June 2023 — <https://sensirion.com/media/documents/8600FF88/64A3B8D6/Sensirion_PM_Sensors_Datasheet_SPS30.pdf>.
- Sensirion, _Datasheet SEN5x_, Version 2 – D1, March 2022 — <https://sensirion.com/media/documents/6791EFA0/62A1F68F/Sensirion_Datasheet_Environmental_Node_SEN5x.pdf>.
- Sensirion SPS30 product page — <https://sensirion.com/products/catalog/SPS30>.
- Trojanowski & Fthenakis, _Nanoparticle emissions from residential wood combustion: a critical literature review, characterization, and recommendations_, BNL-211411-2019-JAAM (Brookhaven National Laboratory / DOE), <https://www.osti.gov/servlets/purl/1501573>.
- US EPA, _Method 5G — Determination of Particulate Matter Emissions from Wood Heaters (Dilution Tunnel Sampling Location)_, 8/3/2017, <https://www.epa.gov/sites/default/files/2017-08/documents/method_5g.pdf> (landing page: <https://www.epa.gov/emc/method-5g-particulate-matter-wood-heaters-dilution-tunnel>).
- Linux kernel, _USB serial drivers_ — <https://www.kernel.org/doc/html/latest/usb/usb-serial.html>.
- Raspberry Pi Ltd, _Raspberry Pi 4 Model B Datasheet_, Release 1.1 (2024) — <https://pip-assets.raspberrypi.com/categories/545-raspberry-pi-4-model-b/documents/RP-008341-DS-1-raspberry-pi-4-datasheet.pdf>.
- Digi International KB, _What is the maximum length allowable for a single USB cable?_ — <https://www.digi.com/support/knowledge-base/what-is-the-maximum-length-allowable-for-a-single>.
- npm registry probes (`registry.npmjs.org`) for `serialport`, `@serialport/bindings-cpp`, `sds011-client`, `sds011-wrapper`, `plantower`, `@serialpilot/driver-plantower`, `sps30`, `pms5003`.
- Adafruit product 3686 (PMS5003 kit) — <https://www.adafruit.com/product/3686>; DigiKey/Mouser listings for SPS30 (price not verified against a live cart).
- Live repo probes: `cat apps/device-service/package.json`; `ls apps/device-service/src/serial`; `sed -n '1,80p' apps/device-service/src/serial/serial.serivce.ts`; `grep -n devices smoker.docker-compose.yml`.

## TL;DR

- **Yes, the physics is on our side.** Dirty white smoke and clean thin-blue smoke differ by roughly an order of magnitude in particle mass *and* by mean particle diameter. Start-up produces the **most** particles and the **largest** mean diameter (~200–260 nm); efficient steady-state burn produces fewer and smaller particles; and organic carbon fraction goes from **57 % (O₂-starved) to 14 % (O₂-rich)** in the same stove ([BNL review, pp. 14–15](https://www.osti.gov/servlets/purl/1501573)).
- **Best single discriminator: the PM2.5/PM10 mass split plus a particle-size proxy**, not PM2.5 alone. A raw PM2.5 number rises with *any* smoke; the *shape* (mass concentration ÷ number concentration, i.e. mean size) is what separates "fat white particles" from "fine blue haze". Only two candidate sensors expose that shape: SPS30 (`Typical Particle Size` in µm/nm, plus number concentrations for PM0.5…PM10) and PMS5003 (six raw particle-count bins ≥0.3/0.5/1.0/2.5/5.0/10 µm per 0.1 L).
- **Shortlist (in order): 1) SPS30 + generic USB-UART, 2) PMS5003 + generic USB-UART, 3) SDS011 with its bundled CH340 dongle.** SPS30 wins on outputs (number concentration + typical particle size), on a documented weekly **fan auto-cleaning** cycle, and on a >10-year MTTF; SDS011 wins on zero-integration (ships with the USB dongle) but only gives PM2.5/PM10 mass and is rated for **8 000 h** laser life.
- **SEN5x / SEN54 / SEN55 is NOT a candidate.** Its datasheet has exactly one comms chapter — "Operation and Communication through the I²C Interface" — and its 6-pin connector is VDD/GND/**SDA**/**SCL**/SEL/NC. There is no UART, therefore no USB-UART path without a bridge board. Ruled out by the ticket's "no soldering/HAT" constraint.
- **Every candidate dies in the plume, and the datasheets say so.** SDS011: work environment **–10…+50 °C, max 70 % RH**. PMS5003: 0…99 % RH but the manual explicitly warns extra protection is required for "Kitchen", "Water mist condition", and sustained ≥300 µg/m³. SPS30: recommended **10–40 °C, 20–80 % RH**, absolute max 60 °C / 95 % RH. Smoker exhaust is hotter, wetter and tarrier than all of these — which is exactly why the prior attempt came back coated in tar.
- **The rig, not the sensor, is the deliverable.** EPA Method 5G measures wood-heater PM by drawing the stack exhaust into a hood, **combining it with ambient dilution air**, and sampling from a single point in the tunnel with filters held at **≤32 °C (90 °F)**. Copy that pattern in miniature: a stainless probe in the stack, a tee that entrains ambient air, and the sensor sitting in cooled diluted gas well off the plume.
- **Integration is cheap.** `apps/device-service` already ships `serialport ^11.0.0` and already opens a port by absolute path. A CH340/CP2102/FTDI dongle enumerates as `/dev/ttyUSB0` (kernel major 188), so the change is one more `devices:` entry in `smoker.docker-compose.yml` and a second `SerialPort` instance. Power is a non-issue (all three sensors ≤100 mA against ~1.1 A aggregate on Pi 4). **A 10 ft cable is fine** — USB 2.0 allows 5 m (16 ft 5 in) per segment.
- **No plug-and-play USB CO or VOC module exists in budget.** The commodity CO parts (MQ-7 and friends) are bare analog/I²C modules needing an MCU — i.e. exactly the soldering the ticket forbids. Skip gas sensing for v1; PM is where the signal is.

## 1. What actually differs between white and blue smoke

The map's language ("dirty white" = early ignition, "thin blue" = established smoulder) maps onto the combustion-science phases **start-up / ramp-up** and **steady-state operation**. The BNL/DOE critical review tabulates them directly ([Table 1, p. 11](https://www.osti.gov/servlets/purl/1501573)):

| Phase | Characteristics (verbatim, BNL Table 1) |
| --- | --- |
| Start up / ramp up | "Fuel was just ignited and the unit ramping up to its full output … **CO concentrations tend to be high as well as PM** with low to moderate O₂ values." |
| Steady-state operation | "Unit is running at full output … high burn rate of fuel, **low CO, low PM**, low to moderate O₂ values." |

The same review says incomplete combustion is "caused by small values of the three most important 'T's' in combustion; time, temperature and turbulence" and that a "Characteristic of incomplete combustion is also an increase in volatile hydrocarbon emissions and CO" (p. 11).

### 1.1 Mass: the dirty phase is up to 10× worse

> "the study found the period of combustion, cold start or steady state had a significant impact in terms of emission production, for some cases **ten times greater emissions output (mg/MJ) were observed**." — BNL review, p. 12

A Swiss study cited in the same review found "emissions could be up to 100 times higher if a stove was not operated properly" (p. 12). So a plain PM mass channel already carries a large, easily-thresholded signal.

### 1.2 Size: the dirty phase makes *bigger* particles

Three independent studies, summarised by BNL (pp. 14–15), agree that particle **mean diameter tracks combustion phase**:

| Study (as cited in BNL review) | Start-up | Steady state | Burn-out |
| --- | --- | --- | --- |
| Bologa et al., 8 kW beech-log stove | mono-modal **180 nm**, **most particles** of any phase; stack ≈100 °C | mono-modal 180 nm; stack 300–330 °C | bi-modal 180–200 nm **and 30–40 nm**; stack 160–180 °C |
| Gaegauf et al. (diluted stack sampling) | largest particles, **avg 200 nm** | avg ≈175 nm, **lowest number conc. <0.8 µm** | smallest, ≈**30 nm**, highest number conc. |
| Hueglin et al., 15 kW beech stove, SMPS behind a dilution sampler | "greatest particle concentration and largest mean diameter (**approximately 260 nm**)" | intermediate phase lowest concentration, mean ≈107 nm | smallest mean, **≈60 nm** |

Hueglin et al. also gives the mechanism the map cares about:

> "an increase in combustion in air supply impacted the particle size distribution; thus **more oxygen caused an increase in the concentration of particles with smaller diameter** … **organic carbon was found to be 14 % for burning conditions with increased O₂ and 57 % when there was an absence of O₂**." — BNL review, p. 15

That 14 %-vs-57 % organic carbon split is the physical reason white smoke is white and blue smoke is blue: the condensed-organic ("tar") fraction produces particles large enough to scatter all visible wavelengths (white), while the small, soot-dominated fine mode of an established burn preferentially scatters short wavelengths (blue).

### 1.3 Which metric to actually compute

- **Not** PM2.5 mass alone — it is monotonic in "amount of smoke" and cannot distinguish a big clean burn from a small dirty one.
- **Best**: a size proxy.
  - On **SPS30**, the sensor computes it for you: `Typical Particle Size` is an explicit output field, and the datasheet defines it as "an indication on the average particle diameter in the sample aerosol … **lighter aerosols will have smaller TPS values than heavier aerosols**" (SPS30 datasheet §4.3, footnote 8, p. 6). Rising TPS + rising PM mass ⇒ dirty.
  - On **PMS5003**, derive it from the six count bins (Data 7…Data 12 in Appendix I): the ratio of counts ≥1.0 µm to counts ≥0.3 µm is a direct coarseness index.
  - On **SDS011** you only get PM2.5 and PM10 mass, so the only available shape metric is the **PM10 : PM2.5 ratio** — coarser and noisier, but non-zero signal.
- **Secondary** (free on SPS30/PMS5003 anyway): PM10/PM2.5 ratio and the absolute mass level, for a two-feature classifier.
- **CO** would be an excellent orthogonal discriminator per BNL Table 1 — but see §2.5: there is no USB-native CO module in budget.
- **Humidity** is a *confounder*, not a discriminator: white smoke contains water vapour, so a sensor reading a wet plume reports inflated PM. This is another argument for dilution + cooling (§4).

## 2. Candidate sensors

### 2.1 Comparison table

| | **Nova SDS011** | **Plantower PMS5003** | **Sensirion SPS30** | **Sensirion SEN5x (SEN54/55)** |
| --- | --- | --- | --- | --- |
| Outputs | PM2.5, PM10 mass only | PM1/2.5/10 mass (×2 calibrations) **+ 6 count bins** ≥0.3/0.5/1.0/2.5/5.0/10 µm per 0.1 L | PM1/2.5/4/10 mass, **number conc. PM0.5…PM10**, **typical particle size** | PM1/2.5/4/10, RH, T, VOC Index, NOx Index (SEN55) |
| Interface | UART TTL 3.3 V, 9600 8N1, 1 Hz | UART TTL 3.3 V, 9600 8N1 | UART (SHDLC) **115 200** 8N1 **or** I²C, selected by `SEL` pin | **I²C only** |
| Frame | 10 bytes, `0xAA 0xC0 … 0xAB`, checksum = Σ DATA1..6 | 32 bytes, `0x42 0x4D` + length + payload + checksum | SHDLC MOSI/MISO frames, `0x7E` start/stop, byte-stuffing, inverted-LSB checksum | I²C commands |
| Supply | 5 V (4.7–5.3 V), **70 mA ±10 mA**, sleep <4 mA | 5 V typ (4.5–5.5), **≤100 mA**, standby ≤200 µA | 5 V ±10 %, **measurement 45–65 mA** (80 mA first 200 ms), idle ~330 µA | 5 V ±10 % |
| Operating temp | **–10 … +50 °C** (storage –20…+60) | **–10 … +60 °C** (storage –40…+80) | recommended **10–40 °C**; absolute max **–10 … 60 °C** | (not extracted — I²C rules it out regardless) |
| Operating humidity | **max 70 % RH** (storage max 90 %) | 0–99 % RH | recommended **20–80 % RH**; absolute max **0–95 % RH** | — |
| Life / MTTF | laser diode "service life is up to **8000 hours**" | **MTTF ≥ 3 years** | **Lifetime > 10 years** @ 24 h/day (MTTF-based) | — |
| Fan | built-in | built-in | built-in **+ automatic fan cleaning** (default every 604 800 s = 1 week, configurable, or on demand) | built-in |
| Self-diagnostics | none | none | Device Status Register: FAN-blocked bit, LASER-failure bit, fan-SPEED-out-of-range bit | — |
| USB path | **ships with a CH340 USB-UART dongle** in the common kit | generic USB-UART adapter (CP2102/FTDI/CH340) | generic USB-UART adapter | none without a bridge |
| Indicative price | ~US$35–40 with USB dongle (retail listings) | US$39.95 kit (Adafruit 3686) | ~US$36.63 bare (DigiKey listing) — **not verified live**; SEK-SPS30 eval kit ~$102 | ~US$40–50 (irrelevant) |

Every number in the SDS011 column is from the Nova datasheet "Technical Parameters" table (p. 2), "Power requirement" (p. 3), "About service life" (p. 4) and "The UART communication protocol" (p. 5). Every number in the PMS5003 column is from the Plantower manual "Technical Index" (p. 3), "Pin Definition" (p. 4) and "Appendix I: PMS5003 transport protocol-Active Mode" (p. 13). Every SPS30 number is from the Sensirion datasheet Table 1 (p. 2), §1.2, Table 2/Table 3 (p. 3), §3 (p. 4), §4.1–4.4 (pp. 5–7) and §5 (pp. 8–10).

### 2.2 SEN5x is disqualified — verified

The SEN5x datasheet's table of contents lists exactly one communication chapter: **"6 Operation and Communication through the I²C Interface"** (p. 3). There is no UART chapter. Table 11 (SEN5x pin assignment, p. 13) is:

| Pin | Name | Description |
| --- | --- | --- |
| 1 | VDD | Supply voltage 5 V ±10 % |
| 2 | GND | Ground |
| 3 | **SDA** | Serial data input/output (LVTTL 3.3 V) |
| 4 | **SCL** | Serial clock input (LVTTL 3.3 V) |
| 5 | SEL | Interface select — **"Connect to GND"** |
| 6 | NC | Do not connect |

Contrast with SPS30 Table 4 (p. 4), where pins 2 and 3 are dual-function `RX/SDA` and `TX/SCL` and `SEL` is "**Leave floating to select UART**, Pull to GND to select I²C". SPS30 is a UART part; SEN5x is not. **Flagged: SEN5x/SEN54/SEN55 is not a USB/UART candidate** for this project.

Relevant aside from the same SPS30 page: "For connection cables longer than 20 cm we recommend using the UART interface, due to its intrinsic robustness against electromagnetic interference." Our sensor is on a long lead — another point for UART.

### 2.3 Fouling and contamination behaviour

- **SPS30** is the only one of the three with an *engineered* answer. §4.2 "Fan Auto Cleaning": "an automatic fan-cleaning procedure will be triggered periodically … This will accelerate the fan to maximum speed for 10 seconds in order to blow out the dust accumulated inside the fan." Default interval 604 800 s (1 week) ±3 %, settable, and **reset to zero every power cycle** — the datasheet explicitly warns "If the sensor is switched off, the time counter is reset to 0. Make sure to trigger a cleaning cycle at least every week if the sensor is switched off and on periodically (e.g., once per day)." For a smoker that runs a cook then powers down, that means **we must issue an explicit Start Fan Cleaning (`0x56`) command after each cook**, not rely on the timer. Sensirion's product page also markets "innovative contamination-resistance technology" that "enables precise measurements from the device's first operation and throughout its lifetime" — a marketing claim, not a datasheet spec, so treat it as directional only.
- **SPS30 self-diagnosis** (Device Status Register, §4.4) exposes a FAN bit ("fan is switched on, but the measured fan speed is 0 RPM … The FAN-bit will **not** be cleared automatically"), a LASER bit and a fan-SPEED bit. That is the difference between "sensor is quietly lying to us because it's tarred up" and "sensor tells us it is tarred up". Big deal for a remote smoker.
- **PMS5003** has no cleaning cycle. Its manual's "Other Attentions" section (p. 10) is an explicit warning list: "The sensor is usually used in the common indoor environment. So some protection must be added if using in the conditions as followed: a) The time of concentration ≥300 µg/m³ is longer than 50 % of the whole year or concentration ≥500 µg/m³ is longer than 20 % of the whole year. b) **Kitchen** c) **Water mist condition such as bathroom or hot spring.** d) **outdoor**". Smoker exhaust hits (a), (b), (c) and (d) simultaneously. The manual also says "Stable data should be got at least 30 seconds after the sensor wakeup from the sleep mode because of the fan's performance."
- **SDS011** has no cleaning cycle either, and its life budget is the tightest: "The laser diode in this sensor has high quality and its service life is up to **8000 hours**." Nova's own mitigation is duty-cycling: "you can use the discontinuous working method to prolong the service life. For example, you can start the sensor for 30 seconds per minutes." At 8 000 h continuous that is ~333 days of 24/7; duty-cycled at 30 s/min it doubles. For a device that only runs during cooks this is not the binding constraint — tar is.
- **The real fouling risk is condensation, not dust.** All three datasheets bound humidity as a *non-condensing* operating window (SDS011 "Work environment: Max 70 %", SPS30 "recommended … 20 to 80 % RH", absolute max 95 % RH). Smoker exhaust is water-saturated and laden with condensable organics; drop it below its dew point inside the optical cavity and you deposit exactly the tar film that killed the prior attempt. Dilution with dry ambient air (§4) both cools *and* lowers RH, which is the whole point.

### 2.4 Linux + armv7 support and how each reaches USB

None of these sensors is a USB device. They are 3.3 V TTL UARTs that reach USB through a bridge chip:

| Bridge | In-tree kernel driver | Node |
| --- | --- | --- |
| WCH CH340/CH341 | `ch341` — the kernel's USB serial doc has a "Winchiphead CH341 Driver" section (it notes "the protocol was analyzed from the behaviour of the Windows driver, no datasheet is available at present") | `/dev/ttyUSB*` |
| Silicon Labs CP2102 | `cp210x` (in `drivers/usb/serial/`; not individually described in the usb-serial doc page I fetched — **not verified from that doc**, but it is the standard in-tree driver name) | `/dev/ttyUSB*` |
| FTDI FT232 | `ftdi_sio` — "FTDI Single Port Serial Driver" section in the same doc | `/dev/ttyUSB*` |

The kernel doc pins the node naming: "The major number that the driver uses is **188** so to use the driver, create the following nodes: `mknod /dev/ttyUSB0 c 188 0` … " and it handles up to 256 interfaces (`/dev/ttyUSB0`–`/dev/ttyUSB255`). A CDC-ACM device would instead appear as `/dev/ttyACM*`; none of our candidates is CDC-ACM, so **expect `/dev/ttyUSB0`**.

Practical consequence: **the SDS011 is the only one that is genuinely plug-and-play**, because the common retail kit bundles a CH340G USB-UART adapter and the sensor's JST lead. PMS5003 and SPS30 need the builder to plug the sensor's cable into a generic USB-UART adapter — no soldering if a pre-crimped adapter cable is bought, but one more part to specify and one more connector to get wrong at 10 ft.

Nothing here is architecture-specific: `ch341`, `cp210x` and `ftdi_sio` are plain in-tree kernel drivers, so armv7l Raspberry Pi OS has them already.

### 2.5 USB CO / VOC / multi-gas modules

Searched for a USB-native CO module under the budget cap and found none. The commodity CO parts (MQ-7 and its module boards from Keyestudio, NCD, Botland etc.) expose **analog output or I²C via an ADC121C**, are specified for roughly 20–2 000 ppm, and require the host to drive a two-phase heater cycle (5 V purge / ~1.4 V measure). Every one of those is an MCU-and-wiring job, i.e. exactly the soldering/HAT work ticket #672 rules out. **Recommendation: no gas sensing in v1.** If CO is wanted later, the cleanest route is a second Arduino sketch on the existing microcontroller rather than a USB module — but that is a different ticket.

Sensirion's VOC/NOx Index lives only on SEN54/SEN55, which is I²C-only (§2.2), so the "one module gives me PM + VOC over USB" option does not exist off the shelf.

## 3. Integration into this repo

### 3.1 What is already there (live probes, 2026-09-08)

`cat apps/device-service/package.json` → dependencies include **`"serialport": "^11.0.0"`**. (Registry probe: `serialport` latest is 13.0.0, published 2024-12-24; `@serialport/bindings-cpp` 13.0.1 is a `gypfile: true` N-API 8 addon, so armv7 either uses a prebuild or compiles at image build time — the existing device-service image already solves this for `/dev/ttyS0`, so a second port costs nothing new.)

`ls apps/device-service/src/serial` → `serial.module.ts`, `serial.serivce.ts` (sic), plus specs.

`sed -n '1,80p' apps/device-service/src/serial/serial.serivce.ts` shows the shape any new sensor should copy:

```ts
this.port = new SerialPort({
  path: '/dev/ttyS0',
  baudRate: 9600,
});
this.port.pipe(parser);
parser.on('data', (data) => { ... this.dataSubject.next(stringData); });
```

Note it is a `ReadlineParser` over an RxJS `Subject`, hard-coded to `/dev/ttyS0`, with a `NODE_ENV === 'local'` emulator branch that fabricates temps on a 500 ms interval. A PM sensor is **binary framed, not line delimited**, so it needs a different parser (`@serialport/parser-delimiter` on `0xAA` / `0x42 0x4D`, or `parser-byte-length`), and the emulator branch pattern should be mirrored so local dev and CI don't need hardware.

`grep -n devices smoker.docker-compose.yml` → two hits (lines 31 and 99). Line 31 is the device-service block, with a comment that is directly load-bearing for this work:

```yaml
    devices:
      # The Arduino is wired to the Pi's GPIO UART, not USB — see
      # apps/device-service/src/serial/serial.serivce.ts, which opens
      # /dev/ttyS0 in production mode. Docker validates this path when it
      # *creates* the container, so naming a node that does not exist breaks
      # every recreate — including the ones Watchtower performs, which would
      # take device_service down permanently.
      - /dev/ttyS0
```

**That warning is the single biggest integration hazard.** Adding a bare `- /dev/ttyUSB0` means that if the dongle is ever unplugged, the node vanishes and **every container recreate fails**, including Watchtower's — bricking the smoker remotely. Mitigations, in order of preference:

1. Bind-mount `/dev` and rely on `privileged: true` (already set on that service) instead of an explicit `devices:` entry, so a missing dongle degrades to a runtime open-error rather than a create-error.
2. Or use a `udev` rule to create a stable symlink and still accept that the node must exist.
3. At minimum, make the sensor's `SerialPort` open lazy and non-fatal, with retry — unlike the current constructor-time open, which would take the whole device-service down if the port is absent.

### 3.2 Protocol framing cheat-sheet

- **SDS011** — 9600 8N1, 1 Hz, 10 bytes: `[0]=0xAA header, [1]=0xC0 commander, [2..3]=PM2.5 lo/hi, [4..5]=PM10 lo/hi, [6..7]=device ID, [8]=checksum, [9]=0xAB tail`. Checksum = `DATA1+DATA2+…+DATA6`. Values: `PM2.5 = (hi*256 + lo)/10` µg/m³, same for PM10.
- **PMS5003** — 9600 8N1, active mode by default, 32-byte frames starting `0x42 0x4D`, then `frame length = 2×13 + 2`. Payload = PM1.0/PM2.5/PM10 (CF=1 "standard particle"), then PM1.0/PM2.5/PM10 "under atmospheric environment", then the six count bins (≥0.3, ≥0.5, ≥1.0 µm shown explicitly in Appendix I; the series continues to ≥2.5/5.0/10 µm), then checksum. Sampling: 2.3 s in stable mode, 200–800 ms when the concentration is changing fast — i.e. **it speeds up exactly when the smoke turns**, which is convenient for us.
- **SPS30 (UART)** — 115 200 8N1, SHDLC: `0x7E | ADR | CMD | L | data | CHK | 0x7E`, with byte-stuffing (`0x7E→0x7D 0x5E`, `0x7D→0x7D 0x5D`, `0x11→0x7D 0x31`, `0x13→0x7D 0x33`) and checksum = inverted LSB of the sum. Slave address always `0`. Commands we need: `0x00` Start Measurement, `0x03` Read Measured Value, `0x01` Stop, `0x56` Start Fan Cleaning, `0x80` Read/Write Auto Cleaning Interval, `0xD2` Read Device Status Register (needs firmware ≥ v2.2). Read Measured Value returns 40 bytes of big-endian IEEE754 floats (or 20 bytes of uint16 with firmware ≥ 2.0): PM1/2.5/4/10 mass, then number conc. PM0.5/1/2.5/4/10, then typical particle size.

Because SHDLC has escaping and a stateful request/response cycle, SPS30 is the most code to write of the three — but `serialport` v11 plus a hand-rolled ~150-line SHDLC codec is entirely tractable, and it is the only sensor that gives us the typical-particle-size discriminator for free.

### 3.3 Node libraries (npm registry probe, 2026-09-08)

| Package | Latest | Published | Verdict |
| --- | --- | --- | --- |
| `serialport` | 13.0.0 | 2024-12-24 | already a dependency at `^11.0.0` — the substrate for all of these |
| `sds011-client` | 1.0.1 | **2018-02-11** | superseded by the author's own wrapper; stale |
| `sds011-wrapper` | 1.4.0 | **2021-01-01** | most maintained SDS011 option ([triforcely/sds011-wrapper](https://github.com/triforcely/sds011-wrapper)); still 5 years old |
| `nova-sds011` | 0.0.2 | 2016-04-10 | abandoned |
| `plantower` | 1.1.10 | **2020-03-04** | ([perfectworks/node-plantower](https://github.com/perfectworks/node-plantower)) description field is literally `## Install` — low-effort package |
| `@serialpilot/driver-plantower` | 0.1.0 | **2026-05-10** | newest Plantower driver by a wide margin, but v0.1.0 and framework-coupled to "serialpilot" |
| `sps30` / `pms5003` | — | — | **do not exist** on npm |
| `homebridge-sensirion-sps30` | 2.0.1 | 2021-03-14 | HomeKit plugin, not a reusable driver |
| `@mytosbio/sensirion-hdlc` | 1.0.0 | 2023-01-22 | generic Sensirion SHDLC codec — the only reusable SPS30-adjacent building block found |

**Recommendation: write the frame parser in-repo rather than take a dependency.** All three protocols are under ~100 lines, every candidate library is stale or v0.x, the repo already owns `serialport`, and a hand-rolled parser is directly unit-testable against a byte-array fixture (device-service enforces a 75 % coverage floor, per `apps/device-service/package.json` `jest.coverageThreshold`). This also avoids adding a dependency that would then feed the Dependabot lane.

### 3.4 Power and cable budget

- Peak draw of the worst candidate is **PMS5003 at ≤100 mA**; SDS011 is 70 mA ±10 mA; SPS30 is 45–65 mA (80 mA for the first 200 ms of fan start).
- Raspberry Pi 4 datasheet §5.3: "The Pi4B has 2x USB2 and 2x USB3 type-A sockets. **Downstream USB current is limited to approximately 1.1A in aggregate over the four sockets.**" §4 adds: "The Pi4B requires a good quality USB-C power supply capable of delivering 5V at 3A. If attached downstream USB devices consume less than 500mA, a 5V, 2.5A supply may be used."
- 100 mA against a ~1.1 A budget is ~9 %. **Power is not a constraint** — but note the sensor's 5 V rail comes through the USB-UART dongle, so the dongle must be one that passes bus 5 V (not a 3.3 V-only adapter).
- **Cable length**: Digi's KB states the maximum single-cable length for "Full Speed (USB 1.1) and High Speed (USB 2.0) devices" is **5 metres (about 16 feet)**. A 10 ft (3.05 m) USB cable is comfortably inside spec. If the run ever needs to exceed 5 m, use a powered hub or an active extension rather than a longer passive cable.

## 4. Recommendation and the rig

### 4.1 Shortlist

1. **Sensirion SPS30 + a CP2102/FTDI USB-UART adapter (~$36 + ~$10).** Pick this if we want the strongest discriminator. It is the only candidate that emits **typical particle size** and **number concentration** alongside mass, i.e. the exact "shape" feature §1.3 says we need; the only one with a **commandable fan-cleaning cycle** (`0x56`) we can fire after every cook; and the only one that can **tell us it has been fouled** (Device Status Register FAN/LASER/SPEED bits) — which matters enormously for a smoker we cannot walk over to. Costs: SHDLC parser to write, and one extra part (the USB adapter) for the builder to plug in.
2. **Plantower PMS5003 kit (Adafruit 3686, $39.95) + USB-UART adapter.** Pick this if we want maximum information per dollar with the simplest parser. Six raw count bins give a richer size histogram than SPS30's single TPS number, its 32-byte frame is trivial to decode, and it auto-accelerates its sample rate when concentration changes. Costs: **no cleaning cycle, no health bits, MTTF only ≥3 years**, and a manual that explicitly tells us not to use it in kitchens, mist or outdoors.
3. **Nova SDS011 with bundled CH340 dongle (~$35–40).** Pick this only if plug-and-play trumps everything: one box, one USB plug, `/dev/ttyUSB0`, a 10-byte frame, and the most mature (if stale) Node libraries. Costs: **PM2.5/PM10 mass only**, so the sole shape metric is the PM10:PM2.5 ratio; the tightest humidity ceiling (**70 % RH**); and an 8 000 h laser budget.

If the goal is "prove the concept in one cook with minimum shipping and minimum code", ship the **SDS011**. If the goal is "a sensor that survives a season of cooks and self-reports when it doesn't", ship the **SPS30**.

### 4.2 Flagged: none of these survives raw exhaust, with or without a rig

State this plainly in the map. Quoting the ceilings again:

- SDS011: "Work environment: **–10 ~ +50 ℃**"; "Work environment: **Max 70 %**" RH.
- PMS5003: "Working Temperature Range **–10~+60 ℃**", "Working Humidity Range 0~99 %" — but with the "some protection must be added" warning list covering kitchens, water mist and outdoor use.
- SPS30: "The sensor shows best performance when operated within recommended normal temperature and humidity range of **10 to 40 °C and 20 to 80 % RH**"; absolute maxima **60 °C / 95 % RH**, and exceeding absolute maxima "may cause permanent damage".

All three humidity figures are **non-condensing** windows. Smoker exhaust at the stack is hotter than 60 °C, near water-saturated, and carries condensable tars. **No amount of shielding lets a sensor sit in the plume.** The prior tar-coated attempt is the empirical confirmation.

### 4.3 The rig: dilution sampling, not plume mounting

The correct design is the one EPA already standardised for measuring wood-heater PM. Method 5G §2.1 (verbatim):

> "The exhaust from a wood heater is collected with a total collection hood, and is **combined with ambient dilution air**. Particulate matter is withdrawn proportionally from **a single point in a sampling tunnel**, and is collected on two glass fiber filters in series. **The filters are maintained at a temperature of no greater than 32 °C (90 °F).** The particulate mass is determined gravimetrically after the removal of uncombined water."

Method 5G's own hardware notes reinforce the material choice and the cooling requirement: the probe shall be "Stainless steel (e.g., 316 or grade more corrosion resistant) or glass about 9.5 mm (3/8 in.) I.D., 0.6 m (24 in.) in length" (§6.1.1.1), and the train includes a dryer "capable of removing water from the sample gas to less than 1.5 percent moisture (volume percent) … sample gas temperature exiting the dryer is less than 20 °C (68 °F)" (§6.1.1.6).

Translated to a dad-fabricable rig:

- **Stainless probe** (3/8 in. tube) inserted a short distance into the exhaust stack — that is the only part that lives in the hot, tarry gas, and stainless is what Method 5G specifies for exactly this reason. It is also the sacrificial, cleanable part.
- **A tee immediately outside the stack** that entrains ambient air, so the sampled gas is diluted and cooled toward ambient before it reaches any optics. Method 5G's ≤32 °C filter temperature is the number to aim at — comfortably inside SPS30's recommended 10–40 °C and under SDS011's 50 °C ceiling.
- **Sensor mounted well off the plume**, at the far end of the diluted run, ideally in a small enclosure with the sensor's own fan doing the drawing (all three candidates are fanned, so they self-aspirate).
- **A known, fixed dilution ratio.** Absolute µg/m³ becomes meaningless once diluted, but we do not need absolute values — we need *relative* change and *ratios* (PM10:PM2.5, count-bin shape, typical particle size), which survive dilution as long as the ratio is stable. Fix the geometry so it does not drift between cooks.
- **Post-cook cleaning**: with SPS30, fire `0x56` Start Fan Cleaning after every cook (mandatory, because §4.2 of the datasheet says the auto-clean timer resets on power-down). With the others, plan on periodic manual removal and a compressed-air blow-out, and expect to replace the sensor annually.
- Plantower's own installation note applies to the enclosure design: "The best way to install is making the plane of inset and outset closely to the plane of the host. Or some shield should be placed between inset and outset in order to prevent the air flow from inner loop" — i.e. do not let the sensor recirculate its own exhaust inside the box.

### 4.4 Open questions for the next ticket

- **Dilution ratio and residence time** are unquantified here. Method 5G's tunnel is a lab instrument; the miniature version needs an empirical calibration (does the diluted stream still show a 2–10× PM swing between white and blue phases, or does dilution bury the signal in ambient noise?). That is a bench experiment, not a literature question.
- **SPS30 street price was taken from a DigiKey listing surfaced in search results and is not verified against a live product page** — confirm before ordering.
- **Whether the classifier needs a labelled dataset.** The literature gives us the direction of every feature (dirty ⇒ higher mass, larger mean diameter, higher CO) but not thresholds for *this* smoker at *this* dilution. Expect the first firmware to log raw features and the thresholds to be fitted after a handful of cooks.
