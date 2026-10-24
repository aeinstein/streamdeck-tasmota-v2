import { Device } from "./device";

function removeItemOnce<T>(arr: T[], value: T): T[] {
    const index = arr.indexOf(value);
    if (index > -1) arr.splice(index, 1);
    return arr;
}

export class Cache {
    devices: Device[] = [];
    private contextUrls = new Map<string, string>();

    getOrAddDevice(contextId: string, url: string, settings: any): Device | undefined {
        if (!url) return undefined;

        // A context belongs to exactly one device, so detach it when its URL changed.
        const prevUrl = this.contextUrls.get(contextId);
        if (prevUrl !== undefined && prevUrl !== url) this.removeContext(contextId, prevUrl);
        this.contextUrls.set(contextId, url);

        const existing = this.devices.find(d => d.url === url);
        if (existing) {
            if (!existing.contexts.includes(contextId)) {
                existing.contexts.push(contextId);
                existing.settings[contextId] = settings;
            }
            if (settings?.password !== undefined) existing.password = settings.password;
            return existing;
        }

        const device = new Device(contextId, url, settings);
        this.devices.push(device);
        return device;
    }

    deviceOf(contextId: string): Device | undefined {
        const url = this.contextUrls.get(contextId);
        return url === undefined ? undefined : this.devices.find(d => d.url === url);
    }

    removeContext(contextId: string, url: string) {
        this.contextUrls.delete(contextId);
        if (!url) return;

        const deviceIndex = this.devices.findIndex(d => d.url === url);
        if (deviceIndex === -1) return;

        const device = this.devices[deviceIndex];
        removeItemOnce(device.contexts, contextId);
        if (device.contexts.length === 0) {
            device.dispose();
            this.devices.splice(deviceIndex, 1);
            return undefined;
        }
        return device;
    }
}

export const deviceCache = new Cache();
