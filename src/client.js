// https://tools.ietf.org/html/rfc8441

import EventEmitter from 'eventemitter2';
import { WebSocketMultiplex } from './multiplex.js';
import { getApi } from "es-fetch-api";
import { POST } from "es-fetch-api/middlewares/methods.js";
import { json } from "es-fetch-api/middlewares/body.js";
import SockJS from 'sockjs-client/lib/entry.js'
import { query } from "es-fetch-api/middlewares/query.js";

if (typeof window !== 'undefined') {
    window.global ??= {}
}
export default class Client extends EventEmitter.EventEmitter2 {
    id
    server;
    channels;
    sock;
    multiplexer;
    retries = 0;
    opened = false;
    #fallbacks = {}
    #logger

    /**
     *
     * @param server {String} Base URL of sockjs-broker
     * @param generateID {()=>String}
     * @param logger: {{info:(...args)=>{}, warn:(...args)=>{}}
     */
    constructor({
                    server,
                    generateID,
                    logger = {
                        info: (...args) => console.log(...args),
                        warn: (...args) => console.warn(...args),
                    }
                }) {
        super();
        this.server = server;
        this.id = generateID()
        this.#logger = logger
    }

    async connect(onOpen) {
        if (this.opened) return;
        const sock = new SockJS(`${this.server}/queues`, null, {
            server: this.id.substr(0, 12),
            sessionId: () => this.id.substr(12)
        });
        this.sock = sock;
        this.multiplexer = new WebSocketMultiplex(this.sock);
        this.channels = {};
        sock.onclose = (e) => {
            this.#logger.info(`Connection closed: ${e.reason} (${e.code}).`);
            this.opened = false;
            delete this.sock;
            delete this.multiplexer;
            if (e.code !== 1000) {
                this.#logger.info('Reconnecting.');
                setTimeout(() => this.connect(), 3000)
            }
        };

        return new Promise(resolve => {
            sock.onopen = () => {
                this.#logger.info('Connection opened.');
                this.opened = true;
                this.retries = 0;
                onOpen?.()
                this.emit('connected')
                resolve(this)
            };
        })
    }

    disconnect() {
        this.sock?.close();
        this.channels = {};
    }

    subscribe(topic, receive) {
        this.#createFallback(topic, receive)
        if (!this.opened) return;
        let channel = this.channels[topic];
        if (!channel) {
            channel = this.multiplexer.channel(topic);
            channel.onopen = () => this.#logger.info(`channel ${topic} opened`);
            channel.onmessage = receive;
            channel.onclose = () => this.#logger.info(`channel ${topic} closed`);
            this.channels[topic] = channel;
        }
        return channel;
    }

    unsubscribe(topic) {
        this.#removeFallback(topic)
        if (!this.opened) return;
        let channel = this.channels[topic];
        if (channel) {
            channel.close();
            delete this.channels[topic];
        }
    }

    send(topic, message) {
        if (!this.opened) return;
        let channel = this.channels[topic];
        if (!channel) {
            return this.#logger.warn('You should subscribe this topic first');
        }
        channel.send(message)
    }

    #createFallback(topic, receive) {
        this.#removeFallback(topic)
        this.once('connected', this.#fallbacks[topic] = () => this.subscribe(topic, receive))
    }

    #removeFallback(topic) {
        const exists = this.#fallbacks[topic]
        exists && this.off('connected', exists)
        delete this.#fallbacks[topic]
    }

    async publish(topic, message) {
        const api = getApi(this.server)
        await api(`publish`, POST, query({ topic }), json(message)).catch(() => null)
    }
}

