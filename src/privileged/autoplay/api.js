"use strict";

ChromeUtils.import("resource:///modules/SitePermissions.jsm");
ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
ChromeUtils.import("resource://gre/modules/PopupNotifications.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/TelemetryController.jsm");

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

function errorHandler(err) {
  console.log(`### Error=${err}`);
}

function getTelemetryId() {
  const id = TelemetryController.clientID;
  if (id === undefined) {
    return CID.ClientIDImpl._doLoadClientID();
  }
  return id;
}

this.autoplay = class AutoplayAPI extends ExtensionAPI {
  constructor(extension) {
    super(extension);
    this.domainUserVisited = new Set();
    this.domainWithAutoplay = new Set();
    this.blockedAudibleAutoplayCount = 0;
    this.promptResponses = [];
    this.settingChanges = [];
    this.pingId = 0;
  }

  async onShutdown(shutdownReason) {
    console.log("@@@@@@ onShutdown, reason=" + shutdownReason);
    return new Promise(async (resolve) => {
      await this.sendTelemetryPings();
      resolve();
    });
  }

  async sendTelemetryPings() {
    let payload;
    if (this.domainUserVisited.size > 0) {
      payload = await this.constructPayload("counts");
      await this.submitTelemetryPing(payload).catch(errorHandler);
    }

    if (this.promptResponses.length > 0) {
      payload = await this.constructPayload("prompt");
      await this.submitTelemetryPing(payload).catch(errorHandler);
    }

    if (this.settingChanges.length > 0) {
      payload = await this.constructPayload("settings");
      await this.submitTelemetryPing(payload).catch(errorHandler);
    }

    this.reset();
  }

  submitTelemetryPing(data) {
    console.log(data);
    const telOptions = { addClientId: true, addEnvironment: true };
    // TODO : verifty JSON
    return TelemetryController.submitExternalPing("shield-study-addon", data, telOptions);
  }

  async constructPayload(type) {
    // TODO : add other info : like ID, branch
    let payload = {
      id : this.pingId++,
      client_id : await getTelemetryId(),
      branch : "none", // TODO
      type : type
    };
    switch (type) {
      case "counts":
        payload.counters = {
          totalPages : this.domainUserVisited.size,
          totalPagesAM : this.domainWithAutoplay.size,
          totalBlockedAudibleMedia : this.getBlockedAudibleMediaCount()
        }
        break;
      case "prompt":
        payload.promptResponse = [];
        while (this.promptResponses.length > 0) {
          let data = this.promptResponses.shift()
          payload.promptResponse.push(data);
        }
        break;
      case "settings":
        payload.settingsChanged = [];
        while (this.settingChanges.length > 0) {
          let data = this.settingChanges.shift();
          payload.settingsChanged.push(data);
        }
        break;
      default:
        console.log("Error : incorrect payload type");
        break;
    }
    return payload;
  }

  getBlockedAudibleMediaCount() {
    let scalar = Services.telemetry.snapshotScalars(Ci.nsITelemetry.DATASET_RELEASE_CHANNEL_OPTIN, false);
    // the count we get is accumulated with session life time, so we need to calculate
    // the count within the period between sending the ping.
    let accumulatedCount = scalar.content["media.autoplay_would_not_be_allowed_count"];
    if (!Number.isInteger(accumulatedCount)) {
      return 0;
    }

    let count = accumulatedCount - this.blockedAudibleAutoplayCount;
    if (count < 0) {
      console.log("### Error : count should not be negative.");
    }
    this.blockedAudibleAutoplayCount = count;
    return count;
  }

  reset() {
    this.domainUserVisited.clear();
    this.domainWithAutoplay.clear();
    this.promptResponses = [];
    this.settingChanges = [];
    this.pingId = 0;
  }

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

        audibleAutoplayOccurred: new EventManager(context, "autoplay.audibleAutoplayOccurred", fire => {
          let autoplayObs = (subject, topic, data) => {
            fire.async(tabManager.getWrapper(subject).id,
                       subject.linkedBrowser.currentURI.spec.toString());
          }
          Services.obs.addObserver(autoplayObs, "AudibleAutoplayMediaOccurred");

          return () => {
            Services.obs.removeObserver(autoplayObs, "AudibleAutoplayMediaOccurred");
          };
        }).api(),

        setPreferences: () => {
          Preferences.set({
            "media.autoplay.enabled" : false,
            "media.autoplay.enabled.user-gestures-needed" : true,
            "media.autoplay.ask-permission" : true
          });
        },

        hasAutoplayMediaContent: async (tabId) => {
          console.log("@@@@@ hasAutoplayMediaContent");
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
              }, 30000);
            });
          }

          let url = await getAutplayURL(tabId).catch((msg) => {
            console.log(msg);
            return msg;
          });
          return url;
        },

        getAutoplayPermission : async (tabId, url) => {
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

        sendTelemetry: async (data) => {
          this.sendTelemetryPings();
        },

        updatePingData: async (type, data) => {
          console.log("@@@@@@@");
          console.log(type);
          console.log(data);
          console.log("@@@@@@@");
          switch (type) {
            case "visitPage":
              this.domainUserVisited.add(data.pageId);
              break;
            case "autoplayOccur":
              this.domainWithAutoplay.add(data.pageId);
              break;
            case "promptChanged":
              this.promptResponses.push(data);
              break;
            case "settingChanged":
              this.settingChanges.push(data);
              break;
            default:
              console.log("Error : incorrect data type");
              break;
          }
        },
      }
    };
  }
};