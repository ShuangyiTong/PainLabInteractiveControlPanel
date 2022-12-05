/* 
    Shuangyi Tong <shuangyi.tong@eng.ox.ac.uk>
    created on Apr 15, 2021
*/
const { app, Menu, dialog } = require('electron');
const isMac = process.platform === 'darwin'
const fs = require('fs-extra');
var JSONStream = require( "JSONStream" );

const { env } = require('./env.js');
const Buffer = require('buffer').Buffer;

// Modified from https://www.bennadel.com/blog/3232-parsing-and-serializing-large-objects-using-jsonstream-in-node-js.htm
function dumpJSONArray(fileName, arr) {
  var transformStream = JSONStream.stringify();
  var outputStream = fs.createWriteStream( fileName );
  transformStream.pipe( outputStream );
  // TODO: Need to flush pipe from time to time, otherwise it consumes too much memory.
  // See Jannis Froese commment: https://stackoverflow.com/a/43011606
  arr.forEach( transformStream.write );
  transformStream.end();

  outputStream.on(
      "finish",
      function handleFinish() {
          console.log("finish writing " + fileName);
      }
  );
}

class DataHub {
    constructor() {
        // device identifier : descriptor sent in register phase
        this.deviceDescriptors = {}
        // device identifier : dataframe
        this.deviceData = {};
        // device_identifier : control data object
        this.controlData = { "log": [] } // a default log object

        const template = [
            // { role: 'appMenu' }
            ...(isMac ? [{
              label: app.name,
              submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
              ]
            }] : []),
            // { role: 'fileMenu' }
            {
              label: 'File',
              submenu: [
                { label: 'Save All Data', click: () => { 
                    dialog.showSaveDialog(
                    { defaultPath: 'test', filters: { extensions: ["json"] } }).then(
                        result => {
                            let fileName = result.filePath + "__Device_Descriptors__.json";
                            fs.outputJson(fileName, this.deviceDescriptors, function (err) {
                              if (err != null) {
                                console.log(err);
                              }
                            });

                            fileName = result.filePath + "__Control_Data__.json";
                            fs.outputJson(fileName, this.controlData, function (err) {
                              if (err != null) {
                                console.log(err);
                              }
                            });

                            Object.keys(this.deviceData).forEach(deviceID => {
                              let fileName = result.filePath + "__Device_Data_" + this.deviceDescriptors[deviceID]["device_type"] + "__.json";

                              dumpJSONArray(fileName, this.deviceData[deviceID]);
                            });
                        }
                    ).catch(err => {
                        console.log(err);
                    });
                  }
                },
                {
                    label: 'Clear Data (incomplete)', 
                    click: () => { this.deviceDescriptors = {}; this.deviceData = {}; this.controlData = {} }
                },
                isMac ? { role: 'close' } : { role: 'quit' }
              ]
            },
            // { role: 'editMenu' }
            {
              label: 'Edit',
              submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                ...(isMac ? [
                  { role: 'pasteAndMatchStyle' },
                  { role: 'delete' },
                  { role: 'selectAll' },
                  { type: 'separator' },
                  {
                    label: 'Speech',
                    submenu: [
                      { role: 'startSpeaking' },
                      { role: 'stopSpeaking' }
                    ]
                  }
                ] : [
                  { role: 'delete' },
                  { type: 'separator' },
                  { role: 'selectAll' }
                ])
              ]
            },
            // { role: 'viewMenu' }
            {
              label: 'View',
              submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
              ]
            },
            // { role: 'windowMenu' }
            {
              label: 'Window',
              submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac ? [
                  { type: 'separator' },
                  { role: 'front' },
                  { type: 'separator' },
                  { role: 'window' }
                ] : [
                  { role: 'close' }
                ])
              ]
            },
            {
              role: 'help',
              submenu: [
                {
                  label: 'Learn More',
                  click: async () => {
                    const { shell } = require('electron')
                    await shell.openExternal('https://electronjs.org')
                  }
                }
              ]
            }
        ];

        const menu = Menu.buildFromTemplate(template)
        Menu.setApplicationMenu(menu)
    }

    registerDescriptor(descriptor) {
        let deviceID = descriptor['device_id'];

        if (deviceID in this.deviceDescriptors) {
            // reconnect, just log that
            console.log("deviceID " + deviceID + " reconnected");
            if (env.winRef) {
                env.winRef.webContents.send('connected', deviceID);
            }
        } else {
            // init device data array
            this.deviceData[deviceID] = [];
            this.controlData[deviceID] = [];
            console.log("deviceID " + deviceID + " connected");
            // update render process
            if (env.winRef) {
                env.winRef.webContents.send('new-descriptor', [deviceID, descriptor]);
            }
        }
        this.deviceDescriptors[deviceID] = descriptor;

        return 0;
    }

    saveFrame(deviceID, bufObj) {
        let frameFormat = this.deviceDescriptors[deviceID]['report_pack_order'];
        let binaryDecode = false;
        if (frameFormat) {
            if (frameFormat.order) {
                binaryDecode = true;
            }
        }

        if (binaryDecode) {
          if (frameFormat.packed) {
            let frameBatch = { timestamp: Date.now(), frames: [] };
            let frameOffset = 0;
            let dataFormat = this.deviceDescriptors[deviceID]['data_to_report'];
            while (frameOffset < bufObj.length) {
              let frameObj = {};
              frameFormat.order.forEach(item => {
                var decodedData;
                if (dataFormat[item] == 'uint32_t_le') {
                  decodedData = bufObj.readUInt32LE(frameOffset);
                  frameOffset += 4;
                } else if (dataFormat[item] == 'uint16_t_le') {
                  decodedData = bufObj.readUInt16LE(frameOffset);
                  frameOffset += 2;
                }
                frameObj[item] = decodedData;
              });
              frameBatch.frames.push(frameObj);
            }
            this.deviceData[deviceID].push(frameBatch);
            // send frame batch to front end
            if (env.winRef) {
              let frameToFront = frameBatch.frames[frameBatch.frames.length - 1];
              frameToFront["timestamp"] = frameBatch.timestamp;
              env.winRef.webContents.send('new-dataframe', [deviceID, frameToFront]);
            }
          } else {
            throw new Error("Not implemented yet");
          }
        } else {
            try
            {
                var frameObj = JSON.parse(bufObj.toString());
            }
            catch (error)
            {
                console.log(error);
                console.log(bufObj.toString());
            }
            frameObj['timestamp'] = Date.now();
            this.deviceData[deviceID].push(frameObj);

            // send the frame to front end
            if (env.winRef) {
              if (frameFormat && frameFormat.packed) {
                let frameToFront = {timestamp: frameObj.timestamp};
                for (const prop in frameObj) {
                  if (prop != 'timestamp' && Array.isArray(frameObj[prop])) {
                    frameToFront[prop] = frameObj[prop][frameObj[prop].length - 1];
                  } 
                }
                env.winRef.webContents.send('new-dataframe', [deviceID, frameToFront]);
              }
              else {
                env.winRef.webContents.send('new-dataframe', [deviceID, frameObj]);
              }
              
            }
        }

        return 0;
    }

    prepareControlData(deviceID, obj) {
        let frameFormat = this.deviceDescriptors[deviceID]['control_pack_order'];

        if (frameFormat) {
            throw new Error("not implemented yet.");
        } else {
            let controlFrame = Buffer.from("0000" + JSON.stringify(obj), 'utf8'); // "0000" is the placeholder for 4 byte BE length

            obj['timestamp'] = Date.now();
            this.controlData[deviceID].push(obj);

            return controlFrame;
        }
    }
}

var dataHub = new DataHub();
exports.dataHub = dataHub;