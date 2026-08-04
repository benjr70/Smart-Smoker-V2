import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StateService } from '../State/state.service';
import { AppSettingsService } from '../appSettings/app-settings.service';
import {
  PROBE_SLOTS,
  ProbeSlot,
  resolveProbeNames,
} from '../appSettings/probe-names';
import { PushDispatcherService } from '../pushDispatcher/push-dispatcher.service';
import { SmokeProfileService } from '../smokeProfile/smokeProfile.service';
import { Temp } from '../temps/temps.schema';
import { TempsService } from '../temps/temps.service';
import {
  AlertRuntimeState,
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

    // The alert settings are one block of the installation's settings document,
    // read here and never written: what evaluation records goes to the separate
    // alert-state document, so an edit typed on the settings page during a cook
    // survives.
    const [settings, state, profile] = await Promise.all([
      this.appSettingsService.getSettings(),
      this.loadAlertState(session.smokeId),
      this.smokeProfileService.getCurrentSmokeProfile(),
    ]);

    const evaluation = evaluateAlerts({
      reading: {
        chamberTemp: readTemperature(latest.ChamberTemp),
        probeTemps: readProbeTemps(latest),
      },
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
   * The bookkeeping for this session. State recorded against another smoke is
   * discarded: clearing a session changes the current smoke id, so the next cook
   * starts disarmed and preheats in silence.
   */
  private async loadAlertState(smokeId: string): Promise<AlertRuntimeState> {
    const stored = await this.alertStateModel.findOne().exec();
    if (!stored || stored.smokeId !== smokeId) {
      return initialAlertRuntimeState();
    }
    return {
      chamberArmed: stored.chamberArmed ?? false,
      chamberOutOfRangeSince: stored.chamberOutOfRangeSince ?? null,
      chamberAlertSent: stored.chamberAlertSent ?? false,
      probeTargetsReached: stored.probeTargetsReached ?? [],
      smokeCompleteProbesDone: stored.smokeCompleteProbesDone ?? [],
      smokeCompleteFired: stored.smokeCompleteFired ?? false,
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
