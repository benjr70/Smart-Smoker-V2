import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StateService } from '../State/state.service';
import { ApplicationSettings } from '../appSettings/app-settings.schema';
import { AppSettingsService } from '../appSettings/app-settings.service';
import {
  PROBE_SLOTS,
  ProbeSlot,
  resolveProbeNames,
} from '../appSettings/probe-names';
import { PreSmokeService } from '../presmoke/presmoke.service';
import { PushDispatcherService } from '../pushDispatcher/push-dispatcher.service';
import { SmokeProfileService } from '../smokeProfile/smokeProfile.service';
import { Temp } from '../temps/temps.schema';
import { TempsService } from '../temps/temps.service';
import { TimelineService } from '../timeline/timeline.service';
import {
  AlertRuntimeState,
  ServePlanState,
  evaluateAlerts,
  initialAlertRuntimeState,
} from './alert-engine';
import { AlertState, AlertStateDocument } from './alert-state.schema';
import {
  NotificationSubscription,
  NotificationSubscriptionDocument,
} from './notificationSubscription.schema';

const TEST_NOTIFICATION_BODY =
  'This is a test notification from your smoker. If you can read this, push is working.';

/**
 * How often alerts are evaluated. Owned here rather than driven by websocket
 * traffic, so "sustained for two minutes" means two minutes of wall-clock time
 * instead of however long the device takes to send its next thirty readings.
 */
export const ALERT_EVALUATION_INTERVAL_MS = 30 * 1000;

/**
 * The name alerts call the chamber by. Resolving live names from the active
 * smoke profile is a later slice; until then every deployment's chamber is
 * simply "Chamber".
 */
const CHAMBER_NAME = 'Chamber';

/** A temperature the device reported, or `null` when it reported nothing. */
const readTemperature = (raw: string | undefined): number | null => {
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  const reading = parseFloat(raw);
  return Number.isNaN(reading) ? null : reading;
};

/**
 * Which reading on the device's record belongs to which probe slot. The device
 * has always named the first meat probe `MeatTemp` and the rest `Meat2Temp`/
 * `Meat3Temp`; the alert settings are keyed by slot. This is the one place the
 * two vocabularies meet.
 */
const PROBE_READINGS: Record<ProbeSlot, keyof Temp> = {
  probe1: 'MeatTemp',
  probe2: 'Meat2Temp',
  probe3: 'Meat3Temp',
};

