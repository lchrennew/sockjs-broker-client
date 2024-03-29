import ClientBase from "./client-base.js";
import SockJS from 'sockjs-client/dist/sockjs.min.js'

export default class Client extends ClientBase {
    constructor({ server, generateID, logger }) {
        super({ server, generateID, logger, SockJS });
    }
}