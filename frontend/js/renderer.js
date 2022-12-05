/* 
  Shuangyi Tong <shuangyi.tong@eng.ox.ac.uk>
  created on Apr 15, 2021
*/

const { ipcRenderer } = require('electron');

const Mutex = require('async-mutex').Mutex;

var current_selected_script;

var device_records = {};

function sendCommand(device_id, field, value) {
    ipcRenderer.send('control-data', [ device_id, { [field]: value }]);
}

function sendMultipleCommands(device_id, obj) {
    ipcRenderer.send('control-data', [ device_id, obj]);
}

function getTupleValue(duplicates, id_prefix) {
    let ret_tuple = [];
    for (var i = 0; i < duplicates; i++) {
        ret_tuple.push($(`#${ id_prefix }-${ i }`).val());
    }

    if (ret_tuple.length == 1) {
        return ret_tuple[0];
    }

    return ret_tuple;
}

function makeVisualControlView(device_id, device_data_field, visual_control_style) {
    let ret_div = `<div style="center">`;
    let data_description = device_records[device_id].descriptor.data_to_control;

    let dup = 1;
    if (Array.isArray(data_description[device_data_field])) {
        dup = data_description[device_data_field][0];
    }

    if (visual_control_style == "static") {
        for (var i = 0; i < dup; i++)
            ret_div += `<input type='text' id="device-control${ device_id }-${ device_data_field }-${ i }"/>`;
        ret_div += `<input id="device-control${ device_id }-${ device_data_field }-submit" type="submit" value="Submit">`
        ret_div += `<script>$( "#device-control${ device_id }-${ device_data_field }-submit" ).click(function() {
                                sendCommand("${ device_id }",
                                            "${ device_data_field }",
                                            getTupleValue(${ dup }, "device-control${ device_id }-${ device_data_field }"));
                            });
                    </script>`
    } else if (Array.isArray(visual_control_style)) { // Since we don't have built-in ADT pattern matching in javascript, just match and unpack values manually
        if (visual_control_style[0] == "slider") {
            ret_div += `<input type="range" min="${ visual_control_style[1] }" max="${ visual_control_style[2] }" 
                         value="0" step="0.01" id="device-control${ device_id }-${ device_data_field }">`;
            ret_div += `Value: <input id="device-control${ device_id }-${ device_data_field }-display" type="text" value="0"/>`;
            ret_div += `<input id="device-control${ device_id }-${ device_data_field }-submit" type="submit" value="Submit">`;
            ret_div += `<script>
                            $( "#device-control${ device_id }-${ device_data_field }-submit" ).click(function() {
                                sendCommand("${ device_id }", "${ device_data_field }", 
                                    $("#device-control${ device_id }-${ device_data_field }").val());
                            });

                            $( "#device-control${ device_id }-${ device_data_field }" ).on("input", function() {
                                $( "#device-control${ device_id }-${ device_data_field }-display" ).val(this.value);
                            });

                            $( "#device-control${ device_id }-${ device_data_field }-display" ).on("input", function() {
                                $( "#device-control${ device_id }-${ device_data_field }" ).val(this.value);
                            });
                        </script>`
        }
    } else if (visual_control_style == "bool") { // note there is no bool value in our protocol, use integer all together
        ret_div += `<label class="switch">
        <input id="device-control${ device_id }-${ device_data_field }-box" type="checkbox">
        <span class="slider round"></span>
        </label>`
        ret_div += `<script>$( "#device-control${ device_id }-${ device_data_field }-box" ).change(function() {
            let val = 0;
            if (this.checked) {
                val = 1;
            }
            sendCommand("${ device_id }",
                        "${ device_data_field }",
                        val);});
            </script>`
    }

    ret_div += "</div>";
    return ret_div
}
var selected_devices = new Set();
var device_rendered = {};
var last_rendered = {};
var render_interval = 50; // 50 ms

function toggleDetailLayout(device_id) {
    if (selected_devices.has(device_id)) {
        selected_devices.delete(device_id);
        $("#entry" + device_id).removeClass("device-select-entry");
        $("#device" + device_id + "-detail").slideToggle();
    } else {
        selected_devices.add(device_id);
        $("#entry" + device_id).addClass("device-select-entry");
        $("#device" + device_id + "-detail").slideToggle();
    }
}

