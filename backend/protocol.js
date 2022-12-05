/* 
  Shuangyi Tong <shuangyi.tong@eng.ox.ac.uk>
  created on Apr 15, 2021
*/

const { ipcMain, Debugger } = require('electron');
const { dataHub } = require('./data.js');
const { env } = require('./env.js');

class ProtocolError extends Error {
    constructor(message) {
        super(message);
    }
}

var socketCount = 0;
var sockets = {};
var socketIDDeviceIDMap = {};
var deviceIDSocketIDMap = {};
var waitingReply = {};
var errorState = {};
var controlDataQueue = {};
var simplifiedReplySockets = {};

const Buffer = require('buffer').Buffer;

function makeDataHandler(dataHubObj) {

    // Data from renderer
    function sendControlData(socketID) {
        if (controlDataQueue[socketID].length > 0) {
            if (!waitingReply[socketID]) {
                let sendBuf = dataHub.prepareControlData(socketIDDeviceIDMap[socketID], controlDataQueue[socketID][0]);
                sendBuf.writeInt32BE(sendBuf.length - 4);

                waitingReply[socketID] = 1;
                sockets[socketID].write(sendBuf, () => {});
                controlDataQueue[socketID].shift();

                sendControlData(socketID);
            }
            else {
                // console.log("reply not received");
            }
        }
    }

    // TODO: only needs to be called once
    ipcMain.on('control-data', (event, arg) => {
        if (!(arg[0] in deviceIDSocketIDMap)) {
            if (arg[0] == 'log') {             
                let logFrame = arg[1];
                logFrame['timestamp'] = Date.now();
                dataHub.controlData["log"].push(logFrame);
            } else {
                console.log("Command send to device " + arg[0] + " does not exist! Did you put the wrong device id code?");
            }
        } else {
            let socketID = deviceIDSocketIDMap[arg[0]];
            // push data to the queue
            controlDataQueue[socketID].push(arg[1]);
            // try to send
            sendControlData(socketID);
        }
    });

    // Data from listener
    return { sender: sendControlData,
        listener: (socketID, bufObj) => {
        // already registered
        // console.log('data coming in');
        if (socketID in socketIDDeviceIDMap) {
            let ret = dataHubObj.saveFrame(socketIDDeviceIDMap[socketID], bufObj);
            if (ret != 0)
            {
                return 1;
            }
        } else { // new connection, must be a JSON descriptor
            let descriptor = JSON.parse(bufObj.toString());
            if (!'device_id' in descriptor) {
                console.log("descriptor sent by " + socketID + " doesn't have a device_id field");
                return 1;
            }
            socketIDDeviceIDMap[socketID] = descriptor['device_id'];
            deviceIDSocketIDMap[descriptor['device_id']] = socketID;
            if (env.winRef) {
                env.winRef.webContents.send('connected', socketIDDeviceIDMap[socketID]);
            }
        
            let ret = dataHubObj.registerDescriptor(descriptor);
            if (ret != 0)
            {
                return 1;
            }
            
            if (descriptor.data_to_control) {
                simplifiedReplySockets[socketID] = false;
            } else {
                simplifiedReplySockets[socketID] = true;
            }

            sockets[socketID].on('end', () => {
                env.winRef.webContents.send('disconnected', socketIDDeviceIDMap[socketID]);
                console.log('device ' + socketIDDeviceIDMap[socketID] + ' sent FIN');
            });

            sockets[socketID].on('close', () => {
                env.winRef.webContents.send('disconnected', socketIDDeviceIDMap[socketID]);
                console.log('connection to ' + socketIDDeviceIDMap[socketID] + ' closed');
            });
        }

        return 0;
    }}
}

function makeListener(dataHandler, socket) {
    var numBytes = "NA";
    var numBytesReceived = 0;
    var chunks   = [];
    var socketID = socketCount++;
    sockets[socketID] = socket;
    waitingReply[socketID] = 0;
    errorState[socketID] = 0;
    controlDataQueue[socketID] = [];

    function processChunk (chunk) {
        let startPos = 0;
        let stickyChunk = null;
        let handled = false;

        // check if the socket is in error
        if (errorState[socketID]) {
            console.log("Socket Error on " + socketID + " " + errorState[socketID]);
            return;
        }

        // if the received chunk belongs to a new transmission
        if (numBytes == "NA") {
            if (chunk.length < 4) {
                // TODO: this should be allowed
                console.log("Buffer size less then 4 while numBytes not initialized");
                return;
            }
            numBytes = chunk.readUIntBE(0, 4);
            startPos = 4;

            // console.log('Frame at socket ' + socketID + ' expected size: ' + numBytes);
        }

        if (numBytesReceived + chunk.length - startPos > numBytes) {
            let cut = numBytes - numBytesReceived;
            chunks.push(chunk.slice(startPos, startPos + cut));
            stickyChunk = chunk.slice(startPos + cut, chunk.length);
            numBytesReceived += cut;
        } else {
            if (startPos > 0) {
                chunks.push(chunk.slice(startPos));
            } else {
                chunks.push(chunk);
            }
            numBytesReceived += chunk.length - startPos;
        }
        
        if (numBytesReceived < numBytes) {
            return;
        } else if (numBytesReceived == numBytes) {
            // console.log("size matched: " + numBytesReceived);
            let ret = 0;
            let payloadBuf = (Buffer.concat(chunks));

            // reset closure variables
            numBytes = "NA";
            numBytesReceived = 0;
            chunks = [];

            if (waitingReply[socketID]) {
                // a reply is either OK or FAIL, check the size just to avoid translating too large string
                if (payloadBuf.length < 5) {
                    let replyString = payloadBuf.toString('utf-8');
                    if (replyString == 'OK') {
                        waitingReply[socketID] = 0;
                        dataHandler.sender(socketID);
                        handled = true;
                    } else if (replyString == 'FAIL') {
                        waitingReply[socketID] = 0;
                        dataHandler.sender(socketID);
                        handled = true;
                        console.log("Device sent FAIL");
                        // TODO: record control reply
                    } // else continue
                }
            }
            
            if (!handled) {
                ret = dataHandler.listener(socketID, payloadBuf);
                
                if (simplifiedReplySockets[socketID]) {
                    let simpRep = new Uint8Array(1);
                    if (ret != 0)
                    {
                        simpRep[0] = 255;
                    } else {
                        simpRep[0] = 1;
                    }
                    sockets[socketID].write(simpRep, () => {}); // one byte reply
                } else {
                    let message = "0000OK";
                    if (ret != 0)
                    {
                        message = "0000FAIL";
                    }
                    let messageBuf = Buffer.from(message, 'utf8');
                    messageBuf.writeInt32BE(messageBuf.length - 4);
                    sockets[socketID].write(messageBuf, () => {});
                }

                
            }

        } else {
            throw new ProtocolError("Num bytes: " + numBytes + ", actual recceived: " + numBytesReceived);
        }

        if (stickyChunk) {
            processChunk(stickyChunk);
        }

        return;
    }

    return processChunk;
}

var dataHandler = makeDataHandler(dataHub);

module.exports = {
    executeProtocol: function (socket) {
        socket.on('data', makeListener(dataHandler, socket));
    }
}