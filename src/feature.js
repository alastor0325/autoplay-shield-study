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
    this.telemetry = new TelemetrySender();
  }

  async sendPing() {
    // Test sending ping
    let payload = this.constructPayload("counts");
    await this.telemetry.sendTelemetry(payload);
    Logger.log("### added custom ping");
  }

  constructPayload(type) {
    let payload = {
      id : GenerateUUID(),
      type : type
    };
    switch (type) {
      case "counts":
          payload.counters = {
            totalPages : this.domainUserVisited.size,
            totalPagesAM : this.domainWithAutoplay.size,
            totalBlockedVideos : this.blockedMediaCount
          }
          // payload.totalPages = this.domainUserVisited.size.toString();
          // payload.totalPagesAM = this.domainWithAutoplay.size.toString();
          // payload.totalBlockedVideos = this.blockedMediaCount.toString();
        break;
      case "prompt":
        break;
      case "settings":
        break;
      default:
        console.log("Error : incorrect payload type");
        break;
    }
    return payload;
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

    // For test
    this.showAllDomainHaseCode();
    this.sendPing();
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

function GenerateUUID() {
  return  Math.random().toString(36).substring(2, 15) +
          Math.random().toString(36).substring(2, 15);
}

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
