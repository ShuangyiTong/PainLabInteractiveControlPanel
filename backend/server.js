/* 
  Shuangyi Tong <shuangyi.tong@eng.ox.ac.uk>
  created on Apr 15, 2021
*/

const { executeProtocol } = require('./protocol.js');

const net = require('net');
const { exec } = require('child_process');

function newServer (socket) {
    socket.on('error', (err) => {
       console.log(err); 
    });
    console.log('a new connection established');
    executeProtocol(socket);
}

const localhostServer = net.createServer(newServer);
localhostServer.on('error', (err) => {
    throw err;
});

const wlanServer = net.createServer(newServer);
wlanServer.on('error', (err) => {
    throw err;
});

var port = 8124;
var localhost = '127.0.0.1';
var wlanAddress = '192.168.0.125'; // Lab server LAN address

localhostServer.listen(port, localhost, () => {
    console.log('localhost server bind to ' + localhost + ':' + port);
});

wlanServer.listen(port, wlanAddress, () => {
    console.log('wlan server bind to ' + wlanAddress + ':' + port);
});