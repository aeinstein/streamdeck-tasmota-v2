import { action, KeyDownEvent, KeyUpEvent, SingletonAction } from "@elgato/streamdeck";
import { deviceCache } from "../cache";
import { sendCommand } from "../utils";

@action({ UUID: "de.itnox.streamdeck.tasmota.custom" })
export class CustomCommand extends SingletonAction<CustomSettings> {
    private readonly pressStart = new Map<string, number>();

    override onKeyDown(ev: KeyDownEvent<CustomSettings>): void {
        this.pressStart.set(ev.action.id, Date.now());
    }

    override async onKeyUp(ev: KeyUpEvent<CustomSettings>): Promise<void> {
        const start = this.pressStart.get(ev.action.id) ?? 0;
        this.pressStart.delete(ev.action.id);
        const { settings } = ev.payload;
        if (!settings.url) { await ev.action.showAlert(); return; }

        const device = deviceCache.getOrAddDevice(ev.action.id, settings.url, settings);
        if (!device) { await ev.action.showAlert(); return; }

        const isLong = Date.now() - start >= 500;
        const command = isLong ? (settings.command2 ?? "") : (settings.command1 ?? "");
        if (!command) return;

        sendCommand(device, command, (_dev, success, result) => {
            if (!success) {
                ev.action.showAlert();
                return;
            }
            const title = Object.entries(result)
                .map(([k, v]) => `${k}: ${v}`)
                .join("\n");
            ev.action.setTitle(title);
            ev.action.showOk();
        });
    }
}

type CustomSettings = {
    url?: string;
    password?: string;
    command1?: string;
    command2?: string;
};
