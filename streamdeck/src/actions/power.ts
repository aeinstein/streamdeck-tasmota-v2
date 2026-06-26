import { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import type { KeyAction } from "@elgato/streamdeck";
import { deviceCache } from "../cache";

@action({ UUID: "de.itnox.streamdeck.tasmota.power" })
export class Toggle extends SingletonAction<TasmotaSettings> {
    override onWillAppear(ev: WillAppearEvent<TasmotaSettings>): void | Promise<void> {
        const { settings } = ev.payload;
        if (!settings.url) return;

        const device = deviceCache.getOrAddDevice(ev.action.id, settings.url, settings);
        if (!device) return;

        device.send("/cm?cmnd=Power", (_dev, success, result) => {
            if (success && ev.action.isKey()) updateButton(ev.action, result, settings);
        }, true);

        if (settings.autoRefresh && settings.autoRefresh > 0) {
            device.setAutoRefresh(settings.autoRefresh, () => {
                device.send("/cm?cmnd=Status%2010", (_dev, success, result) => {
                    if (success && ev.action.isKey()) updateButton(ev.action, result, settings);
                }, true);
            });
        }
    }

    override onWillDisappear(ev: WillDisappearEvent<TasmotaSettings>): void | Promise<void> {
        const { settings } = ev.payload;
        if (!settings.url) return;

        const device = deviceCache.getOrAddDevice(ev.action.id, settings.url, settings);
        device?.setAutoRefresh(-1, () => {});
        deviceCache.removeContext(ev.action.id, settings.url);
    }

    override async onKeyDown(ev: KeyDownEvent<TasmotaSettings>): Promise<void> {
        const { settings } = ev.payload;
        if (!settings.url) return;

        const device = deviceCache.getOrAddDevice(ev.action.id, settings.url, settings);
        if (!device) return;

        device.send("/cm?cmnd=Power%20TOGGLE", (_dev, success, result) => {
            if (success) updateButton(ev.action, result, settings);
        }, true);
    }
}

function updateButton(action: KeyAction<TasmotaSettings>, result: any, settings: TasmotaSettings) {
    const mode = settings.titleMode ?? 0;
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
