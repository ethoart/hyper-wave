import WebSocket from 'ws';
const ws = new WebSocket('wss://fstream.binance.com/ws/btcusdt@kline_1m');
ws.on('open', () => {
    console.log('connected');
});
ws.on('message', (data) => {
    console.log(data.toString());
    process.exit(0);
});
ws.on('error', (err) => {
    console.error(err);
    process.exit(1);
});
