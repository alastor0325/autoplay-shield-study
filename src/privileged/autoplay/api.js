"use strict";

ChromeUtils.import("resource:///modules/PermissionUI.jsm");
ChromeUtils.import("resource:///modules/SitePermissions.jsm");
ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
ChromeUtils.import("resource://gre/modules/PopupNotifications.jsm");
ChromeUtils.import("resource://gre/modules/PrivateBrowsingUtils.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/TelemetryController.jsm");

const CID = ChromeUtils.import("resource://gre/modules/ClientID.jsm", {});
const { EventManager } = ExtensionCommon;

XPCOMUtils.defineLazyGetter(this, "gBrowserBundle", function() {
  return Services.strings.createBundle("chrome://browser/locale/browser.properties");
});

function _once(target, name) {
  const p = new Promise(function(resolve, reject) {
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

function setAutoplayPromptLayout(variation) {
  console.log(`setAutoplayPromptLayout, variation=${variation}`);
  if (!variation || variation === "control") {
    return;
  }

  Object.defineProperty(PermissionUI.AutoplayPermissionPrompt.prototype, "popupOptions", {
    get: function () {
      let checkbox = {
        show: !PrivateBrowsingUtils.isWindowPrivate(this.browser.ownerGlobal) &&
          !this.principal.URI.schemeIs("file")
      };
      if (checkbox.show) {
        if (variation === "allow-and-remember" ||
            variation === "deny-and-remember") {
          checkbox.checked = true;
        }
        checkbox.label = gBrowserBundle.GetStringFromName("autoplay.remember");
      }
      return {
        checkbox,
        displayURI: false,
        name: this.principal.URI.hostPort,
      };
    }
  });

  Object.defineProperty(PermissionUI.AutoplayPermissionPrompt.prototype, "promptActions", {
    get: function () {
      let allowAction = {
        label: gBrowserBundle.GetStringFromName("autoplay.Allow2.label"),
        accessKey: gBrowserBundle.GetStringFromName("autoplay.Allow2.accesskey"),
        action: Ci.nsIPermissionManager.ALLOW_ACTION,
      };
      let denyAction = {
        label: gBrowserBundle.GetStringFromName("autoplay.DontAllow.label"),
        accessKey: gBrowserBundle.GetStringFromName("autoplay.DontAllow.accesskey"),
        action: Ci.nsIPermissionManager.DENY_ACTION,
      };
      if (variation === "allow-and-notRemember" ||
          variation === "allow-and-remember") {
        return [allowAction, denyAction];
      }
      return [denyAction, allowAction];
    }
  });
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
    this.branch = "undefined";
  }

  async onShutdown(shutdownReason) {
    console.log(`onShutdown, reason=${shutdownReason}`);
    return new Promise(async(resolve) => {
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
    console.log("submitTelemetryPing to server");
    console.log(data);
    const telOptions = { addClientId: true, addEnvironment: true };
    return TelemetryController.submitExternalPing("block-autoplay", data, telOptions);
  }

  async constructPayload(payloadType) {
    const payload = {
      id: this.pingId++,
      clientId: await getTelemetryId(),
      branch: this.branch,
      type: payloadType,
    };
    switch (payloadType) {
      case "counts":
        payload.counters = {
          totalPages: this.domainUserVisited.size,
          totalPagesAM: this.domainWithAutoplay.size,
          totalBlockedAudibleMedia: this.getBlockedAudibleMediaCount(),
        };
        break;
      case "prompt":
        payload.promptResponse = [];
        while (this.promptResponses.length > 0) {
          const data = this.promptResponses.shift();
          payload.promptResponse.push(data);
        }
        break;
      case "settings":
        payload.settingsChanged = [];
        while (this.settingChanges.length > 0) {
          const data = this.settingChanges.shift();
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
    const option = Ci.nsITelemetry.DATASET_RELEASE_CHANNEL_OPTIN;
    const scalar = Services.telemetry.snapshotScalars(option, false);
    // the count we get is accumulated with session life time, so we need to calculate
    // the count within the period between sending the ping.
    const accumulatedCount = scalar.content["media.autoplay_would_not_be_allowed_count"];
    if (!Number.isInteger(accumulatedCount)) {
      return 0;
    }

    const count = accumulatedCount - this.blockedAudibleAutoplayCount;
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
      autoplay: {
        autoplaySettingChanged: new EventManager(context, "autoplay.autoplaySettingChanged", fire => {
          const callback = value => {
            fire.async(value);
          };

          const pageSettingObs = (subject, topic, data) => {
            if (subject.type !== "autoplay-media" || topic !== "perm-changed") {
              return;
            }

            console.log(subject);
            const domain = subject.principal.baseDomain;
            let autoplayState;

            const PERM_ACTION = {
              UNKNOWN_ACTION: 0,
              ALLOW_ACTION: 1,
              DENY_ACTION: 2,
              PROMPT_ACTION: 3,
            };

            if (data === "added") {
              autoplayState = (subject.capability === PERM_ACTION.ALLOW_ACTION) ?
                "allow" : "block";
            } else if (data === "deleted") {
              autoplayState = "default";
            }
            callback({
              timestamp: Date.now(),
              pageSpecific: {
                pageId: domain,
                allowAutoplay: autoplayState,
              },
            });
          };

          const globalSettingObs = () => {
            const value = Preferences.get("media.autoplay.default", 2 /* prompt */);
            let autoplayState;
            if (value === 0) {
              autoplayState = "allow";
            } else {
              autoplayState = (value === 1) ? "block" : "ask";
            }
            callback({
              timestamp: Date.now(),
              globalSettings: {
                allowAutoPlay: autoplayState,
              },
            });
          };

          Services.obs.addObserver(pageSettingObs, "perm-changed");
          Preferences.observe("media.autoplay.default", globalSettingObs);

          return () => {
            Services.obs.removeObserver(pageSettingObs, "perm-changed");
            Preferences.ignore("media.autoplay.default", globalSettingObs);
          };
        }).api(),

        audibleAutoplayOccurred: new EventManager(context, "autoplay.audibleAutoplayOccurred", fire => {
          const autoplayObs = (subject, topic, data) => {
            fire.async(tabManager.getWrapper(subject).id,
                       subject.linkedBrowser.currentURI.spec.toString());
          };
          Services.obs.addObserver(autoplayObs, "AudibleAutoplayMediaOccurred");

          return () => {
            Services.obs.removeObserver(autoplayObs, "AudibleAutoplayMediaOccurred");
          };
        }).api(),

        setPreferences: (variation) => {
          this.branch = variation;
          Preferences.set({
            "media.autoplay.default": variation === "control" ? 0 : 2,
            "media.autoplay.enabled.user-gestures-needed": true,
            "media.autoplay.ask-permission": true,
          });
          setAutoplayPromptLayout(variation);
        },

        getAutoplayPermission: async(tabId, url) => {
          function getPromptStatus() {
            return new Promise(function(resolve, reject) {
              notification.panel.firstChild.onclick = (e) => {
                const id = e.originalTarget.attributes.anonid.nodeValue;
                if (id === "checkbox") {
                  return;
                }
                resolve({
                  rememberCheckbox: notification.panel.firstChild.checkbox.checked,
                  allowAutoPlay: (id === "button"),
                });
              };
            });
          }

          const notification = tabManager.get(tabId).nativeTab.ownerGlobal.PopupNotifications;

          await _once(notification.panel, "popupshown");

          const status = await getPromptStatus().catch(errorHandler);
          return status;
        },

        sendTelemetry: async(data) => {
          this.sendTelemetryPings();
        },

        updatePingData: async(type, data) => {
          console.log(`updatePingData, type=${type}`);
          console.log(data);
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
      },
    };
  }
};
