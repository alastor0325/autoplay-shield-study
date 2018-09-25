"use strict";

ChromeUtils.defineModuleGetter(this, "PermissionUI",
                               "resource:///modules/PermissionUI.jsm");
ChromeUtils.defineModuleGetter(this, "SitePermissions",
                               "resource:///modules/SitePermissions.jsm");
ChromeUtils.defineModuleGetter(this, "ExtensionCommon",
                               "resource://gre/modules/ExtensionCommon.jsm");
ChromeUtils.defineModuleGetter(this, "ExtensionStorage",
                               "resource://gre/modules/ExtensionStorage.jsm");
ChromeUtils.defineModuleGetter(this, "PopupNotifications",
                               "resource://gre/modules/PopupNotifications.jsm");
ChromeUtils.defineModuleGetter(this, "PrivateBrowsingUtils",
                               "resource://gre/modules/PrivateBrowsingUtils.jsm");
ChromeUtils.defineModuleGetter(this, "Services",
                               "resource://gre/modules/Services.jsm");
ChromeUtils.defineModuleGetter(this, "TelemetryController",
                               "resource://gre/modules/TelemetryController.jsm");
ChromeUtils.defineModuleGetter(this, "CID",
                               "resource://gre/modules/ClientID.jsm");
ChromeUtils.defineModuleGetter(this, "AddonStudies",
                               "resource://normandy/lib/AddonStudies.jsm");
XPCOMUtils.defineLazyGetter(this, "gBrowserBundle", function() {
  return Services.strings.createBundle("chrome://browser/locale/browser.properties");
});
const { EventManager } = ExtensionCommon;

function _once(target, name) {
  const p = new Promise(function(resolve, reject) {
    target.addEventListener(name, function() {
      resolve();
    }, {once: true});
  });
  return p;
}

