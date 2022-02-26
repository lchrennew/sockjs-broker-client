<script setup>
import Client from "sockjs-broker-client";

const client = new Client('http://localhost:9999/queues');
const sub = () => client.subscribe('topic1', ({ data }) => console.log(data)),
    unsub = () => client.unsubscribe('topic1'),
    pub = () => client.send('topic1', 'hello,world'),
    conn = () => client.connect(),
    disconn = () => client.disconnect()
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
