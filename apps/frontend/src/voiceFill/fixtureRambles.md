# Voice Fill fixture Rambles: the real-phone run sheet

Nine Rambles, three per screen, read aloud to the real app on a real phone. The
same nine live in `fixtureRambles.ts` with the answer a perfect model would
give; `fixtureRambles.test.ts` holds what is expected below to the extraction
contract and holds the scripts below to that file, word for word.

## The bar

- At least 8 of the 9 have every structured field right in the review list, with
  no edits.
- All 9 reach the review list within 15 seconds of **Done talking**.
- Notes make sense, in the tester's judgement.

A structured field is right when its row proposes the value below. Steps are
right when there is one step per action, in the order spoken, saying what was
said; their exact wording is the model's. A row that is not listed below, other
than Notes, is a miss, and so is a listed row that is absent.

## Before the run

1. The phone has the picked pair downloaded and showing ready on the settings
   screen's Voice Fill card: Moonshine Small Streaming and Gemma 4 E2B for the
   default pair.
2. A quiet room, the phone held as it would be at the smoker, a normal speaking
   pace.
3. A stopwatch on something other than the phone. Start it on the tap of **Done
   talking**; stop it when the review rows appear.
4. For each Ramble: put the screen in its **Before** state, tap the Voice Fill
   button, read the script, tap **Done talking**, time it, and mark the review
   list against **Expect** before touching a tick. Then fill, so the next Ramble
   starts from where this one left off.
5. Write down the transcript as the phone heard it wherever a row is wrong: it
   says whether the speech model or the extraction model missed.

The day and the time are the phone's own. Where a value below depends on them it
says so.

## Pre-smoke

### pre-1

An empty screen: a listed cut, a spoken weight and unit, steps, and a built
name.

**Before:** a new smoke. Name, Meat type, Weight, steps and Notes all empty;
unit on LB.

**Read aloud:**

> I'm doing a brisket today, twelve and a half pounds. I trimmed the fat cap
> down to a quarter inch, then rubbed it with salt and pepper. It's a prime
> packer from Costco.

**Expect:**

| Row        | Value                                                                   |
| ---------- | ----------------------------------------------------------------------- |
| Name       | today's weekday, then `Brisket` (on a Saturday: `Saturday Brisket`)     |
| Meat type  | `Brisket`                                                               |
| Weight     | `12.5` LB                                                               |
| Prep steps | two added: trim the fat cap to a quarter inch; rub with salt and pepper |

**Notes:** that it is a prime packer from Costco.

### pre-2

Values already on screen replaced: a spoken name, a cut nobody listed, and
kilograms.

**Before:** Name empty. Meat type `Chicken`. Weight `5`, unit LB. Steps and
Notes empty.

**Read aloud:**

> Call this one Belly Burnt Ends. It's a pork belly, two and a half kilos. I
> scored the skin, cut it into inch and a half cubes, and tossed them in the
> sweet rub. The fridge was running warm overnight so I'm keeping an eye on it.

**Expect:**

| Row        | Value                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| Name       | `Belly Burnt Ends`                                                                 |
| Meat type  | `Pork belly` (in place of Chicken; not snapped to Pork Shoulder)                   |
| Weight     | `2.5` KG (in place of 5 LB)                                                        |
| Prep steps | three added: score the skin; cut into inch and a half cubes; toss in the sweet rub |

**Notes:** that the fridge ran warm overnight and the meat is being watched.

### pre-3

A weight given as a range goes to Notes and fills nothing; steps are added after
the ones there; short existing Notes are merged; a name and a cut already there
are left alone. **This is the Ramble onto existing Notes.**

**Before:** Name `Ribs for the neighbours`. Meat type `Ribs`. Weight empty, unit
LB. One step: `Remove the membrane`. Notes:

> Two racks of St. Louis cut from the butcher on Main Street.

**Read aloud:**

> These are somewhere between five and six pounds all together. I put on yellow
> mustard as a binder, then the sweet rub. One rack is a lot thinner than the
> other so it may finish early.

**Expect:**

| Row        | Value                                                                            |
| ---------- | -------------------------------------------------------------------------------- |
| Prep steps | two added after `Remove the membrane`: yellow mustard as a binder; the sweet rub |

No Name row, no Meat type row, and **no Weight row**: a range is never written
to the field.

**Notes:** one text holding the old Notes (two racks, St. Louis cut, the butcher
on Main Street) with the five-to-six pounds and the thinner rack that may finish
early.

## Smoke

Read these three in order on one cook, filling each: `smoke-2` and `smoke-3`
pick up the probe names `smoke-1` gives. The serve time and the rest are only
written where the screen shows its Serve Plan card, so the planner is switched
on in settings and the cook is running with temperatures arriving. Where the
card is absent, a serve time and a rest land in Notes, and that is the contract
working: record it as such and not as a miss.

### smoke-1

An empty screen: a listed wood of two words, the chamber and two probes named,
and one target said of both.

**Before:** chamber and probe names empty, wood empty, Notes empty, no probe
target set.

**Read aloud:**

> I'm running post oak today. Call the chamber Pit. Probe one is in the flat and
> probe two is in the point. Set them both to two oh three.

**Expect:**

| Row            | Value      |
| -------------- | ---------- |
| Chamber name   | `Pit`      |
| Probe 1 name   | `Flat`     |
| Probe 2 name   | `Point`    |
| Wood type      | `Post Oak` |
| Probe 1 target | `203`      |
| Probe 2 target | `203`      |

