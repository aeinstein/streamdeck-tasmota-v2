import { Device } from "./device";

function removeItemOnce<T>(arr: T[], value: T): T[] {
    const index = arr.indexOf(value);
    if (index > -1) arr.splice(index, 1);
    return arr;
}

export class Cache {
    devices: Device[] = [];

    getOrAddDevice(contextId: string, url: string, settings: any): Device | undefined {
        if (!url) return undefined;

        const existing = this.devices.find(d => d.url === url);
        if (existing) {
            if (!existing.contexts.includes(contextId)) {
                existing.contexts.push(contextId);
                existing.settings[contextId] = settings;
            }
            return existing;
        }

        const device = new Device(contextId, url, settings);
        this.devices.push(device);
        return device;
    }

    removeContext(contextId: string, url: string) {
        if (!url) return;

        const deviceIndex = this.devices.findIndex(d => d.url === url);
        if (deviceIndex === -1) return;

        const device = this.devices[deviceIndex];
        removeItemOnce(device.contexts, contextId);
        if (device.contexts.length === 0) {
            this.devices.splice(deviceIndex, 1);
        }
    }
}

export const deviceCache = new Cache();
