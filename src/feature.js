/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "(feature)" }]*/

class TabsMonitor {
  constructor(feature) {
    this.feature = feature;
    this.settingTabIds = new Set();
    this.privacyPageURL = "about:preferences#privacy";
    this.settingListener = this.autoplaySettingChanged.bind(this);

    browser.tabs.onUpdated.addListener(this.handleUpdated.bind(this));
    browser.tabs.onRemoved.addListener(this.handleRemoved.bind(this));
  }

  async checkTabAutoplayStatus(tabId) {
    let url = await browser.autoplay.hasAutoplayMediaContent(tabId);
    if (!this.isSupportURLProtocol(url)) {
      return;
    }

    let hashURL = this.getBaseDomainHash(url);
    this.feature.update("autoplayOccur", hashURL);

    let permission = await browser.autoplay.getAutoplayPermission(tabId, url);
    this.feature.update("promptChanged", {
      pageId : hashURL,
      timestamp : Date.now(),
      rememberCheckbox : permission.rememberCheckbox,
      allowAutoPlay : permission.allowAutoPlay,
    });
  }

  autoplaySettingChanged(rv) {
    // TODO : global setting changed
    this.feature.update("settingChanged", {
      timestamp : Date.now(),
      pageSpecific : {
        pageid : this.getBaseDomainHash(rv.domain),
        allowAutoPlay : rv.allowAutoplay
      }
    });
  }

  startWaitingForAutoplaySettingChanged() {
    browser.autoplay.autoplaySettingChanged.addListener(this.settingListener);
  }

  stoptWaitingForAutoplaySettingChanged() {
    browser.autoplay.autoplaySettingChanged.removeListener(this.settingListener);
  }

  addSettingTabId(tabId) {
    this.settingTabIds.add(tabId);
    if (this.settingTabIds.size == 1) {
      this.startWaitingForAutoplaySettingChanged();
    }
  }

  removeSettingTabId(tabId) {
    this.settingTabIds.delete(tabId);
    if (this.settingTabIds.size == 0) {
      this.stoptWaitingForAutoplaySettingChanged();
    }
  }

  checkIfEneteringSettingPrivacyPage(tabId, url) {
    if (url === this.privacyPageURL && !this.settingTabIds.has(tabId)) {
      this.addSettingTabId(tabId);
      return true;
    } else if (this.settingTabIds.has(tabId) && url !== this.privacyPageURL) {
      this.removeSettingTabId(tabId);
    }
    return false;
  }

  handleUpdated(tabId, changeInfo, tabInfo) {
    if (!changeInfo.url) {
      return;
    }

    let url = changeInfo.url;
    Logger.log(`@@@ update : TabId: ${tabId}, URL changed to ${url}`);
    if (this.checkIfEneteringSettingPrivacyPage(tabId, url)) {
      return;
    }

    if (!this.isSupportURLProtocol(url)) {
      return;
    }

    let domain = this.getBaseDomainHash(url);
    this.feature.update("visitPage", domain);
    this.checkTabAutoplayStatus(tabId)
  }

  handleRemoved(tabId, removeInfo) {
    if (this.settingTabIds.has(tabId)) {
      this.removeSettingTabId(tabId);
    }
  }

  isSupportURLProtocol(url) {
    return !!(url.match(/^(http(s?):\/\/)/im));
  }

  getBaseDomain(url) {
    return url.match(/^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:\/\n]+)/im)[1];
  }

  getBaseDomainHash(url) {
    // TODO : salted-hash
    let baseDomain = this.getBaseDomain(url);
    Logger.log(`Domain = ${baseDomain}`);

    let hash = 0, i, chr;
    if (baseDomain.length === 0) {
      return hash
    };
    for (i = 0; i < baseDomain.length; i++) {
      chr   = baseDomain.charCodeAt(i);
      hash  = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
    Logger.log(`HashCode = ${hash}`);
    return hash;
  }
}

class TelemetrySender {
  constructor() {}

  sendTelemetry(payload) {
    // browser.study.sendTelemetry(payload);
    // Add validation for JSON
    browser.autoplay.sendTelemetry(payload)
  }
};

class ShieldStudyPing {
  constructor() {
    this.domainUserVisited = new Set();
    this.domainWithAutoplay = new Set();
    this.blockedMediaCount = 0;
    this.promptResponses = [];
    this.settingChanges = [];
    this.telemetry = new TelemetrySender();
  }

  updatePingData(type, data) {
    Logger.log(`type : ${type}`);
    Logger.log(data);
    switch (type) {
      case "visitPage":
        this.domainUserVisited.add(data);
        break;
      case "autoplayOccur":
        this.domainWithAutoplay.add(data);
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
  }

  async sendPing() {
    console.log("@@@@@ send ping");
    let payload = this.constructPayload("counts");
    await this.telemetry.sendTelemetry(payload);

    while (this.promptResponses.length > 0) {
      payload = this.constructPayload("prompt");
      await this.telemetry.sendTelemetry(payload);
    }

    while (this.settingChanges.length > 0) {
      payload = this.constructPayload("settings");
      await this.telemetry.sendTelemetry(payload);
    }
  }

  // Utilities functions
  constructPayload(type) {
    let payload = {
      id : this._generateUUID(),
      type : type
    };
    switch (type) {
      case "counts":
        payload.counters = {
          totalPages : this.domainUserVisited.size,
          totalPagesAM : this.domainWithAutoplay.size,
          totalBlockedVideos : this.blockedMediaCount
        }
        break;
      case "prompt":
        payload.promptResponse = this.promptResponses.shift();
        break;
      case "settings":
        payload.settingsChanged = this.settingChanges.shift();
        break;
      default:
        console.log("Error : incorrect payload type");
        break;
    }
    Logger.log(payload);
    return payload;
  }

  _showAllDomainHaseCode() {
    for (let item of this.domainUserVisited) {
      Logger.log(item);
    }
    for (let item of this.domainWithAutoplay) {
      Logger.log(item);
    }
  }

  _generateUUID() {
    return  Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);
  }
}

class Feature {
  constructor() {
    this.ping = new ShieldStudyPing();
    this.tabsMonitor = new TabsMonitor(this);

    // for test
    browser.browserAction.onClicked.addListener(() => {
      this.ping.sendPing();
    });
  }

  configure(studyInfo) {
    const feature = this;
    const { variation, isFirstRun } = studyInfo;
    console.log(studyInfo);
    browser.autoplay.setPreferences();
  }

  update(type, data) {
    this.ping.updatePingData(type, data);
  }

  /**
   * Called at end of study, and if the user disables the study or it gets
   * uninstalled by other means.
   */
  async cleanup() {}
}

var Logger = {
  openLog : true,
  log : function log(msg) {
    if (!!this.openLog) {
      console.log(msg);
    }
  }
};

// make an instance of the feature class available to background.js
// construct only. will be configured after setup
window.feature = new Feature();
