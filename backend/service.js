/* 
  Shuangyi Tong <shuangyi.tong@eng.ox.ac.uk>
  created on Nov 11, 2021
*/

const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path')

let { env } = require('./env.js');

ipcMain.on('request-script-list', (event, arg) => {
    fs.readdir('./instance/saved_scripts', (err, files) => {
        if (env.winRef) {
            env.winRef.webContents.send('request-script-list', files);
        }
    });
});

ipcMain.on('request-script-content', (event, arg) => {
    filePath = path.join('./instance/saved_scripts', arg);

    fs.readFile(filePath, {encoding: 'utf-8'}, (err, content) => {
        if (err) {
            console.log(err);
            env.winRef.webContents.send('request-script-content', "reading file error");
        }
        if (env.winRef) {
            env.winRef.webContents.send('request-script-content', content);
        }
    });
});

ipcMain.on('save-script-content', (event, arg) => {
    filePath = path.join('./instance/saved_scripts', arg[0]);

    fs.writeFile(filePath, arg[1], {encoding: 'utf-8'}, (err, content) => {
        if (err) {
            console.log(err);
        }
    });
});