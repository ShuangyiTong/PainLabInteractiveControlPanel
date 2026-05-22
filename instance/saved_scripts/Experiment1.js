// Parameters to change
const STIMULATION_CURRENT = 0.5;

const VERSION_NUMBER = "1.0";
// Expriment config
const UNITYVR_VR_DEVICE_ID = "o8Y6VNWF7orzDfPGCrJh";
const STIMULATOR_DEVICE_ID = "SC91BBkyiIWxnJMipKYk";
const AZURE_SPEECH_REC_DEVICE_ID = "yZIfSdsUhQNP5TC7zU2q";

const TRIAL_TIME = 60000 // 60s
const PAIN_SIDE = "Right";
const CONTRA_SIDE = "Left";
const REWARD_PER_ITEM = 0.02;
const PINEAPPLES_PER_TRIAL = 150;
const GREEN_PINEAPPLES = parseInt(PINEAPPLES_PER_TRIAL * 0.5);
const YELLOW_PINEAPPLES = parseInt(PINEAPPLES_PER_TRIAL * 0.5);

// Global state variables
/* Loading | ReadyEnterTask | ConfirmInstructions | MainTaskInstructions | PainRatingsEndOfTrial | ReadyReEnterTask
*/
var current_ui_state = "Loading";
var current_stimulation_timer = 0;
var current_stimulation_strength = 0;
var current_ui_board = 1;
var current_trial_start_time = 0;
var current_trial_collected_items = 0;
var trial_count = 0;
var trial_order = ["NoPain", "MidLowPain", "MidMidPain", "MidHighPain", "MaxPain", "MaxPain", "MidHighPain", "MidMidPain", "MidLowPain", "NoPain"];
var pain_to_numerical_current = { "NoPain": 0, "MidLowPain": 0.25, "MidMidPain": 0.5, "MidHighPain": 0.75, "MaxPain": 1 };
var already_picked_up = false;
var disable_ratings_update = true; // because speech recognition has delays, sometimes this can re-invoke ratings UI because delayed speech recognition.
// variable to change each trial based on config
var reward = REWARD_PER_ITEM;

// Add random trials
var trial_order_shuffled = trial_order.slice();
trial_order = trial_order.concat(inplace_shuffle(trial_order_shuffled));

