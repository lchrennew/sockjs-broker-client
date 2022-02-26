<script setup>
import Client from "sockjs-broker-client";
import { generateObjectID } from "es-object-id";

const client = new Client({ server: 'http://localhost:9999/queues', generateID: generateObjectID });
const sub = () => client.subscribe('topic1', ({ data }) => console.log(data));
const unsub = () => client.unsubscribe('topic1');
const pub = () => client.send('topic1', 'hello,world');
const conn = () => client.connect();
const disconn = () => client.disconnect();
</script>

<template>
    <button @click="conn">接入</button>
    <button @click="sub">订阅</button>
    <button @click="unsub">取消订阅</button>
    <button @click="pub">推送</button>
    <button @click="disconn">断开</button>
</template>

<style scoped>
a {
    color: #42b983;
}
</style>