function setAutoplayPromptLayout(variation) {
  console.log(`setAutoplayPromptLayout, variation=${variation}`);
  if (!variation || variation === "control" || variation === "block") {
    return;
  }

  Object.defineProperty(PermissionUI.AutoplayPermissionPrompt.prototype, "popupOptions", {
    get: function () {
      const learnMoreURL =
        Services.urlFormatter.formatURLPref("app.support.baseURL") + "block-autoplay";
      const checkbox = {
        show: !this.principal.URI.schemeIs("file")
      };

      if (checkbox.show) {
        if (variation === "allow-and-remember") {
          checkbox.checked = true;
        }
        checkbox.label = PrivateBrowsingUtils.isWindowPrivate(this.browser.ownerGlobal) ?
          gBrowserBundle.GetStringFromName("autoplay.remember-private") :
          gBrowserBundle.GetStringFromName("autoplay.remember");
      }
      return {
        checkbox,
        learnMoreURL,
        displayURI: false,
        name: this.principal.URI.hostPort,
      };
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
      await this.submitTelemetryPing(payload).catch(Cu.reportError);
    }

    if (this.promptResponses.length > 0) {
      payload = await this.constructPayload("prompt");
      await this.submitTelemetryPing(payload).catch(Cu.reportError);
    }

    if (this.settingChanges.length > 0) {
      payload = await this.constructPayload("settings");
      await this.submitTelemetryPing(payload).catch(Cu.reportError);
    }

    this.reset();
  }

  submitTelemetryPing(data) {
    console.log("submitTelemetryPing to server");
    console.log(data);
    const telOptions = { addClientId: true };
    return TelemetryController.submitExternalPing("block-autoplay", data, telOptions);
  }

  async constructPayload(payloadType) {
    const ping = {
      id: this.pingId++,
      branch: this.branch,
    };
    ping.payload = {
      type : payloadType
    };
    switch (payloadType) {
      case "counts":
        ping.payload.counters = {
          totalPages: this.domainUserVisited.size,
          totalPagesAM: this.domainWithAutoplay.size,
          totalBlockedAudibleMedia: this.getBlockedAudibleMediaCount(),
        };
        break;
      case "prompt":
        ping.payload.promptResponse = [];
        while (this.promptResponses.length > 0) {
          const data = this.promptResponses.shift();
          ping.payload.promptResponse.push(data);
        }
        break;
      case "settings":
        ping.payload.settingsChanged = [];
        while (this.settingChanges.length > 0) {
          const data = this.settingChanges.shift();
          ping.payload.settingsChanged.push(data);
        }
        break;
      default:
        console.log("Error : incorrect payload type");
        break;
    }
    return ping;
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
      console.log("ERROR : count is negative.");
      this.blockedAudibleAutoplayCount = accumulatedCount;
      return 0;
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

            if (data === "added") {
              autoplayState = (subject.capability === Ci.nsIPermissionManager.ALLOW_ACTION) ?
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
                       subject.linkedBrowser.currentURI.spec);
          };
          Services.obs.addObserver(autoplayObs, "AudibleAutoplayMediaOccurred");

          return () => {
            Services.obs.removeObserver(autoplayObs, "AudibleAutoplayMediaOccurred");
          };
        }).api(),

        onStudyEnd: new EventManager(context, "autoplay.onStudyEnd", fire => {
          AddonStudies.addUnenrollListener(extension.id, () => fire.sync());
          return () => {};
        }).api(),

        setPreferences: async(variation) => {
          this.branch = variation;

          let cacheDefaultSetting =
            await ExtensionStorage.get(extension.id, "media.autoplay.default").catch(Cu.reportError);

          // We have already set the preferences, we only need to set preferences
          // when the first time extension runs.
          if (cacheDefaultSetting.hasOwnProperty("media.autoplay.default")) {
            return;
          }

          // Save current preferences setting and recover preferences when study ends.
          const defaultSetting = {
            "media.autoplay.default" : Preferences.get("media.autoplay.default"),
            "media.autoplay.enabled.user-gestures-needed": Preferences.get("media.autoplay.enabled.user-gestures-needed"),
            "media.autoplay.ask-permission": Preferences.get("media.autoplay.ask-permission"),
          }
          await ExtensionStorage.set(extension.id, defaultSetting).catch(Cu.reportError);

          let autoplayDefault;
          if (variation.startsWith("allow")) {
            autoplayDefault = 2;
          } else {
            autoplayDefault = variation === "control" ? 0 : 1;
          }

          console.log(`set preferences for '${variation}'`);
          Preferences.set({
            "media.autoplay.default": autoplayDefault,
            "media.autoplay.enabled.user-gestures-needed": true,
            "media.autoplay.ask-permission": true,
          });
          setAutoplayPromptLayout(variation);
        },

        clearPreferences: async() => {
          function getDefaultPreference(pref) {
            return ExtensionStorage.get(extension.id, pref).catch(Cu.reportError);
          }

          const defaultSetting = [
            await getDefaultPreference("media.autoplay.default"),
            await getDefaultPreference("media.autoplay.enabled.user-gestures-needed"),
            await getDefaultPreference("media.autoplay.ask-permission"),
          ];

          let setting = {};
          for (let item of defaultSetting) {
            for (let key in item) {
              setting[key] = item[key];
            }
          }

          console.log(`reset user's preferences.`)
          Preferences.set(setting);
          setAutoplayPromptLayout("allow-and-remember");
        },

        getAutoplayPermission: async(tabId, url) => {
          function getPromptStatus() {
            return new Promise(function(resolve, reject) {
              // User can have different ways to interact with the prompt, they
              // can either click a button, hit the ‘escape’ key, or ignore it
              // and do nothing.
              const interactPromise = new Promise((resolve) => {
                panel.firstChild.addEventListener("click", (e) => {
                  const id = e.originalTarget.attributes.anonid.nodeValue;
                  if (id === "checkbox") {
                    return;
                  }
                  panel.firstChild.removeEventListener("click", this);
                  resolve({
                    interact: "interact",
                    rememberCheckbox: panel.firstChild.checkbox.checked,
                    allowAutoPlay: (id === "button"),
                  });
                });
              });

              const escapePromise = new Promise((resolve) => {
                tab.ownerGlobal.addEventListener("keypress", (event) => {
                  if (event.key === "Escape") {
                    tab.ownerGlobal.removeEventListener("keypress", this);
                    resolve({
                      interact: "escape",
                    });
                  }
                });
              });

              // The `popuphidden` might be dispatched before "keypress" or
              // "click" event. Therefore, we would wait for a while to check
              // whether or not we receive those events.
              panel.addEventListener("popuphidden", () => {
                // either user clicking one of prompt button or pressing
                // `escape` key.
                Promise.race([interactPromise, escapePromise]).then((rv) => {
                  resolve(rv);
                });

                tab.ownerGlobal.setTimeout(() => {
                  resolve({
                    interact: "ignore",
                  });
                }, 300);
              }, {once: true});
            });
          }

          const tab = tabManager.get(tabId).nativeTab;
          const panel = tab.ownerGlobal.PopupNotifications.panel;
          await _once(panel, "popupshown");
          const timeStampShow = Date.now();

          const status = await getPromptStatus().catch(Cu.reportError);
          status.timestamp = timeStampShow;
          status.responseTime = (Date.now() - timeStampShow) / 1000;
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