function makeDetailLayout(device_id) {
    $("#entry" + device_id).addClass("device-select-entry");
    let ret_div = `<div id="device${ device_id }-detail">`;
    let report_description = device_records[device_id].descriptor.data_to_report;
    let control_description = device_records[device_id].descriptor.data_to_control;
    let visual_report_guideline = device_records[device_id].descriptor.visual_report;
    let visual_control_guideline = device_records[device_id].descriptor.visual_control;
    if (!visual_report_guideline) {
        return "No visual configuration provided, nothing to show here.";
    }
    for (var report_data_field in report_description) {
        if (report_data_field in visual_report_guideline) {
            let visual_style = visual_report_guideline[report_data_field];
            let data_field_readable_name 
                = report_data_field.split("_").map(str => str[0].toUpperCase() + str.slice(1)).join(" ");
            let dup = 1;
            if (Array.isArray(report_description[report_data_field])) {
                dup = report_description[report_data_field][0];
            }
            ret_div += `<p>${ data_field_readable_name }</p>`;
            if (visual_style == "line_chart") {
                ret_div += `<div id="device${ device_id }-${ report_data_field }" class="line-chart"></div>`;
            } else if (visual_style == "static") {
                for (var i = 0; i < dup; i++)
                    ret_div += `Index-${ i }: <div id="device${ device_id }-${ report_data_field }-${ i }"></div>`;
            } else {
                ret_div += `<div>Unknown visual style: ${ visual_style } </div>`
            }

            // chceck visual control
            if (visual_control_guideline) {
                if (report_data_field in visual_control_guideline) {
                    let visual_control_style = visual_control_guideline[report_data_field];
                    ret_div += makeVisualControlView(device_id, report_data_field, visual_control_style);
                }
            }
        } else {
            continue;
        }
    }

    for (var control_data_field in control_description) {
        if (control_data_field in visual_control_guideline) {
            if (!(control_data_field in visual_report_guideline)) { // those already rendered with report field together
                let data_field_readable_name 
                    = control_data_field.split("_").map(str => str[0].toUpperCase() + str.slice(1)).join(" ");
                ret_div += `<p>${ data_field_readable_name }<\p>`
                ret_div += makeVisualControlView(device_id, control_data_field, visual_control_guideline[control_data_field]);
            }
        }
    }

    ret_div += `</div>`;

    return ret_div;
}

function renderDataFrame(device_id, data_frame) {
    let data_description = device_records[device_id].descriptor.data_to_report;
    let visual_guideline = device_records[device_id].descriptor.visual_report;
    let visual_value_range = device_records[device_id].descriptor.visual_value_range;
    if (visual_guideline) {
        let initialized = device_rendered[device_id];
        if (!initialized) {
            device_rendered[device_id] = {};
            last_rendered[device_id] = {}
        }

        let data_rate = 1000;
        let rolling_time = 10;
        if ("data_rate" in visual_guideline) {
            data_rate = visual_guideline["data_rate"];
            if ("rolling_time" in visual_guideline) {
                rolling_time = visual_guideline["rolling_time"];
            }
        }

        let max_data = rolling_time * data_rate;

        for (var device_data_field in visual_guideline) {  
            if ("data_rate" == device_data_field || "rolling_time" == device_data_field) {
                continue;
            }
            let dup = 1;
            if (Array.isArray(data_description[device_data_field])) {
                // handle multidimensional data
                dup = data_description[device_data_field][0];
            }
            let visual_style = visual_guideline[device_data_field];
            if (initialized) {
                if (visual_style == "line_chart") {
                    let container = document.getElementById(`device${ device_id }-${ device_data_field }`);
                    
                    let value_range = {};
                    if (visual_value_range) {
                        value_range = visual_value_range[device_data_field];
                    }

                    for (var i = 0; i < dup; i++) {
                        series_data = dup > 1 ? data_frame[device_data_field][i] : data_frame[device_data_field];
                        if (Array.isArray(series_data)) {
                            // handle packed but not binary ordered condition
                            device_rendered[device_id][device_data_field][i] 
                                = device_rendered[device_id][device_data_field][i].concat(series_data.map(x => [data_frame.timestamp, x]));
                        } else {
                            device_rendered[device_id][device_data_field][i].push([data_frame.timestamp, series_data]);
                        }
                        let pop_size = device_rendered[device_id][device_data_field][i].length - max_data;
                        for (var j = 0; j < pop_size; j++) {
                            device_rendered[device_id][device_data_field][i].shift();
                        }
                    }
                    if (selected_devices.has(device_id)) {
                        if (Date.now() - last_rendered[device_id][device_data_field] > render_interval) {
                            graph = Flotr.draw(container, device_rendered[device_id][device_data_field], {
                                xaxis : {
                                    mode : 'time',
                                    min : data_frame.timestamp - (rolling_time * 1000)
                                },
                                yaxis : value_range
                            });
                            last_rendered[device_id][device_data_field] = Date.now();
                        }
                    }  
                } else if (visual_style == "static") {
                    for (var i = 0; i < dup; i++) {
                        series_data = dup > 1 ? data_frame[device_data_field][i] : data_frame[device_data_field];
                        $("#device" + device_id + "-" + device_data_field + "-" + i).html(series_data);
                    }
                }
            } else {
                if (visual_style == "line_chart") {
                    device_rendered[device_id][device_data_field] = [];
                    let container = document.getElementById(`device${ device_id }-${ device_data_field }`);

                    let value_range = {};
                    if (visual_value_range) {
                        value_range = visual_value_range[device_data_field];
                    }

                    for (var i = 0; i < dup; i++) {
                        series_data = dup > 1 ? data_frame[device_data_field][i] : data_frame[device_data_field];
                        if (Array.isArray(series_data)) {
                            device_rendered[device_id][device_data_field].push([series_data.map(x => [data_frame.timestamp, x])]);
                        } else {
                            device_rendered[device_id][device_data_field].push([[data_frame.timestamp, series_data]]);
                        }
                    }
                    graph = Flotr.draw(container, device_rendered[device_id][device_data_field], {
                        xaxis : {
                            mode : 'time',
                            min : data_frame.timestamp - (rolling_time * 1000)
                        },
                        yaxis : value_range
                    });
                    last_rendered[device_id][device_data_field] = Date.now();
                } else if (visual_style == "static") {
                    for (var i = 0; i < dup; i++) {
                        series_data = dup > 1 ? data_frame[device_data_field][i] : data_frame[device_data_field];
                        $("#device" + device_id + "-" + device_data_field + "-" + i).html(series_data);
                    }
                } else {
                    console.log("not implemented for " + visual_style);
                }
            }
        }
    }
}

