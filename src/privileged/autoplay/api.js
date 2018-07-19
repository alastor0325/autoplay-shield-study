"use strict";

ChromeUtils.import("resource:///modules/SitePermissions.jsm");
ChromeUtils.import("resource://gre/modules/TelemetryController.jsm");
ChromeUtils.import("resource://gre/modules/PopupNotifications.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");

const CID = ChromeUtils.import("resource://gre/modules/ClientID.jsm", {});
const { EventManager } = ExtensionCommon;


function _once(target, name) {
  var p = new Promise(function(resolve, reject) {
    target.addEventListener(name, function() {
      resolve();
    }, {once: true});
  });
  return p;
}

this.autoplay = class AutoplayAPI extends ExtensionAPI {
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

        hasAutoplayMediaContent: async function (tabId) {
          console.log("@@@@ hasAudibleAutoplayMediaContent");
          function getAutplayURL(tabId) {
            return new Promise(function(resolve, reject) {
              let tab = tabManager.get(tabId).nativeTab;
              tab.addEventListener("TabAttrModified", (event) => {
                console.log(event.detail.changed);
                if (event.detail.changed.includes("contain-autoplay-media")) {
                  resolve(event.target.linkedBrowser.currentURI.spec.toString());
                }
              });
              tab.ownerGlobal.setTimeout(function assumeNoAutoplay() {
                reject("Pass too much time, assume the website doesn't contain autoplay.");
              }, 3000);
            });
          }

          let url = await getAutplayURL(tabId).catch((msg) => {
            console.log(msg);
            return msg;
          });
          return url;
        },

        getAutoplayPermission : async function getAutoplayPermission(tabId, url) {
          function getPromptStatus() {
            return new Promise(function(resolve, reject) {
              notification.panel.firstChild.onclick = (e) => {
                let id = e.originalTarget.attributes.anonid.nodeValue;
                if (id === "checkbox") {
                  return;
                }
                let allowAutoPlay = (id === "button");
                let rememberCheckbox = notification.panel.firstChild.checkbox.checked;
                resolve({
                  rememberCheckbox : rememberCheckbox,
                  allowAutoPlay : allowAutoPlay
                });
              };
            });
          }

          let notification = tabManager.get(tabId).nativeTab.ownerGlobal.PopupNotifications;

          await _once(notification.panel, "popupshown");
          console.log("@@@ show pop-up notifications");

          let status = await getPromptStatus().catch((err) => { console.log(err);})
          return status;
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