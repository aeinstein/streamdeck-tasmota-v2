import streamDeck, { action, DidReceiveSettingsEvent, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import type { KeyAction } from "@elgato/streamdeck";
import { Device } from "../device";
import { deviceCache } from "../cache";

const log = streamDeck.logger.createScope("Toggle");

@action({ UUID: "de.itnox.streamdeck.tasmota.power" })
export class Toggle extends SingletonAction<TasmotaSettings> {
    private actionMap: Map<string, KeyAction<TasmotaSettings>> = new Map();

    override onWillAppear(ev: WillAppearEvent<TasmotaSettings>): void | Promise<void> {
        const { settings } = ev.payload;
        log.debug(`onWillAppear: isKey=${ev.action.isKey()} settings=${JSON.stringify(ev.payload.settings)}`);
        if (!ev.action.isKey()) return;
        if (!settings.url) {
            ev.action.getSettings();
            return;
        }

        const keyAction = ev.action;
        this.actionMap.set(keyAction.id, keyAction);
        const device = deviceCache.getOrAddDevice(keyAction.id, settings.url, settings);
        log.debug(`onWillAppear: device=${!!device}`);
        if (!device) return;

        log.debug(`onWillAppear: ctx=${keyAction.id.slice(-6)} url=${settings.url} autoRefresh=${settings.autoRefresh}`);

        device.send("/cm?cmnd=Power", (_dev, success, result) => {
            log.debug(`initial Power response: success=${success} result=${JSON.stringify(result)}`);
            if (success) updateButton(keyAction, result, settings);
        }, true);

        this.setupDeviceRefresh(device);
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<TasmotaSettings>): void | Promise<void> {
        const { settings } = ev.payload;
        log.debug(`onDidReceiveSettings: isKey=${ev.action.isKey()} url=${settings.url} autoRefresh=${settings.autoRefresh}`);
        if (!settings.url || !ev.action.isKey()) return;

        const keyAction = ev.action;
        const wasKnown = this.actionMap.has(keyAction.id);
        this.actionMap.set(keyAction.id, keyAction);

        const device = deviceCache.getOrAddDevice(keyAction.id, settings.url, settings);
        if (!device) return;

        device.settings[keyAction.id] = settings;

        if (!wasKnown) {
            // onWillAppear hatte noch keine URL — initiale Abfrage nachholen
            device.send("/cm?cmnd=Power", (_dev, success, result) => {
                log.debug(`onDidReceiveSettings initial Power: success=${success} result=${JSON.stringify(result)}`);
                if (success) updateButton(keyAction, result, settings);
            }, true);
        }

        this.setupDeviceRefresh(device);
    }

    override onWillDisappear(ev: WillDisappearEvent<TasmotaSettings>): void | Promise<void> {
        const { settings } = ev.payload;
        this.actionMap.delete(ev.action.id);

        if (!settings.url) return;
        const device = deviceCache.getOrAddDevice(ev.action.id, settings.url, settings);

        if (device && device.contexts.length <= 1) {
            device.setAutoRefresh(0, () => {});
        }
        deviceCache.removeContext(ev.action.id, settings.url);
    }

    override async onKeyDown(ev: KeyDownEvent<TasmotaSettings>): Promise<void> {
        const { settings } = ev.payload;
        if (!settings.url) return;

        const device = deviceCache.getOrAddDevice(ev.action.id, settings.url, settings);
        if (!device) return;

        device.send("/cm?cmnd=Power%20TOGGLE", (_dev, success, result) => {
            if (!success) {
                for (const ctx of _dev.contexts) this.actionMap.get(ctx)?.showAlert();
                return;
            }
            updateButton(ev.action, result, settings);
        }, true);
    }

    private setupDeviceRefresh(device: Device) {
        log.debug(`setupDeviceRefresh: called, contexts=${device.contexts.length}`);
        let minRefresh = Infinity;
        let needsEnergy = false;

        for (const ctx of device.contexts) {
            const s = device.settings[ctx] as TasmotaSettings;
            if (s?.autoRefresh && s.autoRefresh > 0) {
                minRefresh = Math.min(minRefresh, s.autoRefresh);
            }
            if (s?.titleMode && s.titleMode > 0) needsEnergy = true;
        }

        if (minRefresh === Infinity) {
            log.debug(`setupDeviceRefresh: no autoRefresh configured, stopping timer`);
            device.setAutoRefresh(0, () => {});
            return;
        }

        const query = needsEnergy ? "/cm?cmnd=Status%2010" : "/cm?cmnd=Power";
        log.debug(`setupDeviceRefresh: interval=${minRefresh}s query=${query} contexts=${device.contexts.length}`);

        device.setAutoRefresh(minRefresh, () => {
            log.debug(`refresh tick: sending ${query}`);

            device.send(query, (_dev, success, result) => {
                log.debug(`refresh response: success=${success} result=${JSON.stringify(result)}`);
                if (!success) {
                    for (const ctx of _dev.contexts) this.actionMap.get(ctx)?.showAlert();
                    return;
                }
                for (const ctx of device.contexts) {
                    const keyAction = this.actionMap.get(ctx);
                    const s = device.settings[ctx] as TasmotaSettings;
                    log.debug(`updating ctx=${ctx.slice(-6)} keyAction=${!!keyAction} titleMode=${s?.titleMode}`);
                    if (keyAction) updateButton(keyAction, result, s);
                }
            }, true);
        });
    }
}

function updateButton(action: KeyAction<TasmotaSettings>, result: any, settings: TasmotaSettings) {
    const mode = Number(settings.titleMode ?? 0);
    let title = "";

    if (mode === 0) {
        title = result.POWER ?? "";
    } else if (mode === 1) {
        const power = result.StatusSNS?.ENERGY?.Power;
        title = power !== undefined ? `${power}W` : "";
    } else if (mode === 2) {
        const today = result.StatusSNS?.ENERGY?.Today;
        title = today !== undefined ? `${today}kWh` : "";
    } else if (mode === 3) {
        const total = result.StatusSNS?.ENERGY?.Total;
        title = total !== undefined ? `${total}kWh` : "";
    }

    log.debug(`updateButton: mode=${mode} title="${title}" POWER=${result.POWER}`);
    action.setTitle(title);

    if (result.POWER !== undefined) {
        action.setState(result.POWER === "ON" ? 1 : 0);
    }
}

type TasmotaSettings = {
    url?: string;
    password?: string;
    titleMode?: number;
    autoRefresh?: number;
};
