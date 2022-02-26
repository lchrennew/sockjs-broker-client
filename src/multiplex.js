class DumbEventTarget {
    constructor() {
        this._listeners = {};
    }

    _ensure(type) {
        if (!(type in this._listeners)) this._listeners[type] = [];
    }

    addEventListener(type, listener) {
        this._ensure(type);
        this._listeners[type].push(listener);
    }

    emit(type) {
        this._ensure(type);
        const args = Array.prototype.slice.call(arguments, 1);
        if (this['on' + type]) this['on' + type].apply(this, args);
        for (let i = 0; i < this._listeners[type].length; i++) {
            this._listeners[type][i].apply(this, args);
        }
    }
}

export class Channel extends DumbEventTarget {
    constructor(ws, name, channels) {
        super();
        this.ws = ws;
        this.name = name;
        this.channels = channels;
        const onopen = () => {
            this.ws.send('sub,' + this.name);
            this.emit('open');
        };
        if (ws.readyState > 0) {
            setTimeout(onopen, 0);
        } else {
            this.ws.addEventListener('open', onopen);
        }
    }

    send(data) {
        this.ws.send('msg,' + this.name + ',' + data);
    }

    close() {
        this.ws.send('uns,' + this.name);
        delete this.channels[this.name];
        setTimeout(() => this.emit('close', {}), 0);
    }
}

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
                    sub.emit('message', {data: payload});
                    break;
            }
        });
    }

    channel(raw_name) {
        return this.channels[escape(raw_name)] =
            new Channel(this.ws, escape(raw_name), this.channels);
    }
}