/** The meat probes' readings by slot, as the engine takes them. */
const readProbeTemps = (latest: Temp): Record<string, number | null> =>
  PROBE_SLOTS.reduce<Record<string, number | null>>((temps, slot) => {
    temps[slot] = readTemperature(latest[PROBE_READINGS[slot]] as string);
    return temps;
  }, {});

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private evaluationTimer?: ReturnType<typeof setInterval>;

  constructor(
    @InjectModel(NotificationSubscription.name)
    private notificationsModel: Model<NotificationSubscriptionDocument>,
    @InjectModel(AlertState.name)
    private alertStateModel: Model<AlertStateDocument>,
    private pushDispatcher: PushDispatcherService,
    private stateService: StateService,
    private tempsService: TempsService,
    private appSettingsService: AppSettingsService,
    private smokeProfileService: SmokeProfileService,
    private preSmokeService: PreSmokeService,
    private timelineService: TimelineService,
  ) {}

  /** Start the evaluation interval this service owns. */
  onModuleInit(): void {
    this.evaluationTimer = setInterval(() => {
      this.checkAlerts().catch((error) =>
        Logger.error(`Alert evaluation failed: ${error}`, 'Notifications'),
      );
    }, ALERT_EVALUATION_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer);
      this.evaluationTimer = undefined;
    }
  }

  /**
   * Register a browser push subscription. Keyed on the endpoint and upserted:
   * a browser that re-subscribes (or whose subscription is rotated by the push
   * service) replaces its stored record instead of receiving a conflict the
   * client can only swallow.
   */
  async setSubscription(
    subscription: NotificationSubscription,
  ): Promise<NotificationSubscription> {
    return this.notificationsModel
      .findOneAndUpdate({ endpoint: subscription.endpoint }, subscription, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      })
      .exec();
  }

  /** The VAPID public key browsers need to subscribe, served at runtime. */
  async getPublicKey(): Promise<{ publicKey: string | null }> {
    return { publicKey: this.pushDispatcher.getPublicKey() };
  }

  /** Send a test notification to every registered browser. */
  async sendTestNotification(): Promise<{ sent: number }> {
    const sent = await this.pushDispatcher.notify(
      'Smoker',
      TEST_NOTIFICATION_BODY,
    );
    return { sent };
  }

  async getSubscriptions(): Promise<NotificationSubscription[]> {
    return this.notificationsModel.find();
  }

  async sendPushNotification(data: string): Promise<void> {
    await this.pushDispatcher.notify('Smoker', data);
  }

  /**
   * One evaluation tick: load the documents, hand them to the pure engine with
   * the current time, persist the state it returns and dispatch whatever it
   * decided to send. All the alert rules live in the engine; this is only the
   * shell that gives it a reading and takes its answer away.
   */
  async checkAlerts(): Promise<void> {
    const session = await this.stateService.GetState();
    if (!session?.smoking) {
      // An idle smoker never notifies: nothing is cooking to have an opinion
      // about, and the chamber cooling down is not an excursion.
      return;
    }

    const latest = await this.tempsService.getLatestCurrentTemp();
    if (!latest) {
      return;
    }

    // The bookkeeping is loaded first, because whether this is the session's
    // first evaluation is what decides if the probe targets are seeded — and
    // the targets seeded here are the ones this very reading is judged against.
    const { state, sessionStart } = await this.loadAlertState(session.smokeId);

    // The alert settings are one block of the installation's settings document,
    // read here and otherwise never written: what evaluation records goes to
    // the separate alert-state document, so an edit typed on the settings page
    // during a cook survives.
    const [settings, profile] = await Promise.all([
      sessionStart
        ? this.seedTargetsForSession()
        : this.appSettingsService.getSettings(),
      this.smokeProfileService.getCurrentSmokeProfile(),
    ]);

    const reading = {
      chamberTemp: readTemperature(latest.ChamberTemp),
      probeTemps: readProbeTemps(latest),
    };

    const evaluation = evaluateAlerts({
      reading,
      etaMinutes: await this.headsUpMinutes(settings, state, reading),
      servePlan: await this.servePlan(settings),
      settings,
      state,
      names: { chamber: CHAMBER_NAME, probes: resolveProbeNames(profile) },
      now: new Date(),
    });

    await this.saveAlertState(session.smokeId, evaluation.state);
    for (const notification of evaluation.notifications) {
      await this.pushDispatcher.notify(notification.title, notification.body);
    }
  }

  /**
   * How the cook is running against its Serve Plan, as the off-schedule alert
   * reads it — or nothing at all, when there is no plan to be off.
   *
   * Read off the current timeline rather than worked out again here: that is
   * the same block the cook screen draws its verdict banner from, so the push
   * in their pocket cannot contradict the card in front of them.
   *
   * Asked for only while both switches are on. With the planner off — or its
   * push silenced — nothing could be decided from an answer, and this runs
   * every thirty seconds for the length of every cook, so the read is skipped
   * rather than made and thrown away.
   */
  private async servePlan(
    settings: ApplicationSettings,
  ): Promise<ServePlanState | null> {
    if (!settings.servePlan.enabled || !settings.servePlan.driftAlert) {
      return null;
    }
    const timeline = await this.timelineService.getCurrentTimeline();
    return timeline.servePlan ?? null;
  }

  /**
   * How many minutes each probe still awaiting a heads-up is projected to be
   * from its target.
   *
   * Only slots that could still fire are projected: the alert has to be on, the
   * probe watched with a lead, its heads-up unspent, and the meat not already
   * at its target. This runs every thirty seconds for the length of every cook,
   * and a projection nothing could be decided from is a read of the series for
   * nothing — the same reasoning the historical rate is gated by.
   *
   * Only an `'ok'` projection is passed on. Warming, stalled and paused are the
   * estimator saying it cannot tell yet, and a number carried out of one of
   * those states would be read by the engine as live evidence that the meat is
   * nearly there.
   */
  private async headsUpMinutes(
    settings: ApplicationSettings,
    state: AlertRuntimeState,
    reading: { probeTemps: Record<string, number | null> },
  ): Promise<Record<string, number>> {
    if (!settings.headsUp.enabled) {
      return {};
    }
    const pending = settings.probeTarget.probes.filter((probe) => {
      const temp = reading.probeTemps[probe.slot];
      return (
        probe.enabled &&
        probe.leadMinutes !== null &&
        probe.leadMinutes !== undefined &&
        !state.headsUpFired.includes(probe.slot) &&
        !(typeof temp === 'number' && temp >= probe.target)
      );
    });
    if (pending.length === 0) {
      // Nothing could be decided from a projection, so none is asked for: the
      // read is skipped here rather than left to answer an empty list, so the
      // tick costs nothing at all.
      return {};
    }
    const estimates = await this.timelineService.estimateForProbes(
      pending.map((probe) => ({ slot: probe.slot, target: probe.target })),
    );
    return Object.entries(estimates).reduce<Record<string, number>>(
      (minutes, [slot, estimate]) => {
        if (estimate.state === 'ok' && estimate.hoursRemaining !== null) {
          minutes[slot] = estimate.hoursRemaining * 60;
        }
        return minutes;
      },
      {},
    );
  }

  /**
   * Put the default target of whatever is being cooked onto the probes, and
   * answer with the settings that leaves.
   *
   * The meat type is the free text the cook typed into pre-smoke — the only
   * place this application is ever told what is on the smoker.
   */
  private async seedTargetsForSession(): Promise<ApplicationSettings> {
    const preSmoke = await this.preSmokeService.GetByCurrent();
    return this.appSettingsService.seedProbeTargets(preSmoke?.meatType);
  }

  /**
   * The bookkeeping for this session, and whether this is the first evaluation
   * of it. State recorded against another smoke is discarded: clearing a
   * session changes the current smoke id, so the next cook starts disarmed and
   * preheats in silence.
   *
   * That same "recorded against another smoke" test is what makes a session
   * start recognisable — every evaluation writes this document back under the
   * current smoke id, so only the first one of a cook finds it absent or stale.
   */
  private async loadAlertState(
    smokeId: string,
  ): Promise<{ state: AlertRuntimeState; sessionStart: boolean }> {
    const stored = await this.alertStateModel.findOne().exec();
    if (!stored || stored.smokeId !== smokeId) {
      return { state: initialAlertRuntimeState(), sessionStart: true };
    }
    return {
      state: {
        chamberArmed: stored.chamberArmed ?? false,
        chamberOutOfRangeSince: stored.chamberOutOfRangeSince ?? null,
        chamberAlertSent: stored.chamberAlertSent ?? false,
        probeTargetsReached: stored.probeTargetsReached ?? [],
        smokeCompleteProbesDone: stored.smokeCompleteProbesDone ?? [],
        smokeCompleteFired: stored.smokeCompleteFired ?? false,
        headsUpCounters: stored.headsUpCounters ?? {},
        headsUpFired: stored.headsUpFired ?? [],
        offScheduleTicks: stored.offScheduleTicks ?? 0,
        offScheduleDirection: stored.offScheduleDirection ?? null,
        offScheduleFired: stored.offScheduleFired ?? false,
      },
      sessionStart: false,
    };
  }

  private async saveAlertState(
    smokeId: string,
    state: AlertRuntimeState,
  ): Promise<void> {
    await this.alertStateModel
      .findOneAndReplace({}, { smokeId, ...state }, { upsert: true, new: true })
      .exec();
  }
}
