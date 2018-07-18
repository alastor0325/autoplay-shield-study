"use strict";

const CID = ChromeUtils.import("resource://gre/modules/ClientID.jsm", {});
const { TelemetryController } = ChromeUtils.import(
  "resource://gre/modules/TelemetryController.jsm",
  null,
)

ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
const { EventManager } = ExtensionCommon;

ChromeUtils.import("resource://gre/modules/PopupNotifications.jsm");

var autoplay = class AutoplayAPI extends ExtensionAPI {
  getAPI(context) {
    const {extension} = context;
    const {tabManager} = extension;

    return {
      autoplay : {
        onSomething: new EventManager(context, "autoplay.onSomething", fire => {
          const callback = value => {
            fire.async(value);
          };
          callback("hello");
          return () => {};
        }).api(),

        autoplayChanged: new EventManager(context, "autoplay.autoplayChanged", (fire, tabId) => {
          const callback = value => {
            fire.async(value);
          };

          function autoplayListener(event) {
            if (event.detail.changed.includes("contain-autoplay-media")) {
              callback(event.target.linkedBrowser.currentURI.spec.toString());
            }
          }

          let tab = tabManager.get(tabId);
          tab.nativeTab.addEventListener("TabAttrModified", autoplayListener);
          return () => {
            console.log("@@@@ remove autoplayChanged listener");
          };
        }).api(),

        setPreferences: function setPreferences() {
          Preferences.set({
            "media.autoplay.enabled" : false,
            "media.autoplay.enabled.user-gestures-needed" : true,
            "media.autoplay.ask-permission" : true
          });
        },

        hasAudibleAutoplayMediaContent: async function (tabId) {
          console.log("@@@@ hasAudibleAutoplayMediaContent");
          let rv = await new Promise(function(resolve, reject) {
            let tab = tabManager.get(tabId);
            tab.nativeTab.addEventListener("TabAttrModified", (event) => {
              console.log(event.detail.changed);
              if (event.detail.changed.includes("contain-autoplay-media")) {
                resolve(event.target.linkedBrowser.currentURI.spec.toString());
              }
            });
          });
          return rv;
        },

        sendTelemetry: async function sendTelemetry(data) {
          const telOptions = { addClientId: true, addEnvironment: true };
          // TODO : add other info : like ID, branch
          return TelemetryController.submitExternalPing("shield-study-addon", data, telOptions);
        }
      }
    };
  }
};