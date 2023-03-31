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
    constructor(ws, name, channels) {
        super();
        this.ws = ws;
        this.name = name;
        this.channels = channels;

        if (ws.readyState > 0) {
            setTimeout(this.open, 0);
        } else {
            ws.addEventListener('open', this.open);
        }
    }

    open() {
        this.ws.send('sub,' + this.name);
        this.emit('open');
    }

    close() {
        this.ws.removeListener('open', this.open);
        if (this.ws.readyState > 0)
            this.ws.send('uns,' + this.name);

        delete this.channels[this.name];
        setTimeout(() => this.emit('close', {}), 0);
    }
}

export const send = (ws, topic, message) => ws.send('msg,' + topic + ',' + message);

export class WebSocketMultiplex {
    constructor(ws) {
        this.ws = ws;
        this.channels = {};
        this.ws.addEventListener('message', e => {
            const t = e.data.split(',');
            const type = t.shift(), name = t.shift(), payload = t.join();
            if (!(name in this.channels)) {
                return;
            }
            const sub = this.channels[name];

            switch (type) {
                case 'uns':
                    delete this.channels[name];
                    sub.emit('close', {});
                    break;
                case 'msg':
                    sub.emit('message', { data: payload });
                    break;
            }
        });
    }

    channel(name, options) {
        const { autoCreate = true } = options ?? {}
        if (autoCreate)
            return this.channels[name] ??= new Channel(this.ws, name, this.channels);
        else return this.channels[name]
    }
}