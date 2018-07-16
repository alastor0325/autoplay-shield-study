"use strict";

const CID = ChromeUtils.import("resource://gre/modules/ClientID.jsm", {});
const { TelemetryController } = ChromeUtils.import(
  "resource://gre/modules/TelemetryController.jsm",
  null,
)

var autoplay = class extends ExtensionAPI {
  getAPI(context) {

    return {
      autoplay : {
        sendTelemetry: async function sendTelemetry(data) {
          const telOptions = { addClientId: true, addEnvironment: true };
          return TelemetryController.submitExternalPing("shield-study-addon", data, telOptions);
        },

        autoplayTest: async function autoplayTest() {
          return 12345;
        },

        add : async function add(x, y) {
          return x + y;
        }
      }
    };
  }
};