function scriptLog(msg) {
    sendMultipleCommands("log", {
       "source": "ChoicePainEffect.js v" + VERSION_NUMBER,
       "msg": msg
    });
 }

 actionFunction = (device_id, dataframe) => {
    if (device_id == UNITYVR_VR_DEVICE_ID) {
        // Universal actions
        if (dataframe["user_action"] == "MenuButtonPressed") {
           current_ui_board ^= 1; // toggle 0 and 1
           sendCommand(UNITYVR_VR_DEVICE_ID, "show_ui_board", current_ui_board);
        }
  
        // State-based actions
        if (current_ui_state == "Loading") {
            // Bootstrap
            sendMultipleCommands(UNITYVR_VR_DEVICE_ID, {
                    "switch_scene": "RestStage",
                    "set_player_position": [0.1538, 0.0158, 21.991],
                    "set_board_main_text": "Click Enter when you are ready",
                    "set_board_confirm_button_text": "Enter",
                    "show_ui_board": 1,
                    "activate_confirm_button": 1
            });
            current_ui_state = "ConfirmInstructions";
            scriptLog("Initialized - Stimulation current: " + STIMULATION_CURRENT + " PAIN side: " + PAIN_SIDE);
        } else if (current_ui_state == "ConfirmInstructions") {
            if (dataframe["board_command"] == "ConfirmButtonPressed") {
                scriptLog("Instruction confirmed, switching scene - trial: " + trial_count);
                sendMultipleCommands(UNITYVR_VR_DEVICE_ID, {
                    "switch_scene": "CoreScene",
                    "set_player_position": [121.337, 0, 114.472],
                    "set_player_scale": [3, 3, 3],
                    "set_board_title_text": "Main Session",
                    "set_board_main_text": "You can only use " + PAIN_SIDE + " hand. \n Click Start when you are ready",
                    "set_board_confirm_button_text": "Start",
                    "set_hand_active": PAIN_SIDE
                });
                sendCommand(UNITYVR_VR_DEVICE_ID, "enable_reward_popup", reward > 0 ? 1 : 0);
                current_ui_state = "ReadyStartTask";
            }
        } else if (current_ui_state == "ReadyStartTask") {
            if (dataframe["board_command"] == "ConfirmButtonPressed") {
                sendMultipleCommands(UNITYVR_VR_DEVICE_ID, {
                   "set_board_main_text": "The real session is on now!",
                   "set_board_title_text": "Main Session",
                   "generate_fruits": [10, YELLOW_PINEAPPLES, 0],
                   "show_ui_main_session": 1,
                   "show_ui_board": 0,
                   "activate_confirm_button": 0,
                   "set_count_values": current_trial_collected_items
                });
                sendCommand(UNITYVR_VR_DEVICE_ID, "generate_fruits", [10, GREEN_PINEAPPLES, 2]);
                current_trial_start_time = dataframe["timestamp"];
                current_ui_state = "MainTaskInstructions";
                scriptLog("Main task session started - trial: " + trial_count + "-" + trial_order[trial_count]);
            }
        } else if (current_ui_state == "MainTaskInstructions") {
            if (dataframe["pickable_object"] != "") {
                current_trial_collected_items += reward;
                scriptLog("collected an item with reward: " + reward);
    
                sendMultipleCommands(UNITYVR_VR_DEVICE_ID, {
                   "set_count_values": current_trial_collected_items
                });
            }

            if (dataframe["pickable_object_attached"] != "") {
                if (!already_picked_up) {
                    // Only green pineapples are painful and not yoked trial
                    if (dataframe["pickable_object_attached"].charAt(dataframe["pickable_object_attached"].length - 1) == "G") {
                        current_stimulation_strength = STIMULATION_CURRENT * pain_to_numerical_current[trial_order[trial_count]];
                        current_stimulation_timer = Date.now(); // issue shock now
                    }
                    already_picked_up = true;
                    scriptLog("Object " + dataframe["pickable_object_attached"] + " picked up");
                }
            } else {
                if (already_picked_up) {
                    already_picked_up = false;
                    scriptLog("Object " + dataframe["pickable_object_attached"] + " dropped");
                }
            }

            if ((dataframe["timestamp"] - current_trial_start_time > TRIAL_TIME)) {
                disable_ratings_update = false;
                sendCommand(AZURE_SPEECH_REC_DEVICE_ID, "recognition_command", "continuous");
                sendMultipleCommands(UNITYVR_VR_DEVICE_ID, {
                    "switch_scene": "RestStage",
                    "set_player_position": [0.1538, 0.0158, 21.991],
                    "set_player_scale": [1.33, 1.33, 1.33],
                    "show_ui_main_session": 0,
                    "show_ui_board": 1,
                    "set_board_title_text": "Subjective Pain Ratings",
                    "set_board_main_text": "Now rate the level of Pain you experienced during the game.\n Speak a number from 0 to 10 out loud.",
                    "set_board_confirm_button_text": "Submit",
                    "activate_confirm_button": 1,
                    "set_ratings": 5,
                    "set_hand_active": "Both"
                });
                current_ui_state = "PainRatingsEndOfTrial";
    
                scriptLog("Main task session end, trial: " + trial_count + "-" + trial_order[trial_count]);
            }
        } else if (current_ui_state == "PainRatingsEndOfTrial") {
            if (dataframe["board_command"] == "ConfirmButtonPressed") {
                scriptLog("Pain ratings: " + dataframe["slider_bar_value"]);
                disable_ratings_update = true;
                sendCommand(AZURE_SPEECH_REC_DEVICE_ID, "recognition_command", "stop");
                trial_count += 1;
                let remaining_trials = trial_order.length - trial_count;
   
                if (remaining_trials > 0) {
                    sendMultipleCommands(UNITYVR_VR_DEVICE_ID, {
                        "set_ratings": 999,
                        "set_board_title_text": "Trial Complete",
                        "set_board_main_text": "Thank you for completing this trial! There are " + remaining_trials + " left\n When you are ready, click the button to continue",
                        "set_board_confirm_button_text": "Continue"
                    });
                    current_ui_state = "ConfirmInstructions";
                } else {
                    sendMultipleCommands(UNITYVR_VR_DEVICE_ID, {
                        "set_ratings": 999,
                        "activate_confirm_button": 0,
                        "set_board_title_text": "Session complete!",
                        "set_board_main_text": "Thank you for your participation!\n There might be more sessions, you can take-off the headset for a rest.",
                    });
                }
            }
        }
    } else if (device_id == STIMULATOR_DEVICE_ID) {
        // Universal stimulating conditions
        if (current_stimulation_timer > 0 && current_stimulation_timer < Date.now()) {
            sendCommand(STIMULATOR_DEVICE_ID, "normalised_current_level", current_stimulation_strength);
            scriptLog("stimulation applied with strength " + current_stimulation_strength);
            current_stimulation_timer = 0;
            current_stimulation_strength = 0;
        }
    } else if (device_id == AZURE_SPEECH_REC_DEVICE_ID) {
        if (!disable_ratings_update)
            sendCommand(UNITYVR_VR_DEVICE_ID, "set_ratings", dataframe['recognition_val']);
    }
} 

scriptLog("Loaded");