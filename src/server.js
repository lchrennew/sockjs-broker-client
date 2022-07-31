import SockJS from 'sockjs-client'
import ClientBase from './client-base.js'

export default class Client extends ClientBase {
    constructor({ server, generateID, logger }) {
        super({ server, generateID, logger, SockJS });
    }
}