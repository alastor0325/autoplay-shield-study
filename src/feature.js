/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "(feature)" }]*/

/**  Example Feature module for a Shield Study.
 *
 *  Demonstrates `studyUtils` API:
 *
 *  - `telemetry` to instrument "shown", "accept", and "leave-study" events.
 *  - `endStudy` to send a custom study ending.
 *
 **/

class TabsMonitor {
  constructor(feature) {
    Logger.log("#### ctor of TabsMonitor");
    this.feature = feature;
    browser.tabs.onUpdated.addListener(this.handleUpdated.bind(this));
  }

  isSupportURLProtocol(url) {
    return !!(url.match(/^(http(s?):\/\/)/im));
  }

  getBaseDomain(url) {
    return url.match(/^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:\/\n]+)/im)[1];
  }

  handleUpdated(tabId, changeInfo, tabInfo) {
    if (!changeInfo.url) {
      return;
    }

    let url = changeInfo.url;
    Logger.log(`TabId: ${tabId}, URL changed to ${url}`);

    if (!this.isSupportURLProtocol(url)) {
      return;
    }

    let domain = this.getBaseDomain(url);
    Logger.log(`Domain = ${domain}`);
    Logger.log(`HashCode = ${domain.hashCode()}`);
    this.feature.update("visitPage", domain.hashCode());
  }
}

class TelemetrySender {
  constructor() {}

  /* good practice to have the literal 'sending' be wrapped up */
  sendTelemetry(stringStringMap) {
    browser.study.sendTelemetry(stringStringMap);
  }
};

class ShieldStudyPing {
  constructor() {
    this.domainUserVisited = new Set();
    this.domainWithAutoplay = new Set();
    this.blockedMediaCount = 0;
  }

  addDomainHashCode(type, hashCode) {
    Logger.log(`add ${hashCode} to ping`);
    switch (type) {
      case "visitPage":
        this.domainUserVisited.add(hashCode);
        break;
      case "autoplayOccur":
        this.domainWithAutoplay.add(hashCode);
        break;
      default:
        console.log("Error : incorrect data type");
        break;
    }
    this.showAllDomainHaseCode();
  }

  showAllDomainHaseCode() {
    for (let item of this.domainUserVisited) {
      Logger.log(item);
    }
    for (let item of this.domainWithAutoplay) {
      Logger.log(item);
    }
  }
}

class Feature {
  constructor() {
    Logger.log("#### ctor of Feature");
    this.ping = new ShieldStudyPing();
    this.telemetry = new TelemetrySender();
    new TabsMonitor(this);
  }

  configure(studyInfo) {
    const feature = this;
    const { variation, isFirstRun } = studyInfo;
    console.log("#### configure feature");
    console.log(studyInfo);
  }

  update(type, data) {
    switch (type) {
      case "visitPage":
        this.ping.addDomainHashCode(type, data);
        break;
      case "autoplayOccur":
        Logger.log("### autoplayOccur");
        break;
      default:
        console.log("Error : incorrect operation type");
        break;
    }
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

String.prototype.hashCode = function() {
  var hash = 0, i, chr;
  if (this.length === 0) return hash;
  for (i = 0; i < this.length; i++) {
    chr   = this.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};

// make an instance of the feature class available to background.js
// construct only. will be configured after setup
window.feature = new Feature();
