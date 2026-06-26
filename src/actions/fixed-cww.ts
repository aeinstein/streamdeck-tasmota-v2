import { action, KeyDownEvent, KeyUpEvent, SingletonAction } from "@elgato/streamdeck";
import { deviceCache } from "../cache";
import { sendCT, sendWhite, togglePower } from "../utils";

@action({ UUID: "de.itnox.streamdeck.tasmota.wwfixed" })
export class FixedCww extends SingletonAction<FixedCwwSettings> {
    private readonly pressStart = new Map<string, number>();

    override onKeyDown(ev: KeyDownEvent<FixedCwwSettings>): void {
        this.pressStart.set(ev.action.id, Date.now());
    }

    override async onKeyUp(ev: KeyUpEvent<FixedCwwSettings>): Promise<void> {
        const start = this.pressStart.get(ev.action.id) ?? 0;
        this.pressStart.delete(ev.action.id);
        const { settings } = ev.payload;
        if (!settings.url) { await ev.action.showAlert(); return; }

        const device = deviceCache.getOrAddDevice(ev.action.id, settings.url, settings);
        if (!device) { await ev.action.showAlert(); return; }

        if (Date.now() - start >= 500) {
            togglePower(device, (_dev, success) => {
                if (!success) ev.action.showAlert();
            });
        } else {
            sendCT(device, settings.ct ?? 300, (_dev, success) => {
                if (!success) ev.action.showAlert();
            });
            sendWhite(device, settings.brightness ?? 50, (_dev, success) => {
                if (!success) ev.action.showAlert();
                else ev.action.showOk();
            });
        }
    }
}

type FixedCwwSettings = {
    url?: string;
    password?: string;
    ct?: number;
    brightness?: number;
};
