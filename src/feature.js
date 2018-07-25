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

  autoplaySettingChanged(data) {
    if (data.pageSpecific) {
      data.pageSpecific.pageId = this.getBaseDomainHash(data.pageSpecific.pageId);
    }
    this.feature.update("settingChanged", data);
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

class Feature {
  constructor() {
    this.tabsMonitor = new TabsMonitor(this);

    const sendPingIntervalMS = 1 * 24 * 60 * 60 * 1000;
    this.sendPingsScheduler(sendPingIntervalMS);

    // for test
    browser.browserAction.onClicked.addListener(() => {
      console.log("@@@@@ test send ping");
      browser.autoplay.sendTelemetry();
    });
  }

  configure(studyInfo) {
    const feature = this;
    const { variation, isFirstRun } = studyInfo;
    console.log(studyInfo);
    browser.autoplay.setPreferences();
  }

  update(type, data) {
    if (type == "visitPage" || type == "autoplayOccur") {
       data = {pageId : data};
    }
    browser.autoplay.updatePingData(type, data);
  }

  sendPingsScheduler(interval) {
     setInterval((interval) => {
      browser.autoplay.sendTelemetry();
    }, interval);
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
