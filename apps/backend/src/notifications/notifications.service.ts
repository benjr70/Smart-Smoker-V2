import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StateService } from '../State/state.service';
import { PushDispatcherService } from '../pushDispatcher/push-dispatcher.service';
import { TempsService } from '../temps/temps.service';
import {
  AlertRuntimeState,
  evaluateAlerts,
  initialAlertRuntimeState,
} from './alert-engine';
import { AlertState, AlertStateDocument } from './alert-state.schema';
import { withSettingsDefaults } from './notification-settings.defaults';
import {
  NotificationSettings,
  NotificationSettingsDocument,
} from './notificationSettings.schema';
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

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private evaluationTimer?: ReturnType<typeof setInterval>;

  constructor(
    @InjectModel(NotificationSubscription.name)
    private notificationsModel: Model<NotificationSubscriptionDocument>,
    @InjectModel(NotificationSettings.name)
    private notificationSettingsModel: Model<NotificationSettingsDocument>,
    @InjectModel(AlertState.name)
    private alertStateModel: Model<AlertStateDocument>,
    private pushDispatcher: PushDispatcherService,
    private stateService: StateService,
    private tempsService: TempsService,
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

  /**
   * Replace the single settings document.
   *
   * A replace rather than an update: the whole document is user-owned, so there
   * is nothing to merge — and a `$set`-style update would leave the deleted rule
   * list sitting in the document forever, since the first save after this slice
   * deploys lands on a document of the old shape.
   */
  async setSettings(
    settings: NotificationSettings,
  ): Promise<NotificationSettings> {
    const saved = await this.notificationSettingsModel
      .findOneAndReplace({}, withSettingsDefaults(settings), {
        upsert: true,
        new: true,
      })
      .exec();
    return withSettingsDefaults(saved);
  }

  /**
   * The current settings, always complete. A deployment with no document — or
   * with a document of the deleted rule shape, which is not migrated — reads as
   * fresh defaults rather than as an error.
   */
  async getSettings(): Promise<NotificationSettings> {
    const stored = await this.notificationSettingsModel.findOne().exec();
    return withSettingsDefaults(stored);
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

    const [settings, state] = await Promise.all([
      this.getSettings(),
      this.loadAlertState(session.smokeId),
    ]);

    const evaluation = evaluateAlerts({
      reading: { chamberTemp: readTemperature(latest.ChamberTemp) },
      settings,
      state,
      names: { chamber: CHAMBER_NAME },
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