function makeEntry(device_id) {
    return `<div id="entry${ device_id }" class="device-entry" onclick="toggleDetailLayout(this.id.slice(5))">
    </div>`;
}

function makeDeviceEntryInfo(status, device_name) {
    let status_colour = 'green';
    if (status == 'Disconnected') {
        status_colour = 'red';
    }
    return `<div>
        <p style="color:${ status_colour };" class="no-vertical-margin">
            <i class="fas fa-plug"></i>
            ${ status }
        </p>
        <p>
        ${ device_name }
        </p>
    </div>`;
}

function switchTab(invoke_div, selected_tab) {
    $(".panel-container").each((i, obj) => {
        if (obj.id != selected_tab) {
            obj.style.display = "none";
        } else {
            obj.style.display = "";
        }
    });
    $(".nav-tab").each((i, obj) => {
        if (obj.id != invoke_div) {
            obj.classList.remove('active-tab');
        } else {
            obj.classList.add('active-tab');
        }
    });
}

const connect_sync = new Mutex();

ipcRenderer.on('connected', (event, arg) => {
    connect_sync
    .acquire()
    .then(function(release) {
        let device_name = "Unknown";
        if (arg in device_records) {
            device_name = device_records[arg].descriptor.name;
        } else {
            entry = makeEntry(arg);
            $("#device-select-panel").append(entry);
            device_records[arg] = {};
        }
        entry_info = makeDeviceEntryInfo("Connected", device_name);
        $("#entry" + arg).html(entry_info);
        console.log('Device ' + arg + ' connected');
        release();
    });
});

ipcRenderer.on('disconnected', (event, arg) => {
    entry_info = makeDeviceEntryInfo("Disconnected", device_records[arg].descriptor.name);
    $("#entry" + arg).html(entry_info);
    console.log("Disconnected to " + arg);
});

ipcRenderer.on('new-descriptor', (event, arg) => {
    connect_sync
    .acquire()
    .then(function(release) {
        let device_id = arg[0], device_descriptor = arg[1];
        entry_info = makeDeviceEntryInfo("Connected", device_descriptor.name);
        $("#entry" + device_id).html(entry_info);
        device_records[device_id].descriptor = device_descriptor;
        console.log("Received descriptor: " + device_descriptor);
        selected_devices.add(device_id);
        $("#detail-display").append(makeDetailLayout(device_id));
        release();
    });
});

var actionFunction = (device_id, dataframe) => {};
function runUserScript() {
    let script = codeMirrorEditor.getValue();
    $("#activated-script-name").html(current_selected_script);
    eval(script);
}

function saveUserScript() {
    let script = codeMirrorEditor.getValue();
    ipcRenderer.send('save-script-content', [script_name, script]);
}

ipcRenderer.on('new-dataframe', (event, arg) => {
    let device_id = arg[0], dataframe = arg[1];
    renderDataFrame(device_id, dataframe);
    actionFunction(device_id, dataframe);
});

function makeScriptEntry(script_name) {
    return `<div id="script${ script_name }" onclick="requestSavedScript(this.id)" class="device-entry">
        ${ script_name }
    </div>`;
}

function populateScriptList(script_list) {
    $("#script-select-panel").html("");
    script_list.forEach(element => {
        $("#script-select-panel").append(makeScriptEntry(element));
    });
}

function requestSavedScriptList() {
    ipcRenderer.send('request-script-list');
}

ipcRenderer.on('request-script-list', (event, arg) => {
    populateScriptList(arg);
});

function requestSavedScript(script_id) {
    script_name = script_id.slice(6);
    current_selected_script = script_name;
    ipcRenderer.send('request-script-content', script_name);
}

ipcRenderer.on('request-script-content', (event, arg) => {
    codeMirrorEditor.setValue(arg);
});