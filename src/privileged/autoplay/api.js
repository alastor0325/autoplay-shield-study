"use strict";

var autoplay = class extends ExtensionAPI {
  getAPI(context) {

    return {
      autoplay : {
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