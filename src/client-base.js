// https://tools.ietf.org/html/rfc8441

import EventEmitter from 'eventemitter2';
import { send, WebSocketMultiplex } from './multiplex.js';
import { getApi } from "es-fetch-api";
import { POST } from "es-fetch-api/middlewares/methods.js";
import { json } from "es-fetch-api/middlewares/body.js";
import { query } from "es-fetch-api/middlewares/query.js";

export const CONNECTING = 0;
export const OPEN = 1;
export const CLOSING = 2;
export const CLOSED = 3;

export default class ClientBase extends EventEmitter.EventEmitter2 {
    id
    #server;
    #getSock;
    #sock;
    #multiplexer = new WebSocketMultiplex();
    #logger
    #offlineQueue = []

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
        this.id = generateID()
        this.#server = server;
        this.#logger = logger
        this.#getSock = (...opts) => new SockJS(...opts)
        this.setMaxListeners(0)
        this.on('connected', () => {
            while (this.#offlineQueue.length){
                const {topic, message} = this.#offlineQueue.pop()
                this.send(topic, message)
            }
        })
    }


    get #connectable() {
        return ![ CONNECTING, OPEN ].includes(this.#sock?.readyState)
    }

    get #opened() {
        return [ OPEN ].includes(this.#sock?.readyState)
    }

    async connect() {
        if (!this.#connectable) return;

        this.#sock = this.#getSock(`${ this.#server }/queues`, null, {
            server: this.id.substr(0, 12),
            sessionId: () => this.id.substr(12)
        });


        this.#sock.onclose = e => {
            this.#logger.info(`Connection closed: ${ e.reason } (${ e.code }).`);
            this.#multiplexer.uninstall(this.#sock)
            if (e.code !== 1000) {
                this.#logger.info('Reconnecting.');
                setTimeout(() => this.connect(), 3000)
            }
        };

        this.#sock.onopen = () => {
            this.#logger.info('Connection opened.');
            this.#multiplexer.install(this.#sock);
            this.emit('connected')
        };
    }

    disconnect() {
        this.#sock?.close();
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
        let channel = this.#multiplexer.channel(topic);
        channel.onopen = () => this.#logger.info(`channel ${ topic } opened`);
        channel.onmessage = payload => this.emit(topic, payload);
        channel.onclose = () => this.#logger.info(`channel ${ topic } closed`);
        channel.open(this.#sock)
        return channel;
    }

    unsubscribe(topic) {
        // 注销远程通道
        this.#multiplexer.closeChannel(topic, this.#sock);
        // 注销本地事件
        this.removeAllListeners(topic)
    }

    send(topic, message) {
        if (!this.#opened) {
            this.#offlineQueue.push({ topic, message });
            return;
        }
        send(this.#sock, topic, message)
    }

    async publish(topic, message) {
        const api = getApi(this.#server)
        return api(`publish`, POST, query({ topic }), json(message))
    }

    async checkChannel(topic) {
        const api = getApi(this.#server)
        return await api(`channels/exists`, query({ topic }))
            .then(response => response.json())
            .catch(() => false)
    }

    async getChannels() {
        const api = getApi(this.#server)
        return await api(`channels`)
            .then(response => response.json())
            .then(({ exists }) => exists)
            .catch(() => false)
    }
}

