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
        autoplaySettingChanged: new EventManager(context, "autoplay.autoplaySettingChanged", fire => {
          const callback = value => {
            fire.async(value);
          };

          let pageSettingObs = (subject, topic, data) => {
            if (subject.type !== "autoplay-media" || topic !==  "perm-changed") {
              return;
            }

            console.log(subject);
            let domain = subject.principal.baseDomain;
            let allowAutoplay;

            const PERM_ACTION = {
              UNKNOWN_ACTION : 0,
              ALLOW_ACTION   : 1,
              DENY_ACTION    : 2,
              PROMPT_ACTION  : 3
            }

            if (data === "added") {
              allowAutoplay = (subject.capability == PERM_ACTION.ALLOW_ACTION);
            } else if (data === "deleted") {
              allowAutoplay = PERM_ACTION.UNKNOWN_ACTION;
            }
            callback({
              timestamp : Date.now(),
              pageSpecific : {
                pageId : domain,
                allowAutoplay : allowAutoplay
              }
            });
          };

          let globalSettingObs = () => {
            let value = Preferences.get("media.autoplay.default", 2 /* prompt */);
            callback({
              timestamp : Date.now(),
              globalSettings : {
                allowAutoPlay: value
              }
            });
          }

          Services.obs.addObserver(pageSettingObs, "perm-changed");
          Preferences.observe("media.autoplay.default", globalSettingObs);

          return () => {
            Services.obs.removeObserver(pageSettingObs, "perm-changed");
            Preferences.ignore("media.autoplay.default", globalSettingObs);
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

          let status = await getPromptStatus().catch((err) => { console.log(err);})
          return status;
        },

        sendTelemetry: async function sendTelemetry(data) {
          const telOptions = { addClientId: true, addEnvironment: true };
          // TODO : add other info : like ID, branch
          return TelemetryController.submitExternalPing("shield-study-addon", data, telOptions);
        },

        getBlockedAudibleMediaCount: async function() {
          let scalar = Services.telemetry.snapshotScalars(Ci.nsITelemetry.DATASET_RELEASE_CHANNEL_OPTIN, false);
          let count = scalar.content["media.autoplay_would_not_be_allowed_count"];
          // TODO : fix this!
          // Services.telemetry.scalarSet("media.autoplay_would_not_be_allowed_count", 0);
          return count;
        }
      }
    };
  }
};