Nothing for probe 3. **Notes:** no Notes row.

### smoke-2

A probe picked by the name it already has, a serve time on the clock, a rest,
and a stamp for something just done.

**Before:** as `smoke-1` left it: chamber `Pit`, probe 1 `Flat`, probe 2
`Point`, wood `Post Oak`, both targets 203. Serve Plan card showing.

**Read aloud:**

> I'm switching over to cherry. Take the point to one ninety five. We're eating
> at six thirty tonight and I want a forty five minute rest. I just spritzed it.

**Expect:**

| Row            | Value                                                                |
| -------------- | -------------------------------------------------------------------- |
| Wood type      | `Cherry`                                                             |
| Probe 2 target | `195`                                                                |
| Serve time     | 6:30 PM today (tomorrow, where it is read after 6:30 in the evening) |
| Rest duration  | `45` minutes                                                         |
| Log now        | `Spritzed`                                                           |

Nothing for probe 1. **Notes:** no Notes row.

### smoke-3

A third probe named and set in one breath, a serve time as a length of time, one
stamp logged and one done a while ago kept in Notes, and an observation.

**Before:** as `smoke-2` left it. Probe 3 unnamed, its target not set.

**Read aloud:**

> Probe three is in the pork butt, take it to two hundred. I wrapped the brisket
> about an hour ago and I just added wood. We'll serve in five hours. The fire
> has been running hot, around two seventy five.

**Expect:**

| Row            | Value                                |
| -------------- | ------------------------------------ |
| Probe 3 name   | `Pork butt` (either case)            |
| Probe 3 target | `200`                                |
| Serve time     | five hours after the Ramble          |
| Log now        | `Added Wood` only: **not** `Wrapped` |

No target of 275 for anything.

**Notes:** that the fire has been running hot, around 275, and that the brisket
was wrapped about an hour ago, which is not logged because the cook log is never
backdated.

## Post-smoke

### post-1

An empty screen: a rest in hours and minutes, steps, and an observation.

**Before:** Rest time, steps and Notes all empty.

**Read aloud:**

> It rested for an hour and fifteen minutes. Then I sliced it against the grain
> and served it with pickles and white bread. The bark was fantastic but the
> flat was a little dry.

**Expect:**

| Row              | Value                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| Rest time        | `01:15`                                                                |
| Post-smoke steps | two added: slice against the grain; serve with pickles and white bread |

**Notes:** that the bark was fantastic and the flat a little dry.

### post-2

A rest already on screen replaced by one said in words, three steps, and numbers
that belong in Notes and in no field.

**Before:** Rest time `00:30`. Steps and Notes empty.

**Read aloud:**

> I rested it a couple hours. Then I pulled the pork by hand, mixed the juices
> back in, and sauced half of it. Next time I would pull it off at one ninety
> eight instead of two oh three.

**Expect:**

| Row              | Value                                                                        |
| ---------------- | ---------------------------------------------------------------------------- |
| Rest time        | `02:00` (in place of 00:30)                                                  |
| Post-smoke steps | three added: pull the pork by hand; mix the juices back in; sauce half of it |

**Notes:** that next time it comes off at 198 instead of 203.

### post-3

The heaviest Notes merge: about a hundred words of existing Notes rewritten with
the new. A rest of no exact length fills nothing; steps are added after the one
there. **This is the Ramble to watch against the 15 seconds.**

**Before:** Rest time empty. One step: `Rest in the cooler wrapped in towels`.
Notes, pasted in whole:

> Fourteen pound prime brisket from Costco, trimmed down to about twelve. Went
> on at 6:15 AM with the pit at 250. Post oak the whole way with two chunks of
> cherry in the first hour. Stall started around 160 at about 11 AM and lasted
> nearly three hours. Wrapped in butcher paper at 172 with a little tallow.
> Bumped the pit to 275 after the wrap. The flat probed tender at 201 and the
> point at 205. Pulled it at 5:40 PM. Spritzed with apple cider vinegar every 45
> minutes before the wrap. Bark set well but the bottom edge near the firebox
> got a bit dark.

**Read aloud:**

> I let it rest for a while, I didn't time it. Then I sliced the flat and cubed
> the point for burnt ends. The slices were juicy but the burnt ends needed more
> sauce. It fed eight people with leftovers.

**Expect:**

| Row              | Value                                                                        |
| ---------------- | ---------------------------------------------------------------------------- |
| Post-smoke steps | two added after the one there: slice the flat; cube the point for burnt ends |

**No Rest time row**: "a while" is no length.

**Notes:** one text that still holds every fact and number of the old Notes (14
and 12 pounds, 6:15 AM, 250, 160, 11 AM, three hours, 172, 275, 201, 205, 5:40
PM, 45 minutes) with the untimed rest, the juicy slices, the burnt ends wanting
sauce and the eight people fed.

## Recording the run

One row per Ramble, posted on the issue the run belongs to, with the phone, the
browser and the picked pair named above the table.

| Ramble  | Seconds to review | Structured fields right | Notes make sense | What was wrong |
| ------- | ----------------- | ----------------------- | ---------------- | -------------- |
| pre-1   |                   |                         |                  |                |
| pre-2   |                   |                         |                  |                |
| pre-3   |                   |                         |                  |                |
| smoke-1 |                   |                         |                  |                |
| smoke-2 |                   |                         |                  |                |
| smoke-3 |                   |                         |                  |                |
| post-1  |                   |                         |                  |                |
| post-2  |                   |                         |                  |                |
| post-3  |                   |                         |                  |                |
