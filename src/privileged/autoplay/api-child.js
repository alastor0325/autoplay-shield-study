// ChromeUtils.import("resource://gre/modules/Services.jsm");

console.log("@@@@@@@@@@@@@@ in child @@@@@@@@@@@@");

// Services.obs.addObserver(function observe(subject, topic, data) {
//   console.log("@@@@@@@@@@@@@@ in observe!!!!!");
//   console.log(topic);
//   if (topic === "audio-playback") {
//     console.log("------audio-playback------");
//   }
// },"audio-playback");

this.autoplay = class AutoplayAPI extends ExtensionAPI {
  getAPI(context) {
    const {extension} = context;
    const {tabManager} = extension;

    return {
      autoplay : {
    	  testChild: function testChild() {
          console.log("#### testChild");
        },
      }
    };
  }
};