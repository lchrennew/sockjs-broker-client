// https://tools.ietf.org/html/rfc8441

import EventEmitter from 'eventemitter2';
import { send, WebSocketMultiplex } from './multiplex.js';
import { getApi } from "es-fetch-api";
import { POST } from "es-fetch-api/middlewares/methods.js";
import { json } from "es-fetch-api/middlewares/body.js";
import { query } from "es-fetch-api/middlewares/query.js";

export default class ClientBase extends EventEmitter.EventEmitter2 {
    id
    server;
    #getSock;
    channels;
    sock;
    multiplexer;
    retries = 0;
    opened = false;
    #logger

    /**
     *
     * @param server {String} Base URL of sockjs-broker
     * @param generateID {()=>String}
     * @param logger: {{info:(...args)=>{}, warn:(...args)=>{}}
     * @param SockJS {Function}
     */
    constructor({
                    server,
                    generateID,
                    logger = {
                        info: (...args) => console.log(...args),
                        warn: (...args) => console.warn(...args),
                    },
                    SockJS,
                }) {
        super();
        this.server = server;
        this.id = generateID()
        this.#logger = logger
        this.#getSock = (...opts) => new SockJS(...opts)
        this.setMaxListeners(0)
    }

    async connect(onOpen) {
        if (this.opened) return;
        const sock = this.#getSock(`${ this.server }/queues`, null, {
            server: this.id.substr(0, 12),
            sessionId: () => this.id.substr(12)
        });
        this.sock = sock;
        this.multiplexer = new WebSocketMultiplex(this.sock);
        this.channels = {};
        sock.onclose = (e) => {
            this.#logger.info(`Connection closed: ${ e.reason } (${ e.code }).`);
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

    /**
     * 订阅主题
     * @param topic
     * @param receive
     * @returns {Channel|*}
     */
    subscribe(topic, receive) {
        // 添加本地事件订阅
        this.removeAllListeners(topic)
        this.on(topic, receive)

        // 注册远程订阅
        return this.#registerChannel(topic)
    }

    /**
     * 注册远程订阅，并避免重复订阅
     * @param topic
     * @returns {Channel|*}
     */
    #registerChannel(topic) {
        let channel = this.channels[topic] ??= this.multiplexer.channel(topic);
        channel.onopen = () => this.#logger.info(`channel ${ topic } opened`);
        channel.onmessage = (topic, payload) => this.emit(topic, payload);
        channel.onclose = () => this.#logger.info(`channel ${ topic } closed`);
        return channel;
    }

    unsubscribe(topic) {
        // 注销远程通道
        this.channels[topic]?.close();
        delete this.channels[topic];
        // 注销本地事件
        this.removeAllListeners(topic)
    }

    send(topic, message) {
        if (!this.opened) return;
        send(this.sock, topic, message)
    }

    async publish(topic, message) {
        const api = getApi(this.server)
        return api(`publish`, POST, query({ topic }), json(message))
    }

    async checkChannel(topic) {
        const api = getApi(this.server)
        return await api(`channels/exists`, query({ topic }))
            .then(response => response.json())
            .catch(() => false)
    }

    async getChannels() {
        const api = getApi(this.server)
        return await api(`channels`)
            .then(response => response.json())
            .then(({ exists }) => exists)
            .catch(() => false)
    }
}

