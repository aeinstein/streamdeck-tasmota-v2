import { action, KeyDownEvent, KeyUpEvent, SingletonAction } from "@elgato/streamdeck";
import { deviceCache } from "../cache";
import { sendColor, togglePower } from "../utils";

@action({ UUID: "de.itnox.streamdeck.tasmota.fixed" })
export class FixedRgb extends SingletonAction<FixedRgbSettings> {
    private readonly pressStart = new Map<string, number>();

    override onKeyDown(ev: KeyDownEvent<FixedRgbSettings>): void {
        this.pressStart.set(ev.action.id, Date.now());
    }

    override async onKeyUp(ev: KeyUpEvent<FixedRgbSettings>): Promise<void> {
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
            const color = settings.color ?? "#ff0000";
            sendColor(device, color, (_dev, success) => {
                if (!success) ev.action.showAlert();
                else ev.action.showOk();
            });
        }
    }
}

type FixedRgbSettings = {
    url?: string;
    password?: string;
    color?: string;
};
