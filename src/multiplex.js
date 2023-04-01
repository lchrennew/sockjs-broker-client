import { CONNECTING, OPEN } from "./client-base.js";

class DumbEventTarget {
    #listeners;

    constructor() {
        this.#listeners = {};
    }

    #ensure(type) {
        this.#listeners[type] ??= [];
    }

    addEventListener(type, listener) {
        this.#ensure(type);
        this.#listeners[type].push(listener);
    }

    on(type, listener) {
        this.addEventListener(type, listener)
    }

    emit(type) {
        this.#ensure(type);
        const args = Array.prototype.slice.call(arguments, 1);
        this[`on${ type }`]?.apply(this, args);
        for (const listener of this.#listeners[type]) {
            listener.apply(this, args);
        }
    }
}

export class Channel extends DumbEventTarget {
    name;

    #handler;

    constructor(name) {
        super();
        this.name = name;
        this.open = this.open.bind(this)
        this.close = this.close.bind(this)

    }

    open(ws) {
        if (ws && !this.#handler) {
            this.#handler = () => {
                ws.send(`sub,${ this.name }`);
                this.emit('open');
            };

            if (ws.readyState === OPEN) {
                setTimeout(this.#handler, 0);
            } else if (ws.readyState === CONNECTING) {
                ws.addEventListener('open', this.#handler);
            }
        }
    }

    close(ws) {
        if (this.#handler && ws) {
            ws.removeEventListener('open', this.#handler);
            this.#handler = null
            if (ws.readyState === OPEN)
                ws.send(`uns,${ this.name }`);
            else if (ws.readyState === CONNECTING) {
                ws.addEventListener('open', () => ws.send(`uns,${ this.name }`));
            }
            setTimeout(() => this.emit('close', {}), 0);
        }
    }
}

export const send = (ws, topic, message) => ws.send(`msg,${ topic },${ message }`);

export class WebSocketMultiplex {
    #channels = {};

    #handler

    constructor() {
        this.#handler = e => {
            const t = e.data.split(',');
            const type = t.shift(), name = t.shift(), payload = t.join();
            if (!(name in this.#channels)) {
                return;
            }
            const sub = this.#channels[name];

            switch (type) {
                case 'uns':
                    delete this.#channels[name];
                    sub.emit('close', {});
                    break;
                case 'msg':
                    sub.emit('message', { data: payload });
                    break;
            }
        }
    }

    install(ws) {
        ws.addEventListener('message', this.#handler);
        for (const name in this.#channels) {
            this.#channels[name].open(ws)
        }
    }

    uninstall(ws) {
        ws.removeEventListener('message', this.#handler)
        for (const name in this.#channels) {
            this.#channels[name].close(ws)
        }
    }

    channel(name, options) {
        const { autoCreate = true } = options ?? {}
        if (autoCreate)
            return this.#channels[name] ??= new Channel(name);
        else return this.#channels[name]
    }

    closeChannel(name, ws) {
        const channel = this.#channels[name]
        if (channel) {
            delete this.#channels[name]
            channel.close(ws)
        }
    }
}